// ============================================
// نظام موحّد: أقسام متداخلة بعمق غير محدود
// (ملف الإنجاز / العروض / الاختبارات / أوراق العمل)
// ============================================

const BUCKET_NAME = "maharat-files";
const FOLDER_COLORS = ["#2DD8C8", "#F5A623", "#B892FF", "#FF7A8A", "#5FD068", "#5FA8FF", "#FFB74D", "#E879C6"];

let currentModule = null;
let navStack = []; // مسار التنقل: [{id, title}, ...]

const MODULE_LABELS = {
  portfolio: { page: "ملف إنجاز المعلم" },
  presentations: { page: "العروض التقديمية" },
  exams: { page: "الاختبارات" },
  worksheets: { page: "أوراق العمل" },
};

function renderPortfolioSection() { renderModule("portfolio"); }
function renderPresentationsSection() { renderModule("presentations"); }
function renderExamsSection() { renderModule("exams"); }
function renderWorksheetsSection() { renderModule("worksheets"); }

function colorFor(i) { return FOLDER_COLORS[i % FOLDER_COLORS.length]; }
function initials(t) { return (t || "?").trim().charAt(0); }
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

function currentParentId() { return navStack.length ? navStack[navStack.length - 1].id : null; }

async function renderModule(moduleName) {
  currentModule = moduleName;
  navStack = [];
  document.getElementById("pageTitle").textContent = MODULE_LABELS[moduleName].page;
  await renderFolderView();
}

function goToCrumb(index) {
  navStack = navStack.slice(0, index + 1);
  renderFolderView();
}

function goToModuleRoot() {
  navStack = [];
  renderFolderView();
}

async function renderFolderView() {
  const parentId = currentParentId();
  const contentArea = document.getElementById("contentArea");
  const currentTitle = navStack.length ? navStack[navStack.length - 1].title : MODULE_LABELS[currentModule].page;
  document.getElementById("pageTitle").textContent = currentTitle;

  const breadcrumbHtml = `
    <div class="breadcrumb-nav">
      <span class="crumb ${navStack.length === 0 ? "current" : ""}" onclick="goToModuleRoot()">${MODULE_LABELS[currentModule].page}</span>
      ${navStack.map((n, i) => `<span>/</span><span class="crumb ${i === navStack.length - 1 ? "current" : ""}" onclick="goToCrumb(${i})">${escapeHtml(n.title)}</span>`).join("")}
    </div>
  `;

  contentArea.innerHTML = `
    ${breadcrumbHtml}
    <div class="section-card" style="margin-bottom:18px;">
      <div class="section-head">
        <h3>الأقسام الفرعية</h3>
        <div style="display:flex; gap:10px;">
          <button class="btn-add" id="addFolderBtn">+ إضافة قسم</button>
          ${parentId ? `<button class="btn-add" id="addItemHereBtn" style="background:var(--accent-cyan); color:#06231F;">+ إضافة مرفق هنا</button>` : ""}
        </div>
      </div>
      <div id="foldersHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
    ${parentId ? `
    <div class="section-card">
      <div class="section-head"><h3>المرفقات</h3></div>
      <div id="itemsHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
    ` : ""}
  `;

  document.getElementById("addFolderBtn").addEventListener("click", () => openSectionModal(parentId));
  if (parentId) {
    document.getElementById("addItemHereBtn").addEventListener("click", () => openAddItemModal(parentId, currentTitle));
  }

  await loadSubFolders(parentId);
  if (parentId) await loadItems(parentId);
}

