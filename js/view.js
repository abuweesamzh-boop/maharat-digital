// ============================================
// صفحة العرض العامة (مشتقة من رابط مؤقت — عرض فقط)
// ============================================

let SHARED = null;
let viewTab = "tracking";
let viewNavStack = []; // للتصفح داخل الفصول ووحدات المحتوى
let viewCurrentModule = null;
let viewCurrentClass = null;
let viewReportPeriod = "p1";

const MODULE_LABELS_VIEW = {
  portfolio: "ملف إنجاز المعلم",
  presentations: "العروض التقديمية",
  exams: "الاختبارات",
  worksheets: "أوراق العمل",
};

const COMPONENT_DEFS_VIEW = [
  { key: "participation", label: "المشاركة", target: 10, field: "participation" },
  { key: "homework", label: "الواجبات", target: 10, field: "homework" },
  { key: "tasks", label: "المهام الأدائية", target: 10, field: "tasks" },
  { key: "practical", label: "التطبيق العملي", target: 10, field: "practical" },
  { key: "written_exam", label: "الاختبار التحريري", target: 30, field: "exam_score" },
  { key: "practical_exam", label: "الاختبار العملي", target: 30, field: "exam_score" },
];

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

async function initView() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const contentEl = document.getElementById("viewContent");

  if (!token) { contentEl.innerHTML = `<div class="section-card"><div class="empty-state">رابط غير صالح — لا يحتوي على رمز وصول.</div></div>`; return; }

  const { data, error } = await supabaseClient.rpc("get_shared_data", { p_token: token });

  if (error) {
    contentEl.innerHTML = `<div class="section-card"><div class="empty-state">⛔ هذا الرابط غير صالح أو منتهي الصلاحية أو تم إلغاؤه من قبل المعلم.</div></div>`;
    return;
  }

  SHARED = data;
  renderTabs();
}

