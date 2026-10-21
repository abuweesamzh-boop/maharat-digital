const SESSION_KIND_LABELS = { continuous: "الحصص", written_exam: "الاختبار التحريري", practical_exam: "الاختبار العملي" };
const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function weekdayNameFromDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return WEEKDAY_AR[d.getDay()];
}
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

function classifyLevel(avg, target) {
  const pct = target > 0 ? (avg / target) * 100 : 0;
  if (pct >= 80) return { cls: "positive", label: "مستوى جيد" };
  if (pct >= 60) return { cls: "", label: "يحتاج تحسين" };
  return { cls: "negative", label: "يحتاج متابعة عاجلة" };
}

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

function calcSubtotals(results) {
  const continuousTotal = Math.round((results[0].avg + results[1].avg + results[2].avg + results[3].avg) * 100) / 100;
  const examsTotal = Math.round((results[4].avg + results[5].avg) * 100) / 100;
  return { continuousTotal, examsTotal };
}

let gradingClassId = null, gradingClassTitle = null, gradingPeriod = "p1";

function renderGradingArea(classId, classTitle) {
  gradingClassId = classId; gradingClassTitle = classTitle; gradingPeriod = "p1";
  const holder = document.getElementById("gradingAreaHolder");
  holder.innerHTML = `
    <div style="margin-bottom:16px;"><div class="period-toggle" id="gradingPeriodToggle" style="margin-bottom:0;"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div></div>
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
  const kindIcons = { continuous: "list", written_exam: "edit", practical_exam: "check" };
  let html = `<div class="kind-columns">`;
  for (const kind of kinds) {
    const { data: sessions } = await supabaseClient.from("class_sessions").select("*").eq("class_id", gradingClassId).eq("period", gradingPeriod).eq("session_kind", kind).order("session_number", { ascending: true });
    const list = sessions || [];
    html += `
      <div class="kind-col kind-${kind}">
        <div class="kind-col-head">
          <div class="kind-col-title"><span class="kind-col-ic">${icon(kindIcons[kind], 16)}</span><span>${SESSION_KIND_LABELS[kind]}</span><span class="kind-col-count">${list.length}</span></div>
          <button class="kind-col-add" onclick="createSession('${kind}')">${icon("plus", 13)} ${kind === "continuous" ? "حصة" : "اختبار"}</button>
        </div>
        <div class="kind-col-body">
        ${list.length === 0 ? `<div class="kind-empty">ما فيه ${kind === "continuous" ? "حصص" : "اختبارات"} مسجلة بعد</div>` : list.map((s) => `
          <div class="sess-row" onclick="openSessionGrid('${s.id}', '${kind}', ${s.session_number})">
            <div class="sess-num">${s.session_number}</div>
            <div class="sess-info">
              <div class="sess-title">${s.lesson_title ? escapeHtml(s.lesson_title) : `<span class="sess-notitle">${kind === "continuous" ? "حصة " : "اختبار "}${s.session_number} — بدون عنوان</span>`}</div>
              <div class="sess-date">${s.session_date ? new Date(String(s.session_date).slice(0, 10) + "T00:00:00").toLocaleDateString("ar-SA") : "بدون تاريخ"}${s.session_date ? " · " + weekdayNameFromDate(String(s.session_date).slice(0, 10)) : ""}</div>
            </div>
            <div class="sess-actions">
              <span class="sess-act" title="تعديل" onclick="event.stopPropagation(); openEditSessionModal('${s.id}', '${kind}')">${icon("edit", 13)}</span>
              <span class="sess-act danger" title="حذف" onclick="event.stopPropagation(); deleteSession('${s.id}')">${icon("close", 13)}</span>
            </div>
          </div>`).join("")}
        </div>
      </div>`;
  }
  html += `</div>`;
  holder.innerHTML = html;
  hydrateIcons(holder);
}

async function insertSessionRow(row) {
  let res = await supabaseClient.from("class_sessions").insert(row).select().single();
  if (res.error && row.lesson_title !== undefined && /lesson_title/i.test(res.error.message || "")) {
    const { lesson_title, ...rest } = row;
    res = await supabaseClient.from("class_sessions").insert(rest).select().single();
    if (!res.error) alert("تم إنشاء السجل لكن عنوان الدرس لم يُحفظ: عمود lesson_title غير موجود في قاعدة البيانات. شغّل أمر SQL الخاص به في Supabase.");
  }
  return res;
}

async function createSession(kind) {
  const isContinuous = kind === "continuous";
  document.getElementById("modalTitle").textContent = isContinuous ? "حصة جديدة" : "اختبار جديد";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>${isContinuous ? "عنوان الدرس" : "عنوان الاختبار"}</label><input type="text" id="ns_title" placeholder="${isContinuous ? "مثال: مقدمة في الخوارزميات" : "مثال: اختبار الفترة الأولى"}" autocomplete="off" /></div>
    <div class="field"><label>التاريخ</label><input type="date" id="ns_date" value="${new Date().toISOString().slice(0, 10)}" /></div>
    <p style="color:var(--text-muted); font-size:11.5px; line-height:1.8;">يمكنك ترك العنوان فارغاً وتعديله لاحقاً.</p>`;
  document.getElementById("modalOverlay").classList.add("show");
  setTimeout(() => { const t = document.getElementById("ns_title"); if (t) t.focus(); }, 50);
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const title = document.getElementById("ns_title").value.trim();
    const date = document.getElementById("ns_date").value || new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabaseClient.from("class_sessions").select("session_number").eq("class_id", gradingClassId).eq("period", gradingPeriod).eq("session_kind", kind).order("session_number", { ascending: false }).limit(1);
    const nextNumber = existing && existing.length > 0 ? existing[0].session_number + 1 : 1;
    const row = { class_id: gradingClassId, period: gradingPeriod, session_kind: kind, session_number: nextNumber, session_date: date };
    if (title) row.lesson_title = title;
    const { data: newSession, error } = await insertSessionRow(row);
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر إنشاء السجل: " + error.message); return; }
    document.getElementById("modalOverlay").classList.remove("show");
    openSessionGrid(newSession.id, kind, nextNumber);
  };
}

async function deleteSession(sessionId) {
  if (!confirm("متأكد تبي تحذف هذا السجل؟")) return;
  const { error } = await supabaseClient.from("class_sessions").delete().eq("id", sessionId);
  if (error) { alert("تعذر الحذف"); return; }
  await loadGradingKinds();
}

