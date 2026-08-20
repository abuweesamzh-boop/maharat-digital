// ============================================
// روابط الصفوف الخارجية (بطاقات تفتح رابط بتبويب جديد)
// ============================================

const EXT_COLORS = ["#2DD8C8", "#F5A623", "#B892FF", "#FF7A8A", "#5FD068", "#5FA8FF"];

async function renderExternalLinksSection() {
  document.getElementById("pageTitle").textContent = "مهارات رقمية - الصفوف";
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head"><h3>الصفوف الدراسية</h3><button class="btn-add" id="addExtLinkBtn">+ إضافة رابط جديد</button></div>
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
      <button class="folder-delete" onclick="event.stopPropagation(); deleteExtLink('${l.id}')" title="حذف">✕</button>
      ${l.image_url
        ? `<img src="${l.image_url}" style="width:44px; height:44px; border-radius:12px; object-fit:cover; margin-bottom:16px;" />`
        : `<div class="folder-avatar">${(l.title || "?").charAt(0)}</div>`
      }
      <div class="folder-title">${escapeHtmlExt(l.title)}</div>
      <div class="folder-meta">🔗 فتح الرابط</div>
    </div>`).join("");
}

function escapeHtmlExt(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttrExt(str) { return (str || "").replace(/'/g, "&#39;"); }

function openExtLinkModal() {
  document.getElementById("modalTitle").textContent = "إضافة رابط جديد";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>العنوان</label><input type="text" id="el_title" placeholder="مثال: مهارات رقمية - الصف الثاني متوسط" required /></div>
    <div class="field"><label>الرابط</label><input type="text" id="el_url" placeholder="https://..." required /></div>
    <div class="field"><label>صورة/أيقونة (اختياري)</label><input type="file" id="el_image" accept="image/*" /></div>
  `;
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
