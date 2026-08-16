// ============================================
// الحصة التفاعلية: بنك دروس + مشغّل جلسة + فرق + عجلة
// ============================================

const TEAM_COLORS = ["#FF7A8A", "#F5A623", "#2DD8C8", "#B892FF", "#5FD068", "#5FA8FF"];
const TEAM_NAMES = ["الفريق الوردي", "الفريق الذهبي", "الفريق الفيروزي", "الفريق البنفسجي", "الفريق الأخضر", "الفريق الأزرق"];

let currentLesson = null;
let currentLessonSlides = [];

// ============================================
// 1) بنك الدروس
// ============================================

async function renderLessonsSection() {
  document.getElementById("pageTitle").textContent = "الحصة التفاعلية";
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="section-card">
      <div class="section-head"><h3>بنك الدروس</h3><button class="btn-add" id="addLessonBtn">+ إضافة درس جديد</button></div>
      <div id="lessonsHolder" class="folder-grid"><div class="empty-state">جاري التحميل...</div></div>
    </div>`;
  document.getElementById("addLessonBtn").addEventListener("click", openAddLessonModal);
  await loadLessons();
}

async function loadLessons() {
  const holder = document.getElementById("lessonsHolder");
  const { data: lessons, error } = await supabaseClient.from("lessons").select("*").order("created_at", { ascending: true });
  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  if (!lessons || lessons.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه دروس بعد — أضف درس جديد للبدء</div>`; return; }

  const counts = await Promise.all(lessons.map((l) => supabaseClient.from("lesson_slides").select("id", { count: "exact", head: true }).eq("lesson_id", l.id)));

  holder.innerHTML = lessons.map((l, i) => `
    <div class="folder-card" style="--folder-color:${TEAM_COLORS[i % TEAM_COLORS.length]}" onclick="openLessonEditor('${l.id}', '${escapeAttrLs(l.title)}')">
      <button class="folder-delete" onclick="event.stopPropagation(); deleteLesson('${l.id}')" title="حذف">✕</button>
      <div class="folder-avatar">${(l.title || "?").charAt(0)}</div>
      <div class="folder-title">${escapeHtmlLs(l.title)}</div>
      <div class="folder-meta">${counts[i].count ?? 0} شريحة</div>
    </div>`).join("");
}

