const roleLabels = { teacher: "المعلم", student: "الطالب", supervisor: "المشرف" };
let currentProfile = null;

async function guardAndLoad() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) { window.location.href = "index.html"; return; }
  const userId = sessionData.session.user.id;
  const { data: profile, error } = await supabaseClient.from("users_profile").select("*").eq("id", userId).single();
  if (error || !profile) { await supabaseClient.auth.signOut(); window.location.href = "index.html"; return; }
  currentProfile = profile;
  renderUserInfo(profile); renderNavByRole(profile.role); loadHomeStats();
}
function renderUserInfo(profile) {
  document.getElementById("userName").textContent = profile.full_name;
  document.getElementById("userAvatar").textContent = profile.full_name.charAt(0);
  document.getElementById("roleTag").textContent = "الدور: " + (roleLabels[profile.role] || profile.role);
}
function renderNavByRole(role) { if (role !== "teacher") document.getElementById("teacherNav").style.display = "none"; }

async function loadHomeStats() {
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="stat-grid" id="statGrid">
      <div class="stat-card"><div class="num">–</div><div class="lbl">عناصر ملف الإنجاز</div></div>
      <div class="stat-card"><div class="num">–</div><div class="lbl">الطلاب المسجلين</div></div>
      <div class="stat-card"><div class="num">–</div><div class="lbl">الفصول الدراسية</div></div>
      <div class="stat-card"><div class="num">–</div><div class="lbl">روابط الصفوف</div></div>
    </div>
    <div class="section-card"><div class="section-head"><h3>مرحباً، ${currentProfile.full_name} 👋</h3></div><p style="color:var(--text-muted); font-size:14px; line-height:1.9;">استخدم القائمة الجانبية للتنقل بين الأقسام.</p></div>`;
  if (currentProfile.role === "teacher") {
    const [portfolio, students, classes, extLinks] = await Promise.all([
      supabaseClient.from("content_items").select("id, content_sections!inner(module)", { count: "exact", head: true }).eq("content_sections.module", "portfolio"),
      supabaseClient.from("students").select("id", { count: "exact", head: true }),
      supabaseClient.from("classes").select("id", { count: "exact", head: true }),
      supabaseClient.from("external_links").select("id", { count: "exact", head: true }),
    ]);
    const nums = document.querySelectorAll("#statGrid .num");
    nums[0].textContent = portfolio.count ?? 0;
    nums[1].textContent = students.count ?? 0;
    nums[2].textContent = classes.count ?? 0;
    nums[3].textContent = extLinks.count ?? 0;
  }
}

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    const section = link.dataset.section;
    if (section === "home") { document.getElementById("pageTitle").textContent = "نظرة عامة"; loadHomeStats(); }
    else if (section === "portfolio") renderPortfolioSection();
    else if (section === "classes") renderClassesSection();
    else if (section === "sharelinks") renderShareLinksSection();
    else if (section === "externallinks") renderExternalLinksSection();
    document.getElementById("sidebar").classList.remove("open");
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => { await supabaseClient.auth.signOut(); window.location.href = "index.html"; });
document.getElementById("hamburger")?.addEventListener("click", () => { document.getElementById("sidebar").classList.toggle("open"); });

guardAndLoad();
