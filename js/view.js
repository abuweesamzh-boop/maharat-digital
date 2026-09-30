function hydrateIcons(root=document){
  root.querySelectorAll("[data-icon]").forEach(el=>{
    const name = el.getAttribute("data-icon");
    if (!el.querySelector("svg")) el.innerHTML = (ICONS[name]||ICONS.folder);
  });
}
const params = new URLSearchParams(window.location.search);
const viewToken = params.get("token");
let viewData = null;
let viewCurrentModule = "portfolio";

async function initView(){
  const el = document.getElementById("contentArea");
  if (!viewToken) { el.innerHTML = `<p class="muted">رابط غير صالح.</p>`; return; }
  const { data, error } = await supabaseClient.rpc("get_shared_data", { p_token: viewToken });
  if (error || !data) { el.innerHTML = `<p class="muted">الرابط منتهي أو غير صالح.</p>`; return; }
  viewData = data;
  renderViewTabs();
}
function renderViewTabs(){
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="tabs-row">
      <button class="tab-btn active" onclick="switchViewTab('classes',this)">سجل المتابعة</button>
      <button class="tab-btn" onclick="switchViewTab('portfolio',this)">ملف إنجاز المعلم</button>
      <button class="tab-btn" onclick="switchViewTab('external',this)">مهارات رقمية - الصفوف</button>
    </div>
    <div id="viewTabBody"></div>
  `;
  renderClassesTab();
}
function switchViewTab(tab, btn){
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  if (tab === "classes") renderClassesTab();
  else { viewCurrentModule = tab; renderFolderTab(); }
}

function renderClassesTab(){
  const holder = document.getElementById("viewTabBody");
  const classes = viewData.classes || [];
  holder.innerHTML = `<div class="folder-grid">${classes.map(c=>`
    <div class="folder-card"><div class="folder-card-main" onclick="openViewClass('${c.id}')"><span class="folder-title">${c.title}</span></div></div>
  `).join("") || `<p class="muted">لا يوجد فصول.</p>`}</div>`;
}
function openViewClass(classId){
  const holder = document.getElementById("viewTabBody");
  const students = (viewData.students||[]).filter(s=>s.class_id===classId).sort((a,b)=>a.full_name.localeCompare(b.full_name,'ar'));
  holder.innerHTML = `
    <button class="btn-back" onclick="renderClassesTab()">رجوع</button>
    <div class="items-list">${students.map(s=>`
      <div class="item-row"><div class="item-main" onclick="openViewStudent('${s.id}')">${s.full_name}</div></div>
    `).join("") || `<p class="muted">لا يوجد طلاب.</p>`}</div>`;
}
function calcResultsFor(studentId){
  const rows = (viewData.session_scores||[]).filter(r=>r.student_id===studentId);
  const defs = [
    {key:"participation",target:10,field:"participation"},{key:"homework",target:10,field:"homework"},
    {key:"tasks",target:10,field:"tasks"},{key:"practical",target:10,field:"practical"},
    {key:"written_exam",target:30,field:"exam_score"},{key:"practical_exam",target:30,field:"exam_score"}
  ];
  const results = {};
  defs.forEach(d=>{
    const vals = rows.filter(r=>r.class_sessions?.session_kind===d.key && r[d.field]!=null).map(r=>Number(r[d.field]));
    results[d.key] = { avg: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0, target: d.target };
  });
  const continuous = ["participation","homework","tasks","practical"].reduce((s,k)=>s+results[k].avg,0);
  const exams = ["written_exam","practical_exam"].reduce((s,k)=>s+results[k].avg,0);
  return { results, continuous, exams, total: continuous+exams };
}
function openViewStudent(studentId){
  const holder = document.getElementById("viewTabBody");
  const s = (viewData.students||[]).find(x=>x.id===studentId);
  const r = calcResultsFor(studentId);
  holder.innerHTML = `
    <button class="btn-back" onclick="openViewClass('${s.class_id}')">رجوع</button>
    <h3>${s.full_name}</h3>
    <div class="stats-grid">
      <div class="stat-card"><div><strong>${r.total.toFixed(1)}</strong><span>الإجمالي/100</span></div></div>
      <div class="stat-card"><div><strong>${r.continuous.toFixed(1)}</strong><span>أعمال السنة/40</span></div></div>
      <div class="stat-card"><div><strong>${r.exams.toFixed(1)}</strong><span>الاختبارات/60</span></div></div>
    </div>
  `;
}

function renderFolderTab(){
  renderFolderLevel(null);
}
function renderFolderLevel(currentId){
  const holder = document.getElementById("viewTabBody");
  const folders = (viewData.content_sections||[]).filter(s=>s.module===viewCurrentModule && s.parent_id===currentId);
  const items = currentId ? (viewData.content_items||[]).filter(i=>i.section_id===currentId) : [];
  const backBtn = currentId ? `<button class="btn-back" onclick="renderFolderLevel(null)">رجوع</button>` : "";
  holder.innerHTML = `
    ${backBtn}
    <div class="folder-grid">${folders.map(f=>`
      <div class="folder-card"><div class="folder-card-main" onclick="renderFolderLevel('${f.id}')"><span class="folder-title">${f.title}</span></div></div>
    `).join("")}</div>
    <div class="items-list">${items.map(it=>{
      const isLink = it.external_url && !it.file_url;
      return `<div class="item-row"><div class="item-main" onclick="window.open('${isLink?it.external_url:it.file_url}','_blank')">${it.title}${isLink?' <span class="sub-badge">رابط خارجي</span>':''}</div></div>`;
    }).join("")}</div>
  `;
}

document.addEventListener("DOMContentLoaded", initView);