function escapeHtmlLs(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }
function escapeAttrLs(str) { return (str || "").replace(/'/g, "&#39;"); }

function openAddLessonModal() {
  document.getElementById("modalTitle").textContent = "إضافة درس جديد";
  document.getElementById("modalFields").innerHTML = `<div class="field"><label>عنوان الدرس</label><input type="text" id="l_title" required /></div>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';
    const title = document.getElementById("l_title").value.trim();
    const { error } = await supabaseClient.from("lessons").insert({ title });
    submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    if (error) { alert("تعذر الإضافة"); return; }
    document.getElementById("modalOverlay").classList.remove("show");
    await loadLessons();
  };
  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

async function deleteLesson(id) {
  if (!confirm("متأكد تبي تحذف هذا الدرس؟ سيتم حذف كل شرائحه.")) return;
  const { error } = await supabaseClient.from("lessons").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadLessons();
}

// ============================================
// 2) محرر الدرس (الشرائح)
// ============================================

async function openLessonEditor(lessonId, title) {
  currentLesson = { id: lessonId, title };
  document.getElementById("pageTitle").textContent = title;
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `
    <div class="breadcrumb-nav"><span class="crumb" onclick="renderLessonsSection()">الحصة التفاعلية</span><span>/</span><span class="crumb current">${escapeHtmlLs(title)}</span></div>
    <div class="section-card" style="margin-bottom:18px;">
      <div class="section-head">
        <h3>شرائح الدرس</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn-secondary" style="width:auto; padding:9px 16px;" id="addContentSlideBtn">📖 + شريحة شرح</button>
          <button class="btn-secondary" style="width:auto; padding:9px 16px;" id="addQuestionSlideBtn">❓ + شريحة سؤال</button>
        </div>
      </div>
      <div id="slidesHolder"><div class="empty-state">جاري التحميل...</div></div>
    </div>
    <button class="btn-add" id="startSessionBtn" style="width:100%; padding:16px; font-size:15px;">▶️ بدء حصة تفاعلية بهذا الدرس</button>
  `;
  document.getElementById("addContentSlideBtn").addEventListener("click", () => openSlideModal("content"));
  document.getElementById("addQuestionSlideBtn").addEventListener("click", () => openSlideModal("question"));
  document.getElementById("startSessionBtn").addEventListener("click", openSessionSetupModal);
  await loadSlides();
}

async function loadSlides() {
  const holder = document.getElementById("slidesHolder");
  const { data, error } = await supabaseClient.from("lesson_slides").select("*").eq("lesson_id", currentLesson.id).order("order_index", { ascending: true });
  if (error) { holder.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }
  currentLessonSlides = data || [];
  if (currentLessonSlides.length === 0) { holder.innerHTML = `<div class="empty-state">ما فيه شرائح بعد — أضف شريحة شرح أو سؤال</div>`; return; }

  holder.innerHTML = currentLessonSlides.map((s, i) => `
    <div class="item-row">
      <div class="info">
        <div class="t">${s.slide_type === "content" ? "📖" : "❓"} ${i + 1}. ${escapeHtmlLs(s.slide_type === "content" ? s.heading : s.question_text)}</div>
        <div class="d">${s.slide_type === "content" ? "شريحة شرح" : "شريحة سؤال"}</div>
      </div>
      <div class="actions">
        <button class="icon-btn" onclick="moveSlide('${s.id}', -1)" title="تحريك لأعلى" ${i === 0 ? "disabled" : ""}>▲</button>
        <button class="icon-btn" onclick="moveSlide('${s.id}', 1)" title="تحريك لأسفل" ${i === currentLessonSlides.length - 1 ? "disabled" : ""}>▼</button>
        <button class="icon-btn" onclick="editSlide('${s.id}')" title="تعديل">✏️</button>
        <button class="icon-btn danger" onclick="deleteSlide('${s.id}')" title="حذف">🗑</button>
      </div>
    </div>`).join("");
}

async function moveSlide(slideId, direction) {
  const idx = currentLessonSlides.findIndex((s) => s.id === slideId);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= currentLessonSlides.length) return;

  const a = currentLessonSlides[idx], b = currentLessonSlides[swapIdx];
  await supabaseClient.from("lesson_slides").update({ order_index: b.order_index }).eq("id", a.id);
  await supabaseClient.from("lesson_slides").update({ order_index: a.order_index }).eq("id", b.id);
  await loadSlides();
}

function openSlideModal(type, existingSlide) {
  const isEdit = !!existingSlide;
  document.getElementById("modalTitle").textContent = isEdit ? "تعديل الشريحة" : (type === "content" ? "إضافة شريحة شرح" : "إضافة شريحة سؤال");

  if (type === "content") {
    document.getElementById("modalFields").innerHTML = `
      <div class="field"><label>عنوان الشريحة</label><input type="text" id="sl_heading" value="${existingSlide ? escapeAttrLs(existingSlide.heading) : ""}" required /></div>
      <div class="field"><label>نص الشرح</label><input type="text" id="sl_body" value="${existingSlide ? escapeAttrLs(existingSlide.body_text || "") : ""}" /></div>
      <div class="field"><label>صورة (اختياري)</label><input type="file" id="sl_image" accept="image/*" /></div>
      ${existingSlide && existingSlide.image_url ? `<p style="font-size:12px; color:var(--text-muted);">فيه صورة مرفوعة مسبقاً — اختر ملف جديد لاستبدالها بس</p>` : ""}
    `;
  } else {
    document.getElementById("modalFields").innerHTML = `
      <div class="field"><label>نص السؤال</label><input type="text" id="sl_question" value="${existingSlide ? escapeAttrLs(existingSlide.question_text) : ""}" required /></div>
      <div class="field"><label>الخيار أ</label><input type="text" id="sl_a" value="${existingSlide ? escapeAttrLs(existingSlide.option_a || "") : ""}" required /></div>
      <div class="field"><label>الخيار ب</label><input type="text" id="sl_b" value="${existingSlide ? escapeAttrLs(existingSlide.option_b || "") : ""}" required /></div>
      <div class="field"><label>الخيار ج</label><input type="text" id="sl_c" value="${existingSlide ? escapeAttrLs(existingSlide.option_c || "") : ""}" /></div>
      <div class="field"><label>الخيار د</label><input type="text" id="sl_d" value="${existingSlide ? escapeAttrLs(existingSlide.option_d || "") : ""}" /></div>
      <div class="field"><label>الإجابة الصحيحة</label>
        <select id="sl_correct" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body);">
          <option value="a" ${existingSlide && existingSlide.correct_option === "a" ? "selected" : ""}>أ</option>
          <option value="b" ${existingSlide && existingSlide.correct_option === "b" ? "selected" : ""}>ب</option>
          <option value="c" ${existingSlide && existingSlide.correct_option === "c" ? "selected" : ""}>ج</option>
          <option value="d" ${existingSlide && existingSlide.correct_option === "d" ? "selected" : ""}>د</option>
        </select>
      </div>
    `;
  }

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true; submitBtn.innerHTML = '<span class="loading-spin"></span>';

    try {
      let payload = { lesson_id: currentLesson.id, slide_type: type };

      if (type === "content") {
        payload.heading = document.getElementById("sl_heading").value.trim();
        payload.body_text = document.getElementById("sl_body").value.trim();
        const file = document.getElementById("sl_image").files[0];
        if (file) {
          const filePath = `lessons/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
          const { error: upErr } = await supabaseClient.storage.from("maharat-files").upload(filePath, file);
          if (upErr) throw upErr;
          const { data: pub } = await supabaseClient.storage.from("maharat-files").getPublicUrl(filePath);
          payload.image_url = pub.publicUrl;
        }
      } else {
        payload.question_text = document.getElementById("sl_question").value.trim();
        payload.option_a = document.getElementById("sl_a").value.trim();
        payload.option_b = document.getElementById("sl_b").value.trim();
        payload.option_c = document.getElementById("sl_c").value.trim();
        payload.option_d = document.getElementById("sl_d").value.trim();
        payload.correct_option = document.getElementById("sl_correct").value;
      }

      if (isEdit) {
        const { error } = await supabaseClient.from("lesson_slides").update(payload).eq("id", existingSlide.id);
        if (error) throw error;
      } else {
        payload.order_index = currentLessonSlides.length;
        const { error } = await supabaseClient.from("lesson_slides").insert(payload);
        if (error) throw error;
      }

      document.getElementById("modalOverlay").classList.remove("show");
      await loadSlides();
    } catch (err) {
      alert("حدث خطأ: " + (err.message || "تعذر الحفظ"));
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = "حفظ";
    }
  };

  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

