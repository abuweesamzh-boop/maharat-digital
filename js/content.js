// ============================================
// نظام موحّد لثلاث أقسام: ملف الإنجاز / العروض / الاختبارات
// ============================================

const BUCKET_NAME = "maharat-files";
const SECTION_ICONS = ["📁", "📜", "🏆", "🗄️", "🎖️", "📚", "🌟", "📋", "🖥️", "📝"];

let currentModule = null;
let currentSectionId = null;

const MODULE_LABELS = {
  portfolio: { page: "ملف إنجاز المعلم", sectionsTitle: "أقسام ملف الإنجاز", itemsTitle: "مرفقات القسم", showDate: false },
  presentations: { page: "العروض التقديمية", sectionsTitle: "الوحدات الدراسية", itemsTitle: "عروض الوحدة", showDate: false },
  exams: { page: "الاختبارات", sectionsTitle: "الوحدات الدراسية", itemsTitle: "اختبارات الوحدة", showDate: true },
  worksheets: { page: "أوراق العمل", sectionsTitle: "الوحدات الدراسية", itemsTitle: "أوراق عمل الوحدة", showDate: false },
};

function renderPortfolioSection() { renderModule("portfolio"); }
function renderPresentationsSection() { renderModule("presentations"); }
function renderExamsSection() { renderModule("exams"); }
function renderWorksheetsSection() { renderModule("worksheets"); }

async function renderModule(moduleName) {
  currentModule = moduleName;
  currentSectionId = null;
  document.getElementById("pageTitle").textContent = MODULE_LABELS[moduleName].page;
  await loadSectionsList();
}