async function openEditSessionModal(sessionId, kind) {
  const { data: s, error: fetchErr } = await supabaseClient.from("class_sessions").select("*").eq("id", sessionId).single();
  if (fetchErr || !s) { alert("تعذر تحميل بيانات السجل"); return; }
  const isContinuous = kind === "continuous";
  document.getElementById("modalTitle").textContent = `تعديل ${isContinuous ? "الحصة" : "الاختبار"}`;
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>${isContinuous ? "عنوان الدرس" : "عنوان الاختبار"}</label><input type="text" id="es_title" value="${escapeHtml(s.lesson_title || "").replace(/"/g, "&quot;")}" placeholder="اكتب عنوان الدرس" autocomplete="off" /></div>
    <div class="field"><label>رقم ${isContinuous ? "الحصة" : "الاختبار"}</label><input type="number" id="es_number" min="1" value="${s.session_number}" required /></div>
    <div class="field"><label>الفترة</label>
      <select id="es_period" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:11px 12px; color:var(--text-primary); font-family:var(--font-body);">
        <option value="p1" ${s.period === "p1" ? "selected" : ""}>الفترة الأولى</option>
        <option value="p2" ${s.period === "p2" ? "selected" : ""}>الفترة الثانية</option>
      </select>
    </div>
    <div class="field"><label>التاريخ</label><input type="date" id="es_date" value="${s.session_date || ""}" /></div>
    <p style="color:var(--text-muted); font-size:11px;">اليوم: <span id="es_day">${weekdayNameFromDate(s.session_date)}</span></p>
    <p style="color:var(--text-muted); font-size:11.5px; line-height:1.8;">ملاحظة: نوع السجل (${isContinuous ? "حصة" : "اختبار"}) لا يمكن تغييره بعد الإنشاء — لو احتجت نوع مختلف أنشئ سجل جديد واحذف هذا.</p>`;
  document.getElementById("es_date").addEventListener("input", (e) => {
    document.getElementById("es_day").textContent = weekdayNameFromDate(e.target.value);
  });
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const session_number = parseInt(document.getElementById("es_number").value, 10);
    const period = document.getElementById("es_period").value;
    const session_date = document.getElementById("es_date").value || null;
    const lesson_title = document.getElementById("es_title").value.trim() || null;
    let { error } = await supabaseClient.from("class_sessions").update({ session_number, period, session_date, lesson_title }).eq("id", sessionId);
    if (error && /lesson_title/i.test(error.message || "")) {
      const r2 = await supabaseClient.from("class_sessions").update({ session_number, period, session_date }).eq("id", sessionId);
      error = r2.error;
      if (!error) alert("تم الحفظ لكن عنوان الدرس لم يُحفظ: عمود lesson_title غير موجود في قاعدة البيانات. شغّل أمر SQL الخاص به في Supabase.");
    }
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر الحفظ: " + error.message); return; }
    document.getElementById("modalOverlay").classList.remove("show");
    if (period !== gradingPeriod) gradingPeriod = period;
    await loadGradingKinds();
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

const CONTINUOUS_COLS = [
  { field: "participation", label: "المشاركة" }, { field: "homework", label: "الواجبات" },
  { field: "tasks", label: "المهام الأدائية" }, { field: "practical", label: "التطبيق العملي" },
];
let activeCols = ["participation", "homework", "tasks", "practical"];

function circClass(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  if (n === 10) return "ok";
  if (n === 0) return "bad";
  return "part";
}
function circText(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  if (n === 10) return "✓";
  if (n === 0) return "✕";
  return String(n);
}
function updateRowTotal(tr) {
  const out = tr.querySelector(".row-total");
  if (!out) return;
  const groups = Array.from(tr.querySelectorAll(".score-chips"));
  const vals = groups.map((g) => g.dataset.value).filter((v) => v !== "");
  const sum = vals.reduce((a, b) => a + Number(b), 0);
  if (vals.length === groups.length) { out.textContent = sum + "/40"; out.className = "row-total full"; }
  else if (vals.length > 0) { out.textContent = sum + "…"; out.className = "row-total partial"; }
  else { out.textContent = "—"; out.className = "row-total partial"; }
}
function setCircValue(group, v) {
  group.dataset.value = v;
  const btn = group.querySelector(".circ");
  btn.className = "circ " + circClass(v);
  btn.textContent = circText(v);
  const tr = group.closest("tr");
  if (tr) updateRowTotal(tr);
}
function openCircPicker(btn, group) {
  document.querySelectorAll(".circ-picker").forEach((p) => p.remove());
  const pick = document.createElement("div");
  pick.className = "circ-picker";
  const opts = ["10", "8", "6", "5", "4", "2", "0", ""];
  pick.innerHTML = opts.map((o) => `<button type="button" class="circ ${circClass(o)} ${o === "" ? "clear" : ""}" data-v="${o}">${o === "" ? "فارغ" : (o === "10" ? "✓" : (o === "0" ? "✕" : o))}</button>`).join("");
  document.body.appendChild(pick);
  const r = btn.getBoundingClientRect();
  const w = 8 * 38 + 16;
  let left = r.left + r.width / 2 - w / 2 + window.scrollX;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  pick.style.left = left + "px";
  pick.style.top = (r.bottom + window.scrollY + 6) + "px";
  pick.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { setCircValue(group, b.dataset.v); pick.remove(); }));
  setTimeout(() => {
    const off = (e) => { if (!pick.contains(e.target)) { pick.remove(); document.removeEventListener("pointerdown", off, true); } };
    document.addEventListener("pointerdown", off, true);
  }, 0);
}

async function openSessionGrid(sessionId, kind, sessionNumber) {
  const contentArea = document.getElementById("contentArea");
  const isContinuous = kind === "continuous";
  if (isContinuous) activeCols = ["participation", "homework", "tasks", "practical"];
  const { data: students, error: studentsErr } = await supabaseClient.from("students").select("*").eq("class_id", gradingClassId).order("full_name", { ascending: true });
  if (studentsErr || !students || students.length === 0) {
    contentArea.innerHTML = `<button class="btn-back no-print" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">${icon("back", 15)} رجوع للفصل</button><div class="section-card"><div class="empty-state">ما فيه طلاب بهذا الفصل — أضفهم أولاً</div></div>`;
    return;
  }
  const { data: scores } = await supabaseClient.from("session_scores").select("*").eq("session_id", sessionId);
  const scoreMap = {};
  (scores || []).forEach((s) => (scoreMap[s.student_id] = s));
  const { data: sessionRow } = await supabaseClient.from("class_sessions").select("*").eq("id", sessionId).single();
  const lessonTitle = sessionRow && sessionRow.lesson_title ? sessionRow.lesson_title : "";
  const currentDate = sessionRow && sessionRow.session_date ? sessionRow.session_date : new Date().toISOString().slice(0, 10);
  document.getElementById("pageTitle").textContent = `${SESSION_KIND_LABELS[kind]} — ${isContinuous ? "حصة" : "اختبار"} ${sessionNumber}${lessonTitle ? " · " + lessonTitle : ""}`;
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="openClass('${gradingClassId}', '${escapeAttr(gradingClassTitle)}')">${icon("back", 15)} رجوع للفصل</button>
    <div class="field" style="max-width:220px;"><label>تاريخ ${isContinuous ? "الحصة" : "الاختبار"}</label><input type="date" id="sessionDateInput" value="${currentDate}" /><div style="font-size:11px; color:var(--gold); font-weight:700; margin-top:4px;">اليوم: <span id="sessionDayLabel">${weekdayNameFromDate(currentDate)}</span></div></div>
    ${isContinuous ? `<div class="column-picker" id="columnPicker">${CONTINUOUS_COLS.map((c) => `<label><input type="checkbox" class="col-check" value="${c.field}" checked /> ${c.label}</label>`).join("")}</div>` : ""}
    <div class="section-card">
      <div class="section-head"><h3>إدخال الدرجات — ${students.length} طالب</h3><button class="btn-add" id="saveGridBtn">${icon("check", 14)} حفظ الكل</button></div>
      ${isContinuous ? `<div class="circ-legend"><span><i class="circ ok sm">✓</i> ضغطة = ممتاز (10)</span><span><i class="circ bad sm">✕</i> ضغطتان = لم ينفذ (0)</span><span><i class="circ part sm">6</i> ضغطة مطوّلة = درجة أخرى</span><span><i class="circ sm"></i> فارغ = لا يُحتسب</span></div>` : ""}
      <div class="grade-table-wrap"><table class="grade-table" id="gradeTable"><thead><tr id="gradeTableHead"></tr></thead><tbody id="gradeTableBody"></tbody></table></div>
    </div>`;
  document.getElementById("sessionDateInput").addEventListener("change", async (e) => {
    document.getElementById("sessionDayLabel").textContent = weekdayNameFromDate(e.target.value);
    await supabaseClient.from("class_sessions").update({ session_date: e.target.value }).eq("id", sessionId);
  });
  hydrateIcons(contentArea);

  function renderTableRows() {
    const head = document.getElementById("gradeTableHead");
    const body = document.getElementById("gradeTableBody");
    if (isContinuous) head.innerHTML = `<th>الطالب</th>${CONTINUOUS_COLS.map((c) => `<th class="col-${c.field}">${c.label}<button type="button" class="all-ok-btn" data-field="${c.field}" title="تعيين ✓ للجميع">الكل ✓</button></th>`).join("")}<th>المجموع /40</th><th>الحضور</th>`;
    else head.innerHTML = `<th>الطالب</th><th>الدرجة (30)</th>`;

    body.innerHTML = students.map((st) => {
      const sc = scoreMap[st.id] || {};
      if (isContinuous) {
        const cols = CONTINUOUS_COLS.map(({ field }) => {
          const isNew = !scoreMap[st.id];
          const dflt = (field === "tasks" || field === "practical") ? 10 : null;
          const current = isNew ? dflt : (sc[field] !== undefined ? sc[field] : null);
          const val = current === null ? "" : String(current);
          return `<td class="col-${field}"><div class="score-chips" data-field="${field}" data-student="${st.id}" data-value="${val}"><button type="button" class="circ ${circClass(val)}">${circText(val)}</button></div></td>`;
        }).join("");
        const isPresent = sc.attendance !== false;
        return `<tr data-student="${st.id}"><td class="student-name-cell">${escapeHtml(st.full_name)}</td>${cols}<td class="row-total-cell"><span class="row-total"></span></td><td><button type="button" class="attendance-toggle ${isPresent ? "" : "absent"}" data-present="${isPresent}">${isPresent ? "حاضر" : "غائب"}</button></td></tr>`;
      }
      const current = sc.exam_score !== undefined && sc.exam_score !== null ? sc.exam_score : 30;
      return `<tr data-student="${st.id}"><td class="student-name-cell">${escapeHtml(st.full_name)}</td><td><input type="number" class="grid-input" data-field="exam_score" min="0" max="30" step="0.5" value="${current}" /></td></tr>`;
    }).join("");
    hydrateIcons(body);

    body.querySelectorAll(".score-chips").forEach((group) => {
      const btn = group.querySelector(".circ");
      let pressTimer = null, longFired = false;
      btn.addEventListener("pointerdown", () => {
        longFired = false;
        pressTimer = setTimeout(() => { longFired = true; openCircPicker(btn, group); }, 480);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => btn.addEventListener(ev, () => clearTimeout(pressTimer)));
      btn.addEventListener("contextmenu", (e) => { e.preventDefault(); clearTimeout(pressTimer); longFired = true; openCircPicker(btn, group); });
      btn.addEventListener("click", () => {
        if (longFired) { longFired = false; return; }
        const v = group.dataset.value;
        setCircValue(group, v === "" ? "10" : (v === "0" ? "" : (v === "10" ? "0" : "10")));
      });
    });
    wireAllOkButtons();
    body.querySelectorAll("tr").forEach(updateRowTotal);
    body.querySelectorAll(".attendance-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const present = btn.dataset.present === "true";
        btn.dataset.present = (!present).toString();
        btn.textContent = !present ? "حاضر" : "غائب";
        btn.classList.toggle("absent", present);
      });
    });
    body.querySelectorAll(".quick-note-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => openQuickNotePopover(e, btn.dataset.student, btn.dataset.name, sessionId));
    });
    applyColumnVisibility();
  }

  function wireAllOkButtons() {
    document.querySelectorAll(".all-ok-btn").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(`#gradeTableBody .score-chips[data-field="${b.dataset.field}"]`).forEach((g) => setCircValue(g, "10"));
      });
    });
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

