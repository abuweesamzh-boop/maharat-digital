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

const POSITIVE_NOTES = ["مشارك ومتفاعل", "متميز في الانضباط", "التطبيق العملي الجيد", "المبادرة", "الاهتمام بالمادة", "الالتزام بالتعليمات", "إتقان استخدام الأجهزة والبرامج", "حل المشكلات التقنية بنفسه", "التعاون في العمل الجماعي الرقمي", "الإبداع في تصميم المشاريع"];
const NEGATIVE_NOTES = ["التأخر عن الحصة", "مقاطعة الدرس باستمرار", "العبث في الأجهزة والممتلكات العامة", "التلفظ على زملائه", "الحديث الجانبي أثناء الدرس", "عدم الاهتمام بالمادة", "إثارة الفوضى داخل الفصل أو المدرسة", "عدم الالتزام بالوقت", "عدم الالتزام بالتعليمات", "سوء استخدام الأجهزة أو البرامج", "عدم المحافظة على معدات الحاسب", "استخدام الجهاز في غير الغرض المخصص للحصة"];

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

// ============================================
// 1) نظام حساب موحّد (يُستخدم بتقرير الطالب وتقرير الفصل مع بعض)
// درجات الطالب مرتبطة به شخصياً، بغض النظر عن أي فصل — تبقى معه حتى لو انتقل
// ============================================

async function fetchStudentResults(studentId, period) {
  const { data: scores, error } = await supabaseClient
    .from("session_scores")
    .select("*, class_sessions!inner(session_kind, period)")
    .eq("student_id", studentId)
    .eq("class_sessions.period", period);

  const safe = error ? [] : (scores || []);

  const results = COMPONENT_DEFS.map((def) => {
    const relevant = safe.filter((sc) => {
      const kind = sc.class_sessions.session_kind;
      if (def.key === "written_exam") return kind === "written_exam";
      if (def.key === "practical_exam") return kind === "practical_exam";
      return kind === "continuous";
    });
    const values = relevant.map((sc) => sc[def.field]).filter((v) => v !== null && v !== undefined);
    const avg = values.length > 0 ? values.reduce((a, b) => a + Number(b), 0) / values.length : 0;
    return { ...def, avg: Math.round(avg * 100) / 100, count: values.length };
  });

  const total = Math.round(results.reduce((sum, r) => sum + r.avg, 0) * 100) / 100;
  const continuousScores = safe.filter((sc) => sc.class_sessions.session_kind === "continuous");
  const presentCount = continuousScores.filter((sc) => sc.attendance !== false).length;
  const attendanceRate = continuousScores.length > 0 ? Math.round((presentCount / continuousScores.length) * 100) : null;

  return { results, total, attendanceRate, presentCount, totalSessions: continuousScores.length };
}

// ============================================
// 2) داخل صفحة الفصل: إدارة الحصص والاختبارات
// ============================================

let gradingClassId = null, gradingClassTitle = null, gradingPeriod = "p1";

function renderGradingArea(classId, classTitle) {
  gradingClassId = classId; gradingClassTitle = classTitle; gradingPeriod = "p1";
  const holder = document.getElementById("gradingAreaHolder");
  holder.innerHTML = `
    <div style="margin-bottom:16px;">
      <div class="period-toggle" id="gradingPeriodToggle" style="margin-bottom:0;"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
    </div>
    <div id="gradingKindsHolder"></div>`;
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
    const { data: sessions } = await supabaseClient.from("class_sessions").select("*").eq("class_id", gradingClassId).eq("period", gradingPeriod).eq("session_kind", kind).order("session_number", { ascending: true });
    html += `
      <div class="section-card" style="margin-bottom:16px;">
        <div class="section-head"><h3>${SESSION_KIND_LABELS[kind]}</h3><button class="btn-add" onclick="createSession('${kind}')">+ ${kind === "continuous" ? "حصة جديدة" : "اختبار جديد"}</button></div>
        ${!sessions || sessions.length === 0 ? `<div class="empty-state" style="padding:20px;">ما فيه ${kind === "continuous" ? "حصص" : "اختبارات"} مسجلة بعد</div>` : `<div class="session-pill-row">` + sessions.map((s) => `
          <div class="session-pill" onclick="openSessionGrid('${s.id}', '${kind}', ${s.session_number})">
            <div class="del" onclick="event.stopPropagation(); deleteSession('${s.id}')">✕</div>
            <div class="num">${kind === "continuous" ? "حصة " + s.session_number : "اختبار " + s.session_number}</div>
            <div class="lbl">اضغط للتعديل</div>
          </div>`).join("") + `</div>`}
      </div>`;
  }
  holder.innerHTML = html;
}

