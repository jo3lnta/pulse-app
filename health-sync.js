// Apple Health stays on the phone until the user's private Shortcut sends it.
function clearHealthSecret() {
  if (document.getElementById("healthToken")) document.getElementById("healthToken").value = "";
  if (document.getElementById("healthSecret")) document.getElementById("healthSecret").hidden = true;
}
function healthMessage(message) {
  const el = document.getElementById("healthStatus");
  if (el) el.textContent = message;
}
async function refreshHealthStatus() {
  const userId = currentUser?.id;
  if (!pulseClient || !userId) return;
  try {
    const {data, error} = await pulseClient.rpc("health_status");
    if (currentUser?.id !== userId) return;
    if (error) throw error;
    healthMessage(data.connected
      ? (data.last_sync_at ? "Last received: " + new Date(data.last_sync_at).toLocaleString(pulseDateLocale()) : "Connected. Waiting for your iPhone automation.")
      : "Apple Health is disconnected.");
  } catch {
    healthMessage("Health sync unavailable. The server migration may need to be installed.");
  }
}
async function syncHealthEntries() {
  const userId = currentUser?.id;
  if (!pulseClient || !userId) return;
  const {data, error} = await pulseClient.from("health_entries")
    .select("id,type,value,date,created_at,bedtime,wake_time").eq("user_id", userId);
  if (currentUser?.id !== userId) return;
  if (error) {
    healthMessage("Could not fetch Health records. Try Sync now after the server is configured.");
    return;
  }
  const imported = (data || []).map(row => ({...fromCloudRow(row), source: "apple-health"}));
  const merged = [...entries.filter(entry => entry.source !== "apple-health"), ...imported];
  localStorage.setItem(accountStoreKey(userId), JSON.stringify(merged));
  entries = merged;
  render();
  await refreshHealthStatus();
}
async function healthAction(button, action) {
  button.disabled = true;
  try { await action(); }
  catch { healthMessage("Health sync could not complete. Check your connection and server setup."); }
  finally { button.disabled = false; }
}
document.getElementById("healthConnect")?.addEventListener("click", event => healthAction(event.currentTarget, async () => {
  if (!currentUser) return;
  const userId = currentUser.id;
  clearHealthSecret();
  const {data, error} = await pulseClient.rpc("health_connect");
  if (currentUser?.id !== userId) return;
  if (error || typeof data !== "string") throw error || new Error("Missing key");
  document.getElementById("healthToken").value = data;
  document.getElementById("healthSecret").hidden = false;
  await refreshHealthStatus();
}));
document.getElementById("healthDisconnect")?.addEventListener("click", event => healthAction(event.currentTarget, async () => {
  if (!currentUser) return;
  const {error} = await pulseClient.rpc("health_disconnect");
  if (error) throw error;
  clearHealthSecret();
  await refreshHealthStatus();
}));
document.getElementById("healthRefresh")?.addEventListener("click", event => healthAction(event.currentTarget, syncHealthEntries));
document.getElementById("healthCopy")?.addEventListener("click", event => healthAction(event.currentTarget, async () => {
  await navigator.clipboard.writeText(document.getElementById("healthToken").value);
  healthMessage("Key copied. Paste it only into your private iPhone Shortcut.");
}));
// Refresh when the dashboard opens again, and while it is visible.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && currentUser) healthAction({disabled: false}, syncHealthEntries);
  else clearHealthSecret();
});
setInterval(() => {
  if (!document.hidden && currentUser) healthAction({disabled: false}, syncHealthEntries);
}, 60000);
