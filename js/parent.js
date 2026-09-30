const pParams = new URLSearchParams(window.location.search);
const pToken = pParams.get("token");

const COMPONENT_DEFS_P = [
  { key: "participation", label: "المشاركة", target: 10, field: "participation" },
  { key: "homework", label: "الواجبات", target: 10, field: "homework" },
  { key: "tasks", label: "المهام الأدائية", target: 10, field: "tasks" },
  { key: "practical", label: "التطبيق العملي", target: 10, field: "practical" },
  { key: "written_exam", label: "الاختبار التحريري", target: 30, field: "exam_score" },
  { key: "practical_exam", label: "الاختبار العملي", target: 30, field: "exam_score" },
];
function classifyLevelP(avg, target){
  const pct = (avg/target)*100;
  if (pct >= 80) return { cls:"positive", label:"مستوى جيد" };
  if (pct >= 60) return { cls:"mid", label:"يحتاج تحسين" };
  return { cls:"negative", label:"يحتاج متابعة عاجلة" };
}

async function initParent(){
  const el = document.getElementById("contentArea");
  if (!pToken) { el.innerHTML = `<p class="muted">رابط غير صالح.</p>`; return; }
  const { data, error } = await supabaseClient.rpc("get_student_public_report", { p_token: pToken });
  if (error || !data) { el.innerHTML = `<p class="muted">الرابط منتهي أو غير صالح.</p>`; return; }
  renderParentReport(data);
}

function renderParentReport(data){
  const el = document.getElementById("contentArea");
  const scores = data.session_scores || [];
  const results = {};
  COMPONENT_DEFS_P.forEach(c => {
    const vals = scores.filter(r => r.class_sessions?.session_kind === c.key && r[c.field] != null).map(r => Number(r[c.field]));
    results[c.key] = { avg: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0, target: c.target };
  });
  const continuous = ["participation","homework","tasks","practical"].reduce((s,k)=>s+results[k].avg,0);
  const exams = ["written_exam","practical_exam"].reduce((s,k)=>s+results[k].avg,0);
  const total = continuous + exams;
  const totalSessions = scores.length;
  const presentCount = scores.filter(r=>r.attendance!==false).length;
  const attendanceRate = totalSessions ? Math.round((presentCount/totalSessions)*100) : 100;
  const notes = data.behavior_notes || [];

  el.innerHTML = `
    <div class="page-head"><h2>تقرير الطالب: ${data.student.full_name}</h2><p class="muted">${data.student.class_title||''}</p></div>
    <div class="stats-grid">
      <div class="stat-card"><div><strong>${total.toFixed(1)}</strong><span>الإجمالي/100</span></div></div>
      <div class="stat-card"><div><strong>${continuous.toFixed(1)}</strong><span>أعمال السنة/40</span></div></div>
      <div class="stat-card"><div><strong>${exams.toFixed(1)}</strong><span>الاختبارات/60</span></div></div>
      <div class="stat-card"><div><strong>${attendanceRate}%</strong><span>نسبة الحضور</span></div></div>
    </div>
    <div class="component-grid">
      ${COMPONENT_DEFS_P.map(c=>{
        const r = results[c.key]; const lvl = classifyLevelP(r.avg, c.target);
        return `<div class="component-card lvl-${lvl.cls}"><strong>${c.label}</strong><span>${r.avg.toFixed(1)} / ${c.target}</span><span class="lvl-tag">${lvl.label}</span></div>`;
      }).join("")}
    </div>
    <div class="section-block">
      <h3>ملاحظات السلوك</h3>
      <div class="items-list">${notes.length ? notes.map(n=>`
        <div class="item-row"><div class="item-main"><span class="note-dot ${n.note_type}"></span><span>${n.note}</span></div></div>
      `).join("") : `<p class="muted">لا توجد ملاحظات.</p>`}</div>
    </div>
  `;
}
document.addEventListener("DOMContentLoaded", initParent);
