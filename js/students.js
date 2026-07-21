// ============================================
// قسم: بيانات الطلاب + استيراد إكسل
// ============================================

async function renderStudentsSection() {
  document.getElementById("pageTitle").textContent = "بيانات الطلاب";
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:20px;">
      <div class="section-head">
        <h3>استيراد من ملف إكسل</h3>
      </div>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">
        الملف يجب أن يحتوي أعمدة بهذا الترتيب بالضبط: <b>الاسم</b>، <b>الصف</b>، <b>الفصل</b>، <b>الرقم</b> (بدون صف عناوين، أو مع صف عناوين — النظام يتجاهله تلقائياً لو كان أول خلية نصية غير رقمية).
      </p>
      <input type="file" id="excelFile" accept=".xlsx,.xls,.csv" style="margin-bottom:12px;" />
      <div id="importStatus" style="font-size:13px; color:var(--text-muted);"></div>
      <button class="btn-add" id="importBtn" style="margin-top:10px;">📥 استيراد الملف</button>
    </div>

    <div class="section-card">
      <div class="section-head">
        <h3>قائمة الطلاب</h3>
        <button class="btn-add" id="addStudentBtn">+ إضافة طالب يدوياً</button>
      </div>
      <div id="studentsList"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("addStudentBtn").addEventListener("click", openAddStudentModal);
  document.getElementById("importBtn").addEventListener("click", handleExcelImport);

  await loadStudents();
}

async function loadStudents() {
  const listEl = document.getElementById("studentsList");
  const { data, error } = await supabaseClient
    .from("students")
    .select("*")
    .order("grade", { ascending: true })
    .order("class_name", { ascending: true })
    .order("student_number", { ascending: true });

  if (error) { listEl.innerHTML = `<div class="empty-state">حدث خطأ في تحميل البيانات</div>`; return; }

  if (!data || data.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="ico">🎓</div><div>ما فيه طلاب مسجلين بعد</div></div>`;
    return;
  }

  listEl.innerHTML = data.map((s) => `
    <div class="item-row">
      <div class="info">
        <div class="t">${escapeHtml(s.full_name)}</div>
        <div class="d">الصف ${escapeHtml(s.grade)} · فصل ${escapeHtml(s.class_name)} · رقم ${escapeHtml(s.student_number)}</div>
      </div>
      <div class="actions">
        <button class="icon-btn danger" onclick="deleteStudent('${s.id}')" title="حذف">🗑️</button>
      </div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function openAddStudentModal() {
  document.getElementById("modalTitle").textContent = "إضافة طالب";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>اسم الطالب</label><input type="text" id="st_name" required /></div>
    <div class="field"><label>الصف</label><input type="text" id="st_grade" required /></div>
    <div class="field"><label>الفصل</label><input type="text" id="st_class" required /></div>
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
    const class_name = document.getElementById("st_class").value.trim();
    const student_number = document.getElementById("st_number").value.trim();
    const username = `${grade}${class_name}${student_number}`.replace(/\s/g, "");

    const { error } = await supabaseClient.from("students").insert({ full_name, grade, class_name, student_number, username });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";

    if (error) { alert("تعذر إضافة الطالب"); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    await loadStudents();
  };

  document.getElementById("modalCancel").onclick = () => {
    document.getElementById("modalOverlay").classList.remove("show");
  };
}

async function deleteStudent(id) {
  if (!confirm("متأكد تبي تحذف هذا الطالب؟ سيُحذف سجل متابعته أيضاً.")) return;
  const { error } = await supabaseClient.from("students").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadStudents();
}

async function handleExcelImport() {
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
        if (!row || row.length < 4) continue;
        const [name, grade, className, number] = row;
        if (!name || typeof name !== "string") continue;
        // تجاهل صف العناوين لو موجود
        if (name.trim() === "الاسم") continue;

        students.push({
          full_name: String(name).trim(),
          grade: String(grade || "").trim(),
          class_name: String(className || "").trim(),
          student_number: String(number || "").trim(),
          username: `${grade}${className}${number}`.replace(/\s/g, ""),
        });
      }

      if (students.length === 0) {
        statusEl.textContent = "ما لقينا صفوف صالحة بالملف";
        return;
      }

      statusEl.textContent = `جاري استيراد ${students.length} طالب...`;

      const { error } = await supabaseClient.from("students").insert(students);

      if (error) {
        statusEl.textContent = "حدث خطأ أثناء الاستيراد: " + error.message;
        return;
      }

      statusEl.textContent = `تم استيراد ${students.length} طالب بنجاح ✅`;
      fileInput.value = "";
      await loadStudents();
    } catch (err) {
      statusEl.textContent = "تعذر قراءة الملف، تأكد إنه بصيغة صحيحة";
    }
  };

  reader.readAsArrayBuffer(file);
}
