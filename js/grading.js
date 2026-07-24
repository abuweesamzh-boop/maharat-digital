// ============================================
// نظام التقييم: إدخال سريع + حضور + سلوك + طباعة/إكسل
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
// 2) جدول الإدخال السريع (شرائح + حضور + ملاحظة)
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
      ${CONTINUOUS_COLS.map((c) => `<label><input type="checkbox" class="col-check" value="${c.field}" checked /> ${c.label}</label>`).join("")}
    </div>
    ` : ""}

    <div class="section-card">
      <div class="section-head">
        <h3>إدخال الدرجات — ${students.length} طالب</h3>
        <button class="btn-add" id="saveGridBtn">💾 حفظ الكل</button>
      </div>
      <p style="color:var(--text-muted); font-size:12px; margin-bottom:14px;">القيمة الافتراضية 10 لكل خانة — بس اضغط على الرقم المناسب للطالب لو يستحق أقل. ${isContinuous ? "الحضور محدد \"حاضر\" افتراضياً." : ""}</p>
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
      head.innerHTML = `<th>الطالب</th>${CONTINUOUS_COLS.map((c) => `<th class="col-${c.field}">${c.label}</th>`).join("")}<th>ملاحظة</th><th>الحضور</th>`;
    } else {
      head.innerHTML = `<th>الطالب</th><th>الدرجة (30)</th>`;
    }

    body.innerHTML = students.map((st) => {
      const sc = scoreMap[st.id] || {};
      if (isContinuous) {
        const cols = CONTINUOUS_COLS.map(({ field }) => {
          const current = sc[field] !== undefined && sc[field] !== null ? sc[field] : 10;
          return `<td class="col-${field}"><div class="score-chips" data-field="${field}" data-student="${st.id}" data-value="${current}">
            ${CHIP_VALUES.map((v) => `<button type="button" class="chip ${v === current ? "active" : ""}" data-val="${v}">${v}</button>`).join("")}
          </div></td>`;
        }).join("");
        const isPresent = sc.attendance !== false;
        return `<tr data-student="${st.id}">
          <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
          ${cols}
          <td><button type="button" class="quick-note-btn" data-student="${st.id}" data-name="${escapeAttr(st.full_name)}" title="ملاحظة سريعة">📝</button></td>
          <td><button type="button" class="attendance-toggle ${isPresent ? "" : "absent"}" data-present="${isPresent}">${isPresent ? "✓ حاضر" : "✕ غائب"}</button></td>
        </tr>`;
      }
      const current = sc.exam_score !== undefined && sc.exam_score !== null ? sc.exam_score : 30;
      return `<tr data-student="${st.id}">
        <td class="student-name-cell">${escapeHtml(st.full_name)}</td>
        <td><input type="number" class="grid-input" data-field="exam_score" min="0" max="30" step="0.5" value="${current}" /></td>
      </tr>`;
    }).join("");

    body.querySelectorAll(".score-chips").forEach((group) => {
      group.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          group.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
          chip.classList.add("active");
          group.dataset.value = chip.dataset.val;
        });
      });
    });

    body.querySelectorAll(".attendance-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const present = btn.dataset.present === "true";
        btn.dataset.present = (!present).toString();
        btn.textContent = !present ? "✓ حاضر" : "✕ غائب";
        btn.classList.toggle("absent", present);
      });
    });

    body.querySelectorAll(".quick-note-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => openQuickNotePopover(e, btn.dataset.student, btn.dataset.name));
    });

    applyColumnVisibility();
  }

  function applyColumnVisibility() {
    CONTINUOUS_COLS.forEach(({ field }) => {
      const visible = activeCols.includes(field);
      document.querySelectorAll(`.col-${field}`).forEach((el) => { el.style.display = visible ? "" : "none"; });
    });
  }

  renderTableRows();

  if (isContinuous) {
    document.querySelectorAll(".col-check").forEach((chk) => {
      chk.addEventListener("change", () => {
        activeCols = Array.from(document.querySelectorAll(".col-check:checked")).map((c) => c.value);
        applyColumnVisibility();
      });
    });
  }

  document.getElementById("saveGridBtn").addEventListener("click", () => saveSessionGrid(sessionId, isContinuous));
}

function openQuickNotePopover(event, studentId, studentName) {
  document.querySelectorAll(".quick-note-popover").forEach((p) => p.remove());
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();

  const pop = document.createElement("div");
  pop.className = "quick-note-popover";
  pop.style.top = (rect.bottom + window.scrollY + 6) + "px";
  pop.style.left = (rect.left + window.scrollX - 100) + "px";
  pop.innerHTML = `
    <div style="font-size:12px; font-weight:700; margin-bottom:10px;">ملاحظة سريعة: ${escapeHtml(studentName)}</div>
    <div class="btn-pill-choice" style="margin-bottom:10px;">
      <button type="button" class="positive active" data-type="positive" style="padding:8px;">🟢 إيجابية</button>
      <button type="button" class="negative" data-type="negative" style="padding:8px;">🔴 سلبية</button>
    </div>
    <input type="text" id="qn_text" placeholder="اكتب الملاحظة..." style="margin-bottom:10px;" />
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn-secondary" id="qn_cancel" style="width:auto; padding:8px 14px;">إلغاء</button>
      <button type="button" class="btn-add" id="qn_save" style="flex:1;">حفظ</button>
    </div>
  `;
  document.body.appendChild(pop);

  let noteType = "positive";
  pop.querySelectorAll(".btn-pill-choice button").forEach((b) => {
    b.addEventListener("click", () => {
      pop.querySelectorAll(".btn-pill-choice button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      noteType = b.dataset.type;
    });
  });

  pop.querySelector("#qn_cancel").addEventListener("click", () => pop.remove());

  pop.querySelector("#qn_save").addEventListener("click", async () => {
    const text = pop.querySelector("#qn_text").value.trim();
    if (!text) return;
    const saveBtn = pop.querySelector("#qn_save");
    saveBtn.disabled = true;
    saveBtn.textContent = "...";

    const { error } = await supabaseClient.from("behavior_notes").insert({ student_id: studentId, note_type: noteType, note: text });
    if (error) { alert("تعذر الحفظ"); saveBtn.disabled = false; saveBtn.textContent = "حفظ"; return; }

    const btnEl = document.querySelector(`.quick-note-btn[data-student="${studentId}"]`);
    if (btnEl) btnEl.classList.add("has-note");
    pop.remove();
  });

  setTimeout(() => {
    document.addEventListener("click", function closeOnOutside(e) {
      if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener("click", closeOnOutside); }
    });
  }, 50);
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
      tr.querySelectorAll(".score-chips").forEach((group) => { row[group.dataset.field] = parseFloat(group.dataset.value); });
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
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="folder-avatar" style="--folder-color:var(--accent-cyan); width:56px; height:56px; font-size:22px;">${reportStudent.name.charAt(0)}</div>
          <div>
            <div style="font-family:var(--font-display); font-weight:800; font-size:19px;">${escapeHtml(reportStudent.name)}</div>
            <div style="color:var(--text-muted); font-size:13px;">${reportStudent.class_title ? escapeHtml(reportStudent.class_title) : "بدون فصل"}</div>
          </div>
        </div>
        <button class="btn-secondary no-print" style="width:auto; padding:10px 18px;" onclick="window.print()">🖨️ طباعة التقرير</button>
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

function calcStudentResults(scores, sessionMap) {
  return COMPONENT_DEFS.map((def) => {
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
}

async function loadReportBody() {
  const bodyEl = document.getElementById("reportBody");
  if (!reportStudent.class_id) { bodyEl.innerHTML = `<div class="section-card"><div class="empty-state">هذا الطالب غير مرتبط بفصل.</div></div>`; return; }
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

  const results = calcStudentResults(scores, sessionMap);
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
// 5) تقرير الفصل الشامل + طباعة/إكسل
// ============================================

let classReportCache = null;

async function renderClassReport(classId, classTitle) {
  document.getElementById("pageTitle").textContent = `تقرير الفصل: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <button class="btn-secondary no-print" style="width:auto; padding:8px 16px; margin-bottom:16px;" onclick="openClass('${classId}', '${escapeAttr(classTitle)}')">← رجوع للفصل</button>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      <div class="period-toggle" id="reportClassPeriodToggle" style="margin-bottom:0;">
        <button data-p="p1" class="active">الفترة الأولى</button>
        <button data-p="p2">الفترة الثانية</button>
      </div>
      <div class="no-print" style="display:flex; gap:10px;">
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="window.print()">🖨️ طباعة الجدول</button>
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="exportClassReportExcel('${escapeAttr(classTitle)}')">📥 تصدير إكسل</button>
        <button class="btn-add" onclick="printAllStudentReports('${classId}', '${escapeAttr(classTitle)}')">🖨️ طباعة تقارير كل الطلاب</button>
      </div>
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
  if (!students || students.length === 0) { body.innerHTML = `<tr><td colspan="11" class="empty-state">ما فيه طلاب بهذا الفصل</td></tr>`; return; }

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

  const rowsData = students.map((st) => {
    const myScores = allScores.filter((sc) => sc.student_id === st.id);
    const results = calcStudentResults(myScores, sessionMap);
    const total = Math.round(results.reduce((a, b) => a + b.avg, 0) * 100) / 100;

    const continuousScores = myScores.filter((sc) => sessionMap[sc.session_id] && sessionMap[sc.session_id].session_kind === "continuous");
    const presentCount = continuousScores.filter((sc) => sc.attendance !== false).length;
    const attendanceStr = continuousScores.length > 0 ? Math.round((presentCount / continuousScores.length) * 100) + "%" : "—";

    const myNotes = (allNotes || []).filter((n) => n.student_id === st.id);
    const posCount = myNotes.filter((n) => n.note_type === "positive").length;
    const negCount = myNotes.filter((n) => n.note_type === "negative").length;

    return { student: st, results, total, attendanceStr, posCount, negCount };
  });

  classReportCache = { classId, period, rowsData };

  body.innerHTML = rowsData.map((r) => `
    <tr style="cursor:pointer;" onclick="openStudentReport('${r.student.id}', '${escapeAttr(r.student.full_name)}')">
      <td class="student-name-cell">${escapeHtml(r.student.full_name)}</td>
      ${r.results.map((c) => `<td>${c.avg}</td>`).join("")}
      <td style="font-weight:700; color:var(--accent-cyan);">${r.total}</td>
      <td>${r.attendanceStr}</td>
      <td>${r.posCount}</td>
      <td>${r.negCount}</td>
    </tr>
  `).join("");
}

