const CLASS_COLORS = ["#4338CA", "#0F766E", "#BE185D", "#B45309", "#0369A1", "#047857", "#6D28D9", "#0E7490"];
let currentClass = null;

async function renderClassesSection() {
  document.getElementById("pageTitle").textContent = "سجل المتابعة";
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:20px;">
      <div class="section-head"><h3>${icon("search")} بحث سريع عن طالب (كل الفصول)</h3></div>
      <input type="text" id="globalSearchInput" placeholder="اكتب اسم الطالب..." />
      <div id="globalSearchResults" style="margin-top:10px;"></div>
    </div>
    <div class="section-card">
      <div class="section-head"><h3>الفصول</h3><button class="btn-add" id="addClassBtn">${icon("plus", 14)} إضافة فصل جديد</button></div>
      <div id="classesHolder" class="folder-grid"><div class="empty-state">جاري التحميل...</div></div>
    </div>`;
  document.getElementById("addClassBtn").addEventListener("click", openAddClassModal);
  let searchTimeout;
  document.getElementById("globalSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => globalStudentSearch(e.target.value), 300);
  });
  await loadClasses();
}

async function globalStudentSearch(query) {
  const resultsEl = document.getElementById("globalSearchResults");
  if (!query || query.trim().length < 2) { resultsEl.innerHTML = ""; return; }
  const { data, error } = await supabaseClient.from("students").select("*, classes(title)").ilike("full_name", `%${query.trim()}%`).order("full_name", { ascending: true }).limit(10);
  if (error || !data || data.length === 0) { resultsEl.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه نتائج</div>`; return; }
  resultsEl.innerHTML = data.map((s) => `<div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}')"><div class="info"><div class="t">${escapeHtml(s.full_name)}</div><div class="d">${s.classes ? escapeHtml(s.classes.title) : "بدون فصل"} · الصف ${escapeHtml(s.grade)}</div></div><div class="actions"><span class="icon-btn">${icon("back", 14)}</span></div></div>`).join("");
}