async function loadSectionsList() {
  const labels = MODULE_LABELS[currentModule];
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head">
        <h3>${labels.sectionsTitle}</h3>
        <button class="btn-add" id="addSectionBtn">+ إضافة قسم جديد</button>
      </div>
      <div id="sectionsList" class="stat-grid">
        <div class="empty-state">جاري التحميل...</div>
      </div>
    </div>
  `;

  document.getElementById("addSectionBtn").addEventListener("click", openAddSectionModal);

  const { data: sections, error } = await supabaseClient
    .from("content_sections")
    .select("*")
    .eq("module", currentModule)
    .order("created_at", { ascending: true });

  const listEl = document.getElementById("sectionsList");

  if (error) {
    listEl.innerHTML = `<div class="empty-state">حدث خطأ في تحميل الأقسام</div>`;
    return;
  }

  if (!sections || sections.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="ico">📁</div>
        <div>ما فيه أقسام بعد — اضغط "إضافة قسم جديد" للبدء</div>
      </div>
    `;
    return;
  }

  const counts = await Promise.all(
    sections.map((s) =>
      supabaseClient.from("content_items").select("id", { count: "exact", head: true }).eq("section_id", s.id)
    )
  );

  listEl.innerHTML = sections.map((s, i) => `
    <div class="section-card" style="cursor:pointer; position:relative;" onclick="openSection('${s.id}', '${escapeAttr(s.title)}', '${s.icon}')">
      <button class="icon-btn danger" style="position:absolute; top:12px; left:12px;" onclick="event.stopPropagation(); deleteSection('${s.id}')" title="حذف القسم">🗑️</button>
      <div style="font-size:32px; margin-bottom:10px;">${s.icon}</div>
      <div style="font-weight:700; font-size:15px; margin-bottom:4px;">${escapeHtml(s.title)}</div>
      <div style="font-size:12px; color:var(--text-muted);">${counts[i].count ?? 0} عنصر</div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/'/g, "\\'");
}

function openAddSectionModal() {
  document.getElementById("modalTitle").textContent = "إضافة قسم جديد";
  document.getElementById("modalFields").innerHTML = `
    <div class="field">
      <label>اسم القسم</label>
      <input type="text" id="s_title" required />
    </div>
    <div class="field">
      <label>أيقونة القسم</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${SECTION_ICONS.map((ic, i) => `
          <label style="cursor:pointer;">
            <input type="radio" name="s_icon" value="${ic}" ${i === 0 ? "checked" : ""} style="display:none;" class="icon-radio">
            <span class="icon-choice" style="display:flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:10px; border:1px solid var(--border-soft); font-size:20px;">${ic}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;

  setTimeout(() => {
    document.querySelectorAll(".icon-radio").forEach((r) => {
      const span = r.nextElementSibling;
      if (r.checked) span.style.borderColor = "var(--accent-cyan)";
      r.addEventListener("change", () => {
        document.querySelectorAll(".icon-choice").forEach((s) => (s.style.borderColor = "var(--border-soft)"));
        if (r.checked) span.style.borderColor = "var(--accent-cyan)";
      });
      span.addEventListener("click", () => { r.checked = true; r.dispatchEvent(new Event("change")); });
    });
  }, 0);

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const title = document.getElementById("s_title").value.trim();
    const icon = document.querySelector('input[name="s_icon"]:checked').value;

    const { error } = await supabaseClient.from("content_sections").insert({ title, icon, module: currentModule });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";

    if (error) { alert("تعذر إضافة القسم"); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    await loadSectionsList();
  };

  document.getElementById("modalCancel").onclick = () => {
    document.getElementById("modalOverlay").classList.remove("show");
  };
}

async function deleteSection(sectionId) {
  if (!confirm("متأكد تبي تحذف هذا القسم؟ سيتم حذف كل العناصر اللي بداخله.")) return;
  const { error } = await supabaseClient.from("content_sections").delete().eq("id", sectionId);
  if (error) { alert("تعذر حذف القسم"); return; }
  await loadSectionsList();
}

async function openSection(sectionId, title, icon) {
  currentSectionId = sectionId;
  const labels = MODULE_LABELS[currentModule];
  document.getElementById("pageTitle").textContent = `${icon} ${title}`;

  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <button class="btn-secondary" style="width:auto; padding:8px 16px; margin-bottom:16px;" onclick="renderModule('${currentModule}')">← رجوع للأقسام</button>
    <div class="section-card">
      <div class="section-head">
        <h3>${labels.itemsTitle}</h3>
        <button class="btn-add" id="addItemBtn">+ إضافة عنصر</button>
      </div>
      <div id="itemsList"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("addItemBtn").addEventListener("click", () => openAddItemModal(sectionId));
  await loadItems(sectionId);
}

async function loadItems(sectionId) {
  const listEl = document.getElementById("itemsList");
  const { data, error } = await supabaseClient
    .from("content_items")
    .select("*")
    .eq("section_id", sectionId)
    .order("created_at", { ascending: false });

  if (error) { listEl.innerHTML = `<div class="empty-state">حدث خطأ في تحميل العناصر</div>`; return; }

  if (!data || data.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="ico">📎</div><div>ما فيه عناصر بهذا القسم بعد</div></div>`;
    return;
  }

  listEl.innerHTML = data.map((item) => `
    <div class="item-row">
      <div class="info">
        <div class="t">${escapeHtml(item.title)}</div>
        <div class="d">${item.item_date ? escapeHtml(item.item_date) + " · " : ""}${item.description ? escapeHtml(item.description) : ""}</div>
      </div>
      <div class="actions">
        ${item.file_url ? `<a class="icon-btn" href="${item.file_url}" target="_blank" title="عرض الملف">👁️</a>` : ""}
        <button class="icon-btn danger" onclick="deleteItem('${item.id}')" title="حذف">🗑️</button>
      </div>
    </div>
  `).join("");
}

function openAddItemModal(sectionId) {
  const labels = MODULE_LABELS[currentModule];
  document.getElementById("modalTitle").textContent = "إضافة عنصر";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>العنوان</label><input type="text" id="f_title" required /></div>
    ${labels.showDate ? `<div class="field"><label>تاريخ الاختبار</label><input type="date" id="f_date" /></div>` : ""}
    <div class="field"><label>الوصف (اختياري)</label><input type="text" id="f_description" /></div>
    <div class="field"><label>الملف (أي صيغة)</label><input type="file" id="f_file" /></div>
  `;

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    await submitItem(sectionId);
  };

  document.getElementById("modalCancel").onclick = () => {
    document.getElementById("modalOverlay").classList.remove("show");
  };
}

async function submitItem(sectionId) {
  const submitBtn = document.getElementById("modalSubmit");
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spin"></span>';

  const title = document.getElementById("f_title").value.trim();
  const description = document.getElementById("f_description").value.trim();
  const dateField = document.getElementById("f_date");
  const itemDate = dateField ? dateField.value : null;
  const file = document.getElementById("f_file").files[0];

  let fileUrl = null;
  let fileType = null;

  try {
    if (file) {
      const filePath = `${currentModule}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabaseClient.storage.from(BUCKET_NAME).upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      fileUrl = publicUrlData.publicUrl;
      fileType = file.name.split(".").pop();
    }

    const { error: insertError } = await supabaseClient.from("content_items").insert({
      title, description, section_id: sectionId, file_url: fileUrl, file_type: fileType, item_date: itemDate || null,
    });

    if (insertError) throw insertError;

    document.getElementById("modalOverlay").classList.remove("show");
    await loadItems(sectionId);
  } catch (err) {
    alert("حدث خطأ: " + (err.message || "تعذر الحفظ"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

async function deleteItem(id) {
  if (!confirm("متأكد تبي تحذف هذا العنصر؟")) return;
  const { error } = await supabaseClient.from("content_items").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadItems(currentSectionId);
}
