const SESSION_KIND_LABELS = {
  participation: "مشاركة", homework: "واجبات", tasks: "مهام أدائية", practical: "تطبيق عملي",
  written_exam: "اختبار تحريري", practical_exam: "اختبار عملي"
};
const COMPONENT_DEFS = [
  { key: "participation", label: "المشاركة", target: 10, field: "participation" },
  { key: "homework", label: "الواجبات", target: 10, field: "homework" },
  { key: "tasks", label: "المهام الأدائية", target: 10, field: "tasks" },
  { key: "practical", label: "التطبيق العملي", target: 10, field: "practical" },
  { key: "written_exam", label: "الاختبار التحريري", target: 30, field: "exam_score" },
  { key: "practical_exam", label: "الاختبار العملي", target: 30, field: "exam_score" },
];
const POSITIVE_NOTES = ["مشارك ومتفاعل","تطبيق عملي جيد","منظم ومرتب","متعاون مع زملائه","أنجز المهام بسرعة وإتقان","حضور والتزام ممتاز"];
const NEGATIVE_NOTES = ["لم يُحضر أدواته","تلفظ غير لائق","لم يُنجز الواجب","انشغال عن الدرس","إزعاج أثناء الحصة","تأخر عن الحصة"];

const WEEKDAY_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
function weekdayNameFromDate(dateStr){
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return WEEKDAY_AR[d.getDay()];
}

function classifyLevel(avg, target){
  const pct = (avg / target) * 100;
  if (pct >= 80) return { cls: "positive", label: "مستوى جيد" };
  if (pct >= 60) return { cls: "mid", label: "يحتاج تحسين" };
  return { cls: "negative", label: "يحتاج متابعة عاجلة" };
}

async function fetchStudentResults(studentId){
  const { data: scores } = await supabaseClient
    .from("session_scores")
    .select("*, class_sessions(session_kind, period, session_date)")
    .eq("student_id", studentId);
  const rows = scores || [];
  const results = {};
  COMPONENT_DEFS.forEach(c => {
    const vals = rows.filter(r => r.class_sessions?.session_kind === c.key && r[c.field] !== null && r[c.field] !== undefined)
      .map(r => Number(r[c.field]));
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0) / vals.length) : 0;
    results[c.key] = { avg, count: vals.length, target: c.target };
  });
  const totalSessions = rows.length;
  const presentCount = rows.filter(r => r.attendance !== false).length;
  const attendanceRate = totalSessions ? Math.round((presentCount / totalSessions) * 100) : 100;
  return { results, totalSessions, presentCount, attendanceRate };
}

function calcSubtotals(results){
  const continuous = ["participation","homework","tasks","practical"].reduce((sum,k)=>sum + (results[k]?.avg||0), 0);
  const exams = ["written_exam","practical_exam"].reduce((sum,k)=>sum + (results[k]?.avg||0), 0);
  return { continuous, exams, total: continuous + exams };
}

// ============ Sessions ============
async function renderGradingArea(classId){
  const holder = document.getElementById("gradingArea");
  if (!holder) return;
  holder.innerHTML = `
    <div class="toolbar-row">
      <select id="newSessionKind">
        ${Object.entries(SESSION_KIND_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}
      </select>
      <input type="number" id="newSessionPeriod" placeholder="الفترة (1 أو 2)" value="1" style="width:110px;">
      <input type="date" id="newSessionDate" value="${new Date().toISOString().slice(0,10)}">
      <button class="btn-primary" onclick="createSession('${classId}')">${icon("plus",16)}<span>حصة جديدة</span></button>
    </div>
    <div id="sessionsPills" class="pills-row"></div>
  `;
  hydrateIcons(holder);
  loadGradingKinds(classId);
}

async function loadGradingKinds(classId){
  const holder = document.getElementById("sessionsPills");
  const { data } = await supabaseClient.from("class_sessions").select("*").eq("class_id", classId).order("created_at", { ascending: false });
  const list = data || [];
  if (!list.length) { holder.innerHTML = `<p class="muted">لا توجد حصص بعد.</p>`; return; }
  holder.innerHTML = list.map((s,idx) => `
    <div class="session-pill">
      <div class="session-pill-main" onclick="openSessionGrid('${s.id}','${classId}','${s.session_kind}')">
        <strong>${SESSION_KIND_LABELS[s.session_kind] || s.session_kind}</strong>
        <span>الفترة ${s.period || 1}</span>
        <span class="session-date">${s.session_date ? (weekdayNameFromDate(s.session_date) + " - " + s.session_date) : ""}</span>
      </div>
      <div class="session-pill-actions">
        <button class="mini-btn" title="تعديل" onclick="openEditSessionModal('${s.id}','${classId}')">${icon("edit",14)}</button>
        <button class="mini-btn danger" title="حذف" onclick="deleteSession('${s.id}','${classId}')">${icon("trash",14)}</button>
      </div>
    </div>
  `).join("");
  hydrateIcons(holder);
}

