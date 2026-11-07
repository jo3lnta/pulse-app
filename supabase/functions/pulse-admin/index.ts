import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Authentication required." }, 401);
    const token = authHeader.slice(7);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return respond({ error: "Server configuration is incomplete." }, 500);

    const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Invalid or expired session." }, 401);

    // Validate the administrator role through the authenticated client, matching the frontend role check.
    const { data: roleRow, error: roleError } = await userClient
      .from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (roleError) {
      console.error("pulse-admin role lookup:", roleError);
      return respond({ error: "Administrator role could not be verified." }, 500);
    }
    if (roleRow?.role !== "admin") return respond({ error: "Administrator access denied." }, 403);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    if (body.action !== "list") return respond({ error: "Unknown admin action." }, 400);

    const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const { data: roles, error: rolesError } = await admin.from("user_roles").select("user_id,role");
    if (rolesError) throw rolesError;
    // Read only user IDs to count records; measurement values and dates are never returned.
    const { data: entryOwners, error: entriesError } = await admin.from("entries").select("user_id");
    if (entriesError) throw entriesError;

    const roleMap = new Map((roles || []).map((row: { user_id: string; role: string }) => [row.user_id, row.role]));
    const countMap = new Map<string, number>();
    for (const row of entryOwners || []) countMap.set(row.user_id, (countMap.get(row.user_id) || 0) + 1);
    const now = Date.now();
    const users = (authUsers.users || []).map(user => ({
      id: user.id,
      email: user.email || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at || null,
      banned_until: user.banned_until || null,
      role: roleMap.get(user.id) || "user",
      entry_count: countMap.get(user.id) || 0,
    }));
    const blocked = users.filter(user => user.banned_until && new Date(user.banned_until).getTime() > now).length;
    return respond({
      users,
      stats: {
        total_users: users.length,
        active_users: users.length - blocked,
        blocked_users: blocked,
        total_entries: (entryOwners || []).length,
      },
    });
  } catch (error) {
    console.error("pulse-admin:", error);
    return respond({ error: "The administrator request could not be completed." }, 500);
  }
});