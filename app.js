const STORE_KEY = "pulse.entries.v1";
const $ = (id) => document.getElementById(id);
const today = new Date();
const isoToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let entries = loadEntries();

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { return []; }
}
function saveEntries() {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  render();
  if (currentUser) queueCloudSync();
}
function fmtDate(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
function shortDate(value) {
  return new Date(value + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
function latest(type) {
  return entries.filter(e => e.type === type).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function clockMinutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
function circularDeviation(times) {
  const values = times.map(clockMinutes).filter(value => value != null);
  if (values.length < 3) return null;
  const anchor = values[0];
  const offsets = values.map(value => ((value - anchor + 720 + 1440) % 1440) - 720);
  const center = median(offsets);
  return median(offsets.map(value => Math.abs(value - center)));
}
function sleepRegularity() {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 13);
  const cutoffISO = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const byDate = new Map();
  entries.filter(e => e.type === "sleep" && e.date >= cutoffISO && e.date <= isoToday && e.bedtime && e.wakeTime)
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach(e => byDate.set(e.date, e));
  const nights = [...byDate.values()];
  if (nights.length < 3) return { value: null, bedtime: null, wake: null, count: nights.length };
  const bedtimeVariation = circularDeviation(nights.map(e => e.bedtime));
  const wakeVariation = circularDeviation(nights.map(e => e.wakeTime));
  if (bedtimeVariation == null || wakeVariation == null) return { value: null, count: nights.length };
  return { value: Math.round((bedtimeVariation + wakeVariation) / 2), bedtime: Math.round(bedtimeVariation), wake: Math.round(wakeVariation), count: nights.length };
}
function recoveryEstimate() {
  // Experimental personal trend indicator, not a medical score or training recommendation.
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 13);
  const cutoffISO = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dailyValues = type => {
    const map = new Map();
    entries.filter(e => e.type === type && e.date >= cutoffISO && e.date <= isoToday).sort((a,b) => a.createdAt-b.createdAt).forEach(e => map.set(e.date, Number(e.value)));
    return [...map.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  };
  const hrv=dailyValues('hrv'), sleep=dailyValues('sleep');
  if(hrv.length<7||sleep.length<7) return {value:null,message:'Add at least 7 days of HRV and sleep records within 14 days to see a personal trend.'};
  const newest=[hrv[hrv.length-1][0],sleep[sleep.length-1][0]].sort().pop();
  const daysOld=Math.floor((new Date(isoToday+'T12:00:00')-new Date(newest+'T12:00:00'))/86400000);
  if(daysOld>3) return {value:null,message:'Add recent HRV and sleep records to refresh this trend.'};
  const compare=series=>{const baseline=median(series.slice(0,-1).slice(-6).map(x=>x[1]));const current=series[series.length-1][1];if(!Number.isFinite(baseline)||baseline<=0)return null;return Math.max(0,Math.min(100,50+((current-baseline)/baseline)*100));};
  const hrvTrend=compare(hrv),sleepTrend=compare(sleep);
  if(hrvTrend==null||sleepTrend==null)return {value:null,message:'Not enough valid personal baseline data yet.'};
  return {value:Math.round((hrvTrend+sleepTrend)/2),message:'A rough comparison of your latest HRV and sleep duration with your own recent records. It is not a medical measure.'};
}

function displayValue(type, suffix) {
  const e = latest(type);
  return e ? `${Number(e.value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} <small>${suffix}</small>` : `— <small>${suffix}</small>`;
}

// Small, dependency-free chart styles. The existing PULSE theme is preserved.
(function addChartStyles() {
  if ($("pulse-chart-styles")) return;
  const style = document.createElement("style");
  style.id = "pulse-chart-styles";
  style.textContent = `
    .pulse-chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}
    .pulse-chart-card{background:#0d1511;border:1px solid #24342b;border-radius:12px;padding:14px;min-width:0}
    .pulse-chart-title{font-size:10px;letter-spacing:1.1px;color:#9aa99f;font-weight:700;margin-bottom:4px}
    .pulse-chart-current{font:600 23px Manrope,sans-serif;color:#eef7f0;margin-bottom:7px}
    .pulse-chart-current small{font:500 10px 'DM Sans',sans-serif;color:#89968f}
    .pulse-chart-svg{width:100%;height:auto;display:block;overflow:visible}
    .pulse-chart-labels{display:flex;justify-content:space-between;color:#77877d;font-size:9px;margin-top:3px}
    .pulse-chart-empty{color:#89968f;font-size:10px;padding:18px 8px;text-align:center;border:1px dashed #2b3a32;border-radius:10px;margin:12px 0}
    .pulse-history-heading{font-size:10px;letter-spacing:1.2px;color:#89968f;font-weight:700;margin:18px 0 7px}
    @media(max-width:520px){.pulse-chart-grid{grid-template-columns:1fr;gap:9px}.pulse-chart-card{padding:12px}}
  `;
  document.head.appendChild(style);
})();

function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
  document.querySelectorAll(".nav-link[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const names = { home: "Overview", recovery: "Recovery", sleep: "Sleep", activity: "Activity", profile: "Profile & settings" };
  if ($("crumb")) $("crumb").textContent = names[page] || "Overview";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.goto)));
if ($("todayLabel")) $("todayLabel").textContent = today.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
if ($("dateButton")) $("dateButton").title = today.toLocaleDateString("es-ES");

function updateSleepFields() {
  const visible = $("entryType").value === "sleep";
  $("sleepTimeFields").hidden = !visible;
  $("bedtime").required = false;
  $("wakeTime").required = false;
}
function openLog(type = "hr") {
  $("entryType").value = type;
  $("entryDate").value = isoToday;
  $("entryValue").value = "";
  $("bedtime").value = "";
  $("wakeTime").value = "";
  $("formError").textContent = "";
  updateSleepFields();
  $("logDialog").showModal();
}
$("entryType")?.addEventListener("change", updateSleepFields);
$("quickLog")?.addEventListener("click", () => openLog());
$("firstLog")?.addEventListener("click", () => openLog());
document.querySelectorAll("[data-open-log]").forEach(b => b.addEventListener("click", () => openLog(b.dataset.openLog)));
$("cancelLog")?.addEventListener("click", () => $("logDialog").close());
$("logForm")?.addEventListener("submit", e => {
  e.preventDefault();
  const type = $("entryType").value, value = Number($("entryValue").value), date = $("entryDate").value;
  const bedtime = $("bedtime").value, wakeTime = $("wakeTime").value;
  const limits = { hr: [25, 240], hrv: [1, 300], sleep: [0, 24], steps: [0, 100000] };
  if (!date || !Number.isFinite(value) || value < limits[type][0] || value > limits[type][1]) {
    $("formError").textContent = "Check the value and date. Enter a real measurement, not an estimate.";
    return;
  }
  if (type === "sleep" && Boolean(bedtime) !== Boolean(wakeTime)) {
    $("formError").textContent = "Enter both times, or leave both blank.";
    return;
  }
  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type, value, date, createdAt: Date.now() };
  if (type === "sleep" && bedtime && wakeTime) { entry.bedtime = bedtime; entry.wakeTime = wakeTime; }
  entries.push(entry);
  saveEntries();
  $("logDialog").close();
  toast("Measurement saved on this device.");
});
function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2300);
}
function row(e) {
  const labels = { hr: "Heart rate", hrv: "HRV", sleep: "Sleep", steps: "Steps" };
  const units = { hr: "bpm", hrv: "ms", sleep: "h", steps: "steps" };
  const sleepTimes = e.type === "sleep" && e.bedtime && e.wakeTime ? `<br>Bed ${e.bedtime} · Wake ${e.wakeTime}` : "";
  return `<div class="entry-row"><div><strong>${labels[e.type]}</strong><small>${fmtDate(e.date)}${sleepTimes}</small></div><div class="entry-value">${Number(e.value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} ${units[e.type]}</div></div>`;
}
function listInto(id, arr, emptyTitle, emptyText) {
  const el = $(id);
  if (!el) return;
  if (!arr.length) { el.className = "empty-state compact"; el.innerHTML = `<div class="empty-icon">⌁</div><strong>${emptyTitle}</strong><p>${emptyText}</p>`; return; }
  el.className = "entry-list"; el.innerHTML = arr.map(row).join("");
}

