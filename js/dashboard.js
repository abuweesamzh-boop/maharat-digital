let currentProfile = null;

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    const holder = el.querySelector(".nav-ic") || el;
    const name = el.getAttribute("data-icon");
    if (holder && !holder.querySelector("svg")) {
      holder.innerHTML = (ICONS[name] || ICONS.folder);
    }
  });
}

async function guardAndLoad() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "index.html"; return; }
  const { data: profile } = await supabaseClient
    .from("users_profile").select("*").eq("id", session.user.id).single();
  if (!profile) { window.location.href = "index.html"; return; }
  currentProfile = profile;
  document.getElementById("topbarUser").textContent = profile.full_name || "";
  document.getElementById("userRoleTag").textContent =
    profile.role === "teacher" ? "معلم" : profile.role === "student" ? "طالب" : "مشرف";
  renderNavByRole(profile.role);
  hydrateIcons(document);
  loadHomeStats();
}

function renderNavByRole(role) {
  document.querySelectorAll(".teacherNav").forEach(el => {
    el.style.display = (role === "teacher") ? "" : "none";
  });
}

async function loadHomeStats() {
  const el = document.getElementById("contentArea");
  el.innerHTML = `<div class="loading-placeholder">جاري التحميل...</div>`;
  try {
    const [p, s, c, ext] = await Promise.all([
      supabaseClient.from("content_items").select("id", { count: "exact", head: true }).eq("module", "portfolio"),
      supabaseClient.from("students").select("id", { count: "exact", head: true }),
      supabaseClient.from("classes").select("id", { count: "exact", head: true }),
      supabaseClient.from("content_items").select("id", { count: "exact", head: true }).eq("module", "external"),
    ]);
    el.innerHTML = `
      <div class="page-head"><h2>مرحباً، ${currentProfile.full_name}</h2><p class="muted">نظرة سريعة على منصتك</p></div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-ic">${icon("folder",22)}</div><div><strong>${p.count ?? 0}</strong><span>ملفات ملف الإنجاز</span></div></div>
        <div class="stat-card"><div class="stat-ic">${icon("users",22)}</div><div><strong>${s.count ?? 0}</strong><span>طالب مسجل</span></div></div>
        <div class="stat-card"><div class="stat-ic">${icon("list",22)}</div><div><strong>${c.count ?? 0}</strong><span>فصل دراسي</span></div></div>
        <div class="stat-card"><div class="stat-ic">${icon("rocket",22)}</div><div><strong>${ext.count ?? 0}</strong><span>عنصر بمهارات الصفوف</span></div></div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="page-head"><h2>مرحباً، ${currentProfile.full_name}</h2></div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  guardAndLoad();
  document.querySelectorAll(".nav-item[data-section]").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      document.getElementById("topbarTitle").textContent = item.textContent.trim();
      const section = item.getAttribute("data-section");
      routeSection(section);
      document.getElementById("sidebar").classList.remove("open");
    });
  });
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
  const menuToggle = document.getElementById("menuToggle");
  if (menuToggle) menuToggle.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
});

function routeSection(section) {
  switch (section) {
    case "home": loadHomeStats(); break;
    case "portfolio": renderPortfolioSection(); break;
    case "classes": renderClassesSection(); break;
    case "externallinks": renderExternalLinksSection(); break;
    case "sharelinks": renderShareLinksSection(); break;
    case "cv": renderCVSection(); break;
    default: loadHomeStats();
  }
}