function buildNotePillsHtml(prefix) {
  return `
    <div class="note-pill-section">
      <div class="note-pill-label positive">إيجابية</div>
      <div class="note-pill-wrap" id="${prefix}_posWrap">
        ${POSITIVE_NOTES.map((n) => `<button type="button" class="note-pill positive" data-type="positive" data-note="${escapeAttr(n)}">${escapeHtml(n)}</button>`).join("")}
      </div>
    </div>
    <div class="note-pill-section">
      <div class="note-pill-label negative">سلبية</div>
      <div class="note-pill-wrap" id="${prefix}_negWrap">
        ${NEGATIVE_NOTES.map((n) => `<button type="button" class="note-pill negative" data-type="negative" data-note="${escapeAttr(n)}">${escapeHtml(n)}</button>`).join("")}
      </div>
    </div>
    <div class="note-custom-row">
      <select class="note-custom-type" id="${prefix}_customType"><option value="positive">إيجابية</option><option value="negative">سلبية</option></select>
      <input type="text" class="note-custom-input" id="${prefix}_customInput" placeholder="ملاحظة مخصصة">
      <button type="button" class="note-custom-add" id="${prefix}_customAdd" title="إضافة">${icon("plus", 14)}</button>
    </div>
    <div class="note-selected-strip" id="${prefix}_selected"><span class="note-selected-empty">لم يتم اختيار أي ملاحظة بعد</span></div>
  `;
}
function wireNotePills(prefix, container) {
  function renderSelectedStrip() {
    const stripEl = container.querySelector(`#${prefix}_selected`);
    const selected = Array.from(container.querySelectorAll(".note-pill.selected"));
    if (!selected.length) { stripEl.innerHTML = `<span class="note-selected-empty">لم يتم اختيار أي ملاحظة بعد</span>`; return; }
    stripEl.innerHTML = selected.map((p, i) => `<span class="note-chip ${p.dataset.type}">${escapeHtml(p.dataset.note)}<span class="note-chip-x" data-idx="${i}">${icon("close", 10)}</span></span>`).join("");
    stripEl.querySelectorAll(".note-chip-x").forEach((x) => {
      x.addEventListener("click", () => {
        const idx = parseInt(x.dataset.idx, 10);
        const pillEl = selected[idx];
        if (pillEl.classList.contains("custom")) pillEl.remove();
        else pillEl.classList.remove("selected");
        renderSelectedStrip();
      });
    });
  }
  container.querySelectorAll(".note-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      pill.classList.toggle("selected");
      renderSelectedStrip();
    });
  });
  const addBtn = container.querySelector(`#${prefix}_customAdd`);
  if (addBtn) {
    const doAdd = () => {
      const input = container.querySelector(`#${prefix}_customInput`);
      const typeSel = container.querySelector(`#${prefix}_customType`);
      const text = input.value.trim();
      if (!text) return;
      const type = typeSel.value;
      const wrap = container.querySelector(`#${prefix}_${type === "positive" ? "pos" : "neg"}Wrap`);
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `note-pill ${type} selected custom`;
      pill.dataset.type = type;
      pill.dataset.note = text;
      pill.textContent = text;
      pill.addEventListener("click", () => { pill.classList.toggle("selected"); renderSelectedStrip(); });
      wrap.appendChild(pill);
      input.value = "";
      renderSelectedStrip();
    };
    addBtn.addEventListener("click", doAdd);
    container.querySelector(`#${prefix}_customInput`).addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doAdd(); }
    });
  }
}
function collectSelectedNotes(prefix, container, studentId, sessionId) {
  return Array.from(container.querySelectorAll(".note-pill.selected")).map((p) => ({
    student_id: studentId, note_type: p.dataset.type, note: p.dataset.note, session_id: sessionId || null,
  }));
}
function resetNotePills(prefix, container) {
  container.querySelectorAll(".note-pill.selected").forEach((p) => {
    if (p.classList.contains("custom")) p.remove();
    else p.classList.remove("selected");
  });
  const stripEl = container.querySelector(`#${prefix}_selected`);
  if (stripEl) stripEl.innerHTML = `<span class="note-selected-empty">لم يتم اختيار أي ملاحظة بعد</span>`;
}