function exportClassReportExcel(classTitle) {
  if (!classReportCache) return;
  const headers = ["الطالب", "المشاركة", "الواجبات", "المهام الأدائية", "التطبيق العملي", "التحريري", "العملي", "الإجمالي", "الحضور", "ملاحظات إيجابية", "ملاحظات سلبية"];
  const rows = classReportCache.rowsData.map((r) => [
    r.student.full_name, ...r.results.map((c) => c.avg), r.total, r.attendanceStr, r.posCount, r.negCount,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير الفصل");
  XLSX.writeFile(wb, `تقرير-${classTitle}.xlsx`);
}

async function printAllStudentReports(classId, classTitle) {
  if (!classReportCache || classReportCache.classId !== classId) return;

  const periodLabel = classReportCache.period === "p1" ? "الفترة الأولى" : "الفترة الثانية";

  const studentsHtml = classReportCache.rowsData.map((r) => `
    <div style="page-break-after: always; padding: 20px; font-family: Tajawal, Arial, sans-serif; direction: rtl;">
      <h2 style="margin-bottom:4px;">${escapeHtml(r.student.full_name)}</h2>
      <p style="color:#555; margin-bottom:20px;">${escapeHtml(classTitle)} — ${periodLabel}</p>
      <table style="width:100%; border-collapse: collapse; margin-bottom:20px;">
        <thead>
          <tr style="background:#eee;">
            ${r.results.map((c) => `<th style="border:1px solid #ccc; padding:8px;">${c.label}</th>`).join("")}
            <th style="border:1px solid #ccc; padding:8px;">الإجمالي</th>
            <th style="border:1px solid #ccc; padding:8px;">الحضور</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            ${r.results.map((c) => `<td style="border:1px solid #ccc; padding:8px; text-align:center;">${c.avg} / ${c.target}</td>`).join("")}
            <td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${r.total} / 100</td>
            <td style="border:1px solid #ccc; padding:8px; text-align:center;">${r.attendanceStr}</td>
          </tr>
        </tbody>
      </table>
      <p>ملاحظات إيجابية: ${r.posCount} · ملاحظات سلبية: ${r.negCount}</p>
    </div>
  `).join("");

  const win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقارير ${escapeHtml(classTitle)}</title></head>
    <body>${studentsHtml}</body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ============================================
// 6) صفحة سجل متابعة البحث (لاستخدام داخلي إن لزم)
// ============================================

async function trackSearch(query) {
  const resultsEl = document.getElementById("trackSearchResults");
  if (!resultsEl) return;
  if (!query || query.trim().length < 2) { resultsEl.innerHTML = ""; return; }

  const { data, error } = await supabaseClient.from("students").select("*, classes(title)").ilike("full_name", `%${query.trim()}%`).limit(15);

  if (error || !data || data.length === 0) { resultsEl.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه نتائج</div>`; return; }

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
