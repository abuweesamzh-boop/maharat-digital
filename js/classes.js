let classesState = { currentClassId: null, currentClassTitle: "" };
const CLASS_COLORS = ["#0F2542","#B8862E","#1F8A5C","#6B4EA6","#C1443B","#1B7F9E"];

function renderClassesSection(){
  classesState = { currentClassId: null, currentClassTitle: "" };
  renderClassesRoot();
}

async function renderClassesRoot(){
  const el = document.getElementById("contentArea");
  el.innerHTML = `<div class="loading-placeholder">جاري التحميل...</div>`;
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="loadHomeStats()">${icon("back",18)}<span>رجوع للرئيسية</span></button>
      <h2>سجل المتابعة</h2>
    </div>
    <div class="toolbar-row">
      <input type="text" id="globalStudentSearch" placeholder="بحث عن طالب في كل الفصول..." oninput="globalStudentSearch(this.value)">
      <button class="btn-primary" onclick="openClassModal(null)">${icon("plus",16)}<span>فصل جديد</span></button>
    </div>
    <div id="globalSearchResults"></div>
    <div id="classesGrid" class="folder-grid"></div>
  `;
  hydrateIcons(el);
  loadClassesGrid();
}

async function loadClassesGrid(){
  const holder = document.getElementById("classesGrid");
  const { data } = await supabaseClient.from("classes").select("*").order("title");
  const list = data || [];
  if (!list.length) { holder.innerHTML = `<p class="muted" style="grid-column:1/-1;">لا توجد فصول بعد.</p>`; return; }
  holder.innerHTML = list.map(c => `
    <div class="folder-card" style="--folder-color:${CLASS_COLORS[c.color_index % CLASS_COLORS.length] || CLASS_COLORS[0]}">
      <div class="folder-card-main" onclick="openClass('${c.id}','${(c.title||'').replace(/'/g,"\\'")}')">
        ${icon("list",26)}
        <span class="folder-title">${c.title}</span>
      </div>
      <div class="folder-card-actions">
        <button class="mini-btn" title="تعديل" onclick="openEditClassModal('${c.id}')">${icon("edit",15)}</button>
        <button class="mini-btn danger" title="حذف" onclick="deleteClass('${c.id}')">${icon("trash",15)}</button>
      </div>
    </div>
  `).join("");
  hydrateIcons(holder);
}

function openClassModal(){
  openModal(`
    <h3>فصل جديد</h3>
    <label>اسم الفصل</label>
    <input type="text" id="newClassTitle" placeholder="مثال: أول متوسط 1">
    <button class="btn-primary full" onclick="submitNewClass()">إنشاء</button>
  `);
}
async function submitNewClass(){
  const title = document.getElementById("newClassTitle").value.trim();
  if (!title) return alert("أدخل اسم الفصل");
  const { count } = await supabaseClient.from("classes").select("id", { count: "exact", head: true });
  await supabaseClient.from("classes").insert({ title, color_index: (count||0) % CLASS_COLORS.length });
  closeModal();
  loadClassesGrid();
}
async function openEditClassModal(id){
  const { data: c } = await supabaseClient.from("classes").select("*").eq("id", id).single();
  openModal(`
    <h3>تعديل الفصل</h3>
    <label>اسم الفصل</label>
    <input type="text" id="editClassTitle" value="${c.title||''}">
    <button class="btn-primary full" onclick="submitEditClass('${id}')">حفظ</button>
  `);
}
async function submitEditClass(id){
  const title = document.getElementById("editClassTitle").value.trim();
  if (!title) return alert("أدخل اسم الفصل");
  await supabaseClient.from("classes").update({ title }).eq("id", id);
  closeModal();
  loadClassesGrid();
}
async function deleteClass(id){
  if (!confirm("سيتم حذف الفصل. هل الطلاب سينتقلون؟ يفضل نقلهم أولاً. متابعة الحذف؟")) return;
  await supabaseClient.from("classes").delete().eq("id", id);
  loadClassesGrid();
}

async function globalStudentSearch(q){
  const holder = document.getElementById("globalSearchResults");
  if (!q || q.trim().length < 2) { holder.innerHTML = ""; return; }
  const { data } = await supabaseClient
    .from("students").select("*, classes(title)")
    .ilike("full_name", `%${q.trim()}%`)
    .order("full_name", { ascending: true });
  const list = data || [];
  if (!list.length) { holder.innerHTML = `<p class="muted">لا توجد نتائج.</p>`; return; }
  holder.innerHTML = `<div class="items-list">` + list.map(s => `
    <div class="item-row">
      <div class="item-main" onclick="openClass('${s.class_id}','${(s.classes?.title||'').replace(/'/g,"\\'")}');setTimeout(()=>openStudentReport('${s.id}','${(s.full_name||'').replace(/'/g,"\\'")}'),400);">
        ${icon("users",18)}
        <span>${s.full_name}</span>
        <span class="sub-badge">${s.classes?.title || ""}</span>
      </div>
    </div>
  `).join("") + `</div>`;
  hydrateIcons(holder);
}

async function openClass(classId, title){
  classesState.currentClassId = classId;
  classesState.currentClassTitle = title;
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="renderClassesRoot()">${icon("back",18)}<span>رجوع لكل الفصول</span></button>
      <h2>${title}</h2>
    </div>
    <div class="toolbar-row">
      <button class="btn-secondary" onclick="toggleSearchPanel()">${icon("search",16)}<span>بحث</span></button>
      <button class="btn-secondary" onclick="toggleImportPanel()">${icon("upload",16)}<span>استيراد إكسل</span></button>
      <button class="btn-primary" onclick="openAddStudentModal()">${icon("plus",16)}<span>إضافة طالب</span></button>
    </div>
    <div id="searchPanel" class="collapsible-panel" style="display:none;">
      <input type="text" id="classSearchInput" placeholder="ابحث عن طالب داخل الفصل..." oninput="searchWithinClassInline(this.value)">
      <div id="classSearchResults"></div>
    </div>
    <div id="importPanel" class="collapsible-panel" style="display:none;">
      <p class="muted">الأعمدة المطلوبة بالترتيب: الاسم، الصف، الرقم. أول صف (رأس الجدول) سيتم تجاهله تلقائياً.</p>
      <input type="file" id="excelFile" accept=".xlsx,.xls">
      <button class="btn-primary" onclick="handleExcelImport()">استيراد</button>
    </div>

    <div class="section-block">
      <h3>${icon("chart",18)} الحصص والاختبارات</h3>
      <div id="gradingArea"></div>
    </div>

    <div class="section-block">
      <h3>${icon("note",18)} التقارير</h3>
      <div class="toolbar-row">
        <button class="btn-secondary" onclick="renderClassReport('${classId}','${title.replace(/'/g,"\\'")}')">تقرير الرصد</button>
        <button class="btn-secondary" onclick="renderTeacherSpecialReport('${classId}','${title.replace(/'/g,"\\'")}')">تقرير خاص بالفصل</button>
      </div>
    </div>

    <div class="section-block">
      <h3>${icon("users",18)} طلاب الفصل</h3>
      <div class="toolbar-row">
        <button class="btn-secondary" id="printQrBtn" onclick="printClassQRCodes('${classId}','${title.replace(/'/g,"\\'")}')">${icon("qr",16)}<span>طباعة باركود الفصل</span></button>
      </div>
      <div id="studentsHolder" class="items-list"></div>
    </div>
  `;
  hydrateIcons(el);
  loadClassStudents(classId);
  renderGradingArea(classId);
}

