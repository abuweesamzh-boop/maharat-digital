// ============================================
// السيرة الذاتية: نموذج تعبئة + معاينة حية + تنزيل Word/PDF
// ============================================

let cvData = null;
let cvSectionsPool = []; // كل أقسام ملف الإنجاز (رئيسية) مع مرفقاتها لبناء السيرة

async function renderCVSection() {
  document.getElementById("pageTitle").textContent = "السيرة الذاتية";
  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = `<div class="empty-state">جاري التحميل...</div>`;

  const { data: rows } = await supabaseClient.from("teacher_cv").select("*").limit(1);
  cvData = (rows && rows[0]) || {
    full_name: currentProfile ? currentProfile.full_name : "",
    job_title: "معلم مهارات رقمية", email: "", phone: "", summary: "",
    experience: [], education: [], skills: [], selected_sections: [], template: "modern",
  };

  await loadPortfolioPool();
  renderCVEditor();
}

async function loadPortfolioPool() {
  const { data: roots } = await supabaseClient.from("content_sections").select("*").eq("module", "portfolio").is("parent_id", null).order("created_at");
  cvSectionsPool = [];
  for (const r of (roots || [])) {
    const { data: items } = await supabaseClient.from("content_items").select("title").eq("section_id", r.id);
    const { data: subs } = await supabaseClient.from("content_sections").select("*").eq("parent_id", r.id);
    let allTitles = (items || []).map((i) => i.title);
    for (const s of (subs || [])) {
      const { data: subItems } = await supabaseClient.from("content_items").select("title").eq("section_id", s.id);
      allTitles = allTitles.concat((subItems || []).map((i) => i.title));
    }
    cvSectionsPool.push({ id: r.id, title: r.title, items: allTitles });
  }
}

