// ============================================
// نظام التقييم: تسجيل بالحصة + متوسط تلقائي
// ============================================

const SESSION_KIND_LABELS = {
  continuous: "الحصص",
  written_exam: "الاختبار التحريري",
  practical_exam: "الاختبار العملي",
};

const COMPONENT_DEFS = [
  { key: "participation", label: "المشاركة", target: 10, field: "participation" },
  { key: "homework", label: "الواجبات", target: 10, field: "homework" },
  { key: "tasks", label: "المهام الأدائية", target: 10, field: "tasks" },
  { key: "practical", label: "التطبيق العملي", target: 10, field: "practical" },
  { key: "written_exam", label: "الاختبار التحريري", target: 30, field: "exam_score" },
  { key: "practical_exam", label: "الاختبار العملي", target: 30, field: "exam_score" },
];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function escapeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

// ============================================
// 1) داخل صفحة الفصل: إدارة الحصص والاختبارات
// ============================================

let gradingClassId = null;
let gradingClassTitle = null;
let gradingPeriod = "p1";

function renderGradingArea(classId, classTitle) {
  gradingClassId = classId;
  gradingClassTitle = classTitle;
  gradingPeriod = "p1";

  const holder = document.getElementById("gradingAreaHolder");
  holder.innerHTML = `
    <div class="period-toggle" id="gradingPeriodToggle">
      <button data-p="p1" class="active">الفترة الأولى</button>
      <button data-p="p2">الفترة الثانية</button>
    </div>
    <div id="gradingKindsHolder"></div>
  `;

  document.querySelectorAll("#gradingPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      gradingPeriod = btn.dataset.p;
      document.querySelectorAll("#gradingPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadGradingKinds();
    });
  });

  loadGradingKinds();
}

async function loadGradingKinds() {
  const holder = document.getElementById("gradingKindsHolder");
  holder.innerHTML = `<div class="empty-state">جاري التحميل...</div>`;

  const kinds = ["continuous", "written_exam", "practical_exam"];
  let html = "";

  for (const kind of kinds) {
    const { data: sessions } = await supabaseClient
      .from("class_sessions")
      .select("*")
      .eq("class_id", gradingClassId)
      .eq("period", gradingPeriod)
      .eq("session_kind", kind)
      .order("session_number", { ascending: true });

    html += `
      <div class="section-card" style="margin-bottom:16px;">
        <div class="section-head">
          <h3>${SESSION_KIND_LABELS[kind]}</h3>
          <button class="btn-add" onclick="createSession('${kind}')">+ ${kind === "continuous" ? "حصة جديدة" : "اختبار جديد"}</button>
        </div>
        ${
          !sessions || sessions.length === 0
            ? `<div class="empty-state" style="padding:20px;">ما فيه ${kind === "continuous" ? "حصص" : "اختبارات"} مسجلة بعد لهذي الفترة</div>`
            : `<div class="session-pill-row">` + sessions.map((s) => `
                <div class="session-pill" onclick="openSessionGrid('${s.id}', '${kind}', ${s.session_number})">
                  <div class="del" onclick="event.stopPropagation(); deleteSession('${s.id}')">✕</div>
                  <div class="num">${kind === "continuous" ? "حصة " + s.session_number : "اختبار " + s.session_number}</div>
                  <div class="lbl">اضغط للتعديل</div>
                </div>
              `).join("") + `</div>`
        }
      </div>
    `;
  }

  holder.innerHTML = html;
}

async function createSession(kind) {
  const { data: existing } = await supabaseClient
    .from("class_sessions")
    .select("session_number")
    .eq("class_id", gradingClassId)
    .eq("period", gradingPeriod)
    .eq("session_kind", kind)
    .order("session_number", { ascending: false })
    .limit(1);

  const nextNumber = existing && existing.length > 0 ? existing[0].session_number + 1 : 1;

  const { data: newSession, error } = await supabaseClient
    .from("class_sessions")
    .insert({ class_id: gradingClassId, period: gradingPeriod, session_kind: kind, session_number: nextNumber })
    .select()
    .single();

  if (error) { alert("تعذر إنشاء السجل: " + error.message); return; }

  openSessionGrid(newSession.id, kind, nextNumber);
}