function openQuickNotePopover(event, studentId, studentName, sessionId) {
  document.querySelectorAll(".quick-note-popover").forEach((p) => p.remove());
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "quick-note-popover";
  pop.style.top = (rect.bottom + window.scrollY + 6) + "px";
  pop.style.left = (rect.left + window.scrollX - 100) + "px";
  pop.style.maxHeight = "70vh";
  pop.style.overflowY = "auto";
  pop.innerHTML = `
    <div style="font-size:12px; font-weight:700; margin-bottom:10px;">ملاحظات: ${escapeHtml(studentName)}</div>
    <p style="font-size:10.5px; color:var(--text-muted); margin:0 0 8px;">اضغط على كل ملاحظة تنطبق على الطالب بهذه الحصة، ثم اضغط حفظ الكل.</p>
    ${buildNotePillsHtml("qn")}
    <div id="qn_status" style="font-size:11px; color:var(--success); min-height:14px; margin:8px 0 6px;"></div>
    <div style="display:flex; gap:8px;"><button type="button" class="btn-secondary" id="qn_close" style="width:auto; padding:8px 14px;">تم / إغلاق</button><button type="button" class="btn-add" id="qn_save" style="flex:1;">حفظ الكل</button></div>`;
  document.body.appendChild(pop);
  wireNotePills("qn", pop);

  pop.querySelector("#qn_close").addEventListener("click", () => pop.remove());
  pop.querySelector("#qn_save").addEventListener("click", async () => {
    const rows = collectSelectedNotes("qn", pop, studentId, sessionId);
    if (!rows.length) { pop.querySelector("#qn_status").textContent = "ما تم اختيار أي ملاحظة."; pop.querySelector("#qn_status").style.color = "var(--text-muted)"; return; }
    const saveBtn = pop.querySelector("#qn_save");
    saveBtn.disabled = true; saveBtn.textContent = "...";
    const { error } = await supabaseClient.from("behavior_notes").insert(rows);
    saveBtn.disabled = false; saveBtn.textContent = "حفظ الكل";
    if (error) { alert("تعذر الحفظ"); return; }
    const btnEl = document.querySelector(`.quick-note-btn[data-student="${studentId}"]`);
    if (btnEl) btnEl.classList.add("has-note");
    resetNotePills("qn", pop);
    pop.querySelector("#qn_status").style.color = "var(--success)";
    pop.querySelector("#qn_status").textContent = `تم الحفظ ✓ (${rows.length} ملاحظة) — تقدر تضيف المزيد`;
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
      tr.querySelectorAll(".score-chips").forEach((group) => { row[group.dataset.field] = group.dataset.value === "" ? null : parseFloat(group.dataset.value); });
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
  if (error) { btn.innerHTML = icon("check", 14) + " حفظ الكل"; hydrateIcons(btn); alert("تعذر الحفظ: " + error.message); return; }
  btn.innerHTML = icon("check", 14) + " تم الحفظ"; hydrateIcons(btn);
  setTimeout(() => { btn.innerHTML = icon("check", 14) + " حفظ الكل"; hydrateIcons(btn); }, 1500);
}

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
    <button class="btn-back no-print" onclick="${reportFromClass ? `openClass('${reportFromClass.id}', '${escapeAttr(reportFromClass.title)}')` : "renderClassesSection()"}">${icon("back", 15)} رجوع</button>
    <div class="section-card" style="margin-bottom:18px;">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
        <div><div style="font-family:var(--font-display); font-weight:800; font-size:19px;">${escapeHtml(reportStudent.name)}</div><div style="color:var(--text-muted); font-size:13px;">${reportStudent.class_title ? escapeHtml(reportStudent.class_title) : "بدون فصل"}</div></div>
        <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-secondary" style="width:auto; padding:10px 16px;" id="transferStudentBtn">${icon("swap", 15)} نقل لفصل آخر</button>
          <button class="btn-secondary" style="width:auto; padding:10px 16px;" id="parentQrBtn">${icon("qr", 15)} رمز ولي الأمر</button>
          <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="window.print()">${icon("print", 15)} طباعة التقرير</button>
        </div>
      </div>
    </div>
    <div class="period-toggle" id="reportPeriodToggle"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
    <div id="reportBody"></div>
    <div class="section-card" style="margin-top:20px;">
      <div class="section-head"><h3>${icon("note")} ملاحظات السلوك</h3><button class="btn-add" id="addBehaviorBtn">${icon("plus", 14)} إضافة ملاحظة</button></div>
      <div id="behaviorList"><div class="empty-state">جاري التحميل...</div></div>
    </div>`;
  hydrateIcons(contentArea);

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
      return `<div class="component-mini-card"><div class="val">${c.avg}</div><div class="of">من ${c.target}</div><div class="lbl">${c.label}</div><div style="font-size:11px; margin-top:6px; font-weight:700;" class="lvl-${lvl.cls || 'mid'}">${lvl.label}</div></div>`;
    }).join("")}</div>`;
}

function openTransferModal() {
  document.getElementById("modalTitle").textContent = "نقل الطالب لفصل آخر";
  document.getElementById("modalFields").innerHTML = `
    <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">درجات الطالب وحضوره وملاحظاته تبقى محفوظة بالكامل بعد النقل.</p>
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

async function openParentQrModal() {
  document.getElementById("modalTitle").textContent = "رمز ولي الأمر";
  document.getElementById("modalFields").innerHTML = `<div class="empty-state">جاري التحضير...</div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.querySelector(".modal-actions").style.display = "none";
  const { data: student } = await supabaseClient.from("students").select("parent_token").eq("id", reportStudent.id).single();
  let token = student ? student.parent_token : null;
  if (!token) { token = crypto.randomUUID().replace(/-/g, ""); await supabaseClient.from("students").update({ parent_token: token }).eq("id", reportStudent.id); }
  const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");
  const parentLink = baseUrl + "parent.html?token=" + token;
  document.getElementById("modalFields").innerHTML = `
    <p style="color:var(--text-muted); font-size:13px; margin-bottom:16px; line-height:1.8;">هذا الرمز دائم — ولي الأمر يفتحه بأي وقت ويشوف آخر تحديث لتقرير ابنه.</p>
    <div style="display:flex; justify-content:center; margin-bottom:16px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(parentLink)}" alt="QR" style="border-radius:12px; border:1px solid var(--border-soft);" /></div>
    <div class="item-row"><div class="info"><div class="d" style="word-break:break-all;">${parentLink}</div></div><div class="actions"><button class="icon-btn" id="qrCopyBtn" title="نسخ">${icon("copy", 15)}</button></div></div>
    <button type="button" class="btn-secondary" id="qrRegenBtn" style="width:100%; margin-top:14px; border-color:var(--danger); color:var(--danger);">${icon("swap", 15)} توليد رمز جديد (يلغي القديم)</button>
    <button type="button" class="btn-secondary" id="qrCloseBtn" style="width:100%; margin-top:10px;">إغلاق</button>
  `;
  hydrateIcons(document.getElementById("modalFields"));
  document.getElementById("qrCopyBtn").addEventListener("click", () => { navigator.clipboard.writeText(parentLink); document.getElementById("qrCopyBtn").innerHTML = icon("check", 15); hydrateIcons(document.getElementById("qrCopyBtn")); });
  document.getElementById("qrCloseBtn").addEventListener("click", () => { document.getElementById("modalOverlay").classList.remove("show"); document.querySelector(".modal-actions").style.display = ""; });
  document.getElementById("qrRegenBtn").addEventListener("click", async () => {
    if (!confirm("متأكد؟ الرمز القديم بيتوقف عن العمل فوراً.")) return;
    const newToken = crypto.randomUUID().replace(/-/g, "");
    await supabaseClient.from("students").update({ parent_token: newToken }).eq("id", reportStudent.id);
    openParentQrModal();
  });
}

async function loadBehaviorNotes() {
  const listEl = document.getElementById("behaviorList");
  const { data, error } = await supabaseClient.from("behavior_notes").select("*, class_sessions(session_kind, session_number)").eq("student_id", reportStudent.id).order("created_at", { ascending: false });
  if (error) { listEl.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { listEl.innerHTML = `<div class="empty-state">ما فيه ملاحظات سلوك مسجلة بعد</div>`; return; }
  listEl.innerHTML = data.map((n) => {
    const sess = n.class_sessions;
    const sessLabel = sess ? ` · ${sess.session_kind === "continuous" ? "حصة " + sess.session_number : (sess.session_kind === "written_exam" ? "اختبار تحريري " : "اختبار عملي ") + sess.session_number}` : "";
    return `<div class="behavior-note ${n.note_type}"><div><div class="txt"><span class="dot-badge ${n.note_type}"></span> ${escapeHtml(n.note)}</div><div class="date">${new Date(n.created_at).toLocaleDateString("ar-SA")}${sessLabel}</div></div><button class="icon-btn danger" onclick="deleteBehaviorNote('${n.id}')" title="حذف">${icon("trash", 15)}</button></div>`;
  }).join("");
  hydrateIcons(listEl);
}

function openAddBehaviorModal() {
  document.getElementById("modalTitle").textContent = "إضافة ملاحظات سلوك";
  document.getElementById("modalFields").innerHTML = `
    <p style="font-size:11.5px; color:var(--text-muted); margin:0 0 8px;">اضغط على كل ملاحظة تنطبق على الطالب، ثم اضغط حفظ الكل. تقدر تضيف دفعات متعددة بدون ما تسكر النافذة.</p>
    ${buildNotePillsHtml("bh")}
    <div id="bh_status" style="font-size:11px; color:var(--success); min-height:14px; margin-top:8px;"></div>`;
  wireNotePills("bh", document.getElementById("modalFields"));
  document.getElementById("modalSubmit").textContent = "حفظ الكل";
  document.getElementById("modalCancel").textContent = "تم / إغلاق";
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const rows = collectSelectedNotes("bh", document.getElementById("modalFields"), reportStudent.id, null);
    const statusEl = document.getElementById("bh_status");
    if (!rows.length) { statusEl.style.color = "var(--text-muted)"; statusEl.textContent = "ما تم اختيار أي ملاحظة."; return; }
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const { error } = await supabaseClient.from("behavior_notes").insert(rows);
    submitBtn.disabled = false; submitBtn.textContent = "حفظ الكل";
    if (error) { alert("تعذر الحفظ"); return; }
    resetNotePills("bh", document.getElementById("modalFields"));
    statusEl.style.color = "var(--success)";
    statusEl.textContent = `تم الحفظ ✓ (${rows.length} ملاحظة) — تقدر تضيف المزيد`;
    await loadBehaviorNotes();
  };
  document.getElementById("modalCancel").onclick = () => {
    document.getElementById("modalOverlay").classList.remove("show");
    document.getElementById("modalSubmit").textContent = "حفظ";
    document.getElementById("modalCancel").textContent = "إلغاء";
  };
}

async function deleteBehaviorNote(id) {
  if (!confirm("متأكد تبي تحذف هذي الملاحظة؟")) return;
  const { error } = await supabaseClient.from("behavior_notes").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadBehaviorNotes();
}

let classReportCache = null;

let reportEditMode = false;
function reportOverrideKey(classId, period) { return "maharat_rep_edit_" + classId + "_" + period; }
function loadReportOverrides(classId, period) { try { return JSON.parse(localStorage.getItem(reportOverrideKey(classId, period)) || "{}"); } catch (e) { return {}; } }
function saveReportOverrides(classId, period, data) { try { if (Object.keys(data).length) localStorage.setItem(reportOverrideKey(classId, period), JSON.stringify(data)); else localStorage.removeItem(reportOverrideKey(classId, period)); } catch (e) {} }

async function renderClassReport(classId, classTitle) {
  reportEditMode = false;
  document.getElementById("pageTitle").textContent = `تقرير الرصد: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="openClass('${classId}', '${escapeAttr(classTitle)}')">${icon("back", 15)} رجوع للفصل</button>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      <div class="period-toggle" id="reportClassPeriodToggle" style="margin-bottom:0;"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
      <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="copyClassReportTable()">${icon("note", 15)} نسخ الجدول</button>
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="printClassReportTable('${escapeAttr(classTitle)}')">${icon("print", 15)} طباعة (أفقي)</button>
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="exportClassReportExcel('${escapeAttr(classTitle)}')">${icon("download", 15)} تصدير إكسل</button>
        <button class="btn-add" onclick="printAllStudentReports('${classId}', '${escapeAttr(classTitle)}')">${icon("print", 14)} طباعة تقارير كل الطلاب</button>
      </div>
    </div>
    <div class="rep-editbar no-print" id="repEditBar">
      <button class="rep-edit-toggle" id="repEditToggle">${icon("edit", 15)} تعديل الدرجات</button>
      <button class="rep-edit-tool" id="repRoundBtn" style="display:none;">تقريب للأعداد الصحيحة</button>
      <button class="rep-edit-tool danger" id="repResetBtn" style="display:none;">إعادة الحساب التلقائي</button>
      <span class="rep-edit-hint" id="repEditHint">التعديل هنا يخص التقرير فقط (للنسخ إلى نظام نور) ولا يغيّر الدرجات المسجلة في الحصص.</span>
    </div>
    <div class="section-card">
      <div class="grade-table-wrap"><table class="grade-table class-report-table" id="classReportTable">
        <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>المجموع (40)</th><th>تحريري</th><th>عملي</th><th>المجموع (60)</th><th>الإجمالي</th></tr></thead>
        <tbody id="classReportBody"><tr><td colspan="10" class="empty-state">جاري التحميل...</td></tr></tbody>
      </table></div>
    </div>`;
  hydrateIcons(contentArea);
  let period = "p1";
  document.querySelectorAll("#reportClassPeriodToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      period = btn.dataset.p;
      document.querySelectorAll("#reportClassPeriodToggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadClassReportBody(classId, period, classTitle);
    });
  });
  document.getElementById("repEditToggle").addEventListener("click", () => setReportEditMode(!reportEditMode));
  document.getElementById("repRoundBtn").addEventListener("click", () => {
    if (!classReportCache) return;
    const ov = loadReportOverrides(classReportCache.classId, classReportCache.period);
    classReportCache.rowsData.forEach((r) => r.results.forEach((x, i) => {
      const rounded = Math.round(x.avg);
      if (rounded !== x.avg) { x.avg = rounded; (ov[r.student.id] = ov[r.student.id] || {})[i] = rounded; }
    }));
    classReportCache.rowsData.forEach((r) => { r.total = Math.round(r.results.reduce((sum, x) => sum + x.avg, 0) * 100) / 100; });
    saveReportOverrides(classReportCache.classId, classReportCache.period, ov);
    renderClassReportRows();
  });
  document.getElementById("repResetBtn").addEventListener("click", () => {
    if (!classReportCache || !confirm("إلغاء كل التعديلات والرجوع للحساب التلقائي؟")) return;
    saveReportOverrides(classReportCache.classId, classReportCache.period, {});
    loadClassReportBody(classReportCache.classId, classReportCache.period, classReportCache.classTitle);
  });
  await loadClassReportBody(classId, period, classTitle);
}

