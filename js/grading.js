// ============================================
// نظام التقييم: إدخال سريع بالشرائح + حضور + سلوك
// ============================================

const SESSION_KIND_LABELS = { continuous: "الحصص", written_exam: "الاختبار التحريري", practical_exam: "الاختبار العملي" };

const COMPONENT_DEFS = [
  { key: "participation", label: "المشاركة", target: 10, field: "participation" },
  { key: "homework", label: "الواجبات", target: 10, field: "homework" },
  { key: "tasks", label: "المهام الأدائية", target: 10, field: "tasks" },
  { key: "practical", label: "التطبيق العملي", target: 10, field: "practical" },
  { key: "written_exam", label: "الاختبار التحريري", target: 30, field: "exam_score" },
  { key: "practical_exam", label: "الاختبار العملي", target: 30, field: "exam_score" },
];

const CHIP_VALUES = [10, 8, 6, 4, 2, 0];

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

// ============================================
// 1) داخل صفحة الفصل: إدارة الحصص والاختبارات
// ============================================

let gradingClassId = null, gradingClassTitle = null, gradingPeriod = "p1";

function renderGradingArea(classId, classTitle) {
  gradingClassId = classId;
  gradingClassTitle = classTitle;
  gradingPeriod = "p1";

  const holder = document.getElementById("gradingAreaHolder");
  holder.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      <div class="period-toggle" id="gradingPeriodToggle" style="margin-bottom:0;">
        <button data-p="p1" class="active">الفترة الأولى</button>
        <button data-p="p2">الفترة الثانية</button>
      </div>
      <button class="btn-secondary" style="width:auto; padding:10px 18px;" onclick="renderClassReport('${classId}', '${escapeAttr(classTitle)}')">📊 تقرير الفصل الشامل</button>
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
    const { data: sessions } = await supabaseClient.from("class_sessions").select("*")
      .eq("class_id", gradingClassId).eq("period", gradingPeriod).eq("session_kind", kind)
      .order("session_number", { ascending: true });

    html += `
      <div class="section-card" style="margin-bottom:16px;">
        <div class="section-head">
          <h3>${SESSION_KIND_LABELS[kind]}</h3>
          <button class="btn-add" onclick="createSession('${kind}')">+ ${kind === "continuous" ? "حصة جديدة" : "اختبار جديد"}</button>
        </div>
        ${!sessions || sessions.length === 0
          ? `<div class="empty-state" style="padding:20px;">ما فيه ${kind === "continuous" ? "حصص" : "اختبارات"} مسجلة بعد</div>`
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
  const { data: existing } = await supabaseClient.from("class_sessions").select("session_number")
    .eq("class_id", gradingClassId).eq("period", gradingPeriod).eq("session_kind", kind)
    .order("session_number", { ascending: false }).limit(1);

  const nextNumber = existing && existing.length > 0 ? existing[0].session_number + 1 : 1;

  const { data: newSession, error } = await supabaseClient.from("class_sessions")
    .insert({ class_id: gradingClassId, period: gradingPeriod, session_kind: kind, session_number: nextNumber })
    .select().single();

  if (error) { alert("تعذر إنشاء السجل: " + error.message); return; }
  openSessionGrid(newSession.id, kind, nextNumber);
}

async function deleteSession(sessionId) {
  if (!confirm("متأكد تبي تحذف هذا السجل؟")) return;
  const { error } = await supabaseClient.from("class_sessions").delete().eq("id", sessionId);
  if (error) { alert("تعذر الحذف"); return; }
  await loadGradingKinds();
}

// ============================================
// 2) جدول الإدخال السريع (شرائح + حضور)
// ============================================

const CONTINUOUS_COLS = [
  { field: "participation", label: "المشاركة" },
  { field: "homework", label: "الواجبات" },
  { field: "tasks", label: "المهام الأدائية" },
  { field: "practical", label: "التطبيق العملي" },
];

let activeCols = ["participation", "homework", "tasks", "practical"];

async function openSessionGrid(sessionId, kind, sessionNumber) {
  const contentArea = document.getElementById("contentArea");
  const isContinuous = kind === "continuous";
  if (isContinuous) activeCols = ["participation", "homework", "tasks", "practical"];

  const { data: students, error: studentsErr } = await supabaseClient
    .from("students").select("*").eq("class_id", gradingClassId).order("student_number", { ascending: true });

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

  document.getElementById("pageTitle").textContent = `${SESSION_KIND_LABELS[kind]} — ${isContinuous ? "حصة" : "اختبار"} ${sessionNumber}`;

  contentArea.innerHTML = `
    <button class="btn-secondary" style="width:auto; padding:8px 16px; margin-bottom:16px;" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">← رجوع للفصل</button>

    ${isContinuous ? `
    <div class="column-picker" id="columnPicker">
      ${CONTINUOUS_COLS.map((c) => `
        <label><input type="checkbox" class="col-check" value="${c.field}" checked /> ${c.label}</label>
      `).join("")}
    </div>
    ` : ""}

    <div class="section-card">
      <div class="section-head">
        <h3>إدخال الدرجات — ${students.length} طالب</h3>
        <button class="btn-add" id="saveGridBtn">💾 حفظ الكل</button>
      </div>
      <p style="color:var(--text-muted); font-size:12px; margin-bottom:14px;">القيمة الافتراضية 10 لكل خانة — بس اضغط على الرقم المناسب للطالب لو يستحق أقل. ${isContinuous ? "الحضور محدد \"حاضر\" افتراضياً لكل الطلاب." : ""}</p>
      <div class="grade-table-wrap">
        <table class="grade-table" id="gradeTable">
          <thead><tr id="gradeTableHead"></tr></thead>
          <tbody id="gradeTableBody"></tbody>
        </table>
      </div>
    </div>
  `;

  function renderTableRows() {
    const head = document.getElementById("gradeTableHead");
    const body = document.getElementById("gradeTableBody");

    if (isContinuous) {
      head.innerHTML = `<th>الطالب</th>${activeCols.map((f) => `<th>${CONTINUOUS_COLS.find((c) => c.field === f).label}</th>`).join("")}<th>الحضور</th>`;
    } else {
      head.innerHTML = `<th>الطالب</th><th>الدرجة (30)</th>`;
    }

    body.innerHTML = students.map((st) => {
      const sc = scoreMap[st.id] || {};
      if (isContinuous) {
        const cols = activeCols.map((field) => {
          const current = sc[field] !== undefined && sc[field] !== null ? sc[field] : 10;
          return `<td><div class="score-chips" data-field="${field}" data-student="${st.id}" data-value="${current}">
            ${CHIP_VALUES.map((v) => `<button type="button" class="chip ${v === current ? "active" : ""}" data-val="${v}">${v}</button>`).join("")}
          </div></td>`;
        }).join("");
        const isPresent = sc.attendance !== false;
        return `<tr data-student="${st.id}">
          <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
          ${cols}
          <td><button type="button" class="attendance-toggle ${isPresent ? "" : "absent"}" data-present="${isPresent}">${isPresent ? "✓ حاضر" : "✕ غائب"}</button></td>
        </tr>`;
      }
      const current = sc.exam_score !== undefined && sc.exam_score !== null ? sc.exam_score : 30;
      return `<tr data-student="${st.id}">
        <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
        <td><input type="number" class="grid-input" data-field="exam_score" min="0" max="30" step="0.5" value="${current}" /></td>
      </tr>`;
    }).join("");

    // ربط أزرار الشرائح
    body.querySelectorAll(".score-chips").forEach((group) => {
      group.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          group.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");
          group.dataset.value = chip.dataset.val;
        });
      });
    });

    // ربط زر الحضور
    body.querySelectorAll(".attendance-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const present = btn.dataset.present === "true";
        btn.dataset.present = (!present).toString();
        btn.textContent = !present ? "✓ حاضر" : "✕ غائب";
        btn.classList.toggle("absent", present);
      });
    });
  }

  renderTableRows();

  if (isContinuous) {
    document.querySelectorAll(".col-check").forEach((chk) => {
      chk.addEventListener("change", () => {
        activeCols = Array.from(document.querySelectorAll(".col-check:checked")).map((c) => c.value);
        renderTableRows();
      });
    });
  }

  document.getElementById("saveGridBtn").addEventListener("click", () => saveSessionGrid(sessionId, isContinuous));
}

async function saveSessionGrid(sessionId, isContinuous) {
  const btn = document.getElementById("saveGridBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spin"></span>';

  const rowsEls = document.querySelectorAll("#gradeTableBody tr");
  const payload = Array.from(rowsEls).map((tr) => {
    const studentId = tr.dataset.student;
    const row = { session_id: sessionId, student_id: studentId };

    if (isContinuous) {
      tr.querySelectorAll(".score-chips").forEach((group) => {
        row[group.dataset.field] = parseFloat(group.dataset.value);
      });
      const attBtn = tr.querySelector(".attendance-toggle");
      row.attendance = attBtn.dataset.present === "true";
    } else {
      const inp = tr.querySelector(".grid-input");
      row.exam_score = inp.value === "" ? null : parseFloat(inp.value);
    }
    return row;
  });

  const { error } = await supabaseClient.from("session_scores").upsert(payload, { onConflict: "session_id,student_id" });

  btn.disabled = false;
  if (error) { btn.innerHTML = "💾 حفظ الكل"; alert("تعذر الحفظ: " + error.message); return; }
  btn.innerHTML = "✅ تم الحفظ";
  setTimeout(() => { btn.innerHTML = "💾 حفظ الكل"; }, 1500);
}

// ============================================
// 3) تقرير الطالب الكامل
// ============================================

let reportStudent = null, reportPeriod = "p1";

async function openStudentReport(studentId, studentName) {
  const { data: student, error } = await supabaseClient.from("students").select("*, classes(id, title)").eq("id", studentId).single();
  if (error || !student) { alert("تعذر تحميل بيانات الطالب"); return; }

  reportStudent = { id: student.id, name: student.full_name, class_id: student.class_id, class_title: student.classes ? student.classes.title : null };
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
    <div class="section-card" style="margin-top:20px;">
      <div class="section-head">
        <h3>📌 ملاحظات السلوك</h3>
        <button class="btn-add" id="addBehaviorBtn">+ إضافة ملاحظة</button>
      </div>
      <div id="behaviorList"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.querySelectorAll("#reportPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      reportPeriod = btn.dataset.p;
      document.querySelectorAll("#reportPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadReportBody();
    });
  });

  document.getElementById("addBehaviorBtn").addEventListener("click", openAddBehaviorModal);

  loadReportBody();
  loadBehaviorNotes();
}

async function loadReportBody() {
  const bodyEl = document.getElementById("reportBody");
  if (!reportStudent.class_id) {
    bodyEl.innerHTML = `<div class="section-card"><div class="empty-state">هذا الطالب غير مرتبط بفصل.</div></div>`;
    return;
  }
  bodyEl.innerHTML = `<div class="empty-state">جاري التحميل...</div>`;

  const { data: sessions } = await supabaseClient.from("class_sessions").select("*").eq("class_id", reportStudent.class_id).eq("period", reportPeriod);
  const sessionIds = (sessions || []).map((s) => s.id);
  let scores = [];
  if (sessionIds.length > 0) {
    const { data } = await supabaseClient.from("session_scores").select("*").eq("student_id", reportStudent.id).in("session_id", sessionIds);
    scores = data || [];
  }
  const sessionMap = {};
  (sessions || []).forEach((s) => (sessionMap[s.id] = s));

  const results = COMPONENT_DEFS.map((def) => {
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

  const total = Math.round(results.reduce((sum, r) => sum + r.avg, 0) * 100) / 100;

  const continuousScores = scores.filter((sc) => sessionMap[sc.session_id] && sessionMap[sc.session_id].session_kind === "continuous");
  const presentCount = continuousScores.filter((sc) => sc.attendance !== false).length;
  const attendanceRate = continuousScores.length > 0 ? Math.round((presentCount / continuousScores.length) * 100) : null;

  bodyEl.innerHTML = `
    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card"><div class="num">${total}</div><div class="lbl">الدرجة الإجمالية من 100</div></div>
      <div class="stat-card"><div class="num">${attendanceRate !== null ? attendanceRate + "%" : "—"}</div><div class="lbl">نسبة الحضور (${presentCount}/${continuousScores.length})</div></div>
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

// ============================================
// 4) ملاحظات السلوك
// ============================================

async function loadBehaviorNotes() {
  const listEl = document.getElementById("behaviorList");
  const { data, error } = await supabaseClient.from("behavior_notes").select("*").eq("student_id", reportStudent.id).order("created_at", { ascending: false });

  if (error) { listEl.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { listEl.innerHTML = `<div class="empty-state">ما فيه ملاحظات سلوك مسجلة بعد</div>`; return; }

  listEl.innerHTML = data.map((n) => `
    <div class="behavior-note ${n.note_type}">
      <div>
        <div class="txt">${n.note_type === "positive" ? "🟢" : "🔴"} ${escapeHtml(n.note)}</div>
        <div class="date">${new Date(n.created_at).toLocaleDateString("ar-SA")}</div>
      </div>
      <button class="icon-btn danger" onclick="deleteBehaviorNote('${n.id}')" title="حذف">✕</button>
    </div>
  `).join("");
}

function openAddBehaviorModal() {
  document.getElementById("modalTitle").textContent = "إضافة ملاحظة سلوك";
  document.getElementById("modalFields").innerHTML = `
    <div class="btn-pill-choice">
      <button type="button" class="positive active" data-type="positive">🟢 إيجابية</button>
      <button type="button" class="negative" data-type="negative">🔴 سلبية</button>
    </div>
    <input type="hidden" id="bh_type" value="positive" />
    <div class="field"><label>الملاحظة</label><input type="text" id="bh_note" required /></div>
  `;

  document.querySelectorAll(".btn-pill-choice button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-pill-choice button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("bh_type").value = btn.dataset.type;
    });
  });

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const note_type = document.getElementById("bh_type").value;
    const note = document.getElementById("bh_note").value.trim();

    const { error } = await supabaseClient.from("behavior_notes").insert({ student_id: reportStudent.id, note_type, note });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر الحفظ"); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    await loadBehaviorNotes();
  };

  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteBehaviorNote(id) {
  if (!confirm("متأكد تبي تحذف هذي الملاحظة؟")) return;
  const { error } = await supabaseClient.from("behavior_notes").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadBehaviorNotes();
}