async function createSession(classId){
  const kind = document.getElementById("newSessionKind").value;
  const period = parseInt(document.getElementById("newSessionPeriod").value || "1");
  const session_date = document.getElementById("newSessionDate").value || new Date().toISOString().slice(0,10);
  await supabaseClient.from("class_sessions").insert({ class_id: classId, session_kind: kind, period, session_date });
  loadGradingKinds(classId);
}

async function openEditSessionModal(sessionId, classId){
  const { data: s } = await supabaseClient.from("class_sessions").select("*").eq("id", sessionId).single();
  if (!s) return;
  openModal(`
    <h3>تعديل الحصة</h3>
    <label>نوع الحصة</label>
    <select id="editSessionKind">
      ${Object.entries(SESSION_KIND_LABELS).map(([k,v])=>`<option value="${k}" ${k===s.session_kind?'selected':''}>${v}</option>`).join("")}
    </select>
    <label>الفترة</label>
    <input type="number" id="editSessionPeriod" value="${s.period||1}">
    <label>التاريخ</label>
    <input type="date" id="editSessionDate" value="${s.session_date || ''}" oninput="document.getElementById('editSessionDayLabel').textContent = weekdayNameFromDate(this.value)">
    <p class="muted">اليوم: <span id="editSessionDayLabel">${weekdayNameFromDate(s.session_date)}</span></p>
    <button class="btn-primary full" onclick="submitEditSession('${sessionId}','${classId}')">حفظ التعديلات</button>
  `);
}
async function submitEditSession(sessionId, classId){
  const session_kind = document.getElementById("editSessionKind").value;
  const period = parseInt(document.getElementById("editSessionPeriod").value || "1");
  const session_date = document.getElementById("editSessionDate").value;
  await supabaseClient.from("class_sessions").update({ session_kind, period, session_date }).eq("id", sessionId);
  closeModal();
  loadGradingKinds(classId);
}

async function deleteSession(sessionId, classId){
  if (!confirm("حذف هذه الحصة وكل درجاتها؟")) return;
  await supabaseClient.from("session_scores").delete().eq("session_id", sessionId);
  await supabaseClient.from("class_sessions").delete().eq("id", sessionId);
  loadGradingKinds(classId);
}

const SCORE_CHIPS_10 = [0,2,4,6,8,10];
const SCORE_CHIPS_30 = [0,6,12,18,24,30];