function editSlide(slideId) {
  const slide = currentLessonSlides.find((s) => s.id === slideId);
  if (!slide) return;
  openSlideModal(slide.slide_type, slide);
}

async function deleteSlide(id) {
  if (!confirm("متأكد تبي تحذف هذي الشريحة؟")) return;
  const { error } = await supabaseClient.from("lesson_slides").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadSlides();
}

// ============================================
// 3) إعداد الجلسة (اختيار الفصل وعدد الفرق)
// ============================================

function openSessionSetupModal() {
  document.getElementById("modalTitle").textContent = "بدء حصة تفاعلية";
  document.getElementById("modalFields").innerHTML = `
    <div class="field"><label>الفصل</label><select id="ss_class" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body);"><option>جاري التحميل...</option></select></div>
    <div class="field"><label>عدد الفرق</label><select id="ss_teams" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body);">
      <option value="2">فريقين</option><option value="3" selected>3 فرق</option><option value="4">4 فرق</option><option value="5">5 فرق</option><option value="6">6 فرق</option>
    </select></div>
  `;
  document.getElementById("modalOverlay").classList.add("show");

  (async () => {
    const { data: classes } = await supabaseClient.from("classes").select("*").order("created_at");
    const sel = document.getElementById("ss_class");
    if (!classes || classes.length === 0) { sel.innerHTML = `<option value="">ما فيه فصول — أضف فصل أولاً</option>`; return; }
    sel.innerHTML = classes.map((c) => `<option value="${c.id}">${escapeHtmlLs(c.title)}</option>`).join("");
  })();

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const classId = document.getElementById("ss_class").value;
    const teamCount = parseInt(document.getElementById("ss_teams").value, 10);
    if (!classId) { alert("اختر فصل أولاً"); return; }

    const { data: students } = await supabaseClient.from("students").select("*").eq("class_id", classId);
    if (!students || students.length === 0) { alert("هذا الفصل ما فيه طلاب"); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    startInteractiveSession(classId, students, teamCount);
  };

  document.getElementById("modalCancel").onclick = () => document.getElementById("modalOverlay").classList.remove("show");
}