function chartCard(title, unit, source, accent) {
  const data = [...source].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).slice(-7);
  if (!data.length) return `<div class="pulse-chart-empty">Add real measurements to build this chart.</div>`;
  const values = data.map(e => Number(e.value));
  const min = Math.min(...values), max = Math.max(...values);
  const spread = max - min || Math.max(1, max * 0.12);
  const low = min - spread * 0.18, high = max + spread * 0.18;
  const x = i => data.length === 1 ? 150 : 12 + (i * 276 / (data.length - 1));
  const y = v => 88 - ((v - low) / (high - low)) * 68;
  const points = data.map((e, i) => `${x(i)},${y(Number(e.value))}`).join(" ");
  const dots = data.map((e, i) => `<circle cx="${x(i)}" cy="${y(Number(e.value))}" r="3.5" fill="${accent}" stroke="#0d1511" stroke-width="2"><title>${shortDate(e.date)}: ${Number(e.value).toLocaleString("es-ES")} ${unit}</title></circle>`).join("");
  const last = data[data.length - 1];
  return `<div class="pulse-chart-card"><div class="pulse-chart-title">${title}</div><div class="pulse-chart-current">${Number(last.value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} <small>${unit}</small></div><svg class="pulse-chart-svg" viewBox="0 0 300 100" role="img" aria-label="${title}, last ${data.length} entries"><line x1="8" y1="20" x2="292" y2="20" stroke="#26372d"/><line x1="8" y1="54" x2="292" y2="54" stroke="#26372d"/><line x1="8" y1="88" x2="292" y2="88" stroke="#26372d"/><polyline points="${points}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg><div class="pulse-chart-labels"><span>${shortDate(data[0].date)}</span><span>${shortDate(last.date)}</span></div></div>`;
}
function chartsInto(id, types) {
  const el = $(id); if (!el) return;
  el.className = "pulse-chart-container";
  const config = { hr: ["HEART RATE", "bpm", "#f18ba4"], hrv: ["HRV", "ms", "#b19aff"], sleep: ["SLEEP DURATION", "h", "#82baff"], steps: ["DAILY STEPS", "steps", "#39d69a"] };
  const cards = types.map(type => {
    const [title, unit, color] = config[type];
    return chartCard(title, unit, entries.filter(e => e.type === type), color);
  }).join("");
  el.innerHTML = `<div class="pulse-chart-grid">${cards}</div>`;
}

