const MODULE_LABELS = {
  portfolio: { page: "ملف إنجاز المعلم", icon: "folder" },
  external:  { page: "مهارات رقمية - الصفوف", icon: "rocket" }
};
const FOLDER_COLORS = ["#0F2542","#B8862E","#1F8A5C","#6B4EA6","#C1443B","#1B7F9E","#8A5A1F","#3D5A80"];

let contentState = { module: "portfolio", currentSectionId: null, path: [] };

function renderPortfolioSection(){ renderModule("portfolio"); }
function renderExternalLinksSection(){ renderModule("external"); }

function renderModule(moduleName){
  contentState = { module: moduleName, currentSectionId: null, path: [] };
  renderFolderView();
}

async function loadDashboardStats(moduleName){
  const { data: allSections } = await supabaseClient.from("content_sections").select("id").eq("module", moduleName);
  const { data: allItems } = await supabaseClient.from("content_items").select("id, section_id").in("section_id", (allSections||[]).map(s=>s.id).length ? (allSections||[]).map(s=>s.id) : ["00000000-0000-0000-0000-000000000000"]);
  return { folders: (allSections||[]).length, items: (allItems||[]).length };
}

async function getAllDescendantSectionIds(rootId, moduleName){
  const { data: all } = await supabaseClient.from("content_sections").select("id, parent_id").eq("module", moduleName);
  const ids = [rootId];
  let changed = true;
  while (changed) {
    changed = false;
    (all||[]).forEach(s => {
      if (ids.includes(s.parent_id) && !ids.includes(s.id)) { ids.push(s.id); changed = true; }
    });
  }
  return ids;
}

async function renderFolderView(){
  const el = document.getElementById("contentArea");
  const meta = MODULE_LABELS[contentState.module];
  el.innerHTML = `<div class="loading-placeholder">جاري التحميل...</div>`;

  let breadcrumbHtml = `<a href="#" class="crumb" onclick="event.preventDefault();renderModule('${contentState.module}')">${meta.page}</a>`;
  contentState.path.forEach((p,i) => {
    breadcrumbHtml += ` <span class="crumb-sep">/</span> <a href="#" class="crumb" onclick="event.preventDefault();enterFolderByIndex(${i})">${p.title}</a>`;
  });

  let statsHtml = "";
  if (!contentState.currentSectionId) {
    const stats = await loadDashboardStats(contentState.module);
    statsHtml = `
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-ic">${icon("folder",22)}</div><div><strong>${stats.folders}</strong><span>مجلد</span></div></div>
        <div class="stat-card"><div class="stat-ic">${icon("note",22)}</div><div><strong>${stats.items}</strong><span>عنصر</span></div></div>
      </div>`;
  }

  const backBtn = contentState.currentSectionId
    ? `<button class="btn-back" onclick="goBackFolder()">${icon("back",18)}<span>رجوع</span></button>`
    : `<button class="btn-back" onclick="routeSectionBack()">${icon("back",18)}<span>رجوع للرئيسية</span></button>`;

  el.innerHTML = `
    <div class="page-head">
      ${backBtn}
      <div class="breadcrumb">${breadcrumbHtml}</div>
      <h2>${contentState.path.length ? contentState.path[contentState.path.length-1].title : meta.page}</h2>
    </div>
    ${statsHtml}
    <div class="toolbar-row">
      <button class="btn-primary" onclick="openSectionModal(null)">${icon("plus",16)}<span>مجلد جديد</span></button>
      <button class="btn-secondary" onclick="openAddItemModal('${contentState.currentSectionId||''}')">${icon("plus",16)}<span>إضافة عنصر</span></button>
    </div>
    <div id="foldersGrid" class="folder-grid"></div>
    <div id="itemsList" class="items-list"></div>
  `;
  hydrateIcons(el);
  loadSubFolders();
  if (contentState.currentSectionId) loadItems();
}

function routeSectionBack(){ loadHomeStats(); }

async function loadSubFolders(){
  const holder = document.getElementById("foldersGrid");
  let list = [];
  if (contentState.currentSectionId) {
    const r = await supabaseClient.from("content_sections").select("*").eq("module", contentState.module).eq("parent_id", contentState.currentSectionId).order("title");
    list = r.data || [];
  } else {
    const r = await supabaseClient.from("content_sections").select("*").eq("module", contentState.module).is("parent_id", null).order("title");
    list = r.data || [];
  }
  if (!list.length) { holder.innerHTML = `<p class="muted" style="grid-column:1/-1;">لا توجد مجلدات بعد.</p>`; return; }
  holder.innerHTML = list.map(f => `
    <div class="folder-card" style="--folder-color:${f.color_index !== null && FOLDER_COLORS[f.color_index] ? FOLDER_COLORS[f.color_index] : FOLDER_COLORS[0]}">
      <div class="folder-card-main" onclick="enterFolder('${f.id}','${(f.title||'').replace(/'/g,"\\'")}')">
        ${icon("folder",26)}
        <span class="folder-title">${f.title}</span>
      </div>
      <div class="folder-card-actions">
        <button class="mini-btn" title="تعديل" onclick="openEditSectionModal('${f.id}')">${icon("edit",15)}</button>
        <button class="mini-btn danger" title="حذف" onclick="deleteFolder('${f.id}')">${icon("trash",15)}</button>
      </div>
    </div>
  `).join("");
  hydrateIcons(holder);
}