// ============================================
// 5) تقرير الفصل الشامل
// ============================================

async function renderClassReport(classId, classTitle) {
  document.getElementById("pageTitle").textContent = `تقرير الفصل: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <button class="btn-secondary" style="width:auto; padding:8px 16px; margin-bottom:16px;" onclick="openClass('${classId}', '${escapeAttr(classTitle)}')">← رجوع للفصل</button>
    <div class="period-toggle" id="reportClassPeriodToggle">
      <button data-p="p1" class="active">الفترة الأولى</button>
      <button data-p="p2">الفترة الثانية</button>
    </div>
    <div class="section-card">
      <div class="grade-table-wrap">
        <table class="grade-table class-report-table" id="classReportTable">
          <thead><tr>
            <th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>تحريري</th><th>عملي</th><th>الإجمالي</th><th>الحضور</th><th>🟢</th><th>🔴</th>
          </tr></thead>
          <tbody id="classReportBody"><tr><td colspan="11" class="empty-state">جاري التحميل...</td></tr></tbody>
        </table>
      </div>
    </div>
  `;

  let period = "p1";
  document.querySelectorAll("#reportClassPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      period = btn.dataset.p;
      document.querySelectorAll("#reportClassPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadClassReportBody(classId, period);
    });
  });

  await loadClassReportBody(classId, period);
}

