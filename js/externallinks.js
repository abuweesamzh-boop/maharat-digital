const EXT_COLORS = ["#0F2542", "#B8862E", "#3C6E5A", "#7A4B8A", "#1F6F8B", "#8A4B3C"];

async function renderExternalLinksSection() {
  document.getElementById("pageTitle").textContent = "مهارات رقمية - الصفوف";
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head"><h3>الصفوف الدراسية</h3><button class="btn-add" id="addExtLinkBtn">${icon("plus", 14)} إضافة رابط جديد</button></div>
      <div id="extLinksHolder" class="folder-grid"><div class="empty-state">جاري التحميل...</div></div>
    </div>`;
  document.getElementById("addExtLinkBtn").addEventListener("click", () => openExtLinkModal());
  await loadExtLinks();
}

async function loadExtLinks() {
  const holder = document.getElementById("extLinksHolder");
  const { data, error } = await supabaseClient.from("external_links").select("*").order("created_at", { ascending: true });
  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه روابط بعد — أضف رابط جديد للبدء</div>`; return; }
  holder.innerHTML = data.map((l, i) => `
    <div class="folder-card" style="--folder-color:${EXT_COLORS[(l.color_index ?? i) % EXT_COLORS.length]}" onclick="window.open('${l.url}', '_blank')">
      <div class="folder-actions-row"><button class="folder-mini-btn danger" onclick="event.stopPropagation(); deleteExtLink('${l.id}')" title="حذف">${icon("trash", 14)}</button></div>
      ${l.image_url ? `<img src="${l.image_url}" style="width:40px; height:40px; border-radius:10px; object-fit:cover; margin-bottom:10px;" />` : ""}
      <div class="folder-title">${escapeHtmlExt(l.title)}</div>
      <div class="folder-meta">${icon("link", 12)} فتح الرابط</div>
    </div>`).join("");
}

function escapeHtmlExt(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }

function openExtLinkModal() {
  document.getElementById("modalTitle").textContent = "إضافة رابط جديد";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>العنوان</label><input type="text" id="el_title" required /></div>
    <div class="field"><label>الرابط</label><input type="text" id="el_url" placeholder="https://..." required /></div>
    <div class="field"><label>صورة/أيقونة (اختياري)</label><input type="file" id="el_image" accept="image/*" /></div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    try {
      const title = document.getElementById("el_title").value.trim();
      const url = document.getElementById("el_url").value.trim();
      const file = document.getElementById("el_image").files[0];
      let image_url = null;
      if (file) {
        const filePath = `external-links/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error: upErr } = await supabaseClient.storage.from("maharat-files").upload(filePath, file);
        if (upErr) throw upErr;
        const { data: pub } = await supabaseClient.storage.from("maharat-files").getPublicUrl(filePath);
        image_url = pub.publicUrl;
      }
      const { error } = await supabaseClient.from("external_links").insert({ title, url, image_url });
      if (error) throw error;
      document.getElementById("modalOverlay").classList.remove("show");
      await loadExtLinks();
    } catch (err) {
      alert("حدث خطأ: " + (err.message || "تعذر الحفظ"));
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    }
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteExtLink(id) {
  if (!confirm("متأكد تبي تحذف هذا الرابط؟")) return;
  const { error } = await supabaseClient.from("external_links").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadExtLinks();
}
