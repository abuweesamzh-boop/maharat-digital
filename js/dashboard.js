const roleLabels = { teacher: "المعلم", student: "الطالب", supervisor: "المشرف" };
let currentProfile = null;

function hydrateIcons(root) {
  (root || document).querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (ICONS[name]) el.innerHTML = ICONS[name];
  });
}

async function guardAndLoad() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) { window.location.href = "index.html"; return; }
  const userId = sessionData.session.user.id;
  const { data: profile, error } = await supabaseClient.from("users_profile").select("*").eq("id", userId).single();
  if (error || !profile) { await supabaseClient.auth.signOut(); window.location.href = "index.html"; return; }
  currentProfile = profile;
  renderUserInfo(profile); renderNavByRole(profile.role); loadHomeStats();
  hydrateIcons(document);
}
function renderUserInfo(profile) {
  document.getElementById("userName").textContent = profile.full_name;
  document.getElementById("userAvatar").textContent = profile.full_name.charAt(0);
  document.getElementById("roleTag").textContent = "الدور: " + (roleLabels[profile.role] || profile.role);
}
function renderNavByRole(role) { if (role !== "teacher") document.getElementById("teacherNav").style.display = "none"; }

function homeEsc(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function homeAttr(str) { return (str || "").replace(/'/g, "&#39;"); }

function goToSection(section) {
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (link) link.click();
}

function homeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "صباح الخير" : (h < 18 ? "مساء الخير" : "مساء النور");
}

async function loadHomeStats() {
  const contentArea = document.getElementById("contentArea");
  const isTeacher = currentProfile.role === "teacher";
  const today = new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  contentArea.innerHTML = `
    <div class="home-hero">
      <div class="home-hero-text">
        <div class="home-hero-date">${icon("calendar", 14)} ${today}</div>
        <h2>${homeGreeting()}، ${homeEsc(currentProfile.full_name)}</h2>
        <p>ملخص سريع لعملك اليوم — ابدأ من الاختصارات أو افتح أحد فصولك.</p>
      </div>
      ${isTeacher ? `<div class="home-hero-actions">
        <button class="hero-btn solid" onclick="goToSection('classes')">${icon("list", 15)} سجل المتابعة</button>
        <button class="hero-btn" onclick="goToSection('portfolio')">${icon("folder", 15)} ملف الإنجاز</button>
        <button class="hero-btn" onclick="goToSection('sharelinks')">${icon("link", 15)} رابط مشاركة</button>
      </div>` : ""}
    </div>
    <div class="stat-grid" id="statGrid">
      <div class="stat-card"><div class="stat-icon-badge">${icon("folder", 20)}</div><div class="num">–</div><div class="lbl">عناصر ملف الإنجاز</div></div>
      <div class="stat-card"><div class="stat-icon-badge">${icon("users", 20)}</div><div class="num">–</div><div class="lbl">الطلاب المسجلين</div></div>
      <div class="stat-card"><div class="stat-icon-badge">${icon("list", 20)}</div><div class="num">–</div><div class="lbl">الفصول الدراسية</div></div>
      <div class="stat-card"><div class="stat-icon-badge">${icon("link", 20)}</div><div class="num">–</div><div class="lbl">روابط الصفوف</div></div>
    </div>
    ${isTeacher ? `<div class="home-cols">
      <div class="section-card"><div class="section-head"><h3>${icon("users")} فصولي</h3></div><div id="homeClasses"><div class="empty-state" style="padding:20px;">جاري التحميل...</div></div></div>
      <div class="section-card"><div class="section-head"><h3>${icon("note")} آخر النشاط</h3></div><div id="homeActivity"><div class="empty-state" style="padding:20px;">جاري التحميل...</div></div></div>
    </div>` : ""}`;
  hydrateIcons(contentArea);
  if (!isTeacher) return;
  const [portfolio, students, classes, extLinks] = await Promise.all([
    supabaseClient.from("content_items").select("id, content_sections!inner(module)", { count: "exact", head: true }).eq("content_sections.module", "portfolio"),
    supabaseClient.from("students").select("id", { count: "exact", head: true }),
    supabaseClient.from("classes").select("id", { count: "exact", head: true }),
    supabaseClient.from("external_links").select("id", { count: "exact", head: true }),
  ]);
  const nums = document.querySelectorAll("#statGrid .num");
  if (nums.length < 4) return;
  nums[0].textContent = portfolio.count ?? 0;
  nums[1].textContent = students.count ?? 0;
  nums[2].textContent = classes.count ?? 0;
  nums[3].textContent = extLinks.count ?? 0;
  loadHomeClassesAndActivity();
}

async function loadHomeClassesAndActivity() {
  const clsEl = document.getElementById("homeClasses");
  const actEl = document.getElementById("homeActivity");
  if (!clsEl || !actEl) return;
  const { data: classes } = await supabaseClient.from("classes").select("*").order("created_at", { ascending: true });
  const list = classes || [];
  const palette = (typeof CLASS_COLORS !== "undefined") ? CLASS_COLORS : ["#4338CA"];
  clsEl.innerHTML = list.length === 0
    ? `<div class="empty-state" style="padding:20px;">ما فيه فصول بعد</div>`
    : `<div class="home-class-list">` + list.map((c, i) => `
      <div class="home-class" style="--hc:${palette[i % palette.length]}" onclick="openClassFromHome('${c.id}', '${homeAttr(c.title)}', ${i})">
        <span class="home-class-dot">${icon("users", 15)}</span>
        <span class="home-class-name">${homeEsc(c.title)}</span>
        <span class="home-class-go">${icon("back", 14)}</span>
      </div>`).join("") + `</div>`;
  hydrateIcons(clsEl);
  const clsMap = {}; list.forEach((c) => (clsMap[c.id] = c.title));
  const [sess, notes] = await Promise.all([
    supabaseClient.from("class_sessions").select("*").order("created_at", { ascending: false }).limit(4),
    supabaseClient.from("behavior_notes").select("*").order("created_at", { ascending: false }).limit(4),
  ]);
  const noteRows = notes.data || [];
  const stIds = [...new Set(noteRows.map((n) => n.student_id).filter(Boolean))];
  let stMap = {};
  if (stIds.length) {
    const { data: sts } = await supabaseClient.from("students").select("id, full_name").in("id", stIds);
    (sts || []).forEach((x) => (stMap[x.id] = x.full_name));
  }
  const items = [];
  (sess.data || []).forEach((x) => items.push({
    t: x.created_at, kind: "sess",
    title: (x.session_kind === "continuous" ? "حصة " : "اختبار ") + x.session_number + (x.lesson_title ? " — " + x.lesson_title : ""),
    sub: clsMap[x.class_id] || "",
  }));
  noteRows.forEach((n) => items.push({
    t: n.created_at, kind: n.note_type === "negative" ? "neg" : "pos",
    title: n.note, sub: stMap[n.student_id] || "",
  }));
  items.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  const top = items.slice(0, 6);
  actEl.innerHTML = top.length === 0
    ? `<div class="empty-state" style="padding:20px;">لا يوجد نشاط بعد</div>`
    : `<div class="home-activity-list">` + top.map((it) => `
      <div class="act-row"><span class="act-dot ${it.kind}"></span><div class="act-body"><div class="act-title">${homeEsc(it.title)}</div><div class="act-sub">${homeEsc(it.sub)}${it.t ? (it.sub ? " · " : "") + new Date(it.t).toLocaleDateString("ar-SA") : ""}</div></div></div>`).join("") + `</div>`;
}

function openClassFromHome(id, title, idx) {
  window.__classColorIndex = window.__classColorIndex || {};
  window.__classColorIndex[id] = idx;
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.toggle("active", l.dataset.section === "classes"));
  openClass(id, title);
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
    else if (section === "cv") renderCVSection();
    document.getElementById("sidebar").classList.remove("open");
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => { await supabaseClient.auth.signOut(); window.location.href = "index.html"; });
document.getElementById("hamburger")?.addEventListener("click", () => { document.getElementById("sidebar").classList.toggle("open"); });

guardAndLoad();