async function loadClassReportBody(classId, period) {
  const body = document.getElementById("classReportBody");
  body.innerHTML = `<tr><td colspan="11" class="empty-state">جاري التحميل...</td></tr>`;

  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("student_number");
  if (!students || students.length === 0) {
    body.innerHTML = `<tr><td colspan="11" class="empty-state">ما فيه طلاب بهذا الفصل</td></tr>`;
    return;
  }

  const { data: sessions } = await supabaseClient.from("class_sessions").select("*").eq("class_id", classId).eq("period", period);
  const sessionIds = (sessions || []).map((s) => s.id);
  const sessionMap = {};
  (sessions || []).forEach((s) => (sessionMap[s.id] = s));

  let allScores = [];
  if (sessionIds.length > 0) {
    const { data } = await supabaseClient.from("session_scores").select("*").in("session_id", sessionIds);
    allScores = data || [];
  }

  const { data: allNotes } = await supabaseClient.from("behavior_notes").select("*").in("student_id", students.map((s) => s.id));

  body.innerHTML = students.map((st) => {
    const myScores = allScores.filter((sc) => sc.student_id === st.id);
    const results = COMPONENT_DEFS.map((def) => {
      const relevant = myScores.filter((sc) => {
        const sess = sessionMap[sc.session_id];
        if (!sess) return false;
        if (def.key === "written_exam") return sess.session_kind === "written_exam";
        if (def.key === "practical_exam") return sess.session_kind === "practical_exam";
        return sess.session_kind === "continuous";
      });
      const values = relevant.map((sc) => sc[def.field]).filter((v) => v !== null && v !== undefined);
      return values.length > 0 ? Math.round((values.reduce((a, b) => a + Number(b), 0) / values.length) * 100) / 100 : 0;
    });
    const total = Math.round(results.reduce((a, b) => a + b, 0) * 100) / 100;

    const continuousScores = myScores.filter((sc) => sessionMap[sc.session_id] && sessionMap[sc.session_id].session_kind === "continuous");
    const presentCount = continuousScores.filter((sc) => sc.attendance !== false).length;
    const attendanceStr = continuousScores.length > 0 ? Math.round((presentCount / continuousScores.length) * 100) + "%" : "—";

    const myNotes = (allNotes || []).filter((n) => n.student_id === st.id);
    const posCount = myNotes.filter((n) => n.note_type === "positive").length;
    const negCount = myNotes.filter((n) => n.note_type === "negative").length;

    return `
      <tr style="cursor:pointer;" onclick="openStudentReport('${st.id}', '${escapeAttr(st.full_name)}')">
        <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
        ${results.map((r) => `<td>${r}</td>`).join("")}
        <td style="font-weight:700; color:var(--accent-cyan);">${total}</td>
        <td>${attendanceStr}</td>
        <td>${posCount}</td>
        <td>${negCount}</td>
      </tr>
    `;
  }).join("");
}