function enterFolder(id, title){
  contentState.path.push({ id, title });
  contentState.currentSectionId = id;
  renderFolderView();
}
function enterFolderByIndex(i){
  contentState.path = contentState.path.slice(0, i+1);
  contentState.currentSectionId = contentState.path[i].id;
  renderFolderView();
}
function goBackFolder(){
  contentState.path.pop();
  contentState.currentSectionId = contentState.path.length ? contentState.path[contentState.path.length-1].id : null;
  renderFolderView();
}

async function loadItems(){
  const holder = document.getElementById("itemsList");
  if (!holder) return;
  const { data, error } = await supabaseClient.from("content_items").select("*").eq("section_id", contentState.currentSectionId).order("created_at", { ascending: false });
  const items = data || [];
  if (!items.length) { holder.innerHTML = `<p class="muted">لا توجد عناصر هنا بعد.</p>`; return; }
  holder.innerHTML = items.map(it => {
    const isLink = !!it.external_url && !it.file_url;
    return `
    <div class="item-row">
      <div class="item-main" onclick="${isLink ? `window.open('${it.external_url}','_blank')` : `window.open('${it.file_url}','_blank')`}">
        ${icon(isLink ? "link" : "note", 18)}
        <span>${it.title || "بدون عنوان"}</span>
        ${isLink ? `<span class="sub-badge">رابط خارجي</span>` : ""}
      </div>
      <div class="item-actions">
        <button class="mini-btn" title="نقل" onclick="openMoveItemModal('${it.id}')">${icon("move",15)}</button>
        <button class="mini-btn danger" title="حذف" onclick="deleteItem('${it.id}')">${icon("trash",15)}</button>
      </div>
    </div>`;
  }).join("");
  hydrateIcons(holder);
}