function renderTabs() {
  const contentEl = document.getElementById("viewContent");
  contentEl.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px;" id="viewTabsRow"></div>
    <div id="viewTabBody"></div>
  `;

  const tabs = [
    { key: "tracking", label: "📋 سجل المتابعة" },
    { key: "portfolio", label: "📁 ملف إنجاز المعلم" },
    { key: "presentations", label: "🖥️ العروض التقديمية" },
    { key: "exams", label: "📝 الاختبارات" },
    { key: "worksheets", label: "🧾 أوراق العمل" },
  ];

  const tabsRow = document.getElementById("viewTabsRow");
  tabsRow.innerHTML = tabs.map((t) => `<button type="button" class="btn-secondary view-tab-btn" data-tab="${t.key}" style="width:auto; padding:10px 16px;">${t.label}</button>`).join("");

  tabsRow.querySelectorAll(".view-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewTab = btn.dataset.tab;
      viewNavStack = [];
      viewCurrentClass = null;
      updateTabStyles();
      renderTabBody();
    });
  });

  updateTabStyles();
  renderTabBody();
}

function updateTabStyles() {
  document.querySelectorAll(".view-tab-btn").forEach((b) => {
    const active = b.dataset.tab === viewTab;
    b.style.background = active ? "var(--accent-cyan)" : "transparent";
    b.style.color = active ? "#06231F" : "var(--text-muted)";
    b.style.borderColor = active ? "var(--accent-cyan)" : "var(--border-soft)";
  });
}

function renderTabBody() {
  if (viewTab === "tracking") {
    renderTrackingTab();
  } else {
    viewCurrentModule = viewTab;
    renderFolderTab();
  }
}

// ============ سجل المتابعة (فصول → طلاب → تقرير) ============

function renderTrackingTab() {
  const body = document.getElementById("viewTabBody");

  if (viewCurrentClass) { renderClassStudentsView(); return; }

  const classes = SHARED.classes || [];
  if (classes.length === 0) { body.innerHTML = `<div class="section-card"><div class="empty-state">ما فيه فصول مسجلة</div></div>`; return; }

  body.innerHTML = `
    <div class="section-card">
      <div class="section-head"><h3>الفصول</h3></div>
      <div class="folder-grid">
        ${classes.map((c, i) => {
          const studentsCount = (SHARED.students || []).filter((s) => s.class_id === c.id).length;
          return `
            <div class="folder-card" style="--folder-color:${["#2DD8C8","#F5A623","#B892FF","#FF7A8A","#5FD068","#5FA8FF"][i % 6]}" onclick="openViewClass('${c.id}', '${escapeAttr(c.title)}')">
              <div class="folder-avatar">${(c.title || "?").charAt(0)}</div>
              <div class="folder-title">${escapeHtml(c.title)}</div>
              <div class="folder-meta">${studentsCount} طالب</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function openViewClass(classId, title) {
  viewCurrentClass = { id: classId, title };
  renderClassStudentsView();
}

function calcResultsFor(studentId, classId, period) {
  const sessions = (SHARED.class_sessions || []).filter((s) => s.class_id === classId && s.period === period);
  const sessionMap = {};
  sessions.forEach((s) => (sessionMap[s.id] = s));
  const sessionIds = sessions.map((s) => s.id);

  const scores = (SHARED.session_scores || []).filter((sc) => sc.student_id === studentId && sessionIds.includes(sc.session_id));

  const results = COMPONENT_DEFS_VIEW.map((def) => {
    const relevant = scores.filter((sc) => {
      const sess = sessionMap[sc.session_id];
      if (!sess) return false;
      if (def.key === "written_exam") return sess.session_kind === "written_exam";
      if (def.key === "practical_exam") return sess.session_kind === "practical_exam";
      return sess.session_kind === "continuous";
    });
    const values = relevant.map((sc) => sc[def.field]).filter((v) => v !== null && v !== undefined);
    const avg = values.length > 0 ? values.reduce((a, b) => a + Number(b), 0) / values.length : 0;
    return { ...def, avg: Math.round(avg * 100) / 100, count: values.length };
  });

  const total = Math.round(results.reduce((s, r) => s + r.avg, 0) * 100) / 100;

  const continuousScores = scores.filter((sc) => sessionMap[sc.session_id] && sessionMap[sc.session_id].session_kind === "continuous");
  const presentCount = continuousScores.filter((sc) => sc.attendance !== false).length;
  const attendanceRate = continuousScores.length > 0 ? Math.round((presentCount / continuousScores.length) * 100) : null;

  return { results, total, attendanceRate, presentCount, totalSessions: continuousScores.length };
}

function renderClassStudentsView() {
  const body = document.getElementById("viewTabBody");
  const students = (SHARED.students || []).filter((s) => s.class_id === viewCurrentClass.id);

  body.innerHTML = `
    <div class="breadcrumb-nav">
      <span class="crumb" onclick="viewCurrentClass=null; renderTrackingTab();">سجل المتابعة</span>
      <span>/</span>
      <span class="crumb current">${escapeHtml(viewCurrentClass.title)}</span>
    </div>
    <div class="period-toggle" id="viewPeriodToggle">
      <button data-p="p1" class="active">الفترة الأولى</button>
      <button data-p="p2">الفترة الثانية</button>
    </div>
    <div class="section-card">
      <div class="grade-table-wrap">
        <table class="grade-table class-report-table">
          <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>تحريري</th><th>عملي</th><th>الإجمالي</th><th>الحضور</th></tr></thead>
          <tbody id="viewStudentsBody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll("#viewPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewReportPeriod = btn.dataset.p;
      document.querySelectorAll("#viewPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      fillStudentsTable(students);
    });
  });

  fillStudentsTable(students);
}

function fillStudentsTable(students) {
  const tbody = document.getElementById("viewStudentsBody");
  if (students.length === 0) { tbody.innerHTML = `<tr><td colspan="9" class="empty-state">ما فيه طلاب</td></tr>`; return; }

  tbody.innerHTML = students.map((st) => {
    const r = calcResultsFor(st.id, viewCurrentClass.id, viewReportPeriod);
    const attStr = r.attendanceRate !== null ? r.attendanceRate + "%" : "—";
    return `
      <tr style="cursor:pointer;" onclick="openViewStudentReport('${st.id}')">
        <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
        ${r.results.map((c) => `<td>${c.avg}</td>`).join("")}
        <td style="font-weight:700; color:var(--accent-cyan);">${r.total}</td>
        <td>${attStr}</td>
      </tr>
    `;
  }).join("");
}