function renderCVEditor() {
  const contentArea = document.getElementById("contentArea");
  const d = cvData;

  contentArea.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;" id="cvGrid">
      <div>
        <div class="section-card" style="margin-bottom:18px;">
          <div class="section-head"><h3>البيانات الشخصية</h3></div>
          <div class="field"><label>الاسم الكامل</label><input type="text" id="cv_name" value="${escapeAttrCv(d.full_name)}" /></div>
          <div class="field"><label>المسمى الوظيفي</label><input type="text" id="cv_title" value="${escapeAttrCv(d.job_title)}" /></div>
          <div class="field"><label>البريد الإلكتروني</label><input type="text" id="cv_email" value="${escapeAttrCv(d.email)}" /></div>
          <div class="field"><label>الجوال</label><input type="text" id="cv_phone" value="${escapeAttrCv(d.phone)}" /></div>
          <div class="field"><label>ملخص مهني (2-3 أسطر)</label><textarea id="cv_summary" rows="3" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:12px; font-family:var(--font-body); color:var(--text-primary);">${escapeAttrCv(d.summary)}</textarea></div>
        </div>

        <div class="section-card" style="margin-bottom:18px;">
          <div class="section-head"><h3>الخبرة العملية</h3><button class="btn-add" id="addExpBtn">${icon("plus", 13)} إضافة</button></div>
          <div id="expList"></div>
        </div>

        <div class="section-card" style="margin-bottom:18px;">
          <div class="section-head"><h3>المؤهل العلمي</h3><button class="btn-add" id="addEduBtn">${icon("plus", 13)} إضافة</button></div>
          <div id="eduList"></div>
        </div>

        <div class="section-card" style="margin-bottom:18px;">
          <div class="section-head"><h3>المهارات</h3></div>
          <input type="text" id="cv_skill_input" placeholder="اكتب مهارة واضغط Enter" />
          <div id="skillsList" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;"></div>
        </div>

        <div class="section-card" style="margin-bottom:18px;">
          <div class="section-head"><h3>أقسام من ملف الإنجاز</h3></div>
          <p style="color:var(--text-muted); font-size:12px; margin-bottom:12px;">حدد الأقسام اللي تبي عناوين مرفقاتها تنضاف للسيرة تلقائياً.</p>
          <div id="poolCheckboxes"></div>
        </div>

        <div class="section-card">
          <div class="section-head"><h3>القالب</h3></div>
          <div class="btn-pill-choice" id="templateChoice">
            <button type="button" data-tpl="modern" class="${d.template === "modern" ? "active positive" : ""}">عصري بسيط</button>
            <button type="button" data-tpl="classic" class="${d.template === "classic" ? "active positive" : ""}">كلاسيكي احترافي</button>
            <button type="button" data-tpl="bold" class="${d.template === "bold" ? "active positive" : ""}">جريء معاصر</button>
          </div>
        </div>
      </div>

      <div>
        <div class="section-card" style="position:sticky; top:20px;">
          <div class="section-head">
            <h3>معاينة حية</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn-add" id="saveCvBtn">${icon("check", 13)} حفظ</button>
              <button class="btn-secondary" style="width:auto; padding:9px 14px;" id="downloadWordBtn">${icon("download", 14)} Word</button>
              <button class="btn-secondary" style="width:auto; padding:9px 14px;" id="downloadPdfBtn">${icon("print", 14)} PDF</button>
            </div>
          </div>
          <div id="cvPreviewWrap" style="border:1px solid var(--border-soft); border-radius:10px; overflow:auto; max-height:80vh; background:#fff;"></div>
        </div>
      </div>
    </div>
    <style>@media (max-width: 900px) { #cvGrid { grid-template-columns: 1fr !important; } }</style>
  `;

  renderExpList(); renderEduList(); renderSkillsList(); renderPoolCheckboxes();
  updatePreview();

  document.getElementById("cv_name").addEventListener("input", (e) => { cvData.full_name = e.target.value; updatePreview(); });
  document.getElementById("cv_title").addEventListener("input", (e) => { cvData.job_title = e.target.value; updatePreview(); });
  document.getElementById("cv_email").addEventListener("input", (e) => { cvData.email = e.target.value; updatePreview(); });
  document.getElementById("cv_phone").addEventListener("input", (e) => { cvData.phone = e.target.value; updatePreview(); });
  document.getElementById("cv_summary").addEventListener("input", (e) => { cvData.summary = e.target.value; updatePreview(); });

  document.getElementById("addExpBtn").addEventListener("click", () => {
    cvData.experience.push({ title: "", org: "", period: "", desc: "" });
    renderExpList(); updatePreview();
  });
  document.getElementById("addEduBtn").addEventListener("click", () => {
    cvData.education.push({ degree: "", institution: "", year: "" });
    renderEduList(); updatePreview();
  });

  document.getElementById("cv_skill_input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.value.trim()) {
      e.preventDefault();
      cvData.skills.push(e.target.value.trim());
      e.target.value = "";
      renderSkillsList(); updatePreview();
    }
  });

  document.querySelectorAll("#templateChoice button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#templateChoice button").forEach((b) => b.classList.remove("active", "positive"));
      btn.classList.add("active", "positive");
      cvData.template = btn.dataset.tpl;
      updatePreview();
    });
  });

  document.getElementById("saveCvBtn").addEventListener("click", saveCv);
  document.getElementById("downloadWordBtn").addEventListener("click", downloadCvWord);
  document.getElementById("downloadPdfBtn").addEventListener("click", downloadCvPdf);
}

function escapeAttrCv(str) { return (str || "").toString().replace(/"/g, "&quot;"); }
function escapeHtmlCv(str) { const d = document.createElement("div"); d.textContent = str || ""; return d.innerHTML; }

function renderExpList() {
  const holder = document.getElementById("expList");
  if (cvData.experience.length === 0) { holder.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه خبرات مضافة</div>`; return; }
  holder.innerHTML = cvData.experience.map((exp, i) => `
    <div style="border:1px solid var(--border-soft); border-radius:10px; padding:12px; margin-bottom:10px;">
      <div style="display:flex; gap:8px; margin-bottom:8px;"><input type="text" placeholder="المسمى الوظيفي" value="${escapeAttrCv(exp.title)}" data-i="${i}" data-f="title" class="exp-field" /><button class="icon-btn danger" onclick="removeExp(${i})">${icon("trash", 14)}</button></div>
      <input type="text" placeholder="جهة العمل" value="${escapeAttrCv(exp.org)}" data-i="${i}" data-f="org" class="exp-field" style="margin-bottom:8px;" />
      <input type="text" placeholder="الفترة (مثال: 2020 - الآن)" value="${escapeAttrCv(exp.period)}" data-i="${i}" data-f="period" class="exp-field" style="margin-bottom:8px;" />
      <input type="text" placeholder="وصف مختصر" value="${escapeAttrCv(exp.desc)}" data-i="${i}" data-f="desc" class="exp-field" />
    </div>`).join("");
  holder.querySelectorAll(".exp-field").forEach((inp) => {
    inp.addEventListener("input", (e) => { cvData.experience[e.target.dataset.i][e.target.dataset.f] = e.target.value; updatePreview(); });
  });
}
function removeExp(i) { cvData.experience.splice(i, 1); renderExpList(); updatePreview(); }