function render() {
  const recovery = recoveryEstimate();
  if ($("homeRecoveryScore")) $("homeRecoveryScore").textContent = recovery.value == null ? "—" : recovery.value;
  if ($("recoveryScore")) $("recoveryScore").textContent = recovery.value == null ? "—" : recovery.value;
  if ($("homeRecoveryRing")) $("homeRecoveryRing").textContent = recovery.value == null ? "—" : recovery.value;
  if ($("homeRecoveryStatus")) $("homeRecoveryStatus").textContent = recovery.value == null ? "Waiting for enough consistent data" : "Experimental personal trend estimate";
  if ($("recoveryExplanation")) $("recoveryExplanation").textContent = recovery.message;
  $("home-hr").innerHTML = displayValue("hr", "bpm");
  $("home-hrv").innerHTML = displayValue("hrv", "ms");
  $("home-sleep").innerHTML = displayValue("sleep", "h");
  $("home-steps").innerHTML = displayValue("steps", "steps");
  $("recovery-hr").innerHTML = displayValue("hr", "bpm");
  $("recovery-hrv").innerHTML = displayValue("hrv", "ms");
  const sleep = latest("sleep");
  const steps = entries.filter(e => e.type === "steps" && e.date === isoToday).sort((a, b) => b.createdAt - a.createdAt)[0];
  $("sleep-last").innerHTML = sleep ? `${Number(sleep.value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} <small>hours</small>` : `— <small>hours</small>`;
  const sleepCutoff = new Date(today);
  sleepCutoff.setDate(sleepCutoff.getDate() - 6);
  const sleepCutoffISO = new Date(sleepCutoff.getTime() - sleepCutoff.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const sleepByDay = new Map();
  entries.filter(e => e.type === "sleep" && e.date >= sleepCutoffISO && e.date <= isoToday)
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach(e => sleepByDay.set(e.date, Number(e.value)));
  const sleepWeek = [...sleepByDay.values()];
  const sleepAverage = sleepWeek.length ? sleepWeek.reduce((sum, value) => sum + value, 0) / sleepWeek.length : null;
  if ($("sleep-average")) $("sleep-average").innerHTML = sleepAverage == null ? "— <small>hours</small>" : `${sleepAverage.toLocaleString("es-ES", { maximumFractionDigits: 1 })} <small>hours</small>`;
  if ($("sleep-nights")) $("sleep-nights").textContent = `${sleepWeek.length} / 7`;
  const regularity = sleepRegularity();
  if ($("sleep-regularity")) $("sleep-regularity").innerHTML = regularity.value == null ? "— <small>min</small>" : `±${regularity.value} <small>min</small>`;
  if ($("sleep-bed-variation")) $("sleep-bed-variation").innerHTML = regularity.bedtime == null ? "— <small>min</small>" : `±${regularity.bedtime} <small>min</small>`;
  if ($("sleep-wake-variation")) $("sleep-wake-variation").innerHTML = regularity.wake == null ? "— <small>min</small>" : `±${regularity.wake} <small>min</small>`;
  if ($("sleep-regularity-note")) $("sleep-regularity-note").textContent = regularity.value == null
    ? `Add bedtime and wake time for at least 3 nights in the last 14 days (${regularity.count}/3 so far).`
    : `Average variation from your usual bedtime and wake time, based on ${regularity.count} nights in the last 14 days.`;
  $("activity-steps").textContent = steps ? Number(steps.value).toLocaleString("es-ES") : "—";
  const weekStart=new Date(today); weekStart.setDate(weekStart.getDate()-6);
  const weekStartISO=new Date(weekStart.getTime()-weekStart.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const dailyByType=type=>{const map=new Map();entries.filter(e=>e.type===type&&e.date>=weekStartISO&&e.date<=isoToday).sort((a,b)=>a.createdAt-b.createdAt).forEach(e=>map.set(e.date,Number(e.value)));return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));};
  const stepWeek=dailyByType('steps'), sleepDays=dailyByType('sleep');
  const stepTotal=stepWeek.reduce((sum,x)=>sum+x[1],0), stepAverage=stepWeek.length?stepTotal/stepWeek.length:null;
  const sleepWeekAverage=sleepDays.length?sleepDays.reduce((sum,x)=>sum+x[1],0)/sleepDays.length:null;
  if($('home-week-steps'))$('home-week-steps').textContent=stepTotal?Math.round(stepTotal).toLocaleString('es-ES'):'—';
  if($('home-week-step-average'))$('home-week-step-average').textContent=stepAverage==null?'No step records yet':`Average ${Math.round(stepAverage).toLocaleString('es-ES')} per recorded day`;
  if($('home-week-sleep'))$('home-week-sleep').textContent=sleepWeekAverage==null?'—':sleepWeekAverage.toLocaleString('es-ES',{maximumFractionDigits:1})+' h';
  if($('home-week-sleep-note'))$('home-week-sleep-note').textContent=`${sleepDays.length} of 7 days recorded`;
  if($('home-week-active'))$('home-week-active').textContent=`${stepWeek.length} / 7`;
  if($('activity-week-total'))$('activity-week-total').textContent=stepTotal?Math.round(stepTotal).toLocaleString('es-ES'):'—';
  if($('activity-week-average'))$('activity-week-average').textContent=stepAverage==null?'—':Math.round(stepAverage).toLocaleString('es-ES');
  if($('activity-days'))$('activity-days').textContent=`${stepWeek.length} / 7`;
  if($('recovery-data-note'))$('recovery-data-note').textContent=recovery.message;
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  listInto("recentEntries", sorted.slice(0, 4), "No entries yet", "Add a measurement to start building your personal history.");
  const sleepEl = $("sleepEntries");
  if (sleepEl) { sleepEl.innerHTML = "<div class='pulse-history-heading'>LAST 7 ENTRIES</div>" + (sorted.filter(e => e.type === "sleep").length ? sorted.filter(e => e.type === "sleep").slice(0, 7).map(row).join("") : `<div class="empty-state compact"><div class="empty-icon">☾</div><strong>No sleep entries yet</strong><p>Your sleep history will appear here.</p></div>`); }
  const activityEl = $("activityEntries");
  if (activityEl) { activityEl.innerHTML = "<div class='pulse-history-heading'>LAST 7 ENTRIES</div>" + (sorted.filter(e => e.type === "steps").length ? sorted.filter(e => e.type === "steps").slice(0, 7).map(row).join("") : `<div class="empty-state compact"><div class="empty-icon">⌁</div><strong>No activity entries yet</strong><p>Your daily totals will appear here.</p></div>`); }
  chartsInto("recoveryHistory", ["hr", "hrv"]);
  chartsInto("sleepEntries", ["sleep"]);
  chartsInto("activityEntries", ["steps"]);
  // Restore the lists below their charts.
  if (sleepEl) sleepEl.insertAdjacentHTML("beforeend", `<div class="pulse-history-heading">RECENT NIGHTS</div>${sorted.filter(e => e.type === "sleep").slice(0, 7).map(row).join("") || `<div class="pulse-chart-empty">No sleep entries yet.</div>`}`);
  if (activityEl) activityEl.insertAdjacentHTML("beforeend", `<div class="pulse-history-heading">DAILY LOG</div>${sorted.filter(e => e.type === "steps").slice(0, 7).map(row).join("") || `<div class="pulse-chart-empty">No activity entries yet.</div>`}`);
}