async function loadSubFolders(parentId) {
  const holder = document.getElementById("foldersHolder");

  let q = supabaseClient.from("content_sections").select("*").eq("module", currentModule).order("created_at", { ascending: true });
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);

  const { data: sections, error } = await q;

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!sections || sections.length === 0) {
    holder.innerHTML = `<div class="empty-state">ما فيه أقسام فرعية بعد</div>`;
    return;
  }

  const counts = await Promise.all(sections.map((s) =>
    Promise.all([
      supabaseClient.from("content_sections").select("id", { count: "exact", head: true }).eq("parent_id", s.id),
      supabaseClient.from("content_items").select("id", { count: "exact", head: true }).eq("section_id", s.id),
    ])
  ));

  holder.innerHTML = `<div class="folder-grid">` + sections.map((s, i) => {
    const [subCount, itemCount] = counts[i];
    return `
    <div class="folder-card" style="--folder-color:${colorFor(s.color_index ?? i)}" onclick="enterFolder('${s.id}', '${escapeAttr(s.title)}')">
      <button class="folder-delete" onclick="event.stopPropagation(); deleteFolder('${s.id}')" title="حذف">✕</button>
      <div class="folder-avatar">${initials(s.title)}</div>
      <div class="folder-title">${escapeHtml(s.title)}</div>
      <div class="folder-meta">${subCount.count ?? 0} قسم فرعي · ${itemCount.count ?? 0} مرفق</div>
    </div>
  `;
  }).join("") + `</div>`;
}

function enterFolder(id, title) {
  navStack.push({ id, title });
  renderFolderView();
}

async function loadItems(sectionId) {
  const holder = document.getElementById("itemsHolder");
  const { data, error } = await supabaseClient.from("content_items").select("*").eq("section_id", sectionId).order("created_at", { ascending: false });

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه مرفقات بهذا القسم بعد</div>`; return; }

  holder.innerHTML = data.map((item) => `
    <div class="item-row">
      <div class="info">
        <div class="t">${escapeHtml(item.title)}</div>
        <div class="d">${item.item_date ? escapeHtml(item.item_date) + " · " : ""}${item.description ? escapeHtml(item.description) : ""}</div>
      </div>
      <div class="actions">
        ${item.file_url ? `<a class="icon-btn" href="${item.file_url}" target="_blank" title="عرض الملف">👁</a>` : ""}
        <button class="icon-btn danger" onclick="deleteItem('${item.id}')" title="حذف">✕</button>
      </div>
    </div>
  `).join("");
}

function openSectionModal(parentId) {
  document.getElementById("modalTitle").textContent = parentId ? "إضافة قسم فرعي" : "إضافة قسم جديد";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>اسم القسم</label><input type="text" id="s_title" required /></div>
    <div class="field">
      <label>اللون</label>
      <div class="color-swatch-row" id="colorRow">
        ${FOLDER_COLORS.map((c, i) => `<div class="color-swatch ${i === 0 ? "selected" : ""}" data-index="${i}" style="background:${c}"></div>`).join("")}
      </div>
    </div>
  `;

  let selectedColor = 0;
  setTimeout(() => {
    document.querySelectorAll(".color-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll(".color-swatch").forEach((x) => x.classList.remove("selected"));
        sw.classList.add("selected");
        selectedColor = parseInt(sw.dataset.index, 10);
      });
    });
  }, 0);

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const title = document.getElementById("s_title").value.trim();
    const { error } = await supabaseClient.from("content_sections").insert({ title, module: currentModule, parent_id: parentId, color_index: selectedColor });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر الإضافة: " + error.message); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    await loadSubFolders(parentId);
  };

  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteFolder(id) {
  if (!confirm("متأكد تبي تحذف هذا القسم؟ سيتم حذف كل الأقسام الفرعية والمرفقات بداخله.")) return;
  const { error } = await supabaseClient.from("content_sections").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadSubFolders(currentParentId());
}

function openAddItemModal(sectionId, sectionTitle) {
  const showDate = currentModule === "exams";
  document.getElementById("modalTitle").textContent = "إضافة مرفق إلى: " + sectionTitle;
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>العنوان</label><input type="text" id="f_title" required /></div>
    ${showDate ? `<div class="field"><label>تاريخ الاختبار</label><input type="date" id="f_date" /></div>` : ""}
    <div class="field"><label>الوصف (اختياري)</label><input type="text" id="f_description" /></div>
    <div class="field"><label>الملف (أي صيغة)</label><input type="file" id="f_file" /></div>
  `;

  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => { e.preventDefault(); await submitItem(sectionId); };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
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

  let fileUrl = null, fileType = null;

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

function sanitizeFileName(name) { return name.replace(/[^a-zA-Z0-9.\-_]/g, "_"); }

async function deleteItem(id) {
  if (!confirm("متأكد تبي تحذف هذا المرفق؟")) return;
  const { error } = await supabaseClient.from("content_items").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadItems(currentParentId());
}
