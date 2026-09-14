const DURATION_OPTIONS = [
  { label: "ساعة واحدة", hours: 1 }, { label: "6 ساعات", hours: 6 },
  { label: "24 ساعة", hours: 24 }, { label: "3 أيام", hours: 72 }, { label: "7 أيام", hours: 168 },
];

async function renderShareLinksSection() {
  document.getElementById("pageTitle").textContent = "روابط المشاركة";
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:20px;">
      <div class="section-head"><h3>${icon("link")} توليد رابط جديد للعرض فقط</h3></div>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.8;">الرابط يعطي أي شخص عرض كل بيانات الموقع بدون تسجيل دخول وبدون إمكانية تعديل. تقدر تنهي أي رابط بأي وقت.</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <select id="durationSelect" style="background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:12px 14px; color:var(--text-primary); font-family:var(--font-body);">
          ${DURATION_OPTIONS.map((d, i) => `<option value="${d.hours}" ${i === 2 ? "selected" : ""}>${d.label}</option>`).join("")}
        </select>
        <button class="btn-add" id="generateLinkBtn">${icon("link", 14)} توليد رابط جديد</button>
      </div>
      <div id="newLinkResult" style="margin-top:16px;"></div>
    </div>
    <div class="section-card"><div class="section-head"><h3>الروابط الحالية</h3></div><div id="linksListHolder"><div class="empty-state">جاري التحميل...</div></div></div>`;
  document.getElementById("generateLinkBtn").addEventListener("click", generateShareLink);
  await loadShareLinks();
}

async function generateShareLink() {
  const btn = document.getElementById("generateLinkBtn");
  btn.disabled = true; btn.innerHTML = '<span class="loading-spin"></span>';
  const hours = parseInt(document.getElementById("durationSelect").value, 10);
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseClient.from("share_links").insert({ token, expires_at: expiresAt });
  btn.disabled = false; btn.innerHTML = icon("link", 14) + " توليد رابط جديد";
  if (error) { alert("تعذر توليد الرابط: " + error.message); return; }
  const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");
  const fullLink = baseUrl + "view.html?token=" + token;
  document.getElementById("newLinkResult").innerHTML = `
    <div class="section-card" style="background:var(--bg-surface-2); box-shadow:none;">
      <div style="font-weight:700; font-size:13px; margin-bottom:10px; display:flex; align-items:center; gap:8px;">${icon("check", 16)} تم توليد الرابط بنجاح</div>
      <div style="background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:12px 14px; font-size:13px; word-break:break-all; margin-bottom:12px; direction:ltr; text-align:left;">${fullLink}</div>
      <button class="btn-add" style="width:100%; justify-content:center;" id="copyNewLinkBtn">${icon("copy", 15)} نسخ الرابط</button>
    </div>`;
  document.getElementById("copyNewLinkBtn").addEventListener("click", function () {
    navigator.clipboard.writeText(fullLink);
    this.innerHTML = `${icon("check", 15)} تم النسخ`;
    hydrateIcons(this);
    setTimeout(() => { this.innerHTML = `${icon("copy", 15)} نسخ الرابط`; hydrateIcons(this); }, 1800);
  });
  hydrateIcons(document.getElementById("newLinkResult"));
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
    let statusLabel = "نشط", statusIcon = "check";
    if (isRevoked) { statusLabel = "منتهي (أُلغي يدوياً)"; statusIcon = "ban"; }
    else if (isExpired) { statusLabel = "منتهي الصلاحية"; statusIcon = "clock"; }
    const baseUrl = window.location.href.replace(/dashboard\.html.*$/, "");
    const fullLink = baseUrl + "view.html?token=" + link.token;
    return `
      <div class="section-card" style="background:var(--bg-surface-2); box-shadow:none; margin-bottom:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:${!isRevoked && !isExpired ? "10px" : "0"};">
          <div style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:8px;">${icon(statusIcon, 16)} ${statusLabel}</div>
          <div style="font-size:12px; color:var(--text-muted);">ينتهي: ${expires.toLocaleString("ar-SA")}</div>
          ${isRevoked || isExpired ? `<button class="icon-btn danger" onclick="deleteShareLink('${link.id}')" title="حذف من القائمة">${icon("trash", 15)}</button>` : ""}
        </div>
        ${!isRevoked && !isExpired ? `
          <div style="background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:10px 12px; font-size:12px; word-break:break-all; margin-bottom:10px; direction:ltr; text-align:left;">${fullLink}</div>
          <div style="display:flex; gap:8px;">
            <button class="btn-add copy-link-btn" data-link="${fullLink}" style="flex:1; justify-content:center;">${icon("copy", 14)} نسخ الرابط</button>
            <button class="btn-secondary" style="width:auto; padding:10px 16px; border-color:var(--danger); color:var(--danger);" onclick="revokeShareLink('${link.id}')">${icon("ban", 15)} إنهاء</button>
          </div>` : ""}
      </div>`;
  }).join("");
  document.querySelectorAll(".copy-link-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(this.dataset.link);
      const original = this.innerHTML;
      this.innerHTML = `${icon("check", 14)} تم النسخ`;
      hydrateIcons(this);
      setTimeout(() => { this.innerHTML = original; hydrateIcons(this); }, 1800);
    });
  });
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