async function createSession(kind) {
  const { data: existing } = await supabaseClient.from("class_sessions").select("session_number").eq("class_id", gradingClassId).eq("period", gradingPeriod).eq("session_kind", kind).order("session_number", { ascending: false }).limit(1);
  const nextNumber = existing && existing.length > 0 ? existing[0].session_number + 1 : 1;
  const { data: newSession, error } = await supabaseClient.from("class_sessions").insert({ class_id: gradingClassId, period: gradingPeriod, session_kind: kind, session_number: nextNumber }).select().single();
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
// 3) جدول الإدخال السريع (شرائح + حضور + ملاحظة)
// ============================================

const CONTINUOUS_COLS = [
  { field: "participation", label: "المشاركة" }, { field: "homework", label: "الواجبات" },
  { field: "tasks", label: "المهام الأدائية" }, { field: "practical", label: "التطبيق العملي" },
];
let activeCols = ["participation", "homework", "tasks", "practical"];

async function openSessionGrid(sessionId, kind, sessionNumber) {
  const contentArea = document.getElementById("contentArea");
  const isContinuous = kind === "continuous";
  if (isContinuous) activeCols = ["participation", "homework", "tasks", "practical"];
  const { data: students, error: studentsErr } = await supabaseClient.from("students").select("*").eq("class_id", gradingClassId).order("student_number", { ascending: true });
  if (studentsErr || !students || students.length === 0) {
    contentArea.innerHTML = `<button class="btn-back no-print" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">← رجوع للفصل</button><div class="section-card"><div class="empty-state">ما فيه طلاب بهذا الفصل — أضفهم أولاً</div></div>`;
    return;
  }
  const { data: scores } = await supabaseClient.from("session_scores").select("*").eq("session_id", sessionId);
  const scoreMap = {};
  (scores || []).forEach((s) => (scoreMap[s.student_id] = s));
  document.getElementById("pageTitle").textContent = `${SESSION_KIND_LABELS[kind]} — ${isContinuous ? "حصة" : "اختبار"} ${sessionNumber}`;
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">← رجوع للفصل</button>
    ${isContinuous ? `<div class="column-picker" id="columnPicker">${CONTINUOUS_COLS.map((c) => `<label><input type="checkbox" class="col-check" value="${c.field}" checked /> ${c.label}</label>`).join("")}</div>` : ""}
    <div class="section-card">
      <div class="section-head"><h3>إدخال الدرجات — ${students.length} طالب</h3><button class="btn-add" id="saveGridBtn">💾 حفظ الكل</button></div>
      <p style="color:var(--text-muted); font-size:12px; margin-bottom:14px;">القيمة الافتراضية 10 لكل خانة — بس اضغط على الرقم المناسب للطالب لو يستحق أقل.</p>
      <div class="grade-table-wrap"><table class="grade-table" id="gradeTable"><thead><tr id="gradeTableHead"></tr></thead><tbody id="gradeTableBody"></tbody></table></div>
    </div>`;

  function renderTableRows() {
    const head = document.getElementById("gradeTableHead");
    const body = document.getElementById("gradeTableBody");
    if (isContinuous) head.innerHTML = `<th>الطالب</th>${CONTINUOUS_COLS.map((c) => `<th class="col-${c.field}">${c.label}</th>`).join("")}<th>ملاحظة</th><th>الحضور</th>`;
    else head.innerHTML = `<th>الطالب</th><th>الدرجة (30)</th>`;

    body.innerHTML = students.map((st) => {
      const sc = scoreMap[st.id] || {};
      if (isContinuous) {
        const cols = CONTINUOUS_COLS.map(({ field }) => {
          const current = sc[field] !== undefined && sc[field] !== null ? sc[field] : 10;
          return `<td class="col-${field}"><div class="score-chips" data-field="${field}" data-student="${st.id}" data-value="${current}">${CHIP_VALUES.map((v) => `<button type="button" class="chip ${v === current ? "active" : ""}" data-val="${v}">${v}</button>`).join("")}</div></td>`;
        }).join("");
        const isPresent = sc.attendance !== false;
        return `<tr data-student="${st.id}"><td class="student-name-cell">${escapeHtml(st.full_name)}</td>${cols}<td><button type="button" class="quick-note-btn" data-student="${st.id}" data-name="${escapeAttr(st.full_name)}" title="ملاحظة سريعة">📝</button></td><td><button type="button" class="attendance-toggle ${isPresent ? "" : "absent"}" data-present="${isPresent}">${isPresent ? "✓ حاضر" : "✕ غائب"}</button></td></tr>`;
      }
      const current = sc.exam_score !== undefined && sc.exam_score !== null ? sc.exam_score : 30;
      return `<tr data-student="${st.id}"><td class="student-name-cell">${escapeHtml(st.full_name)}</td><td><input type="number" class="grid-input" data-field="exam_score" min="0" max="30" step="0.5" value="${current}" /></td></tr>`;
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
      btn.addEventListener("click", (e) => openQuickNotePopover(e, btn.dataset.student, btn.dataset.name, sessionId));
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

// ============================================
// 4) ملاحظة سريعة (قائمة جاهزة إيجابية/سلبية + أخرى)
// ============================================

function buildNoteSelectHtml(type) {
  const list = type === "positive" ? POSITIVE_NOTES : NEGATIVE_NOTES;
  return `
    <select id="qn_select" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:11px 12px; color:var(--text-primary); font-family:var(--font-body); margin-bottom:10px;">
      ${list.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("")}
      <option value="__other__">أخرى (اكتب بنفسك)...</option>
    </select>
    <input type="text" id="qn_text" placeholder="اكتب الملاحظة..." style="display:none; margin-bottom:10px;" />
  `;
}

function openQuickNotePopover(event, studentId, studentName, sessionId) {
  document.querySelectorAll(".quick-note-popover").forEach((p) => p.remove());
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "quick-note-popover";
  pop.style.top = (rect.bottom + window.scrollY + 6) + "px";
  pop.style.left = (rect.left + window.scrollX - 100) + "px";
  pop.innerHTML = `
    <div style="font-size:12px; font-weight:700; margin-bottom:10px;">ملاحظة سريعة: ${escapeHtml(studentName)}</div>
    <div class="btn-pill-choice" style="margin-bottom:10px;"><button type="button" class="positive active" data-type="positive" style="padding:8px;">🟢 إيجابية</button><button type="button" class="negative" data-type="negative" style="padding:8px;">🔴 سلبية</button></div>
    <div id="qn_selectHolder">${buildNoteSelectHtml("positive")}</div>
    <div style="display:flex; gap:8px;"><button type="button" class="btn-secondary" id="qn_cancel" style="width:auto; padding:8px 14px;">إلغاء</button><button type="button" class="btn-add" id="qn_save" style="flex:1;">حفظ</button></div>`;
  document.body.appendChild(pop);

  let noteType = "positive";
  function wireSelect() {
    const sel = pop.querySelector("#qn_select");
    const txt = pop.querySelector("#qn_text");
    sel.addEventListener("change", () => { txt.style.display = sel.value === "__other__" ? "" : "none"; });
  }
  wireSelect();

  pop.querySelectorAll(".btn-pill-choice button").forEach((b) => {
    b.addEventListener("click", () => {
      pop.querySelectorAll(".btn-pill-choice button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      noteType = b.dataset.type;
      pop.querySelector("#qn_selectHolder").innerHTML = buildNoteSelectHtml(noteType);
      wireSelect();
    });
  });

  pop.querySelector("#qn_cancel").addEventListener("click", () => pop.remove());

  pop.querySelector("#qn_save").addEventListener("click", async () => {
    const sel = pop.querySelector("#qn_select");
    const txtInput = pop.querySelector("#qn_text");
    const text = sel.value === "__other__" ? txtInput.value.trim() : sel.value;
    if (!text) return;
    const saveBtn = pop.querySelector("#qn_save");
    saveBtn.disabled = true; saveBtn.textContent = "...";
    const { error } = await supabaseClient.from("behavior_notes").insert({ student_id: studentId, note_type: noteType, note: text, session_id: sessionId || null });
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
  btn.disabled = true; btn.innerHTML = '<span class="loading-spin"></span>';
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
// 5) تقرير الطالب الكامل
// ============================================

let reportStudent = null, reportPeriod = "p1", reportFromClass = null;

async function openStudentReport(studentId, studentName, fromClass) {
  const { data: student, error } = await supabaseClient.from("students").select("*, classes(id, title)").eq("id", studentId).single();
  if (error || !student) { alert("تعذر تحميل بيانات الطالب"); return; }
  reportStudent = { id: student.id, name: student.full_name, class_id: student.class_id, class_title: student.classes ? student.classes.title : null };
  reportPeriod = "p1";
  reportFromClass = fromClass || (reportStudent.class_id ? { id: reportStudent.class_id, title: reportStudent.class_title } : null);
  document.getElementById("pageTitle").textContent = "تقرير الطالب";
  renderReportShell();
}

function renderReportShell() {
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="${reportFromClass ? `openClass('${reportFromClass.id}', '${escapeAttr(reportFromClass.title)}')` : "renderClassesSection()"}">← رجوع</button>
    <div class="section-card" style="margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="folder-avatar" style="--folder-color:var(--accent-cyan); width:56px; height:56px; font-size:22px;">${reportStudent.name.charAt(0)}</div>
          <div><div style="font-family:var(--font-display); font-weight:800; font-size:19px;">${escapeHtml(reportStudent.name)}</div><div style="color:var(--text-muted); font-size:13px;">${reportStudent.class_title ? escapeHtml(reportStudent.class_title) : "بدون فصل"}</div></div>
        </div>
        <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-secondary" style="width:auto; padding:10px 16px;" id="transferStudentBtn">🔄 نقل لفصل آخر</button>
          <button class="btn-secondary" style="width:auto; padding:10px 16px;" id="parentQrBtn">📱 رمز ولي الأمر</button>
          <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="window.print()">🖨️ طباعة التقرير</button>
        </div>
      </div>
    </div>
    <div class="period-toggle" id="reportPeriodToggle"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
    <div id="reportBody"></div>
    <div class="section-card" style="margin-top:20px;">
      <div class="section-head"><h3>📌 ملاحظات السلوك</h3><button class="btn-add" id="addBehaviorBtn">+ إضافة ملاحظة</button></div>
      <div id="behaviorList"><div class="empty-state">جاري التحميل...</div></div>
    </div>`;

  document.querySelectorAll("#reportPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      reportPeriod = btn.dataset.p;
      document.querySelectorAll("#reportPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadReportBody();
    });
  });

  document.getElementById("addBehaviorBtn").addEventListener("click", openAddBehaviorModal);
  document.getElementById("transferStudentBtn").addEventListener("click", openTransferModal);
  document.getElementById("parentQrBtn").addEventListener("click", openParentQrModal);
  loadReportBody();
  loadBehaviorNotes();
}