async function deleteSession(sessionId) {
  if (!confirm("متأكد تبي تحذف هذا السجل؟ ستُحذف كل درجات الطلاب المرتبطة فيه.")) return;
  const { error } = await supabaseClient.from("class_sessions").delete().eq("id", sessionId);
  if (error) { alert("تعذر الحذف"); return; }
  await loadGradingKinds();
}

// ============================================
// 2) جدول إدخال الدرجات الجماعي لكل طلاب الفصل
// ============================================

async function openSessionGrid(sessionId, kind, sessionNumber) {
  const contentArea = document.getElementById("contentArea");

  const { data: students, error: studentsErr } = await supabaseClient
    .from("students")
    .select("*")
    .eq("class_id", gradingClassId)
    .order("student_number", { ascending: true });

  if (studentsErr || !students || students.length === 0) {
    contentArea.innerHTML = `
      <button class="btn-secondary" style="width:auto; padding:8px 16px; margin-bottom:16px;" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">← رجوع للفصل</button>
      <div class="section-card"><div class="empty-state">ما فيه طلاب بهذا الفصل — أضفهم أولاً</div></div>
    `;
    return;
  }

  const { data: scores } = await supabaseClient.from("session_scores").select("*").eq("session_id", sessionId);
  const scoreMap = {};
  (scores || []).forEach((s) => (scoreMap[s.student_id] = s));

  const isContinuous = kind === "continuous";

  document.getElementById("pageTitle").textContent = `${SESSION_KIND_LABELS[kind]} — ${isContinuous ? "حصة" : "اختبار"} ${sessionNumber}`;

  const headerCols = isContinuous
    ? `<th>المشاركة (10)</th><th>الواجبات (10)</th><th>المهام الأدائية (10)</th><th>التطبيق العملي (10)</th>`
    : `<th>الدرجة (30)</th>`;

  const rows = students.map((st) => {
    const sc = scoreMap[st.id] || {};
    if (isContinuous) {
      return `
        <tr data-student="${st.id}">
          <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
          <td><input type="number" class="grid-input" data-field="participation" min="0" max="10" step="0.5" value="${sc.participation ?? ""}" /></td>
          <td><input type="number" class="grid-input" data-field="homework" min="0" max="10" step="0.5" value="${sc.homework ?? ""}" /></td>
          <td><input type="number" class="grid-input" data-field="tasks" min="0" max="10" step="0.5" value="${sc.tasks ?? ""}" /></td>
          <td><input type="number" class="grid-input" data-field="practical" min="0" max="10" step="0.5" value="${sc.practical ?? ""}" /></td>
        </tr>
      `;
    }
    return `
      <tr data-student="${st.id}">
        <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
        <td><input type="number" class="grid-input" data-field="exam_score" min="0" max="30" step="0.5" value="${sc.exam_score ?? ""}" /></td>
      </tr>
    `;
  }).join("");

  contentArea.innerHTML = `
    <button class="btn-secondary" style="width:auto; padding:8px 16px; margin-bottom:16px;" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">← رجوع للفصل</button>
    <div class="section-card">
      <div class="section-head">
        <h3>إدخال الدرجات — ${students.length} طالب</h3>
        <button class="btn-add" id="saveGridBtn">💾 حفظ الكل</button>
      </div>
      <div class="grade-table-wrap">
        <table class="grade-table">
          <thead><tr><th>الطالب</th>${headerCols}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("saveGridBtn").addEventListener("click", () => saveSessionGrid(sessionId, isContinuous));
}

async function saveSessionGrid(sessionId, isContinuous) {
  const btn = document.getElementById("saveGridBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spin"></span>';

  const rowsEls = document.querySelectorAll(".grade-table tbody tr");
  const payload = Array.from(rowsEls).map((tr) => {
    const studentId = tr.dataset.student;
    const row = { session_id: sessionId, student_id: studentId };
    tr.querySelectorAll(".grid-input").forEach((inp) => {
      const val = inp.value === "" ? null : parseFloat(inp.value);
      row[inp.dataset.field] = val;
    });
    return row;
  });

  const { error } = await supabaseClient.from("session_scores").upsert(payload, { onConflict: "session_id,student_id" });

  btn.disabled = false;
  btn.innerHTML = "💾 حفظ الكل";

  if (error) { alert("تعذر الحفظ: " + error.message); return; }
  btn.innerHTML = "✅ تم الحفظ";
  setTimeout(() => { btn.innerHTML = "💾 حفظ الكل"; }, 1500);
}

// ============================================
// 3) تقرير الطالب الكامل (بحث → عرض)
// ============================================

let reportStudent = null;
let reportPeriod = "p1";

async function openStudentReport(studentId, studentName) {
  const { data: student, error } = await supabaseClient
    .from("students")
    .select("*, classes(id, title)")
    .eq("id", studentId)
    .single();

  if (error || !student) { alert("تعذر تحميل بيانات الطالب"); return; }

  reportStudent = {
    id: student.id,
    name: student.full_name,
    class_id: student.class_id,
    class_title: student.classes ? student.classes.title : null,
  };
  reportPeriod = "p1";

  document.getElementById("pageTitle").textContent = "تقرير الطالب";
  renderReportShell();
}

function renderReportShell() {
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:18px;">
      <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
        <div class="folder-avatar" style="--folder-color:var(--accent-cyan); width:56px; height:56px; font-size:22px;">${reportStudent.name.charAt(0)}</div>
        <div>
          <div style="font-family:var(--font-display); font-weight:800; font-size:19px;">${escapeHtml(reportStudent.name)}</div>
          <div style="color:var(--text-muted); font-size:13px;">${reportStudent.class_title ? escapeHtml(reportStudent.class_title) : "بدون فصل"}</div>
        </div>
      </div>
    </div>

    <div class="period-toggle" id="reportPeriodToggle">
      <button data-p="p1" class="active">الفترة الأولى</button>
      <button data-p="p2">الفترة الثانية</button>
    </div>

    <div id="reportBody"></div>
  `;

  document.querySelectorAll("#reportPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      reportPeriod = btn.dataset.p;
      document.querySelectorAll("#reportPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadReportBody();
    });
  });

  loadReportBody();
}

