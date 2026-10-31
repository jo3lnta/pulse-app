const STORE_KEY = "pulse.entries.v1";
const $ = (id) => document.getElementById(id);
const today = new Date();
const isoToday = new Date(today.getTime() - today.getTimezoneOffset()*60000).toISOString().slice(0,10);
let entries = loadEntries();

function loadEntries(){ try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; } }
function saveEntries(){ localStorage.setItem(STORE_KEY, JSON.stringify(entries)); render(); }
function fmtDate(value){ return new Date(value+"T12:00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"}); }
function latest(type){ return entries.filter(e=>e.type===type).sort((a,b)=>b.date.localeCompare(a.date))[0]; }
function displayValue(type, suffix){ const e=latest(type); return e ? `${Number(e.value).toLocaleString("es-ES",{maximumFractionDigits:1})} <small>${suffix}</small>` : `— <small>${suffix}</small>`; }
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  document.querySelectorAll(".nav-link[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const names={home:"Overview",recovery:"Recovery",sleep:"Sleep",activity:"Activity",profile:"Profile & settings"};
  $("crumb").textContent=names[page]||"Overview";
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.goto)));
$("todayLabel").textContent = today.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});
$("dateButton").title = today.toLocaleDateString("es-ES");

function openLog(type="hr"){
  $("entryType").value=type;
  $("entryDate").value=isoToday;
  $("entryValue").value="";
  $("formError").textContent="";
  $("logDialog").showModal();
}
$("quickLog").addEventListener("click",()=>openLog());
$("firstLog").addEventListener("click",()=>openLog());
document.querySelectorAll("[data-open-log]").forEach(b=>b.addEventListener("click",()=>openLog(b.dataset.openLog)));
$("cancelLog").addEventListener("click",()=>$("logDialog").close());
$("logForm").addEventListener("submit",e=>{
  e.preventDefault();
  const type=$("entryType").value, value=Number($("entryValue").value), date=$("entryDate").value;
  const limits={hr:[25,240],hrv:[1,300],sleep:[0,24],steps:[0,100000]};
  if(!date || !Number.isFinite(value) || value<limits[type][0] || value>limits[type][1]){
    $("formError").textContent="Check the value and date. Enter a real measurement, not an estimate.";
    return;
  }
  entries.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),type,value,date,createdAt:Date.now()});
  saveEntries(); $("logDialog").close(); toast("Measurement saved on this device.");
});
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2300);}
function row(e){
  const labels={hr:"Heart rate",hrv:"HRV",sleep:"Sleep",steps:"Steps"};
  const units={hr:"bpm",hrv:"ms",sleep:"h",steps:"steps"};
  return `<div class="entry-row"><div><strong>${labels[e.type]}</strong><small>${fmtDate(e.date)}</small></div><div class="entry-value">${Number(e.value).toLocaleString("es-ES",{maximumFractionDigits:1})} ${units[e.type]}</div></div>`;
}
function listInto(id, arr, emptyTitle, emptyText){
  const el=$(id);
  if(!arr.length){el.className="empty-state compact";el.innerHTML=`<div class="empty-icon">⌁</div><strong>${emptyTitle}</strong><p>${emptyText}</p>`;return;}
  el.className="entry-list";el.innerHTML=arr.map(row).join("");
}
function render(){
  $("home-hr").innerHTML=displayValue("hr","bpm");
  $("home-hrv").innerHTML=displayValue("hrv","ms");
  $("home-sleep").innerHTML=displayValue("sleep","h");
  $("home-steps").innerHTML=displayValue("steps","steps");
  $("recovery-hr").innerHTML=displayValue("hr","bpm");
  $("recovery-hrv").innerHTML=displayValue("hrv","ms");
  const sleep=latest("sleep"), steps=entries.filter(e=>e.type==="steps"&&e.date===isoToday).sort((a,b)=>b.createdAt-a.createdAt)[0];
  $("sleep-last").innerHTML=sleep?`${Number(sleep.value).toLocaleString("es-ES")} <small>hours</small>`:`— <small>hours</small>`;
  $("activity-steps").textContent=steps?Number(steps.value).toLocaleString("es-ES"):"—";
  const sorted=[...entries].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  listInto("recentEntries",sorted.slice(0,4),"No entries yet","Add a measurement to start building your personal history.");
  listInto("sleepEntries",sorted.filter(e=>e.type==="sleep").slice(0,7),"No sleep entries yet","Your sleep history will appear here.");
  listInto("activityEntries",sorted.filter(e=>e.type==="steps").slice(0,7),"No activity entries yet","Your daily totals will appear here.");
  const recovery=sorted.filter(e=>["hr","hrv"].includes(e.type)).slice(0,7);
  $("recoveryHistory").innerHTML=recovery.length?`<div class="entry-list">${recovery.map(row).join("")}</div>`:"Your measurement history will appear here.";
}
$("clearData").addEventListener("click",()=>{
  if(confirm("Delete all PULSE entries saved in this browser? This cannot be undone.")){
    entries=[];saveEntries();toast("Your local entries have been cleared.");
  }
});
render();