function toggleSearchPanel(){
  const p = document.getElementById("searchPanel");
  p.style.display = p.style.display === "none" ? "" : "none";
}
function toggleImportPanel(){
  const p = document.getElementById("importPanel");
  p.style.display = p.style.display === "none" ? "" : "none";
}

async function loadClassStudents(classId){
  const holder = document.getElementById("studentsHolder");
  const { data } = await supabaseClient.from("students").select("*").eq("class_id", classId).order("full_name", { ascending: true });
  const list = data || [];
  if (!list.length) { holder.innerHTML = `<p class="muted">لا يوجد طلاب في هذا الفصل بعد.</p>`; return; }
  holder.innerHTML = list.map(s => `
    <div class="item-row">
      <div class="item-main" onclick="openStudentReport('${s.id}','${(s.full_name||'').replace(/'/g,"\\'")}')">
        ${icon("users",18)}
        <span>${s.full_name}</span>
        <span class="sub-badge">${s.grade || ""}</span>
      </div>
      <div class="item-actions">
        <button class="mini-btn" title="نقل لفصل آخر" onclick="openTransferModal('${s.id}','${(s.full_name||'').replace(/'/g,"\\'")}')">${icon("swap",15)}</button>
        <button class="mini-btn" title="رمز ولي الأمر" onclick="openParentQrModal('${s.id}','${(s.full_name||'').replace(/'/g,"\\'")}')">${icon("qr",15)}</button>
        <button class="mini-btn danger" title="حذف" onclick="deleteStudent('${s.id}')">${icon("trash",15)}</button>
      </div>
    </div>
  `).join("");
  hydrateIcons(holder);
}

