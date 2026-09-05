const COMPONENT_DEFS_P = [
  { key: "participation", label: "المشاركة", target: 10, field: "participation" },
  { key: "homework", label: "الواجبات", target: 10, field: "homework" },
  { key: "tasks", label: "المهام الأدائية", target: 10, field: "tasks" },
  { key: "practical", label: "التطبيق العملي", target: 10, field: "practical" },
  { key: "written_exam", label: "الاختبار التحريري", target: 30, field: "exam_score" },
  { key: "practical_exam", label: "الاختبار العملي", target: 30, field: "exam_score" },
];

let PDATA = null;
let pPeriod = "p1";

function escapeHtmlP(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }

async function initParent() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const contentEl = document.getElementById("parentContent");
  if (!token) { contentEl.innerHTML = `<div class="section-card"><div class="empty-state">رابط غير صالح.</div></div>`; return; }

  const { data, error } = await supabaseClient.rpc("get_student_public_report", { p_token: token });
  if (error || !data) { contentEl.innerHTML = `<div class="section-card"><div class="empty-state">⛔ هذا الرمز غير صالح.</div></div>`; return; }

  PDATA = data;
  renderParentReport();
}

function computeResults(period) {
  const scores = (PDATA.session_scores || []).filter((sc) => sc.class_sessions && sc.class_sessions.period === period);
  const results = COMPONENT_DEFS_P.map((def) => {
    const relevant = scores.filter((sc) => {
      const kind = sc.class_sessions.session_kind;
      if (def.key === "written_exam") return kind === "written_exam";
      if (def.key === "practical_exam") return kind === "practical_exam";
      return kind === "continuous";
    });
    const values = relevant.map((sc) => sc[def.field]).filter((v) => v !== null && v !== undefined);
    const avg = values.length > 0 ? values.reduce((a, b) => a + Number(b), 0) / values.length : 0;
    return { ...def, avg: Math.round(avg * 100) / 100, count: values.length };
  });
  const total = Math.round(results.reduce((s, r) => s + r.avg, 0) * 100) / 100;
  const continuousScores = scores.filter((sc) => sc.class_sessions.session_kind === "continuous");
  const presentCount = continuousScores.filter((sc) => sc.attendance !== false).length;
  const attendanceRate = continuousScores.length > 0 ? Math.round((presentCount / continuousScores.length) * 100) : null;
  return { results, total, attendanceRate, presentCount, totalSessions: continuousScores.length };
}

function renderParentReport() {
  const contentEl = document.getElementById("parentContent");
  const student = PDATA.student;

  contentEl.innerHTML = `
    <div class="section-card" style="margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:16px;">
        <div class="folder-avatar" style="--folder-color:var(--accent-cyan); width:56px; height:56px; font-size:22px;">${(student.full_name || "?").charAt(0)}</div>
        <div><div style="font-family:var(--font-display); font-weight:800; font-size:19px;">${escapeHtmlP(student.full_name)}</div><div style="color:var(--text-muted); font-size:13px;">${student.class_title ? escapeHtmlP(student.class_title) : ""}</div></div>
      </div>
    </div>
    <div class="period-toggle" id="pPeriodToggle"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
    <div id="pReportBody"></div>
    <div class="section-card" style="margin-top:20px;">
      <div class="section-head"><h3>📌 ملاحظات السلوك</h3></div>
      <div id="pBehaviorList"></div>
    </div>
  `;

  document.querySelectorAll("#pPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      pPeriod = btn.dataset.p;
      document.querySelectorAll("#pPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      fillReportBody();
    });
  });

  fillReportBody();
  fillBehaviorNotes();
}

function classifyLevelP(avg, target) {
  const pct = target > 0 ? (avg / target) * 100 : 0;
  if (pct >= 80) return { emoji: "🟢", label: "مستوى جيد" };
  if (pct >= 60) return { emoji: "🟡", label: "يحتاج تحسين" };
  return { emoji: "🔴", label: "يحتاج متابعة عاجلة" };
}

function fillReportBody() {
  const r = computeResults(pPeriod);
  const continuousTotal = Math.round((r.results[0].avg + r.results[1].avg + r.results[2].avg + r.results[3].avg) * 100) / 100;
  const examsTotal = Math.round((r.results[4].avg + r.results[5].avg) * 100) / 100;
  document.getElementById("pReportBody").innerHTML = `
    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card"><div class="num">${r.total}</div><div class="lbl">الدرجة الإجمالية من 100</div></div>
      <div class="stat-card"><div class="num">${continuousTotal}</div><div class="lbl">مجموع أعمال السنة من 40</div></div>
      <div class="stat-card"><div class="num">${examsTotal}</div><div class="lbl">مجموع الاختبارات من 60</div></div>
      <div class="stat-card"><div class="num">${r.attendanceRate !== null ? r.attendanceRate + "%" : "—"}</div><div class="lbl">نسبة الحضور (${r.presentCount}/${r.totalSessions})</div></div>
    </div>
    <div class="component-ring-grid">${r.results.map((c) => {
      const lvl = classifyLevelP(c.avg, c.target);
      return `<div class="component-mini-card"><div class="val">${c.avg}</div><div class="of">من ${c.target}</div><div class="lbl">${c.label}</div><div style="font-size:11px; margin-top:6px; font-weight:700;">${lvl.emoji} ${lvl.label}</div></div>`;
    }).join("")}</div>
  `;
}

function fillBehaviorNotes() {
  const notes = (PDATA.behavior_notes || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const holder = document.getElementById("pBehaviorList");
  if (notes.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه ملاحظات</div>`; return; }
  holder.innerHTML = notes.map((n) => `
    <div class="behavior-note ${n.note_type}">
      <div><div class="txt">${n.note_type === "positive" ? "🟢" : "🔴"} ${escapeHtmlP(n.note)}</div><div class="date">${new Date(n.created_at).toLocaleDateString("ar-SA")}</div></div>
    </div>`).join("");
}

initParent();