function classifyLevel(avg, target) {
  const pct = target > 0 ? (avg / target) * 100 : 0;
  if (pct >= 80) return { emoji: "🟢", label: "مستوى جيد" };
  if (pct >= 60) return { emoji: "🟡", label: "يحتاج تحسين" };
  return { emoji: "🔴", label: "يحتاج متابعة عاجلة" };
}

async function loadReportBody() {
  const bodyEl = document.getElementById("reportBody");
  bodyEl.innerHTML = `<div class="empty-state">جاري التحميل...</div>`;
  const r = await fetchStudentResults(reportStudent.id, reportPeriod);
  const { continuousTotal, examsTotal } = calcSubtotals(r.results);
  bodyEl.innerHTML = `
    <div class="stat-grid" style="margin-bottom:18px;">
      <div class="stat-card"><div class="num">${r.total}</div><div class="lbl">الدرجة الإجمالية من 100</div></div>
      <div class="stat-card"><div class="num">${continuousTotal}</div><div class="lbl">مجموع أعمال السنة من 40</div></div>
      <div class="stat-card"><div class="num">${examsTotal}</div><div class="lbl">مجموع الاختبارات من 60</div></div>
      <div class="stat-card"><div class="num">${r.attendanceRate !== null ? r.attendanceRate + "%" : "—"}</div><div class="lbl">نسبة الحضور (${r.presentCount}/${r.totalSessions})</div></div>
    </div>
    <div class="component-ring-grid">${r.results.map((c) => {
      const lvl = classifyLevel(c.avg, c.target);
      return `<div class="component-mini-card"><div class="val">${c.avg}</div><div class="of">من ${c.target}</div><div class="lbl">${c.label}</div><div style="font-size:11px; margin-top:6px; font-weight:700;">${lvl.emoji} ${lvl.label}</div></div>`;
    }).join("")}</div>`;
}