// ============================================
// 4) مشغّل الحصة التفاعلية
// ============================================

let sessionTeams = [];
let sessionSlides = [];
let sessionSlideIndex = 0;
let sessionClassId = null;
let sessionStudentStats = {}; // studentId -> {correct: n}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startInteractiveSession(classId, students, teamCount) {
  sessionClassId = classId;
  const shuffled = shuffleArray(students);
  sessionTeams = Array.from({ length: teamCount }, (_, i) => ({
    name: TEAM_NAMES[i], color: TEAM_COLORS[i], score: 0, students: [],
  }));
  shuffled.forEach((st, i) => sessionTeams[i % teamCount].students.push(st));

  sessionStudentStats = {};
  students.forEach((st) => (sessionStudentStats[st.id] = { correct: 0, name: st.full_name }));

  const { data: slides } = await supabaseClient.from("lesson_slides").select("*").eq("lesson_id", currentLesson.id).order("order_index", { ascending: true });
  sessionSlides = slides || [];
  sessionSlideIndex = 0;

  if (sessionSlides.length === 0) { alert("هذا الدرس ما فيه شرائح بعد"); return; }

  renderSessionPlayer();
}

function renderSessionPlayer() {
  const contentArea = document.getElementById("contentArea");
  document.getElementById("pageTitle").textContent = "🎮 حصة تفاعلية — " + currentLesson.title;

  contentArea.innerHTML = `
    <div class="scoreboard-row" id="scoreboardRow"></div>
    <div class="section-card" id="slideStage" style="min-height:340px;"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
      <button class="btn-secondary" style="width:auto; padding:12px 20px;" id="prevSlideBtn">◀ السابق</button>
      <div style="color:var(--text-muted); font-size:13px;">شريحة ${sessionSlideIndex + 1} من ${sessionSlides.length}</div>
      <button class="btn-add" style="width:auto; padding:12px 20px;" id="nextSlideBtn">${sessionSlideIndex === sessionSlides.length - 1 ? "إنهاء الحصة 🏁" : "التالي ▶"}</button>
    </div>
  `;

  renderScoreboard();
  renderCurrentSlide();

  document.getElementById("prevSlideBtn").addEventListener("click", () => {
    if (sessionSlideIndex > 0) { sessionSlideIndex--; renderSessionPlayer(); }
  });
  document.getElementById("nextSlideBtn").addEventListener("click", () => {
    if (sessionSlideIndex < sessionSlides.length - 1) { sessionSlideIndex++; renderSessionPlayer(); }
    else { renderSessionResults(); }
  });

  document.getElementById("prevSlideBtn").disabled = sessionSlideIndex === 0;
}

function renderScoreboard() {
  const row = document.getElementById("scoreboardRow");
  const sorted = [...sessionTeams].sort((a, b) => b.score - a.score);
  row.innerHTML = sorted.map((t) => `
    <div class="team-badge" style="--team-color:${t.color};">
      <div class="team-badge-name">${t.name}</div>
      <div class="team-badge-score">${t.score}</div>
    </div>
  `).join("");
}