function setReportEditMode(on) {
  reportEditMode = on;
  const t = document.getElementById("repEditToggle");
  if (t) { t.classList.toggle("on", on); t.innerHTML = on ? icon("check", 15) + " إنهاء التعديل" : icon("edit", 15) + " تعديل الدرجات"; hydrateIcons(t); }
  const r = document.getElementById("repRoundBtn"); if (r) r.style.display = on ? "" : "none";
  renderClassReportRows();
}

function reportHasEdits() {
  if (!classReportCache) return false;
  return Object.keys(loadReportOverrides(classReportCache.classId, classReportCache.period)).length > 0;
}

function renderClassReportRows() {
  const body = document.getElementById("classReportBody");
  if (!body || !classReportCache) return;
  const { classId, classTitle, rowsData, period } = classReportCache;
  const ov = loadReportOverrides(classId, period);
  const resetBtn = document.getElementById("repResetBtn");
  if (resetBtn) resetBtn.style.display = Object.keys(ov).length ? "" : "none";
  const cell = (r, i) => {
    const edited = ov[r.student.id] && ov[r.student.id][i] !== undefined;
    if (reportEditMode) return `<td class="${edited ? "rep-edited" : ""}"><input type="number" class="rep-input" data-s="${r.student.id}" data-i="${i}" min="0" max="${r.results[i].target}" step="0.5" value="${r.results[i].avg}" onclick="event.stopPropagation()" /></td>`;
    return `<td class="${edited ? "rep-edited" : ""}">${r.results[i].avg}</td>`;
  };
  body.innerHTML = rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    const rowClick = reportEditMode ? "" : `onclick="openStudentReport('${r.student.id}', '${escapeAttr(r.student.full_name)}', {id:'${classId}', title:'${escapeAttr(classTitle)}'})" style="cursor:pointer;"`;
    return `
    <tr data-s="${r.student.id}" ${rowClick}>
      <td class="student-name-cell">${escapeHtml(r.student.full_name)}</td>
      ${cell(r, 0)}${cell(r, 1)}${cell(r, 2)}${cell(r, 3)}
      <td style="font-weight:700;" data-sub="cont">${continuousTotal}</td>
      ${cell(r, 4)}${cell(r, 5)}
      <td style="font-weight:700;" data-sub="exam">${examsTotal}</td>
      <td style="font-weight:700; color:var(--navy);" data-sub="total">${r.total}</td>
    </tr>`;
  }).join("");
  if (reportEditMode) {
    body.querySelectorAll(".rep-input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const row = classReportCache.rowsData.find((x) => x.student.id === inp.dataset.s);
        const i = parseInt(inp.dataset.i, 10);
        let v = parseFloat(inp.value);
        if (isNaN(v)) return;
        v = Math.max(0, Math.min(row.results[i].target, v));
        row.results[i].avg = v;
        row.total = Math.round(row.results.reduce((sum, x) => sum + x.avg, 0) * 100) / 100;
        const ovs = loadReportOverrides(classReportCache.classId, classReportCache.period);
        if (v === row.results[i].orig) { if (ovs[row.student.id]) { delete ovs[row.student.id][i]; if (!Object.keys(ovs[row.student.id]).length) delete ovs[row.student.id]; } }
        else (ovs[row.student.id] = ovs[row.student.id] || {})[i] = v;
        saveReportOverrides(classReportCache.classId, classReportCache.period, ovs);
        inp.parentElement.classList.toggle("rep-edited", v !== row.results[i].orig);
        const { continuousTotal, examsTotal } = calcSubtotals(row.results);
        const tr = inp.closest("tr");
        tr.querySelector('[data-sub="cont"]').textContent = continuousTotal;
        tr.querySelector('[data-sub="exam"]').textContent = examsTotal;
        tr.querySelector('[data-sub="total"]').textContent = row.total;
        const rb = document.getElementById("repResetBtn"); if (rb) rb.style.display = Object.keys(ovs).length ? "" : "none";
      });
    });
  }
}

function copyClassReportTable() {
  if (!classReportCache) return;
  const lines = [["الطالب", "المشاركة", "الواجبات", "المهام الأدائية", "التطبيق العملي", "المجموع (40)", "التحريري", "العملي", "المجموع (60)", "الإجمالي"].join("\t")];
  classReportCache.rowsData.forEach((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    lines.push([r.student.full_name, r.results[0].avg, r.results[1].avg, r.results[2].avg, r.results[3].avg, continuousTotal, r.results[4].avg, r.results[5].avg, examsTotal, r.total].join("\t"));
  });
  const text = lines.join("\n");
  const done = () => alert("تم نسخ الجدول — الصقه مباشرة في إكسل أو أي جدول.");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => alert("تعذر النسخ تلقائياً، استخدم تصدير إكسل."));
  else alert("المتصفح لا يدعم النسخ المباشر، استخدم تصدير إكسل.");
}

async function loadClassReportBody(classId, period, classTitle) {
  const body = document.getElementById("classReportBody");
  body.innerHTML = `<tr><td colspan="10" class="empty-state">جاري التحميل...</td></tr>`;
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  if (!students || students.length === 0) { body.innerHTML = `<tr><td colspan="10" class="empty-state">ما فيه طلاب بهذا الفصل</td></tr>`; return; }
  const rowsData = await Promise.all(students.map(async (st) => {
    const r = await fetchStudentResults(st.id, period);
    r.results.forEach((x) => { x.orig = x.avg; });
    return { student: st, results: r.results, total: r.total };
  }));
  const ov = loadReportOverrides(classId, period);
  rowsData.forEach((r) => {
    const o = ov[r.student.id];
    if (!o) return;
    Object.keys(o).forEach((i) => { r.results[i].avg = o[i]; });
    r.total = Math.round(r.results.reduce((sum, x) => sum + x.avg, 0) * 100) / 100;
  });
  classReportCache = { classId, period, classTitle, rowsData };
  renderClassReportRows();
}

