// ============================================
// قسم: ملف إنجاز المعلم
// ============================================

const PORTFOLIO_CATEGORIES = ["شهادات", "دورات تدريبية", "إنجازات", "مشاركات مجتمعية", "أخرى"];
const BUCKET_NAME = "maharat-files";

async function renderPortfolioSection() {
  document.getElementById("pageTitle").textContent = "ملف إنجاز المعلم";
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head">
        <h3>عناصر ملف الإنجاز</h3>
        <button class="btn-add" id="addPortfolioBtn">+ إضافة عنصر</button>
      </div>
      <div id="portfolioList">
        <div class="empty-state">جاري التحميل...</div>
      </div>
    </div>
  `;

  document.getElementById("addPortfolioBtn").addEventListener("click", openAddPortfolioModal);

  await loadPortfolioItems();
}

async function loadPortfolioItems() {
  const listEl = document.getElementById("portfolioList");
  const { data, error } = await supabaseClient
    .from("teacher_portfolio")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<div class="empty-state">حدث خطأ في تحميل البيانات</div>`;
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="ico">📁</div>
        <div>ما فيه عناصر مضافة بعد — اضغط "إضافة عنصر" للبدء</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = data.map((item) => `
    <div class="item-row" data-id="${item.id}">
      <div class="info">
        <div class="t">${escapeHtml(item.title)}</div>
        <div class="d">${item.category ? escapeHtml(item.category) + " · " : ""}${item.description ? escapeHtml(item.description) : ""}</div>
      </div>
      <div class="actions">
        ${item.file_url ? `<a class="icon-btn" href="${item.file_url}" target="_blank" title="عرض الملف">👁️</a>` : ""}
        <button class="icon-btn danger" onclick="deletePortfolioItem('${item.id}')" title="حذف">🗑️</button>
      </div>
    </div>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function openAddPortfolioModal() {
  document.getElementById("modalTitle").textContent = "إضافة عنصر لملف الإنجاز";
  document.getElementById("modalFields").innerHTML = `
    <div class="field">
      <label>العنوان</label>
      <input type="text" id="f_title" required />
    </div>
    <div class="field">
      <label>التصنيف</label>
      <select id="f_category" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body); font-size:15px;">
        ${PORTFOLIO_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label>الوصف (اختياري)</label>
      <input type="text" id="f_description" />
    </div>
    <div class="field">
      <label>الملف (أي صيغة: PDF, PPTX, DOCX, صور...)</label>
      <input type="file" id="f_file" />
    </div>
  `;

  const overlay = document.getElementById("modalOverlay");
  overlay.classList.add("show");

  const form = document.getElementById("modalForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    await submitPortfolioItem();
  };

  document.getElementById("modalCancel").onclick = () => {
    overlay.classList.remove("show");
  };
}

async function submitPortfolioItem() {
  const submitBtn = document.getElementById("modalSubmit");
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spin"></span>';

  const title = document.getElementById("f_title").value.trim();
  const category = document.getElementById("f_category").value;
  const description = document.getElementById("f_description").value.trim();
  const fileInput = document.getElementById("f_file");
  const file = fileInput.files[0];

  let fileUrl = null;
  let fileType = null;

  try {
    if (file) {
      const filePath = `portfolio/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabaseClient.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      fileUrl = publicUrlData.publicUrl;
      fileType = file.name.split(".").pop();
    }

    const { error: insertError } = await supabaseClient.from("teacher_portfolio").insert({
      title,
      description,
      category,
      file_url: fileUrl,
      file_type: fileType,
    });

    if (insertError) throw insertError;

    document.getElementById("modalOverlay").classList.remove("show");
    await loadPortfolioItems();
  } catch (err) {
    alert("حدث خطأ: " + (err.message || "تعذر الحفظ، حاول مرة أخرى"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

async function deletePortfolioItem(id) {
  if (!confirm("متأكد تبي تحذف هذا العنصر؟")) return;

  const { error } = await supabaseClient.from("teacher_portfolio").delete().eq("id", id);

  if (error) {
    alert("تعذر الحذف، حاول مرة أخرى");
    return;
  }

  await loadPortfolioItems();
}
