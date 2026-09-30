const SHARE_EXPIRY_OPTIONS = [
  { label: "ساعة واحدة", hours: 1 },
  { label: "6 ساعات", hours: 6 },
  { label: "24 ساعة", hours: 24 },
  { label: "3 أيام", hours: 72 },
  { label: "7 أيام", hours: 168 },
];

function renderShareLinksSection(){
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="loadHomeStats()">${icon("back",18)}<span>رجوع للرئيسية</span></button>
      <h2>روابط المشاركة</h2>
      <p class="muted">أنشئ رابط مشاهدة للمشرف بصلاحية قراءة فقط ومدة صلاحية محددة.</p>
    </div>
    <div class="toolbar-row">
      <select id="shareExpirySelect">
        ${SHARE_EXPIRY_OPTIONS.map(o => `<option value="${o.hours}">${o.label}</option>`).join("")}
      </select>
      <button class="btn-primary" onclick="createShareLink()">${icon("plus",16)}<span>رابط جديد</span></button>
    </div>
    <div id="shareLinksList" class="items-list"></div>
  `;
  hydrateIcons(el);
  loadShareLinks();
}

async function createShareLink(){
  const hours = parseInt(document.getElementById("shareExpirySelect").value);
  const token = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2));
  const expires_at = new Date(Date.now() + hours*3600*1000).toISOString();
  await supabaseClient.from("share_links").insert({ token, expires_at });
  loadShareLinks();
}

async function loadShareLinks(){
  const holder = document.getElementById("shareLinksList");
  const { data } = await supabaseClient.from("share_links").select("*").order("created_at", { ascending: false });
  const list = data || [];
  if (!list.length) { holder.innerHTML = `<p class="muted">لا توجد روابط بعد.</p>`; return; }
  holder.innerHTML = list.map(l => {
    const url = `${window.location.origin}${window.location.pathname.replace('dashboard.html','')}view.html?token=${l.token}`;
    const expired = new Date(l.expires_at) < new Date();
    return `
    <div class="item-row share-row">
      <div class="item-main">
        ${icon(expired ? "ban" : "clock", 18)}
        <span>${expired ? "منتهي" : "فعّال"} — ينتهي: ${new Date(l.expires_at).toLocaleString('ar-SA')}</span>
      </div>
      <div class="link-box">${url}</div>
      <div class="item-actions">
        <button class="btn-secondary" onclick="navigator.clipboard.writeText('${url}');this.textContent='تم النسخ ✓';setTimeout(()=>this.textContent='نسخ الرابط',1500);">نسخ الرابط</button>
        <button class="mini-btn danger" title="حذف" onclick="deleteShareLink('${l.id}')">${icon("trash",15)}</button>
      </div>
    </div>`;
  }).join("");
  hydrateIcons(holder);
}
async function deleteShareLink(id){
  if (!confirm("حذف/إلغاء هذا الرابط؟")) return;
  await supabaseClient.from("share_links").delete().eq("id", id);
  loadShareLinks();
}