function exportClassReportExcel(classTitle) {
  if (!classReportCache) return;
  const headers = ["الطالب", "المشاركة", "الواجبات", "المهام الأدائية", "التطبيق العملي", "المجموع (40)", "التحريري", "العملي", "المجموع (60)", "الإجمالي"];
  const rows = classReportCache.rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    return [r.student.full_name, r.results[0].avg, r.results[1].avg, r.results[2].avg, r.results[3].avg, continuousTotal, r.results[4].avg, r.results[5].avg, examsTotal, r.total];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير الرصد");
  XLSX.writeFile(wb, `تقرير-الرصد-${classTitle}.xlsx`);
}

function printClassReportTable(classTitle) {
  if (!classReportCache) return;
  const periodLabel = classReportCache.period === "p1" ? "الفترة الأولى" : "الفترة الثانية";
  const win = window.open("", "_blank");
  const rowsHtml = classReportCache.rowsData.map((r) => {
    const { continuousTotal, examsTotal } = calcSubtotals(r.results);
    return `<tr><td style="text-align:right; font-weight:600;">${escapeHtml(r.student.full_name)}</td><td>${r.results[0].avg}</td><td>${r.results[1].avg}</td><td>${r.results[2].avg}</td><td>${r.results[3].avg}</td><td style="font-weight:700; background:#f5f5f5;">${continuousTotal}</td><td>${r.results[4].avg}</td><td>${r.results[5].avg}</td><td style="font-weight:700; background:#f5f5f5;">${examsTotal}</td><td style="font-weight:800;">${r.total}</td></tr>`;
  }).join("");
  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير الرصد ${escapeHtml(classTitle)}</title>
    <style>@page { size: landscape; margin: 10mm; } body { font-family: Tajawal, Arial, sans-serif; direction: rtl; margin: 0; padding: 20px; } h2 { margin-bottom: 4px; } p { color: #555; margin-bottom: 16px; } table { width: 100%; border-collapse: collapse; font-size: 11px; } th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; } thead th { background: #eee; }</style>
    </head><body><h2>تقرير الرصد: ${escapeHtml(classTitle)}</h2><p>${periodLabel}</p>
    <table><thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>المجموع (40)</th><th>تحريري</th><th>عملي</th><th>المجموع (60)</th><th>الإجمالي</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>`);
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
        <thead><tr style="background:#eee;">${r.results.slice(0, 4).map((c) => `<th style="border:1px solid #ccc; padding:8px;">${c.label}</th>`).join("")}<th style="border:1px solid #ccc; padding:8px;">المجموع (40)</th>${r.results.slice(4).map((c) => `<th style="border:1px solid #ccc; padding:8px;">${c.label}</th>`).join("")}<th style="border:1px solid #ccc; padding:8px;">المجموع (60)</th><th style="border:1px solid #ccc; padding:8px;">الإجمالي</th></tr></thead>
        <tbody><tr>${r.results.slice(0, 4).map((c) => `<td style="border:1px solid #ccc; padding:8px; text-align:center;">${c.avg}</td>`).join("")}<td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${continuousTotal}</td>${r.results.slice(4).map((c) => `<td style="border:1px solid #ccc; padding:8px; text-align:center;">${c.avg}</td>`).join("")}<td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${examsTotal}</td><td style="border:1px solid #ccc; padding:8px; text-align:center; font-weight:bold;">${r.total} / 100</td></tr></tbody>
      </table>
    </div>`;
  }).join("");
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقارير ${escapeHtml(classTitle)}</title></head><body>${studentsHtml}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

let teacherReportCache = null;

async function renderTeacherSpecialReport(classId, classTitle) {
  document.getElementById("pageTitle").textContent = `تقرير خاص بالفصل: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <button class="btn-back no-print" onclick="openClass('${classId}', '${escapeAttr(classTitle)}')">${icon("back", 15)} رجوع للفصل</button>
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      <div class="period-toggle" id="teacherReportPeriodToggle" style="margin-bottom:0;"><button data-p="p1" class="active">الفترة الأولى</button><button data-p="p2">الفترة الثانية</button></div>
      <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="printTeacherReport('${escapeAttr(classTitle)}')">${icon("print", 15)} طباعة (أفقي)</button>
        <button class="btn-secondary" style="width:auto; padding:10px 16px;" onclick="exportTeacherReportExcel('${escapeAttr(classTitle)}')">${icon("download", 15)} تصدير إكسل</button>
      </div>
    </div>
    <p style="color:var(--text-muted); font-size:12px; margin-bottom:14px;">مستوى جيد (80%+) · يحتاج تحسين (60-79%) · يحتاج متابعة عاجلة (أقل من 60%)</p>
    <div class="section-card">
      <div class="grade-table-wrap"><table class="grade-table class-report-table" id="teacherReportTable">
        <thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>تحريري</th><th>عملي</th><th>الإجمالي</th><th>عدد الغياب</th><th>إيجابية</th><th>سلبية</th></tr></thead>
        <tbody id="teacherReportBody"><tr><td colspan="11" class="empty-state">جاري التحميل...</td></tr></tbody>
      </table></div>
    </div>`;
  hydrateIcons(contentArea);
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
  return `<td>${c.avg}<br><span style="font-size:10px;" class="lvl-${lvl.cls || 'mid'}">${lvl.label}</span></td>`;
}

async function loadTeacherReportBody(classId, period, classTitle) {
  const body = document.getElementById("teacherReportBody");
  body.innerHTML = `<tr><td colspan="11" class="empty-state">جاري التحميل...</td></tr>`;
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  if (!students || students.length === 0) { body.innerHTML = `<tr><td colspan="11" class="empty-state">ما فيه طلاب بهذا الفصل</td></tr>`; return; }
  const { data: allNotes } = await supabaseClient.from("behavior_notes").select("*").in("student_id", students.map((s) => s.id));
  const rowsData = await Promise.all(students.map(async (st) => {
    const r = await fetchStudentResults(st.id, period);
    const myNotes = (allNotes || []).filter((n) => n.student_id === st.id);
    const posCount = myNotes.filter((n) => n.note_type === "positive").length;
    const negCount = myNotes.filter((n) => n.note_type === "negative").length;
    const absenceCount = r.totalSessions - r.presentCount;
    return { student: st, results: r.results, total: r.total, posCount, negCount, absenceCount };
  }));
  teacherReportCache = { classId, period, classTitle, rowsData };
  body.innerHTML = rowsData.map((r) => `
    <tr style="cursor:pointer;" onclick="openStudentReport('${r.student.id}', '${escapeAttr(r.student.full_name)}', {id:'${classId}', title:'${escapeAttr(classTitle)}'})">
      <td class="student-name-cell">${escapeHtml(r.student.full_name)}</td>
      ${r.results.map((c) => levelCellHtml(c)).join("")}
      <td style="font-weight:800; color:var(--navy);">${r.total}</td>
      <td style="${r.absenceCount > 0 ? "color:var(--danger); font-weight:700;" : ""}">${r.absenceCount}</td>
      <td>${r.posCount}</td><td>${r.negCount}</td>
    </tr>`).join("");
}