async function loadReportBody() {
  const bodyEl = document.getElementById("reportBody");

  if (!reportStudent.class_id) {
    bodyEl.innerHTML = `<div class="section-card"><div class="empty-state">هذا الطالب غير مرتبط بفصل، فما فيه تقييم متاح.</div></div>`;
    return;
  }

  bodyEl.innerHTML = `<div class="empty-state">جاري التحميل...</div>`;

  // كل حصص/اختبارات الفصل بهذي الفترة
  const { data: sessions } = await supabaseClient
    .from("class_sessions")
    .select("*")
    .eq("class_id", reportStudent.class_id)
    .eq("period", reportPeriod);

  const sessionIds = (sessions || []).map((s) => s.id);
  let scores = [];
  if (sessionIds.length > 0) {
    const { data } = await supabaseClient
      .from("session_scores")
      .select("*")
      .eq("student_id", reportStudent.id)
      .in("session_id", sessionIds);
    scores = data || [];
  }

  const sessionMap = {};
  (sessions || []).forEach((s) => (sessionMap[s.id] = s));

  // حساب المتوسط لكل مكوّن
  const results = COMPONENT_DEFS.map((def) => {
    const relevantScores = scores.filter((sc) => {
      const sess = sessionMap[sc.session_id];
      if (!sess) return false;
      if (def.key === "written_exam") return sess.session_kind === "written_exam";
      if (def.key === "practical_exam") return sess.session_kind === "practical_exam";
      return sess.session_kind === "continuous";
    });

    const values = relevantScores.map((sc) => sc[def.field]).filter((v) => v !== null && v !== undefined);
    const avg = values.length > 0 ? values.reduce((a, b) => a + Number(b), 0) / values.length : 0;

    return { ...def, avg: Math.round(avg * 100) / 100, count: values.length };
  });

  const total = Math.round(results.reduce((sum, r) => sum + r.avg, 0) * 100) / 100;

  bodyEl.innerHTML = `
    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card" style="grid-column: span 2;">
        <div class="num">${total}</div>
        <div class="lbl">الدرجة الإجمالية من 100</div>
      </div>
    </div>
    <div class="component-ring-grid">
      ${results.map((r) => `
        <div class="component-mini-card">
          <div class="val">${r.avg}</div>
          <div class="of">من ${r.target}</div>
          <div class="lbl">${r.label}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${r.count} ${r.key.includes("exam") ? "اختبار" : "حصة"} مسجلة</div>
        </div>
      `).join("")}
    </div>
  `;
}