// ============================================
// 6) نقل الطالب لفصل آخر
// ============================================

function openTransferModal() {
  document.getElementById("modalTitle").textContent = "نقل الطالب لفصل آخر";
  document.getElementById("modalFields").innerHTML = `
    <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">درجات الطالب وحضوره وملاحظاته تبقى محفوظة بالكامل بعد النقل — بس يصير جزء من روستر الفصل الجديد.</p>
    <div class="field"><label>الفصل الجديد</label><select id="tr_class" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body);"><option>جاري التحميل...</option></select></div>`;
  document.getElementById("modalOverlay").classList.add("show");

  (async () => {
    const { data: classes } = await supabaseClient.from("classes").select("*").order("created_at");
    const sel = document.getElementById("tr_class");
    const others = (classes || []).filter((c) => c.id !== reportStudent.class_id);
    if (others.length === 0) { sel.innerHTML = `<option value="">ما فيه فصول ثانية متاحة</option>`; return; }
    sel.innerHTML = others.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");
  })();

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const newClassId = document.getElementById("tr_class").value;
    if (!newClassId) { alert("اختر فصل"); return; }
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const { data: newClass } = await supabaseClient.from("classes").select("title").eq("id", newClassId).single();
    const { error } = await supabaseClient.from("students").update({ class_id: newClassId, class_name: newClass ? newClass.title : null }).eq("id", reportStudent.id);

    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر النقل: " + error.message); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    reportStudent.class_id = newClassId;
    reportStudent.class_title = newClass ? newClass.title : null;
    renderReportShell();
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

// ============================================
// 7) رمز ولي الأمر (QR دائم)
// ============================================

async function openParentQrModal() {
  document.getElementById("modalTitle").textContent = "رمز ولي الأمر";
  document.getElementById("modalFields").innerHTML = `<div class="empty-state">جاري التحضير...</div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.querySelector(".modal-actions").style.display = "none";

  const { data: student } = await supabaseClient.from("students").select("parent_token").eq("id", reportStudent.id).single();
  let token = student ? student.parent_token : null;

  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    await supabaseClient.from("students").update({ parent_token: token }).eq("id", reportStudent.id);
  }

  const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");
  const parentLink = baseUrl + "parent.html?token=" + token;

  document.getElementById("modalFields").innerHTML = `
    <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px; line-height:1.8;">هذا الرمز دائم — ولي الأمر يفتحه بأي وقت ويشوف آخر تحديث لتقرير ابنه (الدرجات، الحضور، السلوك). ما يشوف شي ثاني بالموقع.</p>
    <div style="display:flex; justify-content:center; margin-bottom:16px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(parentLink)}" alt="QR" style="border-radius:12px; border:1px solid var(--border-soft);" /></div>
    <div class="item-row"><div class="info"><div class="d" style="word-break:break-all;">${parentLink}</div></div>
      <div class="actions"><button class="icon-btn" id="qrCopyBtn" title="نسخ">📋</button></div>
    </div>
    <button type="button" class="btn-secondary" id="qrRegenBtn" style="width:100%; margin-top:14px; border-color:var(--danger); color:var(--danger);">🔄 توليد رمز جديد (يلغي القديم)</button>
    <button type="button" class="btn-secondary" id="qrCloseBtn" style="width:100%; margin-top:10px;">إغلاق</button>
  `;

  document.getElementById("qrCopyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(parentLink);
    document.getElementById("qrCopyBtn").textContent = "✓";
  });
  document.getElementById("qrCloseBtn").addEventListener("click", () => {
    document.getElementById("modalOverlay").classList.remove("show");
    document.querySelector(".modal-actions").style.display = "";
  });
  document.getElementById("qrRegenBtn").addEventListener("click", async () => {
    if (!confirm("متأكد؟ الرمز القديم بيتوقف عن العمل فوراً.")) return;
    const newToken = crypto.randomUUID().replace(/-/g, "");
    await supabaseClient.from("students").update({ parent_token: newToken }).eq("id", reportStudent.id);
    openParentQrModal();
  });
}

// ============================================
// 8) ملاحظات السلوك (تُدخل بقائمة جاهزة)
// ============================================

async function loadBehaviorNotes() {
  const listEl = document.getElementById("behaviorList");
  const { data, error } = await supabaseClient.from("behavior_notes").select("*, class_sessions(session_kind, session_number)").eq("student_id", reportStudent.id).order("created_at", { ascending: false });
  if (error) { listEl.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { listEl.innerHTML = `<div class="empty-state">ما فيه ملاحظات سلوك مسجلة بعد</div>`; return; }
  listEl.innerHTML = data.map((n) => {
    const sess = n.class_sessions;
    const sessLabel = sess ? ` · ${sess.session_kind === "continuous" ? "حصة " + sess.session_number : (sess.session_kind === "written_exam" ? "اختبار تحريري " : "اختبار عملي ") + sess.session_number}` : "";
    return `<div class="behavior-note ${n.note_type}"><div><div class="txt">${n.note_type === "positive" ? "🟢" : "🔴"} ${escapeHtml(n.note)}</div><div class="date">${new Date(n.created_at).toLocaleDateString("ar-SA")}${sessLabel}</div></div><button class="icon-btn danger" onclick="deleteBehaviorNote('${n.id}')" title="حذف">✕</button></div>`;
  }).join("");
}

function openAddBehaviorModal() {
  document.getElementById("modalTitle").textContent = "إضافة ملاحظة سلوك";
  document.getElementById("modalFields").innerHTML = `
    <div class="btn-pill-choice"><button type="button" class="positive active" data-type="positive">🟢 إيجابية</button><button type="button" class="negative" data-type="negative">🔴 سلبية</button></div>
    <div id="bh_selectHolder">${buildNoteSelectHtml("positive")}</div>`;

  let noteType = "positive";
  function wireSelect() {
    const sel = document.getElementById("qn_select");
    const txt = document.getElementById("qn_text");
    if (sel) sel.addEventListener("change", () => { txt.style.display = sel.value === "__other__" ? "" : "none"; });
  }
  wireSelect();

  document.querySelectorAll(".btn-pill-choice button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-pill-choice button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      noteType = btn.dataset.type;
      document.getElementById("bh_selectHolder").innerHTML = buildNoteSelectHtml(noteType);
      wireSelect();
    });
  });

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const sel = document.getElementById("qn_select");
    const txtInput = document.getElementById("qn_text");
    const note = sel.value === "__other__" ? txtInput.value.trim() : sel.value;
    if (!note) return;
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const { error } = await supabaseClient.from("behavior_notes").insert({ student_id: reportStudent.id, note_type: noteType, note });
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
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
// 9) تقرير الفصل الشامل + طباعة/إكسل (حساب موحّد)
// ============================================

let classReportCache = null;

async function renderClassReport(classId, classTitle) {
  document.getElementById("pageTitle").textContent = `تقرير الرصد: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="openClass('${classId}', '${escapeAttr(classTitle)}')">← رجوع للفصل</button>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      <div class="period-toggle" id="reportClassPeriodToggle" style="margin-bottom:0;"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
      <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="printClassReportTable('${escapeAttr(classTitle)}')">🖨️ طباعة الجدول (أفقي)</button>
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="exportClassReportExcel('${escapeAttr(classTitle)}')">📥 تصدير إكسل</button>
        <button class="btn-add" onclick="printAllStudentReports('${classId}', '${escapeAttr(classTitle)}')">🖨️ طباعة تقارير كل الطلاب</button>
      </div>
    </div>
    <div class="section-card">
      <div class="grade-table-wrap"><table class="grade-table class-report-table" id="classReportTable">
        <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>المجموع (40)</th><th>تحريري</th><th>عملي</th><th>المجموع (60)</th><th>الإجمالي</th><th>الحضور</th><th>🟢</th><th>🔴</th></tr></thead>
        <tbody id="classReportBody"><tr><td colspan="13" class="empty-state">جاري التحميل...</td></tr></tbody>
      </table></div>
    </div>`;
  let period = "p1";
  document.querySelectorAll("#reportClassPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      period = btn.dataset.p;
      document.querySelectorAll("#reportClassPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadClassReportBody(classId, period, classTitle);
    });
  });
  await loadClassReportBody(classId, period, classTitle);
}

function calcSubtotals(results) {
  // results بترتيب ثابت: مشاركة، واجبات، مهام أدائية، تطبيق عملي، تحريري، عملي
  const continuousTotal = Math.round((results[0].avg + results[1].avg + results[2].avg + results[3].avg) * 100) / 100;
  const examsTotal = Math.round((results[4].avg + results[5].avg) * 100) / 100;
  return { continuousTotal, examsTotal };
}

async function loadClassReportBody(classId, period, classTitle) {
  const body = document.getElementById("classReportBody");
  body.innerHTML = `<tr><td colspan="11" class="empty-state">جاري التحميل...</td></tr>`;
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("student_number");
  if (!students || students.length === 0) { body.innerHTML = `<tr><td colspan="11" class="empty-state">ما فيه طلاب بهذا الفصل</td></tr>`; return; }

  const { data: allNotes } = await supabaseClient.from("behavior_notes").select("*").in("student_id", students.map((s) => s.id));

  const rowsData = await Promise.all(students.map(async (st) => {
    const r = await fetchStudentResults(st.id, period);
    const myNotes = (allNotes || []).filter((n) => n.student_id === st.id);
    const posCount = myNotes.filter((n) => n.note_type === "positive").length;
    const negCount = myNotes.filter((n) => n.note_type === "negative").length;
    const attendanceStr = r.attendanceRate !== null ? r.attendanceRate + "%" : "—";
    return { student: st, results: r.results, total: r.total, attendanceStr, posCount, negCount };
  }));

  classReportCache = { classId, period, classTitle, rowsData };

  body.innerHTML = rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    return `
    <tr style="cursor:pointer;" onclick="openStudentReport('${r.student.id}', '${escapeAttr(r.student.full_name)}', {id:'${classId}', title:'${escapeAttr(classTitle)}'})">
      <td class="student-name-cell">${escapeHtml(r.student.full_name)}</td>
      <td>${r.results[0].avg}</td><td>${r.results[1].avg}</td><td>${r.results[2].avg}</td><td>${r.results[3].avg}</td>
      <td style="font-weight:700;">${continuousTotal}</td>
      <td>${r.results[4].avg}</td><td>${r.results[5].avg}</td>
      <td style="font-weight:700;">${examsTotal}</td>
      <td style="font-weight:700; color:var(--accent-cyan);">${r.total}</td><td>${r.attendanceStr}</td><td>${r.posCount}</td><td>${r.negCount}</td>
    </tr>`;
  }).join("");
}

function exportClassReportExcel(classTitle) {
  if (!classReportCache) return;
  const headers = ["الطالب", "المشاركة", "الواجبات", "المهام الأدائية", "التطبيق العملي", "المجموع (40)", "التحريري", "العملي", "المجموع (60)", "الإجمالي", "الحضور", "ملاحظات إيجابية", "ملاحظات سلبية"];
  const rows = classReportCache.rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    return [r.student.full_name, r.results[0].avg, r.results[1].avg, r.results[2].avg, r.results[3].avg, continuousTotal, r.results[4].avg, r.results[5].avg, examsTotal, r.total, r.attendanceStr, r.posCount, r.negCount];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير الفصل");
  XLSX.writeFile(wb, `تقرير-${classTitle}.xlsx`);
}

function printClassReportTable(classTitle) {
  if (!classReportCache) return;
  const periodLabel = classReportCache.period === "p1" ? "الفترة الأولى" : "الفترة الثانية";

  const win = window.open("", "_blank");

  const rowsHtml = classReportCache.rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    return `
      <tr>
        <td style="text-align:right; font-weight:600;">${escapeHtml(r.student.full_name)}</td>
        <td>${r.results[0].avg}</td><td>${r.results[1].avg}</td><td>${r.results[2].avg}</td><td>${r.results[3].avg}</td>
        <td style="font-weight:700; background:#f5f5f5;">${continuousTotal}</td>
        <td>${r.results[4].avg}</td><td>${r.results[5].avg}</td>
        <td style="font-weight:700; background:#f5f5f5;">${examsTotal}</td>
        <td style="font-weight:800;">${r.total}</td><td>${r.attendanceStr}</td><td>${r.posCount}</td><td>${r.negCount}</td>
      </tr>`;
  }).join("");

  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير ${escapeHtml(classTitle)}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Tajawal, Arial, sans-serif; direction: rtl; margin: 0; padding: 20px; }
      h2 { margin-bottom: 4px; }
      p { color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; }
      thead th { background: #eee; }
    </style>
    </head><body>
      <h2>تقرير الرصد: ${escapeHtml(classTitle)}</h2>
      <p>${periodLabel}</p>
      <table>
        <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>المجموع (40)</th><th>تحريري</th><th>عملي</th><th>المجموع (60)</th><th>الإجمالي</th><th>الحضور</th><th>🟢</th><th>🔴</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

async function printAllStudentReports(classId, classTitle) {
  if (!classReportCache || classReportCache.classId !== classId) return;
  const periodLabel = classReportCache.period === "p1" ? "الفترة الأولى" : "الفترة الثانية";
  const studentsHtml = classReportCache.rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    return `
    <div style="page-break-after: always; padding: 20px; font-family: Tajawal, Arial, sans-serif; direction: rtl;">
      <h2 style="margin-bottom:4px;">${escapeHtml(r.student.full_name)}</h2>
      <p style="color:#555; margin-bottom:20px;">${escapeHtml(classTitle)} — ${periodLabel}</p>
      <table style="width:100%; border-collapse: collapse; margin-bottom:20px;">
        <thead><tr style="background:#eee;">${r.results.slice(0, 4).map((c) => `<th style="border:1px solid #ccc; padding:8px;">${c.label}</th>`).join("")}<th style="border:1px solid #ccc; padding:8px;">المجموع (40)</th>${r.results.slice(4).map((c) => `<th style="border:1px solid #ccc; padding:8px;">${c.label}</th>`).join("")}<th style="border:1px solid #ccc; padding:8px;">المجموع (60)</th><th style="border:1px solid #ccc; padding:8px;">الإجمالي</th><th style="border:1px solid #ccc; padding:8px;">الحضور</th></tr></thead>
        <tbody><tr>
          ${r.results.slice(0, 4).map((c) => `<td style="border:1px solid #ccc; padding:8px; text-align:center;">${c.avg}</td>`).join("")}
          <td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${continuousTotal}</td>
          ${r.results.slice(4).map((c) => `<td style="border:1px solid #ccc; padding:8px; text-align:center;">${c.avg}</td>`).join("")}
          <td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${examsTotal}</td>
          <td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${r.total} / 100</td>
          <td style="border:1px solid #ccc; padding:8px; text-align:center;">${r.attendanceStr}</td>
        </tr></tbody>
      </table>
      <p>ملاحظات إيجابية: ${r.posCount} · ملاحظات سلبية: ${r.negCount}</p>
    </div>`;
  }).join("");
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقارير ${escapeHtml(classTitle)}</title></head><body>${studentsHtml}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

async function trackSearch(query) {
  const resultsEl = document.getElementById("trackSearchResults");
  if (!resultsEl) return;
  if (!query || query.trim().length < 2) { resultsEl.innerHTML = ""; return; }
  const { data, error } = await supabaseClient.from("students").select("*, classes(title)").ilike("full_name", `%${query.trim()}%`).limit(15);
  if (error || !data || data.length === 0) { resultsEl.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه نتائج</div>`; return; }
  resultsEl.innerHTML = data.map((s) => `<div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}')"><div class="info"><div class="t">${escapeHtml(s.full_name)}</div><div class="d">${s.classes ? escapeHtml(s.classes.title) : "بدون فصل"} · الصف ${escapeHtml(s.grade)}</div></div><div class="actions"><span class="icon-btn">←</span></div></div>`).join("");
}