async function loadClasses() {
  const holder = document.getElementById("classesHolder");
  const { data: classes, error } = await supabaseClient.from("classes").select("*").order("created_at", { ascending: true });
  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!classes || classes.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه فصول بعد — أضف فصل جديد للبدء</div>`; return; }
  const counts = await Promise.all(classes.map((c) => supabaseClient.from("students").select("id", { count: "exact", head: true }).eq("class_id", c.id)));
  window.__classColorIndex = {}; classes.forEach((c, i) => { window.__classColorIndex[c.id] = i; });
  holder.innerHTML = classes.map((c, i) => `
    <div class="folder-card" style="--folder-color:${CLASS_COLORS[i % CLASS_COLORS.length]}" onclick="openClass('${c.id}', '${escapeAttr(c.title)}')">
      <div class="folder-actions-row">
        <button class="folder-mini-btn" onclick="event.stopPropagation(); openEditClassModal('${c.id}', '${escapeAttr(c.title)}')" title="تعديل">${icon("edit", 14)}</button>
        <button class="folder-mini-btn danger" onclick="event.stopPropagation(); deleteClass('${c.id}')" title="حذف">${icon("trash", 14)}</button>
      </div>
      <div class="folder-icon-badge">${icon("users", 22)}</div>
      <div class="folder-title">${escapeHtml(c.title)}</div>
      <div class="folder-meta">${counts[i].count ?? 0} طالب</div>
    </div>`).join("");
}

function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

function openAddClassModal() {
  document.getElementById("modalTitle").textContent = "إضافة فصل جديد";
  document.getElementById("modalFields").innerHTML = `<div class="field"><label>اسم الفصل</label><input type="text" id="c_title" placeholder="مثال: الفصل 1" required /></div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const title = document.getElementById("c_title").value.trim();
    const { error } = await supabaseClient.from("classes").insert({ title });
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر إضافة الفصل"); return; }
    document.getElementById("modalOverlay").classList.remove("show");
    await loadClasses();
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

function openEditClassModal(classId, currentTitle) {
  document.getElementById("modalTitle").textContent = "تعديل اسم الفصل";
  document.getElementById("modalFields").innerHTML = `<div class="field"><label>اسم الفصل</label><input type="text" id="ec_title" value="${escapeAttr(currentTitle)}" required /></div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const title = document.getElementById("ec_title").value.trim();
    const { error } = await supabaseClient.from("classes").update({ title }).eq("id", classId);
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر التعديل"); return; }
    document.getElementById("modalOverlay").classList.remove("show");
    await loadClasses();
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteClass(id) {
  if (!confirm("متأكد تبي تحذف هذا الفصل؟ الطلاب ما بينحذفون، بس بيصيرون بدون فصل.")) return;
  const { error } = await supabaseClient.from("classes").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadClasses();
}

let classActiveTab = "sessions";
const CLASS_TABS = [
  { key: "sessions", label: "الحصص والاختبارات", ic: "list" },
  { key: "students", label: "الطلاب", ic: "users" },
  { key: "reports", label: "التقارير", ic: "chart" },
  { key: "behavior", label: "الملاحظات السلوكية", ic: "note" },
];
function switchClassTab(key) {
  classActiveTab = key;
  document.querySelectorAll(".class-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === key));
  document.querySelectorAll(".class-pane").forEach((p) => { p.style.display = p.dataset.pane === key ? "" : "none"; });
}

async function openClass(classId, title) {
  currentClass = { id: classId, title };
  document.getElementById("pageTitle").textContent = title;
  const contentArea = document.getElementById("contentArea");
  const ci = Math.max(0, (window.__classColorIndex && window.__classColorIndex[classId]) || 0);
  const headColor = CLASS_COLORS[ci % CLASS_COLORS.length];
  contentArea.innerHTML = `
    <div class="breadcrumb-nav"><span class="crumb" onclick="renderClassesSection()">سجل المتابعة</span><span>/</span><span class="crumb current">${escapeHtml(title)}</span></div>

    <div class="class-head" style="--head-color:${headColor}">
      <div class="class-head-main">
        <div class="class-head-badge">${icon("users", 26)}</div>
        <div>
          <div class="class-head-title">${escapeHtml(title)}</div>
          <div class="class-head-chips">
            <span class="class-chip"><b id="chipStudents">–</b> طالب</span>
            <span class="class-chip"><b id="chipSessions">–</b> حصة</span>
            <span class="class-chip"><b id="chipExams">–</b> اختبار</span>
          </div>
        </div>
      </div>
      <div class="class-head-actions no-print">
        <button class="class-head-btn" id="toggleSearchBtn">${icon("search", 15)} بحث</button>
        <button class="class-head-btn" id="toggleImportBtn">${icon("upload", 15)} استيراد إكسل</button>
        <button class="class-head-btn solid" id="addStudentBtn">${icon("plus", 14)} إضافة طالب</button>
      </div>
    </div>

    <div class="section-card" id="searchPanel" style="margin-bottom:18px; display:none;">
      <div class="section-head"><h3>${icon("search")} بحث عن طالب بالفصل</h3></div>
      <input type="text" id="classSearchInput" placeholder="بحث بالاسم..." />
      <div id="searchInlineResults" style="margin-top:10px;"></div>
    </div>

    <div class="section-card" id="importPanel" style="margin-bottom:18px; display:none;">
      <div class="section-head"><h3>استيراد من ملف إكسل</h3></div>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">الأعمدة بالترتيب: <b>الاسم</b>، <b>الصف</b>، <b>الرقم</b>.</p>
      <input type="file" id="excelFile" accept=".xlsx,.xls,.csv" style="margin-bottom:12px;" />
      <div id="importStatus" style="font-size:13px; color:var(--text-muted);"></div>
      <button class="btn-add" id="importBtn" style="margin-top:10px;">${icon("upload", 14)} استيراد الملف</button>
    </div>

    <div class="class-tabs no-print">
      ${CLASS_TABS.map((t) => `<button class="class-tab ${t.key === classActiveTab ? "active" : ""}" data-tab="${t.key}" onclick="switchClassTab('${t.key}')">${icon(t.ic, 15)} ${t.label}</button>`).join("")}
    </div>

    <div class="class-pane" data-pane="sessions" style="${classActiveTab === "sessions" ? "" : "display:none;"}">
      <div id="gradingAreaHolder"></div>
    </div>

    <div class="class-pane" data-pane="students" style="${classActiveTab === "students" ? "" : "display:none;"}">
      <div class="section-card">
        <div class="section-head">
          <h3>طلاب الفصل</h3>
          <button class="toolbar-icon-btn" id="printQrBtn">${icon("qr", 15)} طباعة باركودات الطلاب</button>
        </div>
        <div id="studentsHolder"><div class="empty-state">جاري التحميل...</div></div>
      </div>
    </div>

    <div class="class-pane" data-pane="reports" style="${classActiveTab === "reports" ? "" : "display:none;"}">
      <div class="report-tiles">
        <div class="report-tile" style="--tile-color:#4338CA" onclick="renderClassReport('${classId}', '${escapeAttr(title)}')">
          <div class="report-tile-ic">${icon("chart", 24)}</div>
          <div class="report-tile-t">تقرير الرصد</div>
          <div class="report-tile-d">جدول كامل بدرجات كل طلاب الفصل مع الطباعة والتصدير.</div>
        </div>
        <div class="report-tile" style="--tile-color:#0F766E" onclick="renderTeacherSpecialReport('${classId}', '${escapeAttr(title)}')">
          <div class="report-tile-ic">${icon("note", 24)}</div>
          <div class="report-tile-t">تقرير خاص بالفصل</div>
          <div class="report-tile-d">مستويات الطلاب والغياب والملاحظات في تقرير واحد.</div>
        </div>
      </div>
    </div>

    <div class="class-pane" data-pane="behavior" style="${classActiveTab === "behavior" ? "" : "display:none;"}">
      <div class="report-tiles">
        <div class="report-tile" style="--tile-color:#BE185D" onclick="renderBehaviorPage('${classId}', '${escapeAttr(title)}')">
          <div class="report-tile-ic">${icon("note", 24)}</div>
          <div class="report-tile-t">الملاحظات السلوكية</div>
          <div class="report-tile-d">تدوين الملاحظات الإيجابية والسلبية لكل طالب بشكل منفصل عن الحصص، مع عرض أنواعها وتكرارها.</div>
        </div>
      </div>
    </div>`;

  document.getElementById("toggleSearchBtn").addEventListener("click", () => {
    const panel = document.getElementById("searchPanel");
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });
  document.getElementById("toggleImportBtn").addEventListener("click", () => {
    const panel = document.getElementById("importPanel");
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });

  document.getElementById("addStudentBtn").addEventListener("click", () => openAddStudentModal(classId));
  document.getElementById("importBtn").addEventListener("click", () => handleExcelImport(classId));
  document.getElementById("printQrBtn").addEventListener("click", () => printClassQRCodes(classId, title));

  let searchTimeout;
  document.getElementById("classSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchWithinClassInline(classId, e.target.value), 250);
  });

  hydrateIcons(contentArea);
  loadClassCounts(classId);
  await loadClassStudents(classId, "");
  renderGradingArea(classId, title);
}

async function loadClassCounts(classId) {
  try {
    const [st, se, ex] = await Promise.all([
      supabaseClient.from("students").select("id", { count: "exact", head: true }).eq("class_id", classId),
      supabaseClient.from("class_sessions").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("session_kind", "continuous"),
      supabaseClient.from("class_sessions").select("id", { count: "exact", head: true }).eq("class_id", classId).neq("session_kind", "continuous"),
    ]);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
    set("chipStudents", st.count); set("chipSessions", se.count); set("chipExams", ex.count);
  } catch (e) {}
}

async function searchWithinClassInline(classId, query) {
  const holder = document.getElementById("searchInlineResults");
  if (!query || query.trim().length < 1) { holder.innerHTML = ""; return; }
  const { data, error } = await supabaseClient.from("students").select("*").eq("class_id", classId).ilike("full_name", `%${query.trim()}%`).order("full_name", { ascending: true });
  if (error || !data || data.length === 0) { holder.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه نتائج</div>`; return; }
  holder.innerHTML = data.map((s) => `<div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}', {id:'${classId}', title:'${escapeAttr(currentClass.title)}'})"><div class="info"><div class="t">${escapeHtml(s.full_name)}</div><div class="d">الصف ${escapeHtml(s.grade)} · رقم ${escapeHtml(s.student_number)}</div></div><div class="actions"><span class="icon-btn">${icon("back", 14)}</span></div></div>`).join("");
}