// ============================================
// 6) صفحة سجل متابعة الطلاب: بحث مباشر عن أي طالب
// ============================================

async function renderTrackingSearchSection() {
  document.getElementById("pageTitle").textContent = "سجل متابعة الطلاب";
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head"><h3>🔍 ابحث عن الطالب لعرض تقريره الكامل</h3></div>
      <input type="text" id="trackSearchInput" placeholder="اكتب اسم الطالب..." />
      <div id="trackSearchResults" style="margin-top:14px;"></div>
    </div>
  `;

  let searchTimeout;
  document.getElementById("trackSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => trackSearch(e.target.value), 300);
  });
}

async function trackSearch(query) {
  const resultsEl = document.getElementById("trackSearchResults");
  if (!query || query.trim().length < 2) { resultsEl.innerHTML = ""; return; }

  const { data, error } = await supabaseClient.from("students").select("*, classes(title)").ilike("full_name", `%${query.trim()}%`).limit(15);

  if (error || !data || data.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه نتائج</div>`;
    return;
  }

  resultsEl.innerHTML = data.map((s) => `
    <div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}')">
      <div class="info">
        <div class="t">${escapeHtml(s.full_name)}</div>
        <div class="d">${s.classes ? escapeHtml(s.classes.title) : "بدون فصل"} · الصف ${escapeHtml(s.grade)}</div>
      </div>
      <div class="actions"><span class="icon-btn">←</span></div>
    </div>
  `).join("");
}