function renderEduList() {
  const holder = document.getElementById("eduList");
  if (cvData.education.length === 0) { holder.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه مؤهلات مضافة</div>`; return; }
  holder.innerHTML = cvData.education.map((ed, i) => `
    <div style="border:1px solid var(--border-soft); border-radius:10px; padding:12px; margin-bottom:10px;">
      <div style="display:flex; gap:8px; margin-bottom:8px;"><input type="text" placeholder="الدرجة العلمية" value="${escapeAttrCv(ed.degree)}" data-i="${i}" data-f="degree" class="edu-field" /><button class="icon-btn danger" onclick="removeEdu(${i})">${icon("trash", 14)}</button></div>
      <input type="text" placeholder="الجهة/الجامعة" value="${escapeAttrCv(ed.institution)}" data-i="${i}" data-f="institution" class="edu-field" style="margin-bottom:8px;" />
      <input type="text" placeholder="سنة التخرج" value="${escapeAttrCv(ed.year)}" data-i="${i}" data-f="year" class="edu-field" />
    </div>`).join("");
  holder.querySelectorAll(".edu-field").forEach((inp) => {
    inp.addEventListener("input", (e) => { cvData.education[e.target.dataset.i][e.target.dataset.f] = e.target.value; updatePreview(); });
  });
}
function removeEdu(i) { cvData.education.splice(i, 1); renderEduList(); updatePreview(); }

function renderSkillsList() {
  const holder = document.getElementById("skillsList");
  holder.innerHTML = cvData.skills.map((s, i) => `<span class="sub-badge" style="display:flex; align-items:center; gap:6px; padding:6px 12px;">${escapeHtmlCv(s)} <span style="cursor:pointer;" onclick="removeSkill(${i})">${icon("close", 11)}</span></span>`).join("");
}
function removeSkill(i) { cvData.skills.splice(i, 1); renderSkillsList(); updatePreview(); }

function renderPoolCheckboxes() {
  const holder = document.getElementById("poolCheckboxes");
  if (cvSectionsPool.length === 0) { holder.innerHTML = `<div class="empty-state" style="padding:16px;">ما فيه أقسام بملف الإنجاز بعد</div>`; return; }
  holder.innerHTML = cvSectionsPool.map((s) => `
    <label style="display:flex; align-items:center; gap:8px; padding:8px 0; cursor:pointer;">
      <input type="checkbox" class="pool-check" value="${s.id}" ${cvData.selected_sections.includes(s.id) ? "checked" : ""} />
      ${escapeHtmlCv(s.title)} <span class="sub-badge">${s.items.length} عنصر</span>
    </label>`).join("");
  holder.querySelectorAll(".pool-check").forEach((chk) => {
    chk.addEventListener("change", () => {
      cvData.selected_sections = Array.from(document.querySelectorAll(".pool-check:checked")).map((c) => c.value);
      updatePreview();
    });
  });
}

async function saveCv() {
  const btn = document.getElementById("saveCvBtn");
  btn.disabled = true; btn.innerHTML = '<span class="loading-spin"></span>';
  const payload = {
    full_name: cvData.full_name, job_title: cvData.job_title, email: cvData.email, phone: cvData.phone,
    summary: cvData.summary, experience: cvData.experience, education: cvData.education, skills: cvData.skills,
    selected_sections: cvData.selected_sections, template: cvData.template, updated_at: new Date().toISOString(),
  };
  let error;
  if (cvData.id) {
    ({ error } = await supabaseClient.from("teacher_cv").update(payload).eq("id", cvData.id));
  } else {
    const { data, error: insErr } = await supabaseClient.from("teacher_cv").insert(payload).select().single();
    error = insErr;
    if (data) cvData.id = data.id;
  }
  btn.disabled = false;
  if (error) { btn.innerHTML = icon("check", 13) + " حفظ"; hydrateIcons(btn); alert("تعذر الحفظ: " + error.message); return; }
  btn.innerHTML = icon("check", 13) + " تم الحفظ"; hydrateIcons(btn);
  setTimeout(() => { btn.innerHTML = icon("check", 13) + " حفظ"; hydrateIcons(btn); }, 1800);
}

// ============ توليد محتوى السيرة (مشترك بين المعاينة والتنزيل) ============

function buildCvBodyHtml() {
  const d = cvData;
  const pool = cvSectionsPool.filter((s) => d.selected_sections.includes(s.id));

  const expHtml = d.experience.filter((e) => e.title).map((e) => `
    <div style="margin-bottom:14px;">
      <div style="font-weight:700; font-size:14px;">${escapeHtmlCv(e.title)} ${e.org ? "— " + escapeHtmlCv(e.org) : ""}</div>
      <div style="font-size:11px; color:#888; margin-bottom:4px;">${escapeHtmlCv(e.period)}</div>
      <div style="font-size:12px; color:#333;">${escapeHtmlCv(e.desc)}</div>
    </div>`).join("");

  const eduHtml = d.education.filter((e) => e.degree).map((e) => `
    <div style="margin-bottom:10px;">
      <div style="font-weight:700; font-size:14px;">${escapeHtmlCv(e.degree)}</div>
      <div style="font-size:12px; color:#555;">${escapeHtmlCv(e.institution)} ${e.year ? "· " + escapeHtmlCv(e.year) : ""}</div>
    </div>`).join("");

  const skillsHtml = d.skills.map((s) => `<span style="display:inline-block; padding:5px 12px; border-radius:999px; font-size:11px; margin:3px;">${escapeHtmlCv(s)}</span>`).join("");

  const poolHtml = pool.map((s) => `
    <div style="margin-bottom:14px;">
      <div style="font-weight:700; font-size:14px; margin-bottom:6px;">${escapeHtmlCv(s.title)}</div>
      <ul style="margin:0; padding-inline-start:18px; font-size:12px; color:#333; line-height:1.9;">
        ${s.items.map((t) => `<li>${escapeHtmlCv(t)}</li>`).join("")}
      </ul>
    </div>`).join("");

  return { expHtml, eduHtml, skillsHtml, poolHtml };
}

function renderTemplateHtml(template) {
  const d = cvData;
  const { expHtml, eduHtml, skillsHtml, poolHtml } = buildCvBodyHtml();
  const accent = "#0F2542", gold = "#B8862E";

  if (template === "classic") {
    return `
    <div style="font-family:'Tajawal',Arial,sans-serif; direction:rtl; display:flex; min-height:100%; color:#222;">
      <div style="width:32%; background:${accent}; color:#fff; padding:26px 20px;">
        <div style="font-size:20px; font-weight:800; margin-bottom:4px;">${escapeHtmlCv(d.full_name)}</div>
        <div style="font-size:12px; color:${gold}; margin-bottom:20px;">${escapeHtmlCv(d.job_title)}</div>
        <div style="font-size:11px; line-height:2; margin-bottom:20px;">${d.email ? escapeHtmlCv(d.email) + "<br>" : ""}${d.phone ? escapeHtmlCv(d.phone) : ""}</div>
        <div style="font-weight:700; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.3); padding-bottom:6px; margin-bottom:10px;">المهارات</div>
        <div>${d.skills.map((s) => `<div style="font-size:11px; padding:4px 0;">• ${escapeHtmlCv(s)}</div>`).join("")}</div>
      </div>
      <div style="width:68%; padding:26px 24px;">
        ${d.summary ? `<div style="margin-bottom:18px; font-size:12.5px; line-height:1.9; color:#444;">${escapeHtmlCv(d.summary)}</div>` : ""}
        ${expHtml ? `<div style="font-weight:800; font-size:14px; color:${accent}; border-bottom:2px solid ${gold}; padding-bottom:4px; margin-bottom:12px;">الخبرة العملية</div>${expHtml}` : ""}
        ${eduHtml ? `<div style="font-weight:800; font-size:14px; color:${accent}; border-bottom:2px solid ${gold}; padding-bottom:4px; margin:18px 0 12px;">المؤهل العلمي</div>${eduHtml}` : ""}
        ${poolHtml}
      </div>
    </div>`;
  }

  if (template === "bold") {
    return `
    <div style="font-family:'Tajawal',Arial,sans-serif; direction:rtl; color:#222;">
      <div style="background:linear-gradient(120deg, ${accent}, #1c3f6b); color:#fff; padding:30px 26px;">
        <div style="font-size:24px; font-weight:800;">${escapeHtmlCv(d.full_name)}</div>
        <div style="font-size:13px; color:${gold}; margin-top:4px;">${escapeHtmlCv(d.job_title)}</div>
        <div style="font-size:11px; margin-top:10px; opacity:0.85;">${[d.email, d.phone].filter(Boolean).join(" · ")}</div>
      </div>
      <div style="padding:24px 26px;">
        ${d.summary ? `<div style="margin-bottom:18px; font-size:12.5px; line-height:1.9; color:#444;">${escapeHtmlCv(d.summary)}</div>` : ""}
        ${skillsHtml ? `<div style="margin-bottom:18px;">${skillsHtml.replace(/padding:5px 12px;/g, `padding:5px 12px; background:${accent}; color:#fff;`)}</div>` : ""}
        ${expHtml ? `<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;"><span style="width:10px; height:10px; background:${gold};"></span><span style="font-weight:800; font-size:14px;">الخبرة العملية</span></div>${expHtml}` : ""}
        ${eduHtml ? `<div style="display:flex; align-items:center; gap:8px; margin:18px 0 12px;"><span style="width:10px; height:10px; background:${gold};"></span><span style="font-weight:800; font-size:14px;">المؤهل العلمي</span></div>${eduHtml}` : ""}
        ${poolHtml}
      </div>
    </div>`;
  }

  // modern (افتراضي)
  return `
    <div style="font-family:'Tajawal',Arial,sans-serif; direction:rtl; padding:28px 26px; color:#222;">
      <div style="border-bottom:3px solid ${accent}; padding-bottom:14px; margin-bottom:18px;">
        <div style="font-size:22px; font-weight:800; color:${accent};">${escapeHtmlCv(d.full_name)}</div>
        <div style="font-size:13px; color:${gold}; margin-top:2px;">${escapeHtmlCv(d.job_title)}</div>
        <div style="font-size:11px; color:#777; margin-top:6px;">${[d.email, d.phone].filter(Boolean).join(" · ")}</div>
      </div>
      ${d.summary ? `<div style="margin-bottom:18px; font-size:12.5px; line-height:1.9; color:#444;">${escapeHtmlCv(d.summary)}</div>` : ""}
      ${skillsHtml ? `<div style="margin-bottom:18px;">${skillsHtml.replace(/padding:5px 12px;/g, `padding:5px 12px; background:#f0f1f6; border:1px solid #ddd;`)}</div>` : ""}
      ${expHtml ? `<div style="font-weight:800; font-size:14px; color:${accent}; margin-bottom:12px;">الخبرة العملية</div>${expHtml}` : ""}
      ${eduHtml ? `<div style="font-weight:800; font-size:14px; color:${accent}; margin:18px 0 12px;">المؤهل العلمي</div>${eduHtml}` : ""}
      ${poolHtml}
    </div>`;
}

function updatePreview() {
  const wrap = document.getElementById("cvPreviewWrap");
  wrap.innerHTML = `<div style="width:100%; min-height:1000px;">${renderTemplateHtml(cvData.template)}</div>`;
}

// ============ التنزيل ============

function downloadCvPdf() {
  const html = renderTemplateHtml(cvData.template);
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>السيرة الذاتية - ${escapeHtmlCv(cvData.full_name)}</title><style>@page{margin:0;} body{margin:0;}</style></head><body>${html}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function downloadCvWord() {
  const html = renderTemplateHtml(cvData.template);
  const wordDoc = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><title>السيرة الذاتية</title></head>
    <body dir="rtl">${html}</body></html>`;
  const blob = new Blob(["\ufeff", wordDoc], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `السيرة الذاتية - ${cvData.full_name || "معلم"}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