function openViewStudentReport(studentId) {
  const student = (SHARED.students || []).find((s) => s.id === studentId);
  if (!student) return;

  const body = document.getElementById("viewTabBody");
  const r = calcResultsFor(studentId, student.class_id, viewReportPeriod);
  const notes = (SHARED.behavior_notes || []).filter((n) => n.student_id === studentId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  body.innerHTML = `
    <div class="breadcrumb-nav">
      <span class="crumb" onclick="viewCurrentClass=null; renderTrackingTab();">سجل المتابعة</span>
      <span>/</span>
      <span class="crumb" onclick="renderClassStudentsView();">${escapeHtml(viewCurrentClass.title)}</span>
      <span>/</span>
      <span class="crumb current">${escapeHtml(student.full_name)}</span>
    </div>

    <div class="section-card" style="margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:16px;">
        <div class="folder-avatar" style="--folder-color:var(--accent-cyan); width:56px; height:56px; font-size:22px;">${student.full_name.charAt(0)}</div>
        <div>
          <div style="font-family:var(--font-display); font-weight:800; font-size:19px;">${escapeHtml(student.full_name)}</div>
          <div style="color:var(--text-muted); font-size:13px;">${escapeHtml(viewCurrentClass.title)}</div>
        </div>
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card"><div class="num">${r.total}</div><div class="lbl">الدرجة الإجمالية من 100</div></div>
      <div class="stat-card"><div class="num">${r.attendanceRate !== null ? r.attendanceRate + "%" : "—"}</div><div class="lbl">نسبة الحضور (${r.presentCount}/${r.totalSessions})</div></div>
    </div>

    <div class="component-ring-grid" style="margin-bottom:20px;">
      ${r.results.map((c) => `
        <div class="component-mini-card">
          <div class="val">${c.avg}</div>
          <div class="of">من ${c.target}</div>
          <div class="lbl">${c.label}</div>
        </div>
      `).join("")}
    </div>

    <div class="section-card">
      <div class="section-head"><h3>📌 ملاحظات السلوك</h3></div>
      ${notes.length === 0 ? `<div class="empty-state">ما فيه ملاحظات</div>` : notes.map((n) => `
        <div class="behavior-note ${n.note_type}">
          <div><div class="txt">${n.note_type === "positive" ? "🟢" : "🔴"} ${escapeHtml(n.note)}</div>
          <div class="date">${new Date(n.created_at).toLocaleDateString("ar-SA")}</div></div>
        </div>
      `).join("")}
    </div>
  `;
}

// ============ وحدات المحتوى (تصفح مجلدات للقراءة فقط) ============

function renderFolderTab() {
  viewNavStack = [];
  renderFolderLevel();
}

function viewParentId() { return viewNavStack.length ? viewNavStack[viewNavStack.length - 1].id : null; }

function renderFolderLevel() {
  const body = document.getElementById("viewTabBody");
  const parentId = viewParentId();

  const breadcrumbHtml = `
    <div class="breadcrumb-nav">
      <span class="crumb ${viewNavStack.length === 0 ? "current" : ""}" onclick="viewNavStack=[]; renderFolderLevel();">${MODULE_LABELS_VIEW[viewCurrentModule]}</span>
      ${viewNavStack.map((n, i) => `<span>/</span><span class="crumb ${i === viewNavStack.length - 1 ? "current" : ""}" onclick="viewNavStack=viewNavStack.slice(0,${i + 1}); renderFolderLevel();">${escapeHtml(n.title)}</span>`).join("")}
    </div>
  `;

  const subs = (SHARED.content_sections || []).filter((s) => s.module === viewCurrentModule && (parentId ? s.parent_id === parentId : !s.parent_id));
  const items = parentId ? (SHARED.content_items || []).filter((i) => i.section_id === parentId) : [];

  body.innerHTML = `
    ${breadcrumbHtml}
    <div class="section-card" style="margin-bottom:18px;">
      <div class="section-head"><h3>الأقسام الفرعية</h3></div>
      ${subs.length === 0 ? `<div class="empty-state">ما فيه أقسام فرعية</div>` : `<div class="folder-grid">${subs.map((s, i) => `
        <div class="folder-card" style="--folder-color:${["#2DD8C8","#F5A623","#B892FF","#FF7A8A","#5FD068","#5FA8FF"][(s.color_index ?? i) % 6]}" onclick="viewNavStack.push({id:'${s.id}', title:'${escapeAttr(s.title)}'}); renderFolderLevel();">
          <div class="folder-avatar">${(s.title || "?").charAt(0)}</div>
          <div class="folder-title">${escapeHtml(s.title)}</div>
        </div>
      `).join("")}</div>`}
    </div>
    ${parentId ? `
    <div class="section-card">
      <div class="section-head"><h3>المرفقات</h3></div>
      ${items.length === 0 ? `<div class="empty-state">ما فيه مرفقات</div>` : items.map((item) => `
        <div class="item-row">
          <div class="info">
            <div class="t">${escapeHtml(item.title)}</div>
            <div class="d">${item.item_date ? escapeHtml(item.item_date) + " · " : ""}${item.description ? escapeHtml(item.description) : ""}</div>
          </div>
          <div class="actions">
            ${item.file_url ? `<a class="icon-btn" href="${item.file_url}" target="_blank" title="عرض الملف">👁</a>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
    ` : ""}
  `;
}

initView();
