// ============================================
// روابط المشاركة المؤقتة (عرض فقط للمشرف)
// ============================================

const DURATION_OPTIONS = [
  { label: "ساعة واحدة", hours: 1 },
  { label: "6 ساعات", hours: 6 },
  { label: "24 ساعة", hours: 24 },
  { label: "3 أيام", hours: 72 },
  { label: "7 أيام", hours: 168 },
];

async function renderShareLinksSection() {
  document.getElementById("pageTitle").textContent = "روابط المشاركة";
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:20px;">
      <div class="section-head"><h3>توليد رابط جديد للعرض فقط</h3></div>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">
        الرابط يعطي أي شخص عنده (مشرف، مدير...) صلاحية عرض كل بيانات الموقع (الدرجات، ملف الإنجاز، العروض، الاختبارات) بدون تسجيل دخول وبدون إمكانية تعديل أو حذف. تقدر تنهي أي رابط بأي وقت.
      </p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <select id="durationSelect" style="background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:12px 14px; color:var(--text-primary); font-family:var(--font-body);">
          ${DURATION_OPTIONS.map((d, i) => `<option value="${d.hours}" ${i === 2 ? "selected" : ""}>${d.label}</option>`).join("")}
        </select>
        <button class="btn-add" id="generateLinkBtn">🔗 توليد رابط جديد</button>
      </div>
      <div id="newLinkResult" style="margin-top:16px;"></div>
    </div>

    <div class="section-card">
      <div class="section-head"><h3>الروابط الحالية</h3></div>
      <div id="linksListHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("generateLinkBtn").addEventListener("click", generateShareLink);
  await loadShareLinks();
}

async function generateShareLink() {
  const btn = document.getElementById("generateLinkBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spin"></span>';

  const hours = parseInt(document.getElementById("durationSelect").value, 10);
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const { error } = await supabaseClient.from("share_links").insert({ token, expires_at: expiresAt });

  btn.disabled = false;
  btn.textContent = "🔗 توليد رابط جديد";

  if (error) { alert("تعذر توليد الرابط: " + error.message); return; }

  const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");
  const fullLink = baseUrl + "view.html?token=" + token;

  document.getElementById("newLinkResult").innerHTML = `
    <div class="item-row">
      <div class="info">
        <div class="t">✅ تم توليد الرابط</div>
        <div class="d" style="word-break:break-all;">${fullLink}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" onclick="navigator.clipboard.writeText('${fullLink}'); this.textContent='✓'; setTimeout(()=>this.textContent='📋',1500);" title="نسخ">📋</button>
      </div>
    </div>
  `;

  await loadShareLinks();
}

async function loadShareLinks() {
  const holder = document.getElementById("linksListHolder");
  const { data, error } = await supabaseClient.from("share_links").select("*").order("created_at", { ascending: false });

  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!data || data.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه روابط مولّدة بعد</div>`; return; }

  const now = new Date();

  holder.innerHTML = data.map((link) => {
    const expires = new Date(link.expires_at);
    const isExpired = expires < now;
    const isRevoked = link.revoked;
    let statusLabel = "🟢 نشط";
    if (isRevoked) statusLabel = "⛔ منتهي (أُلغي يدوياً)";
    else if (isExpired) statusLabel = "⏱️ منتهي الصلاحية";

    const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");
    const fullLink = baseUrl + "view.html?token=" + link.token;

    return `
      <div class="item-row">
        <div class="info">
          <div class="t">${statusLabel}</div>
          <div class="d">ينتهي: ${expires.toLocaleString("ar-SA")}</div>
        </div>
        <div class="actions">
          ${!isRevoked && !isExpired ? `
            <button class="icon-btn" onclick="navigator.clipboard.writeText('${fullLink}'); this.textContent='✓'; setTimeout(()=>this.textContent='📋',1500);" title="نسخ الرابط">📋</button>
            <button class="icon-btn danger" onclick="revokeShareLink('${link.id}')" title="إنهاء الآن">⛔</button>
          ` : `<button class="icon-btn danger" onclick="deleteShareLink('${link.id}')" title="حذف من القائمة">🗑</button>`}
        </div>
      </div>
    `;
  }).join("");
}

async function revokeShareLink(id) {
  if (!confirm("متأكد تبي تنهي هذا الرابط الآن؟")) return;
  const { error } = await supabaseClient.from("share_links").update({ revoked: true }).eq("id", id);
  if (error) { alert("تعذر الإنهاء"); return; }
  await loadShareLinks();
}

async function deleteShareLink(id) {
  const { error } = await supabaseClient.from("share_links").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadShareLinks();
}