// ============================================
// 10) طباعة باركودات كل طلاب الفصل دفعة وحدة
// ============================================

async function printClassQRCodes(classId, classTitle) {
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>باركودات ${escapeHtml(classTitle)}</title></head><body style="font-family:Tajawal, Arial, sans-serif; padding:40px; text-align:center;"><h2>جاري تجهيز الباركودات...</h2></body></html>`);
  win.document.close();

  const { data: students, error } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("student_number");
  if (error || !students || students.length === 0) { win.document.body.innerHTML = "<h2>ما فيه طلاب بهذا الفصل</h2>"; return; }

  const missing = students.filter((s) => !s.parent_token);
  for (const st of missing) {
    const newToken = crypto.randomUUID().replace(/-/g, "");
    await supabaseClient.from("students").update({ parent_token: newToken }).eq("id", st.id);
    st.parent_token = newToken;
  }

  const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");

  const cardsHtml = students.map((st) => {
    const link = baseUrl + "parent.html?token=" + st.parent_token;
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(link)}`;
    return `
      <div style="border:1px solid #ccc; border-radius:10px; padding:16px; text-align:center; page-break-inside:avoid; font-family:Tajawal, Arial, sans-serif; direction:rtl;">
        <img src="${qrImgUrl}" style="width:140px; height:140px; margin-bottom:10px;" />
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${escapeHtml(st.full_name)}</div>
        <div style="font-size:12px; color:#555;">${escapeHtml(st.grade || "")} — ${escapeHtml(classTitle)}</div>
        <div style="font-size:9px; color:#999; margin-top:6px; word-break:break-all;">${st.parent_token}</div>
      </div>
    `;
  });

  win.document.open();
  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>باركودات ${escapeHtml(classTitle)}</title>
    <style>
      @page { margin: 10mm; }
      body { margin: 20px; }
      h2 { font-family: Tajawal, Arial, sans-serif; margin-bottom: 20px; }
      .qr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    </style>
    </head><body>
      <h2>باركودات دخول أولياء الأمور — ${escapeHtml(classTitle)}</h2>
      <div class="qr-grid">${cardsHtml.join("")}</div>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 800);
}