async function searchWithinClassInline(q){
  const holder = document.getElementById("classSearchResults");
  if (!q || q.trim().length < 1) { holder.innerHTML = ""; return; }
  const { data } = await supabaseClient
    .from("students").select("*")
    .eq("class_id", classesState.currentClassId)
    .ilike("full_name", `%${q.trim()}%`)
    .order("full_name", { ascending: true });
  const list = data || [];
  holder.innerHTML = list.map(s => `
    <div class="item-row"><div class="item-main" onclick="openStudentReport('${s.id}','${(s.full_name||'').replace(/'/g,"\\'")}')">${icon("users",16)}<span>${s.full_name}</span></div></div>
  `).join("") || `<p class="muted">لا توجد نتائج.</p>`;
  hydrateIcons(holder);
}

function openAddStudentModal(){
  openModal(`
    <h3>إضافة طالب</h3>
    <label>الاسم الكامل</label>
    <input type="text" id="newStudentName">
    <label>الصف</label>
    <input type="text" id="newStudentGrade">
    <label>الرقم</label>
    <input type="text" id="newStudentNumber">
    <button class="btn-primary full" onclick="submitNewStudent()">إضافة</button>
  `);
}
async function submitNewStudent(){
  const full_name = document.getElementById("newStudentName").value.trim();
  const grade = document.getElementById("newStudentGrade").value.trim();
  const student_number = document.getElementById("newStudentNumber").value.trim();
  if (!full_name) return alert("أدخل اسم الطالب");
  await supabaseClient.from("students").insert({ full_name, grade, student_number, class_id: classesState.currentClassId });
  closeModal();
  loadClassStudents(classesState.currentClassId);
}
async function deleteStudent(id){
  if (!confirm("حذف هذا الطالب وكل سجلاته؟")) return;
  await supabaseClient.from("students").delete().eq("id", id);
  loadClassStudents(classesState.currentClassId);
}

async function handleExcelImport(){
  const fileInput = document.getElementById("excelFile");
  const file = fileInput.files[0];
  if (!file) return alert("اختر ملف إكسل");
  const reader = new FileReader();
  reader.onload = async (e) => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const toInsert = [];
    rows.forEach(r => {
      if (!r || !r[0]) return;
      if (String(r[0]).trim() === "الاسم") return;
      toInsert.push({ full_name: String(r[0]).trim(), grade: r[1] ? String(r[1]).trim() : "", student_number: r[2] ? String(r[2]).trim() : "", class_id: classesState.currentClassId });
    });
    if (!toInsert.length) return alert("لم يتم العثور على بيانات صالحة");
    await supabaseClient.from("students").insert(toInsert);
    alert(`تم استيراد ${toInsert.length} طالب`);
    loadClassStudents(classesState.currentClassId);
  };
  reader.readAsArrayBuffer(file);
}
