// ============================================
// نظام موحّد: أقسام رئيسية + أقسام فرعية
// (ملف الإنجاز / العروض / الاختبارات / أوراق العمل)
// ============================================

const BUCKET_NAME = "maharat-files";

// لوحة ألوان عصرية تتوزع تلقائياً على الأقسام
const FOLDER_COLORS = ["#2DD8C8", "#F5A623", "#B892FF", "#FF7A8A", "#5FD068", "#5FA8FF", "#FFB74D", "#E879C6"];

let currentModule = null;
let currentRootSection = null;   // { id, title }
let currentSubSection = null;    // { id, title } أو null لو نعرض القسم الرئيسي مباشرة

const MODULE_LABELS = {
  portfolio: { page: "ملف إنجاز المعلم", sectionsTitle: "أقسام ملف الإنجاز" },
  presentations: { page: "العروض التقديمية", sectionsTitle: "الوحدات الدراسية" },
  exams: { page: "الاختبارات", sectionsTitle: "الوحدات الدراسية" },
  worksheets: { page: "أوراق العمل", sectionsTitle: "الوحدات الدراسية" },
};

function renderPortfolioSection() { renderModule("portfolio"); }
function renderPresentationsSection() { renderModule("presentations"); }
function renderExamsSection() { renderModule("exams"); }
function renderWorksheetsSection() { renderModule("worksheets"); }

function colorFor(index) {
  return FOLDER_COLORS[index % FOLDER_COLORS.length];
}