// ============================================
// 11) التقرير الخاص (للمعلم/الإدارة) — مع تصنيف المستوى لكل أداة
// ============================================

let teacherReportCache = null;

async function renderTeacherSpecialReport(classId, classTitle) {
  document.getElementById("pageTitle").textContent = `تقرير خاص بالفصل: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="openClass('${classId}', '${escapeAttr(classTitle)}')">← رجوع للفصل</button>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      <div class="period-toggle" id="teacherReportPeriodToggle" style="margin-bottom:0;"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
      <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="printTeacherReport('${escapeAttr(classTitle)}')">🖨️ طباعة (أفقي)</button>
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="exportTeacherReportExcel('${escapeAttr(classTitle)}')">📥 تصدير إكسل</button>
      </div>
    </div>
    <p style="color:var(--text-muted); font-size:12px; margin-bottom:14px;">🟢 مستوى جيد (80%+) · 🟡 يحتاج تحسين (60-79%) · 🔴 يحتاج متابعة عاجلة (أقل من 60%)</p>
    <div class="section-card">
      <div class="grade-table-wrap"><table class="grade-table class-report-table" id="teacherReportTable">
        <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>تحريري</th><th>عملي</th><th>الإجمالي</th></tr></thead>
        <tbody id="teacherReportBody"><tr><td colspan="8" class="empty-state">جاري التحميل...</td></tr></tbody>
      </table></div>
    </div>`;

  let period = "p1";
  document.querySelectorAll("#teacherReportPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      period = btn.dataset.p;
      document.querySelectorAll("#teacherReportPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadTeacherReportBody(classId, period, classTitle);
    });
  });
  await loadTeacherReportBody(classId, period, classTitle);
}