function renderCurrentSlide() {
  const stage = document.getElementById("slideStage");
  const slide = sessionSlides[sessionSlideIndex];

  if (slide.slide_type === "content") {
    stage.innerHTML = `
      <div style="text-align:center; padding:20px;">
        <h2 style="font-family:var(--font-display); font-size:28px; margin-bottom:20px;">${escapeHtmlLs(slide.heading)}</h2>
        ${slide.image_url ? `<img src="${slide.image_url}" style="max-width:100%; max-height:320px; border-radius:14px; margin-bottom:20px;" />` : ""}
        <p style="font-size:17px; line-height:2; color:var(--text-primary); max-width:700px; margin:0 auto;">${escapeHtmlLs(slide.body_text || "")}</p>
      </div>
    `;
  } else {
    const opts = [
      { key: "a", text: slide.option_a }, { key: "b", text: slide.option_b },
      { key: "c", text: slide.option_c }, { key: "d", text: slide.option_d },
    ].filter((o) => o.text);

    stage.innerHTML = `
      <h2 style="font-family:var(--font-display); font-size:22px; margin-bottom:24px; text-align:center;">❓ ${escapeHtmlLs(slide.question_text)}</h2>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:12px; margin-bottom:24px;">
        ${opts.map((o) => `<div class="quiz-option" data-key="${o.key}" id="opt_${o.key}">${o.key.toUpperCase()}) ${escapeHtmlLs(o.text)}</div>`).join("")}
      </div>
      <div id="pickedStudentBox" style="text-align:center; margin-bottom:16px; min-height:24px; font-weight:700;"></div>
      <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
        <button class="btn-add" id="spinWheelBtn" style="width:auto; padding:12px 24px;">🎡 أدر العجلة</button>
        <button class="btn-secondary" style="width:auto; padding:12px 24px; display:none;" id="showAnswerBtn">👁️ إظهار الإجابة الصحيحة</button>
      </div>
      <div id="scoringRow" style="display:none; justify-content:center; gap:10px; margin-top:16px;"></div>
    `;

    document.getElementById("spinWheelBtn").addEventListener("click", () => openWheelModal(slide));
    document.getElementById("showAnswerBtn").addEventListener("click", () => {
      document.getElementById(`opt_${slide.correct_option}`).classList.add("correct-answer");
    });
  }
}

function findStudentTeam(studentId) {
  return sessionTeams.find((t) => t.students.some((s) => s.id === studentId));
}

function openWheelModal(slide) {
  const allStudents = sessionTeams.flatMap((t) => t.students.map((s) => ({ ...s, teamColor: t.color })));
  if (allStudents.length === 0) return;

  document.getElementById("modalTitle").textContent = "🎡 عجلة الاختيار العشوائي";
  document.getElementById("modalFields").innerHTML = `
    <div style="display:flex; justify-content:center; margin-bottom:20px;">
      <div class="wheel-pointer">▼</div>
    </div>
    <div style="display:flex; justify-content:center;">
      <div class="wheel-wrap">
        <div class="wheel-disc" id="wheelDisc" style="background: conic-gradient(${allStudents.map((s, i) => `${s.teamColor} ${(i * 360) / allStudents.length}deg ${((i + 1) * 360) / allStudents.length}deg`).join(", ")});"></div>
      </div>
    </div>
    <div id="wheelResultBox" style="text-align:center; margin-top:18px; font-size:18px; font-weight:800; min-height:28px;"></div>
  `;
  document.getElementById("modalOverlay").classList.add("show");
  document.querySelector(".modal-actions").style.display = "none";

  const targetIndex = Math.floor(Math.random() * allStudents.length);
  const anglePer = 360 / allStudents.length;
  const spins = 6;
  const finalAngle = spins * 360 + (360 - (targetIndex * anglePer + anglePer / 2));

  const disc = document.getElementById("wheelDisc");
  setTimeout(() => {
    disc.style.transition = "transform 3.5s cubic-bezier(0.17, 0.67, 0.32, 1.02)";
    disc.style.transform = `rotate(${finalAngle}deg)`;
  }, 100);

  setTimeout(() => {
    const picked = allStudents[targetIndex];
    document.getElementById("wheelResultBox").textContent = "🎉 " + picked.full_name;
    setTimeout(() => {
      document.getElementById("modalOverlay").classList.remove("show");
      document.querySelector(".modal-actions").style.display = "";
      showPickedStudent(picked, slide);
    }, 1200);
  }, 3700);
}

