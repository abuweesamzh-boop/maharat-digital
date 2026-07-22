// ============================================
// قسم: الفصول الدراسية (إدارة + استيراد إكسل + بحث)
// ============================================

const CLASS_COLORS = ["#2DD8C8", "#F5A623", "#B892FF", "#FF7A8A", "#5FD068", "#5FA8FF"];
let currentClass = null;

async function renderClassesSection() {
  document.getElementById("pageTitle").textContent = "الفصول الدراسية";
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:20px;">
      <div class="section-head">
        <h3>🔍 بحث سريع عن طالب (كل الفصول)</h3>
      </div>
      <input type="text" id="globalSearchInput" placeholder="اكتب اسم الطالب..." />
      <div id="globalSearchResults" style="margin-top:10px;"></div>
    </div>

    <div class="section-card">
      <div class="section-head">
        <h3>الفصول</h3>
        <button class="btn-add" id="addClassBtn">+ إضافة فصل جديد</button>
      </div>
      <div id="classesHolder" class="folder-grid"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

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

  const { data, error } = await supabaseClient
    .from("students")
    .select("*, classes(title)")
    .ilike("full_name", `%${query.trim()}%`)
    .limit(10);

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

async function loadClasses() {
  const holder = document.getElementById("classesHolder");

  const { data: classes, error } = await supabaseClient
    .from("classes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }

  if (!classes || classes.length === 0) {
    holder.innerHTML = `<div class="empty-state"><div>ما فيه فصول بعد — أضف فصل جديد للبدء</div></div>`;
    return;
  }

  const counts = await Promise.all(
    classes.map((c) => supabaseClient.from("students").select("id", { count: "exact", head: true }).eq("class_id", c.id))
  );

  holder.innerHTML = classes.map((c, i) => `
    <div class="folder-card" style="--folder-color:${CLASS_COLORS[i % CLASS_COLORS.length]}" onclick="openClass('${c.id}', '${escapeAttr(c.title)}')">
      <button class="folder-delete" onclick="event.stopPropagation(); deleteClass('${c.id}')" title="حذف الفصل">✕</button>
      <div class="folder-avatar">${(c.title || "?").charAt(0)}</div>
      <div class="folder-title">${escapeHtml(c.title)}</div>
      <div class="folder-meta">${counts[i].count ?? 0} طالب</div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/'/g, "&#39;");
}

function openAddClassModal() {
  document.getElementById("modalTitle").textContent = "إضافة فصل جديد";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>اسم الفصل</label><input type="text" id="c_title" placeholder="مثال: الفصل 1" required /></div>
  `;

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const title = document.getElementById("c_title").value.trim();
    const { error } = await supabaseClient.from("classes").insert({ title });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";

    if (error) { alert("تعذر إضافة الفصل"); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    await loadClasses();
  };

  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteClass(id) {
  if (!confirm("متأكد تبي تحذف هذا الفصل؟ الطلاب المرتبطين فيه ما بينحذفون، بس بيصيرون بدون فصل.")) return;
  const { error } = await supabaseClient.from("classes").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadClasses();
}

// ============ داخل الفصل ============

async function openClass(classId, title) {
  currentClass = { id: classId, title };
  document.getElementById("pageTitle").textContent = title;

  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="breadcrumb-nav">
      <span class="crumb" onclick="renderClassesSection()">الفصول الدراسية</span>
      <span>/</span>
      <span class="crumb current">${escapeHtml(title)}</span>
    </div>

    <div class="section-card" style="margin-bottom:18px;">
      <div class="section-head"><h3>استيراد من ملف إكسل</h3></div>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">
        الأعمدة بالترتيب: <b>الاسم</b>، <b>الصف</b>، <b>الرقم</b> (بدون عمود الفصل — كل الطلاب المستوردين ينضافون تلقائياً لهذا الفصل).
      </p>
      <input type="file" id="excelFile" accept=".xlsx,.xls,.csv" style="margin-bottom:12px;" />
      <div id="importStatus" style="font-size:13px; color:var(--text-muted);"></div>
      <button class="btn-add" id="importBtn" style="margin-top:10px;">📥 استيراد الملف</button>
    </div>

    <div class="section-card">
      <div class="section-head">
        <h3>طلاب الفصل</h3>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="text" id="classSearchInput" placeholder="بحث بالاسم..." style="width:200px;" />
          <button class="btn-add" id="addStudentBtn">+ إضافة طالب</button>
        </div>
      </div>
      <div id="studentsHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>

    <div class="section-card" style="margin-top:20px;">
      <div class="section-head"><h3>📊 الدرجات والتقييم</h3></div>
      <div id="gradingAreaHolder"></div>
    </div>
  `;

  document.getElementById("addStudentBtn").addEventListener("click", () => openAddStudentModal(classId));
  document.getElementById("importBtn").addEventListener("click", () => handleExcelImport(classId));
  renderGradingArea(classId, title);

  let searchTimeout;
  document.getElementById("classSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadClassStudents(classId, e.target.value), 250);
  });

  await loadClassStudents(classId, "");
}

async function loadClassStudents(classId, query) {
  const holder = document.getElementById("studentsHolder");

  let q = supabaseClient.from("students").select("*").eq("class_id", classId).order("student_number");
  if (query && query.trim()) q = q.ilike("full_name", `%${query.trim()}%`);

  const { data, error } = await q;

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }

  if (!data || data.length === 0) {
    holder.innerHTML = `<div class="empty-state"><div>ما فيه طلاب بهذا الفصل بعد</div></div>`;
    return;
  }

  holder.innerHTML = data.map((s) => `
    <div class="item-row" style="cursor:pointer;" onclick="openStudentReport('${s.id}', '${escapeAttr(s.full_name)}')">
      <div class="info">
        <div class="t">${escapeHtml(s.full_name)}</div>
        <div class="d">الصف ${escapeHtml(s.grade)} · رقم ${escapeHtml(s.student_number)}</div>
      </div>
      <div class="actions">
        <span class="icon-btn" title="عرض التقرير">←</span>
        <button class="icon-btn danger" onclick="event.stopPropagation(); deleteStudent('${s.id}', '${classId}')" title="حذف">🗑</button>
      </div>
    </div>
  `).join("");
}

function openAddStudentModal(classId) {
  document.getElementById("modalTitle").textContent = "إضافة طالب";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>اسم الطالب</label><input type="text" id="st_name" required /></div>
    <div class="field"><label>الصف</label><input type="text" id="st_grade" required /></div>
    <div class="field"><label>الرقم</label><input type="text" id="st_number" required /></div>
  `;

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const full_name = document.getElementById("st_name").value.trim();
    const grade = document.getElementById("st_grade").value.trim();
    const student_number = document.getElementById("st_number").value.trim();
    const username = `${grade}${currentClass.title}${student_number}`.replace(/\s/g, "");

    const { error } = await supabaseClient.from("students").insert({
      full_name, grade, class_name: currentClass.title, student_number, username, class_id: classId,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";

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

        students.push({
          full_name: String(name).trim(),
          grade: String(grade || "").trim(),
          class_name: currentClass.title,
          student_number: String(number || "").trim(),
          username: `${grade}${currentClass.title}${number}`.replace(/\s/g, ""),
          class_id: classId,
        });
      }

      if (students.length === 0) { statusEl.textContent = "ما لقينا صفوف صالحة بالملف"; return; }

      statusEl.textContent = `جاري استيراد ${students.length} طالب...`;
      const { error } = await supabaseClient.from("students").insert(students);

      if (error) { statusEl.textContent = "حدث خطأ أثناء الاستيراد: " + error.message; return; }

      statusEl.textContent = `تم استيراد ${students.length} طالب بنجاح ✅`;
      fileInput.value = "";
      await loadClassStudents(classId, "");
    } catch (err) {
      statusEl.textContent = "تعذر قراءة الملف، تأكد إنه بصيغة صحيحة";
    }
  };

  reader.readAsArrayBuffer(file);
}