$("clearData")?.addEventListener("click", () => {
  if (confirm("Delete all PULSE entries saved in this browser? This cannot be undone.")) {
    entries = []; saveEntries(); toast("Your local entries have been cleared.");
  }
});
render();


// PULSE account and private cloud sync.
const PULSE_SUPABASE_URL = "https://sxsrlucazbgigxllxfgc.supabase.co";
const PULSE_SUPABASE_KEY = "sb_publishable_WDTnMx0ugljuRqS4a16bGA_V-Y3c1w4";
const pulseClient = window.supabase?.createClient(PULSE_SUPABASE_URL, PULSE_SUPABASE_KEY);
let currentUser = null;
let currentRole = "user";
let syncQueue = Promise.resolve();

function setLoginMessage(message, isError = true) {
  const el = $("loginMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}
async function loadCurrentRole() {
  currentRole = "user";
  if (!pulseClient || !currentUser) return;
  const { data, error } = await pulseClient.from("user_roles").select("role").eq("user_id", currentUser.id).maybeSingle();
  if (!error && data?.role === "admin") currentRole = "admin";
}
function showAccountState(signedIn) {
  const roleEl = $("accountRole");
  if (roleEl) { roleEl.hidden = !signedIn; roleEl.textContent = currentRole === "admin" ? "MASTER ADMIN" : "MEMBER"; roleEl.classList.toggle("admin-role", currentRole === "admin"); }
  const login = $("loginScreen"), shell = document.querySelector(".app-shell");
  if (login) login.hidden = signedIn;
  if (shell) shell.hidden = !signedIn;
  if ($("accountEmail")) $("accountEmail").textContent = currentUser?.email || "PULSE account";
  if ($("accountInitial")) $("accountInitial").textContent = (currentUser?.email || "P").slice(0,1).toUpperCase();
  if ($("syncStatus")) $("syncStatus").textContent = signedIn ? "CLOUD SYNC" : "SIGNED OUT";
}
function toCloudRow(entry, userId) {
  let id = entry.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
    id = crypto.randomUUID();
    entry.id = id;
  }
  return {
    id, user_id: userId, type: entry.type, value: Number(entry.value),
    date: entry.date, created_at: Number(entry.createdAt || Date.now()),
    bedtime: entry.bedtime || null, wake_time: entry.wakeTime || null
  };
}
function fromCloudRow(row) {
  return {
    id: row.id, type: row.type, value: Number(row.value), date: row.date,
    createdAt: Number(row.created_at), ...(row.bedtime ? {bedtime: row.bedtime.slice(0,5)} : {}),
    ...(row.wake_time ? {wakeTime: row.wake_time.slice(0,5)} : {})
  };
}
async function syncCloudEntries() {
  if (!pulseClient || !currentUser) return;
  const localRows = entries.map(entry => toCloudRow(entry, currentUser.id));
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  if (localRows.length) {
    const { error: uploadError } = await pulseClient.from("entries").upsert(localRows, { onConflict: "id" });
    if (uploadError) throw uploadError;
  }
  const { data, error } = await pulseClient.from("entries").select("id,type,value,date,created_at,bedtime,wake_time").eq("user_id", currentUser.id);
  if (error) throw error;
  const merged = new Map(entries.map(entry => [entry.id, entry]));
  (data || []).forEach(row => { const entry = fromCloudRow(row); if (!merged.has(entry.id)) merged.set(entry.id, entry); });
  entries = [...merged.values()].sort((a,b) => a.date.localeCompare(b.date) || a.createdAt-b.createdAt);
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  render();
  if ($("syncStatus")) $("syncStatus").textContent = "SYNCED";
}
function queueCloudSync() {
  syncQueue = syncQueue.then(syncCloudEntries).catch(error => {
    console.error("PULSE cloud sync:", error);
    if ($("syncStatus")) $("syncStatus").textContent = "SYNC ISSUE";
    toast("Saved on this device. Cloud sync needs attention.");
  });
  return syncQueue;
}
async function handleLogin(event) {
  event.preventDefault();
  if (!pulseClient) { setLoginMessage("Could not load the secure sign-in service. Check your connection."); return; }
  const button = $("loginSubmit");
  button.disabled = true; button.textContent = "Signing in…";
  setLoginMessage("");
  const { data, error } = await pulseClient.auth.signInWithPassword({
    email: $("loginEmail").value.trim(), password: $("loginPassword").value
  });
  button.disabled = false; button.textContent = "Sign in";
  if (error) { setLoginMessage("Sign-in failed. Check your email and password, or ask the account administrator."); return; }
  currentUser = data.user;
  await loadCurrentRole();
  showAccountState(true);
  setLoginMessage("");
  try {
    await syncCloudEntries();
    toast("PULSE synced securely.");
  } catch (syncError) {
    console.error("PULSE initial sync:", syncError);
    if ($("syncStatus")) $("syncStatus").textContent = "SYNC ISSUE";
    toast("Signed in. Some records remain only on this device until sync succeeds.");
  }
}
async function handleLogout() {
  if (!pulseClient) return;
  await pulseClient.auth.signOut();
  currentUser = null;
  currentRole = "user";
  showAccountState(false);
  setLoginMessage("You have signed out.", false);
}
$("loginForm")?.addEventListener("submit", handleLogin);
$("logoutButton")?.addEventListener("click", handleLogout);
(async function initialisePulseAuth() {
  if (!pulseClient) {
    setLoginMessage("The sign-in service did not load. Check your internet connection.");
    showAccountState(false); return;
  }
  const { data, error } = await pulseClient.auth.getSession();
  if (error || !data.session) { currentUser = null; showAccountState(false); return; }
  currentUser = data.session.user;
  await loadCurrentRole();
  showAccountState(true);
  try { await syncCloudEntries(); }
  catch (syncError) {
    console.error("PULSE restore sync:", syncError);
    if ($("syncStatus")) $("syncStatus").textContent = "SYNC ISSUE";
  }
  pulseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") { currentUser = null; showAccountState(false); }
  });
})();