function showPickedStudent(student, slide) {
  const team = findStudentTeam(student.id);
  document.getElementById("pickedStudentBox").innerHTML = `🎯 دور: <span style="color:${team.color};">${escapeHtmlLs(student.full_name)}</span> (${team.name})`;
  document.getElementById("showAnswerBtn").style.display = "";

  const scoringRow = document.getElementById("scoringRow");
  scoringRow.style.display = "flex";
  scoringRow.innerHTML = `
    <button class="btn-add" id="correctBtn" style="width:auto; padding:10px 20px; background:var(--success); color:#06231F;">✓ إجابة صحيحة (+10)</button>
    <button class="btn-secondary" id="wrongBtn" style="width:auto; padding:10px 20px; border-color:var(--danger); color:var(--danger);">✕ إجابة خاطئة</button>
  `;

  document.getElementById("correctBtn").addEventListener("click", () => {
    team.score += 10;
    sessionStudentStats[student.id].correct += 1;
    document.getElementById(`opt_${slide.correct_option}`).classList.add("correct-answer");
    renderScoreboard();
    scoringRow.innerHTML = `<div style="color:var(--success); font-weight:700;">✓ تم تسجيل النقاط لفريق ${team.name}</div>`;
  });
  document.getElementById("wrongBtn").addEventListener("click", () => {
    document.getElementById(`opt_${slide.correct_option}`).classList.add("correct-answer");
    renderScoreboard();
    scoringRow.innerHTML = `<div style="color:var(--danger); font-weight:700;">✕ بدون نقاط هالمرة</div>`;
  });
}

// ============================================
// 5) شاشة نتائج الحصة
// ============================================

function renderSessionResults() {
  const contentArea = document.getElementById("contentArea");
  document.getElementById("pageTitle").textContent = "🏁 نتائج الحصة";

  const sortedTeams = [...sessionTeams].sort((a, b) => b.score - a.score);
  const winner = sortedTeams[0];

  const mvp = Object.values(sessionStudentStats).sort((a, b) => b.correct - a.correct)[0];

  contentArea.innerHTML = `
    <div class="section-card" style="text-align:center; padding:40px 20px;">
      <div style="font-size:52px; margin-bottom:10px;">🏆</div>
      <h2 style="font-family:var(--font-display); font-size:26px; margin-bottom:6px;">الفريق الفائز: ${winner.name}</h2>
      <div style="color:var(--accent-cyan); font-size:32px; font-weight:800; margin-bottom:24px;">${winner.score} نقطة</div>

      <div class="scoreboard-row" style="justify-content:center; margin-bottom:24px;">
        ${sortedTeams.map((t) => `<div class="team-badge" style="--team-color:${t.color};"><div class="team-badge-name">${t.name}</div><div class="team-badge-score">${t.score}</div></div>`).join("")}
      </div>

      ${mvp && mvp.correct > 0 ? `<p style="font-size:16px;">⭐ أكثر طالب تفاعل: <b>${escapeHtmlLs(mvp.name)}</b> (${mvp.correct} إجابة صحيحة)</p>` : ""}

      <div style="display:flex; justify-content:center; gap:12px; margin-top:30px; flex-wrap:wrap;">
        <button class="btn-secondary" style="width:auto; padding:12px 24px;" onclick="window.print()">🖨️ طباعة النتائج</button>
        <button class="btn-secondary" style="width:auto; padding:12px 24px;" id="saveResultsBtn">💾 حفظ النتيجة</button>
        <button class="btn-add" style="width:auto; padding:12px 24px;" onclick="renderLessonsSection()">إنهاء والعودة للدروس</button>
      </div>
    </div>
  `;

  document.getElementById("saveResultsBtn").addEventListener("click", async () => {
    const btn = document.getElementById("saveResultsBtn");
    btn.disabled = true; btn.textContent = "...";
    const { error } = await supabaseClient.from("session_results").insert({
      class_id: sessionClassId, lesson_id: currentLesson.id,
      teams_snapshot: sortedTeams.map((t) => ({ name: t.name, score: t.score, students: t.students.map((s) => s.full_name) })),
      mvp_name: mvp ? mvp.name : null,
    });
    if (error) { alert("تعذر الحفظ"); btn.disabled = false; btn.textContent = "💾 حفظ النتيجة"; return; }
    btn.textContent = "✅ تم الحفظ";
  });
}