function exportTeacherReportExcel(classTitle) {
  if (!teacherReportCache) return;
  const headers = ["الطالب", "المشاركة", "تصنيف", "الواجبات", "تصنيف", "المهام الأدائية", "تصنيف", "التطبيق العملي", "تصنيف", "التحريري", "تصنيف", "العملي", "تصنيف", "الإجمالي", "عدد الغياب", "ملاحظات إيجابية", "ملاحظات سلبية"];
  const rows = teacherReportCache.rowsData.map((r) => {
    const row = [r.student.full_name];
    r.results.forEach((c) => { const lvl = classifyLevel(c.avg, c.target); row.push(c.avg, lvl.label); });
    row.push(r.total, r.absenceCount, r.posCount, r.negCount);
    return row;
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير خاص بالفصل");
  XLSX.writeFile(wb, `تقرير-خاص-${classTitle}.xlsx`);
}

function printTeacherReport(classTitle) {
  if (!teacherReportCache) return;
  const periodLabel = teacherReportCache.period === "p1" ? "الفترة الأولى" : "الفترة الثانية";
  const win = window.open("", "_blank");
  const rowsHtml = teacherReportCache.rowsData.map((r) => `<tr><td style="text-align:right; font-weight:600;">${escapeHtml(r.student.full_name)}</td>${r.results.map((c) => { const lvl = classifyLevel(c.avg, c.target); return `<td>${c.avg}<br><span style="font-size:9px;">${lvl.label}</span></td>`; }).join("")}<td style="font-weight:800;">${r.total}</td><td>${r.absenceCount}</td><td>${r.posCount}</td><td>${r.negCount}</td></tr>`).join("");
  win.document.write(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير خاص بالفصل ${escapeHtml(classTitle)}</title>
    <style>@page { size: landscape; margin: 10mm; } body { font-family: Tajawal, Arial, sans-serif; direction: rtl; margin: 0; padding: 20px; } h2 { margin-bottom: 4px; } p { color: #555; margin-bottom: 16px; } table { width: 100%; border-collapse: collapse; font-size: 11px; } th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; } thead th { background: #eee; }</style>
    </head><body><h2>تقرير خاص بالفصل: ${escapeHtml(classTitle)}</h2><p>${periodLabel} · مستوى جيد · يحتاج تحسين · يحتاج متابعة عاجلة</p>
    <table><thead><tr><th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>تحريري</th><th>عملي</th><th>الإجمالي</th><th>عدد الغياب</th><th>إيجابية</th><th>سلبية</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

async function printClassQRCodes(classId, classTitle) {
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>باركودات ${escapeHtml(classTitle)}</title></head><body style="font-family:Tajawal, Arial, sans-serif; padding:40px; text-align:center;"><h2>جاري تجهيز الباركودات...</h2></body></html>`);
  win.document.close();
  const { data: students, error } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
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
    return `<div style="border:1px solid #ccc; border-radius:10px; padding:16px; text-align:center; page-break-inside:avoid; font-family:Tajawal, Arial, sans-serif; direction:rtl;"><img src="${qrImgUrl}" style="width:140px; height:140px; margin-bottom:10px;" /><div style="font-weight:700; font-size:14px; margin-bottom:4px;">${escapeHtml(st.full_name)}</div><div style="font-size:12px; color:#555;">${escapeHtml(st.grade || "")} — ${escapeHtml(classTitle)}</div><div style="font-size:9px; color:#999; margin-top:6px; word-break:break-all;">${st.parent_token}</div></div>`;
  });
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>باركودات ${escapeHtml(classTitle)}</title><style>@page { margin: 10mm; } body { margin: 20px; } h2 { font-family: Tajawal, Arial, sans-serif; margin-bottom: 20px; } .qr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }</style></head><body><h2>باركودات دخول أولياء الأمور — ${escapeHtml(classTitle)}</h2><div class="qr-grid">${cardsHtml.join("")}</div></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 800);
}

async function trackSearch(query) {
  const resultsEl = document.getElementById("trackSearchResults");
  if (!resultsEl) return;
  if (!query || query.trim().length < 2) { resultsEl.innerHTML = ""; return; }
  const { data, error } = await supabaseClient.from("students").select("*, classes(title)").ilike("full_name", `%${query.trim()}%`).limit(15);
  if (error || !data || data.length === 0) { resultsEl.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه نتائج</div>`; return; }
  resultsEl.innerHTML = data.map((s) => `<div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}')"><div class="info"><div class="t">${escapeHtml(s.full_name)}</div><div class="d">${s.classes ? escapeHtml(s.classes.title) : "بدون فصل"} · الصف ${escapeHtml(s.grade)}</div></div><div class="actions"><span class="icon-btn">${icon("back", 14)}</span></div></div>`).join("");
  hydrateIcons(resultsEl);
}


// ============================================
// صفحة الملاحظات السلوكية (منفصلة عن الحصص)
// ============================================
let behState = null;

async function renderBehaviorPage(classId, classTitle) {
  document.getElementById("pageTitle").textContent = `الملاحظات السلوكية: ${classTitle}`;
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `<div class="empty-state">جاري التحميل...</div>`;
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  const list = students || [];
  let notes = [];
  if (list.length) {
    const { data } = await supabaseClient.from("behavior_notes").select("*").in("student_id", list.map((x) => x.id)).order("created_at", { ascending: false });
    notes = data || [];
  }
  behState = {
    classId, classTitle, students: list, notes, mode: "student",
    selStudent: list[0] ? list[0].id : null, type: "positive",
    batchType: "negative", batchNote: null, batchCustom: "", batchStudents: new Set(),
    logFilter: "all", flash: "",
  };
  drawBehaviorPage();
}

async function behReloadNotes() {
  const ids = behState.students.map((x) => x.id);
  if (!ids.length) { behState.notes = []; return; }
  const { data } = await supabaseClient.from("behavior_notes").select("*").in("student_id", ids).order("created_at", { ascending: false });
  behState.notes = data || [];
}

async function behAddNotes(rows, flashText, beforeDraw) {
  const { error } = await supabaseClient.from("behavior_notes").insert(rows);
  if (error) { alert("تعذر الحفظ"); return false; }
  await behReloadNotes();
  behState.flash = flashText;
  if (beforeDraw) beforeDraw();
  drawBehaviorPage();
  return true;
}

function behCounts(studentId) {
  const mine = behState.notes.filter((n) => n.student_id === studentId);
  return { pos: mine.filter((n) => n.note_type === "positive").length, neg: mine.filter((n) => n.note_type === "negative").length };
}
function behStudentName(id) { const x = behState.students.find((y) => y.id === id); return x ? x.full_name : ""; }
function behBatchText() {
  const st = behState;
  const custom = (st.batchCustom || "").trim();
  if (custom) return custom;
  const presets = st.batchType === "positive" ? POSITIVE_NOTES : NEGATIVE_NOTES;
  return st.batchNote !== null ? presets[st.batchNote] : "";
}
function behUpdateBatchBtn() {
  const st = behState;
  const btn = document.getElementById("behBatchSave");
  if (!btn) return;
  const text = behBatchText();
  const n = st.batchStudents.size;
  btn.disabled = !text || n === 0;
  btn.textContent = !text ? "اختر ملاحظة أولاً" : (n === 0 ? "اختر الطلاب" : `تسجيل «${text}» على ${n} ${n === 1 ? "طالب" : "طلاب"}`);
}

function behStudentPanelHtml() {
  const st = behState;
  const stu = st.students.find((x) => x.id === st.selStudent);
  if (!stu) return `<div class="empty-state">اختر طالباً من القائمة</div>`;
  const mine = st.notes.filter((n) => n.student_id === stu.id);
  const presets = st.type === "positive" ? POSITIVE_NOTES : NEGATIVE_NOTES;
  const groups = {};
  mine.forEach((n) => {
    const k = n.note_type + "|" + n.note;
    if (!groups[k]) groups[k] = { type: n.note_type, note: n.note, count: 0 };
    groups[k].count++;
  });
  const summary = Object.values(groups).sort((a, b) => b.count - a.count).map((g) => `<span class="beh-sum ${g.type}">${escapeHtml(g.note)} <b>×${g.count}</b></span>`).join("") || `<span class="note-selected-empty">ما فيه ملاحظات مسجلة على هذا الطالب</span>`;
  const indiv = mine.map((n) => `<div class="beh-log-row"><span class="dot-badge ${n.note_type}"></span><span style="flex:1;">${escapeHtml(n.note)}</span><span class="beh-date">${new Date(n.created_at).toLocaleDateString("ar-SA")}</span><button type="button" class="icon-btn danger" data-beh-del="${n.id}" title="حذف">${icon("trash", 14)}</button></div>`).join("");
  return `
    <div class="section-head"><h3>${escapeHtml(stu.full_name)} — ماذا تسجّل؟</h3></div>
    <div class="beh-big-btns">
      <button type="button" class="beh-big-btn positive ${st.type === "positive" ? "active" : ""}" data-beh-type="positive">+ إيجابية</button>
      <button type="button" class="beh-big-btn negative ${st.type === "negative" ? "active" : ""}" data-beh-type="negative">− سلبية</button>
    </div>
    <p class="beh-hint">اضغط على الملاحظة لتُسجَّل فوراً على الطالب.</p>
    <div class="beh-pills">${presets.map((n, i) => `<button type="button" class="note-pill ${st.type}" data-beh-add="${i}">${escapeHtml(n)}</button>`).join("")}</div>
    <div class="note-custom-row"><input type="text" class="note-custom-input" id="behCustomInput" placeholder="ملاحظة مخصصة (اكتبها واضغط +)"><button type="button" class="note-custom-add" id="behCustomAdd" title="إضافة">${icon("plus", 14)}</button></div>
    <div class="beh-subtitle">المسجّل على الطالب (النوع وعدد التكرار)</div>
    <div class="beh-sums">${summary}</div>
    ${indiv ? `<div class="beh-subtitle">التفاصيل</div>${indiv}` : ""}`;
}

function behBatchPanelHtml() {
  const st = behState;
  const presets = st.batchType === "positive" ? POSITIVE_NOTES : NEGATIVE_NOTES;
  return `
    <div class="section-head"><h3>سجّل ملاحظة على عدة طلاب دفعة واحدة</h3></div>
    <p class="beh-hint">١) اختر نوع الملاحظة ثم الملاحظة  ٢) اضغط أسماء الطلاب  ٣) اضغط تسجيل</p>
    <div class="beh-big-btns">
      <button type="button" class="beh-big-btn positive ${st.batchType === "positive" ? "active" : ""}" data-beh-btype="positive">+ إيجابية</button>
      <button type="button" class="beh-big-btn negative ${st.batchType === "negative" ? "active" : ""}" data-beh-btype="negative">− سلبية</button>
    </div>
    <div class="beh-pills">${presets.map((n, i) => `<button type="button" class="note-pill ${st.batchType} ${st.batchNote === i ? "selected" : ""}" data-beh-bnote="${i}">${escapeHtml(n)}</button>`).join("")}</div>
    <div class="note-custom-row"><input type="text" class="note-custom-input" id="behBatchCustom" placeholder="أو اكتب ملاحظة مخصصة"></div>
    <div class="beh-subtitle" style="display:flex; justify-content:space-between; align-items:center;"><span>الطلاب</span><button type="button" class="toolbar-icon-btn" id="behBatchAll" style="padding:5px 12px;">تحديد الكل / إلغاء</button></div>
    <div class="beh-chips">${st.students.map((x) => `<button type="button" class="beh-stu-chip ${st.batchStudents.has(x.id) ? "on" : ""}" data-beh-bstu="${x.id}">${escapeHtml(x.full_name)}</button>`).join("")}</div>
    <button type="button" class="btn-add" id="behBatchSave" style="width:100%; justify-content:center; margin-top:14px;" disabled>اختر ملاحظة أولاً</button>`;
}

function drawBehaviorPage() {
  const st = behState;
  const ca = document.getElementById("contentArea");
  const back = `
    <button class="btn-back no-print" onclick="openClass('${st.classId}', '${escapeAttr(st.classTitle)}')">${icon("back", 15)} رجوع للفصل</button>
    <div class="breadcrumb-nav"><span class="crumb" onclick="renderClassesSection()">سجل المتابعة</span><span>/</span><span class="crumb" onclick="openClass('${st.classId}', '${escapeAttr(st.classTitle)}')">${escapeHtml(st.classTitle)}</span><span>/</span><span class="crumb current">الملاحظات السلوكية</span></div>`;
  if (!st.students.length) { ca.innerHTML = back + `<div class="section-card"><div class="empty-state">ما فيه طلاب بهذا الفصل</div></div>`; return; }

  const rows = st.students.map((x) => {
    const c = behCounts(x.id);
    return `<div class="beh-student-row ${x.id === st.selStudent ? "sel" : ""}" data-beh-stu="${x.id}"><div class="beh-av">${escapeHtml((x.full_name || "?").charAt(0))}</div><div class="beh-name">${escapeHtml(x.full_name)}</div><span class="beh-cnt pos">+${c.pos}</span><span class="beh-cnt neg">−${c.neg}</span></div>`;
  }).join("");
  const logRows = st.notes.filter((n) => st.logFilter === "all" || n.note_type === st.logFilter).slice(0, 40).map((n) =>
    `<div class="beh-log-row"><span class="dot-badge ${n.note_type}"></span><b>${escapeHtml(behStudentName(n.student_id))}</b><span style="flex:1;">— ${escapeHtml(n.note)}</span><span class="beh-date">${new Date(n.created_at).toLocaleDateString("ar-SA")}</span><button type="button" class="icon-btn danger" data-beh-del="${n.id}" title="حذف">${icon("trash", 14)}</button></div>`).join("") || `<div class="empty-state">ما فيه ملاحظات</div>`;

  ca.innerHTML = `${back}
    <div class="period-toggle"><button data-beh-mode="student" class="${st.mode === "student" ? "active" : ""}">حسب الطالب</button><button data-beh-mode="note" class="${st.mode === "note" ? "active" : ""}">حسب الملاحظة (جماعي)</button></div>
    <div class="beh-flash" id="behFlash">${escapeHtml(st.flash || "")}</div>
    ${st.mode === "student"
      ? `<div class="beh-layout"><div class="section-card" style="padding:14px;"><div class="section-head"><h3>الطلاب</h3></div>${rows}</div><div class="section-card">${behStudentPanelHtml()}</div></div>`
      : `<div class="section-card">${behBatchPanelHtml()}</div>`}
    <div class="section-card" style="margin-top:18px;">
      <div class="section-head"><h3>سجل الملاحظات</h3>
        <div class="period-toggle" style="margin-bottom:0;"><button data-beh-filter="all" class="${st.logFilter === "all" ? "active" : ""}">الكل</button><button data-beh-filter="positive" class="${st.logFilter === "positive" ? "active" : ""}">إيجابية</button><button data-beh-filter="negative" class="${st.logFilter === "negative" ? "active" : ""}">سلبية</button></div>
      </div>${logRows}
    </div>`;

  ca.querySelectorAll("[data-beh-mode]").forEach((b) => b.addEventListener("click", () => { st.mode = b.dataset.behMode; drawBehaviorPage(); }));
  ca.querySelectorAll("[data-beh-filter]").forEach((b) => b.addEventListener("click", () => { st.logFilter = b.dataset.behFilter; drawBehaviorPage(); }));
  ca.querySelectorAll("[data-beh-stu]").forEach((r) => r.addEventListener("click", () => { st.selStudent = r.dataset.behStu; drawBehaviorPage(); }));
  ca.querySelectorAll("[data-beh-type]").forEach((b) => b.addEventListener("click", () => { st.type = b.dataset.behType; drawBehaviorPage(); }));
  ca.querySelectorAll("[data-beh-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("متأكد تبي تحذف هذي الملاحظة؟")) return;
    const { error } = await supabaseClient.from("behavior_notes").delete().eq("id", b.dataset.behDel);
    if (error) { alert("تعذر الحذف"); return; }
    await behReloadNotes();
    st.flash = "تم الحذف";
    drawBehaviorPage();
  }));

  if (st.mode === "student") {
    ca.querySelectorAll("[data-beh-add]").forEach((b) => b.addEventListener("click", async () => {
      const presets = st.type === "positive" ? POSITIVE_NOTES : NEGATIVE_NOTES;
      const text = presets[parseInt(b.dataset.behAdd, 10)];
      await behAddNotes([{ student_id: st.selStudent, note_type: st.type, note: text, session_id: null }], `تم تسجيل: ${text} ✓`);
    }));
    const input = document.getElementById("behCustomInput");
    const doCustom = async () => {
      const text = input.value.trim();
      if (!text) return;
      await behAddNotes([{ student_id: st.selStudent, note_type: st.type, note: text, session_id: null }], `تم تسجيل: ${text} ✓`);
    };
    document.getElementById("behCustomAdd").addEventListener("click", doCustom);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doCustom(); } });
  } else {
    const customEl = document.getElementById("behBatchCustom");
    customEl.value = st.batchCustom || "";
    ca.querySelectorAll("[data-beh-btype]").forEach((b) => b.addEventListener("click", () => { st.batchType = b.dataset.behBtype; st.batchNote = null; drawBehaviorPage(); }));
    ca.querySelectorAll("[data-beh-bnote]").forEach((b) => b.addEventListener("click", () => {
      const i = parseInt(b.dataset.behBnote, 10);
      st.batchNote = st.batchNote === i ? null : i;
      st.batchCustom = ""; customEl.value = "";
      ca.querySelectorAll("[data-beh-bnote]").forEach((x) => x.classList.toggle("selected", parseInt(x.dataset.behBnote, 10) === st.batchNote));
      behUpdateBatchBtn();
    }));
    customEl.addEventListener("input", () => {
      st.batchCustom = customEl.value;
      if (customEl.value.trim()) { st.batchNote = null; ca.querySelectorAll("[data-beh-bnote]").forEach((x) => x.classList.remove("selected")); }
      behUpdateBatchBtn();
    });
    ca.querySelectorAll("[data-beh-bstu]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.behBstu;
      if (st.batchStudents.has(id)) st.batchStudents.delete(id); else st.batchStudents.add(id);
      b.classList.toggle("on", st.batchStudents.has(id));
      behUpdateBatchBtn();
    }));
    document.getElementById("behBatchAll").addEventListener("click", () => {
      const all = st.batchStudents.size === st.students.length;
      st.batchStudents = all ? new Set() : new Set(st.students.map((x) => x.id));
      ca.querySelectorAll("[data-beh-bstu]").forEach((x) => x.classList.toggle("on", st.batchStudents.has(x.dataset.behBstu)));
      behUpdateBatchBtn();
    });
    document.getElementById("behBatchSave").addEventListener("click", async () => {
      const text = behBatchText();
      if (!text || !st.batchStudents.size) return;
      const ids = Array.from(st.batchStudents);
      const rows2 = ids.map((id) => ({ student_id: id, note_type: st.batchType, note: text, session_id: null }));
      await behAddNotes(rows2, `تم تسجيل «${text}» على ${ids.length} ${ids.length === 1 ? "طالب" : "طلاب"} ✓`, () => { st.batchNote = null; st.batchCustom = ""; st.batchStudents = new Set(); });
    });
    behUpdateBatchBtn();
  }
  if (st.flash) setTimeout(() => { const f = document.getElementById("behFlash"); if (f) f.textContent = ""; st.flash = ""; }, 3000);
}