async function loadClassStudents(classId, query) {
  const holder = document.getElementById("studentsHolder");
  let q = supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  if (query && query.trim()) q = q.ilike("full_name", `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه طلاب بهذا الفصل بعد</div>`; return; }
  holder.innerHTML = data.map((s) => `<div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}')"><div class="info"><div class="t">${escapeHtml(s.full_name)}</div><div class="d">الصف ${escapeHtml(s.grade)} · رقم ${escapeHtml(s.student_number)}</div></div><div class="actions"><span class="icon-btn" title="عرض التقرير">${icon("back", 14)}</span><button class="icon-btn danger" onclick="event.stopPropagation(); deleteStudent('${s.id}', '${classId}')" title="حذف">${icon("trash", 14)}</button></div></div>`).join("");
}

function openAddStudentModal(classId) {
  document.getElementById("modalTitle").textContent = "إضافة طالب";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>اسم الطالب</label><input type="text" id="st_name" required /></div>
    <div class="field"><label>الصف</label><input type="text" id="st_grade" required /></div>
    <div class="field"><label>الرقم</label><input type="text" id="st_number" required /></div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const full_name = document.getElementById("st_name").value.trim();
    const grade = document.getElementById("st_grade").value.trim();
    const student_number = document.getElementById("st_number").value.trim();
    const username = `${grade}${currentClass.title}${student_number}`.replace(/\s/g, "");
    const { error } = await supabaseClient.from("students").insert({ full_name, grade, class_name: currentClass.title, student_number, username, class_id: classId });
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر إضافة الطالب"); return; }
    document.getElementById("modalOverlay").classList.remove("show");
    await loadClassStudents(classId, "");
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteStudent(id, classId) {
  if (!confirm("متأكد تبي تحذف هذا الطالب؟ سيُحذف سجل درجاته أيضاً.")) return;
  const { error } = await supabaseClient.from("students").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadClassStudents(classId, "");
}

async function handleExcelImport(classId) {
  const fileInput = document.getElementById("excelFile");
  const statusEl = document.getElementById("importStatus");
  const file = fileInput.files[0];
  if (!file) { statusEl.textContent = "اختر ملف أولاً"; return; }
  statusEl.textContent = "جاري القراءة...";
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const students = [];
      for (const row of rows) {
        if (!row || row.length < 3) continue;
        const [name, grade, number] = row;
        if (!name || typeof name !== "string") continue;
        if (name.trim() === "الاسم") continue;
        students.push({ full_name: String(name).trim(), grade: String(grade || "").trim(), class_name: currentClass.title, student_number: String(number || "").trim(), username: `${grade}${currentClass.title}${number}`.replace(/\s/g, ""), class_id: classId });
      }
      if (students.length === 0) { statusEl.textContent = "ما لقينا صفوف صالحة بالملف"; return; }
      statusEl.textContent = `جاري استيراد ${students.length} طالب...`;
      const { error } = await supabaseClient.from("students").insert(students);
      if (error) { statusEl.textContent = "حدث خطأ أثناء الاستيراد: " + error.message; return; }
      statusEl.textContent = `تم استيراد ${students.length} طالب بنجاح`;
      fileInput.value = "";
      await loadClassStudents(classId, "");
    } catch (err) {
      statusEl.textContent = "تعذر قراءة الملف، تأكد إنه بصيغة صحيحة";
    }
  };
  reader.readAsArrayBuffer(file);
}