async function openSessionGrid(sessionId, classId, kind){
  const el = document.getElementById("contentArea");
  const { data: session } = await supabaseClient.from("class_sessions").select("*").eq("id", sessionId).single();
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  const { data: scores } = await supabaseClient.from("session_scores").select("*").eq("session_id", sessionId);
  const scoreMap = {};
  (scores||[]).forEach(s => scoreMap[s.student_id] = s);

  const isExam = kind === "written_exam" || kind === "practical_exam";
  const field = isExam ? "exam_score" : kind;
  const chips = isExam ? SCORE_CHIPS_30 : SCORE_CHIPS_10;

  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="openClass('${classId}','${classesState.currentClassTitle.replace(/'/g,"\\'")}')">${icon("back",18)}<span>رجوع للفصل</span></button>
      <h2>${SESSION_KIND_LABELS[kind]} — الفترة ${session.period||1}</h2>
    </div>
    <div class="toolbar-row">
      <label style="margin:0;">التاريخ:</label>
      <input type="date" id="sessionDateInput" value="${session.session_date||''}" onchange="updateSessionDate('${sessionId}')">
      <span id="sessionDayLabel" class="sub-badge">${weekdayNameFromDate(session.session_date)}</span>
    </div>
    <div id="gridHolder" class="grid-table-holder"></div>
  `;
  hydrateIcons(el);

  const holder = document.getElementById("gridHolder");
  holder.innerHTML = `
    <table class="grid-table">
      <thead><tr><th>الطالب</th><th>الدرجة</th><th>حضور</th><th>ملاحظة</th></tr></thead>
      <tbody>
        ${(students||[]).map(s => {
          const sc = scoreMap[s.id];
          const val = sc ? sc[field] : null;
          const att = sc ? sc.attendance !== false : true;
          return `
          <tr data-student="${s.id}">
            <td>${s.full_name}</td>
            <td>
              <div class="chip-row">
                ${chips.map(c => `<button type="button" class="chip ${val===c?'active':''}" onclick="setScoreChip('${s.id}','${sessionId}','${field}',${c},this)">${c}</button>`).join("")}
              </div>
            </td>
            <td><input type="checkbox" ${att?'checked':''} onchange="setAttendance('${s.id}','${sessionId}',this.checked)"></td>
            <td><button class="mini-btn" onclick="openBehaviorModal('${s.id}','${(s.full_name||'').replace(/'/g,"\\'")}','${sessionId}')">${icon("note",15)}</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  hydrateIcons(holder);
}

async function updateSessionDate(sessionId){
  const val = document.getElementById("sessionDateInput").value;
  await supabaseClient.from("class_sessions").update({ session_date: val }).eq("id", sessionId);
  document.getElementById("sessionDayLabel").textContent = weekdayNameFromDate(val);
}

async function setScoreChip(studentId, sessionId, field, value, btnEl){
  btnEl.parentElement.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  btnEl.classList.add("active");
  const payload = { student_id: studentId, session_id: sessionId, [field]: value };
  const { data: existing } = await supabaseClient.from("session_scores").select("id").eq("student_id", studentId).eq("session_id", sessionId).maybeSingle();
  if (existing) {
    await supabaseClient.from("session_scores").update(payload).eq("id", existing.id);
  } else {
    await supabaseClient.from("session_scores").insert(payload);
  }
}

async function setAttendance(studentId, sessionId, checked){
  const { data: existing } = await supabaseClient.from("session_scores").select("id").eq("student_id", studentId).eq("session_id", sessionId).maybeSingle();
  if (existing) {
    await supabaseClient.from("session_scores").update({ attendance: checked }).eq("id", existing.id);
  } else {
    await supabaseClient.from("session_scores").insert({ student_id: studentId, session_id: sessionId, attendance: checked });
  }
}

// ============ Behavior notes (multi-select) ============
async function openBehaviorModal(studentId, studentName, sessionId){
  openModal(`
    <h3>ملاحظات — ${studentName}</h3>
    <p class="muted">حدد كل الملاحظات التي تنطبق على الطالب في هذه الحصة، ثم اضغط حفظ الكل.</p>
    <div class="notes-col">
      <strong class="note-group-label positive">إيجابية</strong>
      ${POSITIVE_NOTES.map((n,i)=>`<label class="check-row"><input type="checkbox" class="note-check" data-type="positive" value="${n}"> ${n}</label>`).join("")}
    </div>
    <div class="notes-col">
      <strong class="note-group-label negative">سلبية</strong>
      ${NEGATIVE_NOTES.map((n,i)=>`<label class="check-row"><input type="checkbox" class="note-check" data-type="negative" value="${n}"> ${n}</label>`).join("")}
    </div>
    <div id="otherNotesHolder">
      <label>أخرى (اختياري)</label>
      <div class="other-note-row">
        <select class="other-note-type"><option value="positive">إيجابية</option><option value="negative">سلبية</option></select>
        <input type="text" class="other-note-text" placeholder="اكتب ملاحظة إضافية">
      </div>
    </div>
    <button type="button" class="btn-secondary" onclick="addOtherNoteRow()">${icon("plus",14)}<span>إضافة سطر آخر</span></button>
    <div id="behaviorSaveStatus" class="muted" style="margin-top:8px;"></div>
    <button class="btn-primary full" onclick="saveAllBehaviorNotes('${studentId}','${sessionId}')">حفظ الكل</button>
    <button class="btn-secondary full" onclick="closeModal()">تم / إغلاق</button>
  `);
  hydrateIcons(document.getElementById("modalOverlay"));
}
function addOtherNoteRow(){
  const holder = document.getElementById("otherNotesHolder");
  const row = document.createElement("div");
  row.className = "other-note-row";
  row.innerHTML = `
    <select class="other-note-type"><option value="positive">إيجابية</option><option value="negative">سلبية</option></select>
    <input type="text" class="other-note-text" placeholder="اكتب ملاحظة إضافية">
  `;
  holder.appendChild(row);
}
async function saveAllBehaviorNotes(studentId, sessionId){
  const rows = [];
  document.querySelectorAll(".note-check:checked").forEach(cb => {
    rows.push({ student_id: studentId, session_id: sessionId, note_type: cb.getAttribute("data-type"), note: cb.value });
  });
  document.querySelectorAll(".other-note-row").forEach(r => {
    const text = r.querySelector(".other-note-text").value.trim();
    const type = r.querySelector(".other-note-type").value;
    if (text) rows.push({ student_id: studentId, session_id: sessionId, note_type: type, note: text });
  });
  if (!rows.length) { document.getElementById("behaviorSaveStatus").textContent = "لم يتم تحديد أي ملاحظة."; return; }
  await supabaseClient.from("behavior_notes").insert(rows);
  document.querySelectorAll(".note-check").forEach(cb => cb.checked = false);
  document.querySelectorAll(".other-note-text").forEach(inp => inp.value = "");
  document.getElementById("behaviorSaveStatus").textContent = `تم الحفظ ✓ (${rows.length} ملاحظة) — يمكنك إضافة المزيد`;
}

async function loadBehaviorNotes(studentId){
  const { data } = await supabaseClient
    .from("behavior_notes").select("*, class_sessions(session_kind, session_date)")
    .eq("student_id", studentId).order("created_at", { ascending: false });
  return data || [];
}

// ============ Student report ============
async function openStudentReport(studentId, studentName){
  renderReportShell(studentId, studentName);
}
function renderReportShell(studentId, studentName){
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="openClass('${classesState.currentClassId}','${classesState.currentClassTitle.replace(/'/g,"\\'")}')">${icon("back",18)}<span>رجوع للفصل</span></button>
      <h2>تقرير الطالب: ${studentName}</h2>
    </div>
    <div class="toolbar-row">
      <button class="btn-secondary" onclick="openTransferModal('${studentId}','${studentName.replace(/'/g,"\\'")}')">${icon("swap",16)}<span>نقل لفصل آخر</span></button>
      <button class="btn-secondary" onclick="openParentQrModal('${studentId}','${studentName.replace(/'/g,"\\'")}')">${icon("qr",16)}<span>رمز ولي الأمر</span></button>
      <button class="btn-secondary" onclick="window.print()">${icon("print",16)}<span>طباعة</span></button>
    </div>
    <div id="reportBody"></div>
  `;
  hydrateIcons(el);
  loadReportBody(studentId);
}
async function loadReportBody(studentId){
  const holder = document.getElementById("reportBody");
  const { results, attendanceRate } = await fetchStudentResults(studentId);
  const sub = calcSubtotals(results);
  const notes = await loadBehaviorNotes(studentId);
  const posCount = notes.filter(n=>n.note_type==="positive").length;
  const negCount = notes.filter(n=>n.note_type==="negative").length;

  holder.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div><strong>${sub.total.toFixed(1)}</strong><span>الإجمالي / 100</span></div></div>
      <div class="stat-card"><div><strong>${sub.continuous.toFixed(1)}</strong><span>أعمال السنة / 40</span></div></div>
      <div class="stat-card"><div><strong>${sub.exams.toFixed(1)}</strong><span>الاختبارات / 60</span></div></div>
      <div class="stat-card"><div><strong>${attendanceRate}%</strong><span>نسبة الحضور</span></div></div>
    </div>
    <div class="component-grid">
      ${COMPONENT_DEFS.map(c => {
        const r = results[c.key];
        const lvl = classifyLevel(r.avg, r.target);
        return `<div class="component-card lvl-${lvl.cls}">
          <strong>${c.label}</strong>
          <span>${r.avg.toFixed(1)} / ${c.target}</span>
          <span class="lvl-tag">${lvl.label}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="section-block">
      <h3>ملاحظات السلوك <span class="sub-badge">🟢 ${posCount} / 🔴 ${negCount}</span></h3>
      <div class="items-list">
        ${notes.length ? notes.map(n => `
          <div class="item-row">
            <div class="item-main">
              <span class="note-dot ${n.note_type}"></span>
              <span>${n.note}</span>
              <span class="sub-badge">${n.class_sessions ? (SESSION_KIND_LABELS[n.class_sessions.session_kind]||'') + ' - ' + (n.class_sessions.session_date||'') : ''}</span>
            </div>
          </div>`).join("") : `<p class="muted">لا توجد ملاحظات.</p>`}
      </div>
    </div>
  `;
}

async function openTransferModal(studentId, studentName){
  const { data: classesList } = await supabaseClient.from("classes").select("*").order("title");
  openModal(`
    <h3>نقل الطالب: ${studentName}</h3>
    <label>الفصل الجديد</label>
    <select id="transferDestClass">
      ${(classesList||[]).map(c => `<option value="${c.id}">${c.title}</option>`).join("")}
    </select>
    <button class="btn-primary full" onclick="submitTransfer('${studentId}')">نقل</button>
  `);
}
async function submitTransfer(studentId){
  const dest = document.getElementById("transferDestClass").value;
  await supabaseClient.from("students").update({ class_id: dest }).eq("id", studentId);
  closeModal();
  alert("تم نقل الطالب. سجل درجاته وحضوره وملاحظاته محفوظ بالكامل.");
  openClass(classesState.currentClassId, classesState.currentClassTitle);
}

async function openParentQrModal(studentId, studentName){
  let { data: student } = await supabaseClient.from("students").select("*").eq("id", studentId).single();
  if (!student.parent_token) {
    const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2));
    await supabaseClient.from("students").update({ parent_token: token }).eq("id", studentId);
    student.parent_token = token;
  }
  const url = `${window.location.origin}${window.location.pathname.replace('dashboard.html','')}parent.html?token=${student.parent_token}`;
  renderParentQrModalBody(studentId, studentName, url);
}
function renderParentQrModalBody(studentId, studentName, url){
  openModal(`
    <h3>رمز ولي الأمر — ${studentName}</h3>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}" alt="QR" style="display:block;margin:0 auto 14px;">
    <div class="link-box">${url}</div>
    <button class="btn-primary full" onclick="navigator.clipboard.writeText('${url}');this.textContent='تم النسخ ✓';setTimeout(()=>this.textContent='نسخ الرابط',1500);">نسخ الرابط</button>
    <button class="btn-secondary full" onclick="regenerateParentToken('${studentId}','${studentName.replace(/'/g,"\\'")}')">توليد رمز جديد</button>
  `);
}
async function regenerateParentToken(studentId, studentName){
  const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2));
  await supabaseClient.from("students").update({ parent_token: token }).eq("id", studentId);
  const url = `${window.location.origin}${window.location.pathname.replace('dashboard.html','')}parent.html?token=${token}`;
  renderParentQrModalBody(studentId, studentName, url);
}

// ============ تقرير الرصد (grades only) ============
async function renderClassReport(classId, classTitle){
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="openClass('${classId}','${classTitle.replace(/'/g,"\\'")}')">${icon("back",18)}<span>رجوع للفصل</span></button>
      <h2>تقرير الرصد — ${classTitle}</h2>
    </div>
    <div class="toolbar-row">
      <button class="btn-secondary" onclick="exportClassReportExcel('${classId}','${classTitle.replace(/'/g,"\\'")}')">${icon("download",16)}<span>تصدير إكسل</span></button>
      <button class="btn-secondary" onclick="printClassReportTable('${classId}','${classTitle.replace(/'/g,"\\'")}')">${icon("print",16)}<span>طباعة</span></button>
    </div>
    <div id="classReportHolder"></div>
  `;
  hydrateIcons(el);
  loadClassReportBody(classId);
}
async function computeClassResults(classId){
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  const rows = [];
  for (const s of (students||[])) {
    const r = await fetchStudentResults(s.id);
    const sub = calcSubtotals(r.results);
    rows.push({ student: s, ...r, sub });
  }
  return rows;
}
async function loadClassReportBody(classId){
  const holder = document.getElementById("classReportHolder");
  const rows = await computeClassResults(classId);
  holder.innerHTML = renderClassReportTableHtml(rows);
}
function renderClassReportTableHtml(rows){
  return `
  <table class="report-table">
    <thead><tr>
      <th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>المجموع (40)</th>
      <th>تحريري</th><th>عملي</th><th>المجموع (60)</th><th>الإجمالي</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td>${r.student.full_name}</td>
        <td>${r.results.participation.avg.toFixed(1)}</td>
        <td>${r.results.homework.avg.toFixed(1)}</td>
        <td>${r.results.tasks.avg.toFixed(1)}</td>
        <td>${r.results.practical.avg.toFixed(1)}</td>
        <td><strong>${r.sub.continuous.toFixed(1)}</strong></td>
        <td>${r.results.written_exam.avg.toFixed(1)}</td>
        <td>${r.results.practical_exam.avg.toFixed(1)}</td>
        <td><strong>${r.sub.exams.toFixed(1)}</strong></td>
        <td><strong>${r.sub.total.toFixed(1)}</strong></td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}