function levelCellHtml(c) {
  const lvl = classifyLevel(c.avg, c.target);
  return `<td>${c.avg}<br><span style="font-size:10px;">${lvl.emoji} ${lvl.label}</span></td>`;
}

async function loadTeacherReportBody(classId, period, classTitle) {
  const body = document.getElementById("teacherReportBody");
  body.innerHTML = `<tr><td colspan="8" class="empty-state">جاري التحميل...</td></tr>`;
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("student_number");
  if (!students || students.length === 0) { body.innerHTML = `<tr><td colspan="8" class="empty-state">ما فيه طلاب بهذا الفصل</td></tr>`; return; }

  const rowsData = await Promise.all(students.map(async (st) => {
    const r = await fetchStudentResults(st.id, period);
    return { student: st, results: r.results, total: r.total };
  }));

  teacherReportCache = { classId, period, classTitle, rowsData };

  body.innerHTML = rowsData.map((r) => `
    <tr style="cursor:pointer;" onclick="openStudentReport('${r.student.id}', '${escapeAttr(r.student.full_name)}', {id:'${classId}', title:'${escapeAttr(classTitle)}'})">
      <td class="student-name-cell">${escapeHtml(r.student.full_name)}</td>
      ${r.results.map((c) => levelCellHtml(c)).join("")}
      <td style="font-weight:800; color:var(--accent-cyan);">${r.total}</td>
    </tr>`).join("");
}

