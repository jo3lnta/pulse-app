interface Runtime { get(name: string): string | undefined }
const webOrigin = "https://jo3lnta.github.io";
export async function handleRequest(request: Request, env: Runtime, send: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = {"Content-Type":"application/json", "Access-Control-Allow-Origin":webOrigin,
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS", "Vary":"Origin"};
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), {status, headers});
  if (origin && origin !== webOrigin) return reply(403, {error:"Origin not allowed"});
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers});
  if (request.method !== "POST") return reply(405, {error:"Use POST"});
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/i.test(authorization)) return reply(401, {error:"Sign in first"});
  let body;
  try { body = await request.json(); } catch { return reply(400, {error:"Invalid request"}); }
  if (body?.confirmation !== "DELETE") return reply(400, {error:"Explicit deletion confirmation required"});
  const url = env.get("SUPABASE_URL"), secret = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return reply(503, {error:"Account service unavailable"});
  try {
    // Resolve identity from the verified user token; never accept a target user ID.
    const verified = await send(url + "/auth/v1/user", {headers:{apikey:secret, Authorization:authorization}});
    if (!verified.ok) return reply(401, {error:"Session expired. Sign in again."});
    const user = await verified.json();
    if (typeof user.id !== "string" || !/^[0-9a-f-]{36}$/i.test(user.id)) return reply(401, {error:"Invalid session"});
    const revoked = await send(url + "/auth/v1/logout?scope=global", {method:"POST", headers:{apikey:secret, Authorization:authorization}});
    if (!revoked.ok) return reply(503, {error:"Could not revoke sessions. Retry deletion."});
    const deleted = await send(url + "/auth/v1/admin/users/" + encodeURIComponent(user.id), {
      method:"DELETE", headers:{apikey:secret, Authorization:"Bearer " + secret, "Content-Type":"application/json"},
      body:JSON.stringify({should_soft_delete:false})
    });
    if (!deleted.ok) return reply(503, {error:"Could not delete the account. Sign in again and retry."});
    return reply(200, {deleted:true});
  } catch { return reply(503, {error:"Account service unavailable. Retry later."}); }
}
if (import.meta.main) Deno.serve(request => handleRequest(request, Deno.env));