function openSectionModal(parentId){
  openModal(`
    <h3>مجلد جديد</h3>
    <label>اسم المجلد</label>
    <input type="text" id="newSectionTitle" placeholder="مثال: شهادات الشكر">
    <label>اللون</label>
    <div class="color-pick-row">
      ${FOLDER_COLORS.map((c,i)=>`<span class="color-dot" data-color="${i}" style="background:${c}" onclick="selectColorDot(this)"></span>`).join("")}
    </div>
    <input type="hidden" id="newSectionColor" value="0">
    <button class="btn-primary full" onclick="submitNewSection()">إنشاء</button>
  `);
  document.querySelectorAll(".color-dot")[0]?.classList.add("selected");
}
function selectColorDot(el){
  document.querySelectorAll(".color-dot").forEach(d=>d.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("newSectionColor").value = el.getAttribute("data-color");
}
async function submitNewSection(){
  const title = document.getElementById("newSectionTitle").value.trim();
  const color = parseInt(document.getElementById("newSectionColor").value || "0");
  if (!title) return alert("أدخل اسم المجلد");
  await supabaseClient.from("content_sections").insert({
    module: contentState.module, title, color_index: color, parent_id: contentState.currentSectionId
  });
  closeModal();
  renderFolderView();
}

async function openEditSectionModal(id){
  const { data: sec } = await supabaseClient.from("content_sections").select("*").eq("id", id).single();
  if (!sec) return;
  openModal(`
    <h3>تعديل المجلد</h3>
    <label>اسم المجلد</label>
    <input type="text" id="editSectionTitle" value="${sec.title || ""}">
    <label>اللون</label>
    <div class="color-pick-row">
      ${FOLDER_COLORS.map((c,i)=>`<span class="color-dot ${i===sec.color_index?'selected':''}" data-color="${i}" style="background:${c}" onclick="selectColorDot(this)"></span>`).join("")}
    </div>
    <input type="hidden" id="newSectionColor" value="${sec.color_index||0}">
    <button class="btn-primary full" onclick="submitEditSection('${id}')">حفظ التعديلات</button>
  `);
}
async function submitEditSection(id){
  const title = document.getElementById("editSectionTitle").value.trim();
  const color = parseInt(document.getElementById("newSectionColor").value || "0");
  if (!title) return alert("أدخل اسم المجلد");
  await supabaseClient.from("content_sections").update({ title, color_index: color }).eq("id", id);
  closeModal();
  renderFolderView();
}

async function deleteFolder(id){
  if (!confirm("سيتم حذف المجلد وكل ما بداخله. متأكد؟")) return;
  await supabaseClient.from("content_sections").delete().eq("id", id);
  renderFolderView();
}

async function openMoveItemModal(itemId){
  const { data: allSections } = await supabaseClient.from("content_sections").select("id, title, parent_id").eq("module", contentState.module).order("title");
  function buildOptions(parentId, depth){
    let html = "";
    (allSections||[]).filter(s => s.parent_id === parentId).forEach(s => {
      html += `<option value="${s.id}">${"— ".repeat(depth)}${s.title}</option>`;
      html += buildOptions(s.id, depth+1);
    });
    return html;
  }
  openModal(`
    <h3>نقل العنصر</h3>
    <label>اختر المجلد الوجهة</label>
    <select id="moveDestSelect">
      <option value="">(المجلد الرئيسي)</option>
      ${buildOptions(null, 0)}
    </select>
    <button class="btn-primary full" onclick="submitMoveItem('${itemId}')">نقل</button>
  `);
}
async function submitMoveItem(itemId){
  const dest = document.getElementById("moveDestSelect").value || null;
  await supabaseClient.from("content_items").update({ section_id: dest }).eq("id", itemId);
  closeModal();
  renderFolderView();
}

function openAddItemModal(sectionId){
  if (!sectionId) return alert("ادخل مجلد أولاً لإضافة عنصر بداخله");
  openModal(`
    <h3>إضافة عنصر</h3>
    <div class="btn-pill-choice">
      <button type="button" class="pill active" id="pillFile" onclick="switchItemType('file')">ملف</button>
      <button type="button" class="pill" id="pillLink" onclick="switchItemType('link')">رابط خارجي</button>
    </div>
    <div id="itemTypeFields">
      <label>العنوان</label>
      <input type="text" id="itemTitle" placeholder="عنوان العنصر">
      <div id="fileFields">
        <label>الملف</label>
        <input type="file" id="itemFile">
        <label>أو التقط صورة بالكاميرا</label>
        <input type="file" id="itemFileCamera" accept="image/*" capture="environment">
      </div>
      <div id="linkFields" style="display:none;">
        <label>الرابط</label>
        <input type="url" id="itemUrl" placeholder="https://...">
      </div>
    </div>
    <button class="btn-primary full" id="submitItemBtn" onclick="submitItem('${sectionId}','file')">إضافة</button>
  `);
}
function switchItemType(type){
  document.getElementById("pillFile").classList.toggle("active", type==="file");
  document.getElementById("pillLink").classList.toggle("active", type==="link");
  document.getElementById("fileFields").style.display = type==="file" ? "" : "none";
  document.getElementById("linkFields").style.display = type==="link" ? "" : "none";
  document.getElementById("submitItemBtn").setAttribute("onclick", `submitItem('${contentState.currentSectionId}','${type}')`);
}

async function submitItem(sectionId, itemType){
  const title = document.getElementById("itemTitle").value.trim();
  if (!title) return alert("أدخل عنوان العنصر");
  const btn = document.getElementById("submitItemBtn");
  btn.disabled = true; btn.textContent = "جاري الحفظ...";
  try {
    if (itemType === "link") {
      const url = document.getElementById("itemUrl").value.trim();
      if (!url) { alert("أدخل الرابط"); btn.disabled=false; btn.textContent="إضافة"; return; }
      await supabaseClient.from("content_items").insert({ section_id: sectionId, title, external_url: url });
    } else {
      const fileInput = document.getElementById("itemFile");
      const camInput = document.getElementById("itemFileCamera");
      const file = (fileInput.files[0]) || (camInput.files[0]);
      if (!file) { alert("اختر ملفاً"); btn.disabled=false; btn.textContent="إضافة"; return; }
      const path = `${contentState.module}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabaseClient.storage.from("maharat-files").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabaseClient.storage.from("maharat-files").getPublicUrl(path);
      await supabaseClient.from("content_items").insert({ section_id: sectionId, title, file_url: pub.publicUrl, file_type: file.type });
    }
    closeModal();
    renderFolderView();
  } catch (e) {
    alert("حدث خطأ أثناء الحفظ: " + (e.message || e));
    btn.disabled = false; btn.textContent = "إضافة";
  }
}

async function deleteItem(id){
  if (!confirm("حذف هذا العنصر؟")) return;
  await supabaseClient.from("content_items").delete().eq("id", id);
  loadItems();
}

// ---- shared modal helpers ----
function openModal(innerHtml){
  let overlay = document.getElementById("modalOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "modalOverlay";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div class="modal-box">
    <button class="modal-close" onclick="closeModal()">${icon("close",16)}</button>
    <div class="modal-body">${innerHtml}</div>
  </div>`;
  overlay.style.display = "flex";
  hydrateIcons(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}
function closeModal(){
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.style.display = "none";
}