function exportTeacherReportExcel(classTitle) {
  if (!teacherReportCache) return;
  const headers = ["الطالب", "المشاركة", "تصنيف", "الواجبات", "تصنيف", "المهام الأدائية", "تصنيف", "التطبيق العملي", "تصنيف", "التحريري", "تصنيف", "العملي", "تصنيف", "الإجمالي"];
  const rows = teacherReportCache.rowsData.map((r) => {
    const row = [r.student.full_name];
    r.results.forEach((c) => {
      const lvl = classifyLevel(c.avg, c.target);
      row.push(c.avg, lvl.label);
    });
    row.push(r.total);
    return row;
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير خاص بالفصل");
  XLSX.writeFile(wb, `التقرير-الخاص-${classTitle}.xlsx`);
}

function printTeacherReport(classTitle) {
  if (!teacherReportCache) return;
  const periodLabel = teacherReportCache.period === "p1" ? "الفترة الأولى" : "الفترة الثانية";
  const win = window.open("", "_blank");

  const rowsHtml = teacherReportCache.rowsData.map((r) => `
    <tr>
      <td style="text-align:right; font-weight:600;">${escapeHtml(r.student.full_name)}</td>
      ${r.results.map((c) => {
        const lvl = classifyLevel(c.avg, c.target);
        return `<td>${c.avg}<br><span style="font-size:9px;">${lvl.emoji} ${lvl.label}</span></td>`;
      }).join("")}
      <td style="font-weight:800;">${r.total}</td>
    </tr>`).join("");

  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير خاص بالفصل ${escapeHtml(classTitle)}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Tajawal, Arial, sans-serif; direction: rtl; margin: 0; padding: 20px; }
      h2 { margin-bottom: 4px; }
      p { color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; }
      thead th { background: #eee; }
    </style>
    </head><body>
      <h2>تقرير خاص بالفصل: ${escapeHtml(classTitle)}</h2>
      <p>${periodLabel} · 🟢 مستوى جيد · 🟡 يحتاج تحسين · 🔴 يحتاج متابعة عاجلة</p>
      <table>
        <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>تحريري</th><th>عملي</th><th>الإجمالي</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 400);
}
