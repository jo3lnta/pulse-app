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
function recoveryEstimate() {
  // Experimental personal trend only: HRV and sleep are compared with the user's own recent baseline.
  // Generic heart-rate entries are excluded because they are not identified as resting measurements.
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 13);
  const cutoffISO = new Date(cutoff.getTime() - cutoff.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dailyValues = type => {
    const byDate = new Map();
    entries.filter(e => e.type === type && e.date >= cutoffISO && e.date <= isoToday)
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach(e => byDate.set(e.date, Number(e.value)));
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const hrv = dailyValues("hrv");
  const sleep = dailyValues("sleep");
  if (hrv.length < 7 || sleep.length < 7) {
    return { value: null, message: "Need at least 7 days of HRV and sleep entries within the last 14 days." };
  }
  const newest = [hrv[hrv.length - 1][0], sleep[sleep.length - 1][0]].sort().pop();
  const daysOld = Math.floor((new Date(isoToday + "T12:00:00") - new Date(newest + "T12:00:00")) / 86400000);
  if (daysOld > 3) {
    return { value: null, message: "Add recent HRV and sleep entries to refresh this estimate." };
  }
  const component = series => {
    const baseline = median(series.slice(0, -1).map(item => item[1]));
    const latestValue = series[series.length - 1][1];
    if (!Number.isFinite(baseline) || baseline <= 0) return 50;
    return Math.max(0, Math.min(100, 50 + ((latestValue - baseline) / baseline) * 200));
  };
  return { value: Math.round((component(hrv) + component(sleep)) / 2), message: "Experimental estimate based on your recent HRV and sleep trends." };
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

function openLog(type = "hr") {
  $("entryType").value = type;
  $("entryDate").value = isoToday;
  $("entryValue").value = "";
  $("formError").textContent = "";
  $("logDialog").showModal();
}
$("quickLog")?.addEventListener("click", () => openLog());
$("firstLog")?.addEventListener("click", () => openLog());
document.querySelectorAll("[data-open-log]").forEach(b => b.addEventListener("click", () => openLog(b.dataset.openLog)));
$("cancelLog")?.addEventListener("click", () => $("logDialog").close());
$("logForm")?.addEventListener("submit", e => {
  e.preventDefault();
  const type = $("entryType").value, value = Number($("entryValue").value), date = $("entryDate").value;
  const limits = { hr: [25, 240], hrv: [1, 300], sleep: [0, 24], steps: [0, 100000] };
  if (!date || !Number.isFinite(value) || value < limits[type][0] || value > limits[type][1]) {
    $("formError").textContent = "Check the value and date. Enter a real measurement, not an estimate.";
    return;
  }
  entries.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type, value, date, createdAt: Date.now() });
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
  return `<div class="entry-row"><div><strong>${labels[e.type]}</strong><small>${fmtDate(e.date)}</small></div><div class="entry-value">${Number(e.value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} ${units[e.type]}</div></div>`;
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
  $("sleep-last").innerHTML = sleep ? `${Number(sleep.value).toLocaleString("es-ES")} <small>hours</small>` : `— <small>hours</small>`;
  $("activity-steps").textContent = steps ? Number(steps.value).toLocaleString("es-ES") : "—";
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