async function exportClassReportExcel(classId, classTitle){
  const rows = await computeClassResults(classId);
  const data = rows.map(r => ({
    "الطالب": r.student.full_name,
    "مشاركة": r.results.participation.avg.toFixed(1),
    "واجبات": r.results.homework.avg.toFixed(1),
    "مهام أدائية": r.results.tasks.avg.toFixed(1),
    "تطبيق عملي": r.results.practical.avg.toFixed(1),
    "المجموع (40)": r.sub.continuous.toFixed(1),
    "تحريري": r.results.written_exam.avg.toFixed(1),
    "عملي": r.results.practical_exam.avg.toFixed(1),
    "المجموع (60)": r.sub.exams.toFixed(1),
    "الإجمالي": r.sub.total.toFixed(1),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير الرصد");
  XLSX.writeFile(wb, `تقرير_الرصد_${classTitle}.xlsx`);
}
async function printClassReportTable(classId, classTitle){
  const rows = await computeClassResults(classId);
  const w = window.open("", "_blank");
  w.document.write(`
    <html dir="rtl"><head><title>تقرير الرصد - ${classTitle}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Tajawal, Arial; }
      table { width:100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px; text-align:center; font-size:13px; }
      th { background:#0F2542; color:#fff; }
    </style></head><body>
    <h2>تقرير الرصد — ${classTitle}</h2>
    ${renderClassReportTableHtml(rows)}
    </body></html>
  `);
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

// ============ تقرير خاص بالفصل (internal, with attendance + notes) ============
async function renderTeacherSpecialReport(classId, classTitle){
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="openClass('${classId}','${classTitle.replace(/'/g,"\\'")}')">${icon("back",18)}<span>رجوع للفصل</span></button>
      <h2>تقرير خاص بالفصل — ${classTitle}</h2>
    </div>
    <div class="toolbar-row">
      <button class="btn-secondary" onclick="exportTeacherReportExcel('${classId}','${classTitle.replace(/'/g,"\\'")}')">${icon("download",16)}<span>تصدير إكسل</span></button>
      <button class="btn-secondary" onclick="printTeacherReport('${classId}','${classTitle.replace(/'/g,"\\'")}')">${icon("print",16)}<span>طباعة</span></button>
    </div>
    <div id="teacherReportHolder"></div>
  `;
  hydrateIcons(el);
  loadTeacherReportBody(classId);
}
async function computeTeacherReportRows(classId){
  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  const rows = [];
  for (const s of (students||[])) {
    const r = await fetchStudentResults(s.id);
    const sub = calcSubtotals(r.results);
    const notes = await loadBehaviorNotes(s.id);
    const posCount = notes.filter(n=>n.note_type==="positive").length;
    const negCount = notes.filter(n=>n.note_type==="negative").length;
    const absences = r.totalSessions - r.presentCount;
    rows.push({ student: s, ...r, sub, posCount, negCount, absences });
  }
  return rows;
}
async function loadTeacherReportBody(classId){
  const holder = document.getElementById("teacherReportHolder");
  const rows = await computeTeacherReportRows(classId);
  holder.innerHTML = renderTeacherReportTableHtml(rows);
}
function renderTeacherReportTableHtml(rows){
  return `
  <table class="report-table">
    <thead><tr>
      <th>الطالب</th><th>مشاركة</th><th>واجبات</th><th>مهام أدائية</th><th>تطبيق عملي</th><th>المجموع (40)</th>
      <th>تحريري</th><th>عملي</th><th>المجموع (60)</th><th>الإجمالي</th><th>عدد الغياب</th><th>إيجابية</th><th>سلبية</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td>${r.student.full_name}</td>
        <td>${r.results.participation.avg.toFixed(1)}</td>
        <td>${r.results.homework.avg.toFixed(1)}</td>
        <td>${r.results.tasks.avg.toFixed(1)}</td>
        <td>${r.results.practical.avg.toFixed(1)}</td>
        <td><strong>${r.sub.continuous.toFixed(1)}</strong></td>
        <td>${r.results.written_exam.avg.toFixed(1)}</td>
        <td>${r.results.practical_exam.avg.toFixed(1)}</td>
        <td><strong>${r.sub.exams.toFixed(1)}</strong></td>
        <td><strong>${r.sub.total.toFixed(1)}</strong></td>
        <td>${r.absences}</td>
        <td>🟢 ${r.posCount}</td>
        <td>🔴 ${r.negCount}</td>
      </tr>`).join("")}
    </tbody>
  </table>`;
}
async function exportTeacherReportExcel(classId, classTitle){
  const rows = await computeTeacherReportRows(classId);
  const data = rows.map(r => ({
    "الطالب": r.student.full_name,
    "مشاركة": r.results.participation.avg.toFixed(1),
    "واجبات": r.results.homework.avg.toFixed(1),
    "مهام أدائية": r.results.tasks.avg.toFixed(1),
    "تطبيق عملي": r.results.practical.avg.toFixed(1),
    "المجموع (40)": r.sub.continuous.toFixed(1),
    "تحريري": r.results.written_exam.avg.toFixed(1),
    "عملي": r.results.practical_exam.avg.toFixed(1),
    "المجموع (60)": r.sub.exams.toFixed(1),
    "الإجمالي": r.sub.total.toFixed(1),
    "عدد الغياب": r.absences,
    "إيجابية": r.posCount,
    "سلبية": r.negCount,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "تقرير خاص");
  XLSX.writeFile(wb, `تقرير_خاص_${classTitle}.xlsx`);
}
async function printTeacherReport(classId, classTitle){
  const rows = await computeTeacherReportRows(classId);
  const w = window.open("", "_blank");
  w.document.write(`
    <html dir="rtl"><head><title>تقرير خاص - ${classTitle}</title>
    <style>
      @page { size: landscape; margin: 10mm; }
      body { font-family: Tajawal, Arial; }
      table { width:100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px; text-align:center; font-size:12px; }
      th { background:#0F2542; color:#fff; }
    </style></head><body>
    <h2>تقرير خاص بالفصل — ${classTitle}</h2>
    ${renderTeacherReportTableHtml(rows)}
    </body></html>
  `);
  w.document.close();
  setTimeout(()=>w.print(), 400);
}

// ============ Bulk QR printing ============
async function printClassQRCodes(classId, classTitle){
  const w = window.open("", "_blank");
  w.document.write(`<html dir="rtl"><head><title>باركود ${classTitle}</title></head><body><p style="font-family:sans-serif;padding:40px;">جاري تجهيز الباركودات...</p></body></html>`);
  w.document.close();

  const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  const list = students || [];
  for (const s of list) {
    if (!s.parent_token) {
      const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2));
      await supabaseClient.from("students").update({ parent_token: token }).eq("id", s.id);
      s.parent_token = token;
    }
  }
  const baseUrl = `${window.location.origin}${window.location.pathname.replace('dashboard.html','')}parent.html`;
  const cardsHtml = list.map(s => {
    const url = `${baseUrl}?token=${s.parent_token}`;
    return `
      <div class="qr-card">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}">
        <div class="qr-name">${s.full_name}</div>
        <div class="qr-meta">${s.grade || ""} — ${classTitle}</div>
        <div class="qr-token">${s.parent_token}</div>
      </div>`;
  }).join("");
  w.document.open();
  w.document.write(`
    <html dir="rtl"><head><title>باركود ${classTitle}</title>
    <style>
      body { font-family: Tajawal, Arial; }
      .qr-grid { display:flex; flex-wrap:wrap; gap:14px; }
      .qr-card { width:200px; border:1px solid #ccc; border-radius:10px; padding:12px; text-align:center; page-break-inside:avoid; }
      .qr-name { font-weight:bold; margin-top:8px; }
      .qr-meta { color:#666; font-size:12px; }
      .qr-token { font-size:9px; color:#999; word-break:break-all; margin-top:4px; }
    </style></head><body>
    <h2>باركود دخول أولياء الأمور — ${classTitle}</h2>
    <div class="qr-grid">${cardsHtml}</div>
    </body></html>
  `);
  w.document.close();
  setTimeout(()=>w.print(), 800);
}