function initials(title) {
  return (title || "?").trim().charAt(0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/'/g, "&#39;");
}

// ============ المستوى الأول: الأقسام الرئيسية ============

async function renderModule(moduleName) {
  currentModule = moduleName;
  currentRootSection = null;
  currentSubSection = null;
  document.getElementById("pageTitle").textContent = MODULE_LABELS[moduleName].page;
  await loadRootSections();
}

async function loadRootSections() {
  const labels = MODULE_LABELS[currentModule];
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head">
        <h3>${labels.sectionsTitle}</h3>
        <button class="btn-add" id="addRootBtn">+ إضافة قسم جديد</button>
      </div>
      <div id="foldersHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("addRootBtn").addEventListener("click", () => openSectionModal(null));

  const { data: sections, error } = await supabaseClient
    .from("content_sections")
    .select("*")
    .eq("module", currentModule)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  const holder = document.getElementById("foldersHolder");

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ في تحميل الأقسام</div>`; return; }

  if (!sections || sections.length === 0) {
    holder.innerHTML = `<div class="empty-state"><div>ما فيه أقسام بعد — اضغط "إضافة قسم جديد" للبدء</div></div>`;
    return;
  }

  const totals = await Promise.all(sections.map((s) => countAggregatedItems(s.id)));

  holder.innerHTML = `<div class="folder-grid">` + sections.map((s, i) => `
    <div class="folder-card" style="--folder-color:${s.color_index !== null ? colorFor(s.color_index) : colorFor(i)}" onclick="openRootSection('${s.id}', '${escapeAttr(s.title)}')">
      <button class="folder-delete" onclick="event.stopPropagation(); deleteSectionNode('${s.id}', true)" title="حذف القسم">✕</button>
      <div class="folder-avatar">${initials(s.title)}</div>
      <div class="folder-title">${escapeHtml(s.title)}</div>
      <div class="folder-meta">${totals[i]} عنصر</div>
    </div>
  `).join("") + `</div>`;
}

async function countAggregatedItems(rootId) {
  const { data: subs } = await supabaseClient.from("content_sections").select("id").eq("parent_id", rootId);
  const ids = [rootId, ...(subs || []).map((s) => s.id)];
  const { count } = await supabaseClient.from("content_items").select("id", { count: "exact", head: true }).in("section_id", ids);
  return count ?? 0;
}

// ============ فتح القسم الرئيسي: يعرض الأقسام الفرعية + كل العناصر المجمّعة ============

async function openRootSection(id, title) {
  currentRootSection = { id, title };
  currentSubSection = null;
  document.getElementById("pageTitle").textContent = title;

  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="breadcrumb-nav">
      <span class="crumb" onclick="renderModule(currentModule)">${MODULE_LABELS[currentModule].sectionsTitle}</span>
      <span>/</span>
      <span class="crumb current">${escapeHtml(title)}</span>
    </div>

    <div class="section-card" style="margin-bottom:18px;">
      <div class="section-head">
        <h3>أقسام فرعية</h3>
        <div style="display:flex; gap:10px;">
          <button class="btn-add" id="addSubBtn">+ قسم فرعي</button>
          <button class="btn-add" id="addRootItemBtn" style="background:var(--accent-cyan); color:#06231F;">+ إضافة عنصر هنا</button>
        </div>
      </div>
      <div id="subfoldersHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>

    <div class="section-card">
      <div class="section-head"><h3>كل العناصر (مجمّعة من كل الأقسام الفرعية)</h3></div>
      <div id="aggItemsHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("addSubBtn").addEventListener("click", () => openSectionModal(id));
  document.getElementById("addRootItemBtn").addEventListener("click", () => openAddItemModal(id, title));

  await loadSubSections(id);
  await loadAggregatedItems(id);
}

async function loadSubSections(rootId) {
  const holder = document.getElementById("subfoldersHolder");

  const { data: subs, error } = await supabaseClient
    .from("content_sections")
    .select("*")
    .eq("parent_id", rootId)
    .order("created_at", { ascending: true });

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }

  if (!subs || subs.length === 0) {
    holder.innerHTML = `<div class="empty-state" style="padding:24px;">ما فيه أقسام فرعية بعد</div>`;
    return;
  }

  const counts = await Promise.all(
    subs.map((s) => supabaseClient.from("content_items").select("id", { count: "exact", head: true }).eq("section_id", s.id))
  );

  holder.innerHTML = `<div class="folder-grid">` + subs.map((s, i) => `
    <div class="folder-card" style="--folder-color:${colorFor((s.color_index ?? i) + 3)}" onclick="openSubSection('${s.id}', '${escapeAttr(s.title)}')">
      <button class="folder-delete" onclick="event.stopPropagation(); deleteSectionNode('${s.id}', false)" title="حذف القسم الفرعي">✕</button>
      <div class="folder-avatar">${initials(s.title)}</div>
      <div class="folder-title">${escapeHtml(s.title)}</div>
      <div class="folder-meta">${counts[i].count ?? 0} عنصر</div>
    </div>
  `).join("") + `</div>`;
}

async function loadAggregatedItems(rootId) {
  const holder = document.getElementById("aggItemsHolder");

  const { data: subs } = await supabaseClient.from("content_sections").select("id, title").eq("parent_id", rootId);
  const subMap = {};
  (subs || []).forEach((s) => (subMap[s.id] = s.title));
  const ids = [rootId, ...(subs || []).map((s) => s.id)];

  const { data, error } = await supabaseClient
    .from("content_items")
    .select("*")
    .in("section_id", ids)
    .order("created_at", { ascending: false });

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }

  if (!data || data.length === 0) {
    holder.innerHTML = `<div class="empty-state"><div>ما فيه عناصر بعد</div></div>`;
    return;
  }

  holder.innerHTML = data.map((item) => `
    <div class="item-row">
      <div class="info">
        <div class="t">${escapeHtml(item.title)} ${item.section_id !== rootId ? `<span class="sub-badge">${escapeHtml(subMap[item.section_id] || "")}</span>` : ""}</div>
        <div class="d">${item.item_date ? escapeHtml(item.item_date) + " · " : ""}${item.description ? escapeHtml(item.description) : ""}</div>
      </div>
      <div class="actions">
        ${item.file_url ? `<a class="icon-btn" href="${item.file_url}" target="_blank" title="عرض الملف">👁</a>` : ""}
        <button class="icon-btn danger" onclick="deleteItem('${item.id}')" title="حذف">✕</button>
      </div>
    </div>
  `).join("");
}

// ============ فتح قسم فرعي محدد ============

async function openSubSection(id, title) {
  currentSubSection = { id, title };
  document.getElementById("pageTitle").textContent = title;

  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="breadcrumb-nav">
      <span class="crumb" onclick="renderModule(currentModule)">${MODULE_LABELS[currentModule].sectionsTitle}</span>
      <span>/</span>
      <span class="crumb" onclick="openRootSection('${currentRootSection.id}', '${escapeAttr(currentRootSection.title)}')">${escapeHtml(currentRootSection.title)}</span>
      <span>/</span>
      <span class="crumb current">${escapeHtml(title)}</span>
    </div>

    <div class="section-card">
      <div class="section-head">
        <h3>العناصر</h3>
        <button class="btn-add" id="addSubItemBtn">+ إضافة عنصر</button>
      </div>
      <div id="subItemsHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("addSubItemBtn").addEventListener("click", () => openAddItemModal(id, title));
  await loadPlainItems(id);
}

async function loadPlainItems(sectionId) {
  const holder = document.getElementById("subItemsHolder");
  const { data, error } = await supabaseClient
    .from("content_items")
    .select("*")
    .eq("section_id", sectionId)
    .order("created_at", { ascending: false });

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }

  if (!data || data.length === 0) {
    holder.innerHTML = `<div class="empty-state"><div>ما فيه عناصر بهذا القسم بعد</div></div>`;
    return;
  }

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

// ============ نافذة إضافة قسم (رئيسي أو فرعي) ============

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

    const { error } = await supabaseClient.from("content_sections").insert({
      title, module: currentModule, parent_id: parentId, color_index: selectedColor,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";

    if (error) { alert("تعذر الإضافة: " + error.message); return; }

    document.getElementById("modalOverlay").classList.remove("show");

    if (parentId) {
      await loadSubSections(parentId);
      await loadAggregatedItems(parentId);
    } else {
      await loadRootSections();
    }
  };

  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteSectionNode(id, isRoot) {
  const msg = isRoot ? "متأكد تبي تحذف هذا القسم؟ سيتم حذف كل الأقسام الفرعية والعناصر بداخله." : "متأكد تبي تحذف هذا القسم الفرعي؟ سيتم حذف عناصره.";
  if (!confirm(msg)) return;

  const { error } = await supabaseClient.from("content_sections").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }

  if (isRoot) {
    await loadRootSections();
  } else {
    await loadSubSections(currentRootSection.id);
    await loadAggregatedItems(currentRootSection.id);
  }
}

// ============ نافذة إضافة عنصر ============

function openAddItemModal(sectionId, sectionTitle) {
  const showDate = currentModule === "exams";
  document.getElementById("modalTitle").textContent = "إضافة عنصر إلى: " + sectionTitle;
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>العنوان</label><input type="text" id="f_title" required /></div>
    ${showDate ? `<div class="field"><label>تاريخ الاختبار</label><input type="date" id="f_date" /></div>` : ""}
    <div class="field"><label>الوصف (اختياري)</label><input type="text" id="f_description" /></div>
    <div class="field"><label>الملف (أي صيغة)</label><input type="file" id="f_file" /></div>
  `;

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    await submitItem(sectionId);
  };

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

    // تحديث العرض الصحيح حسب أين نحن الآن
    if (currentSubSection && currentSubSection.id === sectionId) {
      await loadPlainItems(sectionId);
    } else if (currentRootSection) {
      await loadAggregatedItems(currentRootSection.id);
      if (currentRootSection.id !== sectionId) await loadSubSections(currentRootSection.id);
    }
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

  if (currentSubSection) {
    await loadPlainItems(currentSubSection.id);
  } else if (currentRootSection) {
    await loadAggregatedItems(currentRootSection.id);
  }
}
