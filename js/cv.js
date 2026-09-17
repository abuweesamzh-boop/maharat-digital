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
          <div style="display:flex; align-items:center; gap:14px; margin-bottom:16px;">
            <div id="cvPhotoPreview" style="width:64px; height:64px; border-radius:50%; overflow:hidden; border:2px solid var(--border-soft); flex-shrink:0; background:var(--bg-surface-2); display:flex; align-items:center; justify-content:center;">
              ${d.photo_url ? `<img src="${d.photo_url}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="color:var(--text-muted); font-size:11px;">بدون صورة</span>`}
            </div>
            <div>
              <input type="file" id="cv_photo_input" accept="image/*" style="margin-bottom:6px;" />
              <div style="font-size:11px; color:var(--text-muted);">صورة شخصية رسمية (اختياري)</div>
            </div>
          </div>
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

  document.getElementById("cv_photo_input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById("cvPhotoPreview");
    preview.innerHTML = '<span class="loading-spin" style="border-top-color:var(--navy);"></span>';
    try {
      const filePath = `cv/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
      const { error: upErr } = await supabaseClient.storage.from("maharat-files").upload(filePath, file);
      if (upErr) throw upErr;
      const { data: pub } = await supabaseClient.storage.from("maharat-files").getPublicUrl(filePath);
      cvData.photo_url = pub.publicUrl;
      preview.innerHTML = `<img src="${cvData.photo_url}" style="width:100%; height:100%; object-fit:cover;" />`;
      updatePreview();
    } catch (err) {
      preview.innerHTML = `<span style="color:var(--text-muted); font-size:11px;">فشل الرفع</span>`;
    }
  });
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
    selected_sections: cvData.selected_sections, template: cvData.template, photo_url: cvData.photo_url || null,
    updated_at: new Date().toISOString(),
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
    <div style="margin-bottom:13px;">
      <div style="font-weight:700; font-size:12.5px;">${escapeHtmlCv(e.title)} ${e.org ? "— " + escapeHtmlCv(e.org) : ""}</div>
      <div style="font-size:10px; color:#8a8a8a; margin-bottom:3px;">${escapeHtmlCv(e.period)}</div>
      <div style="font-size:11px; color:#3a3a3a; line-height:1.7;">${escapeHtmlCv(e.desc)}</div>
    </div>`).join("");

  const eduHtml = d.education.filter((e) => e.degree).map((e) => `
    <div style="margin-bottom:9px;">
      <div style="font-weight:700; font-size:12.5px;">${escapeHtmlCv(e.degree)}</div>
      <div style="font-size:11px; color:#555;">${escapeHtmlCv(e.institution)} ${e.year ? "· " + escapeHtmlCv(e.year) : ""}</div>
    </div>`).join("");

  const poolHtml = pool.map((s) => `
    <div style="margin-bottom:13px;">
      <div style="font-weight:700; font-size:12.5px; margin-bottom:5px;">${escapeHtmlCv(s.title)}</div>
      <ul style="margin:0; padding-inline-start:16px; font-size:11px; color:#3a3a3a; line-height:1.85;">
        ${s.items.map((t) => `<li>${escapeHtmlCv(t)}</li>`).join("")}
      </ul>
    </div>`).join("");

  return { expHtml, eduHtml, poolHtml };
}

const CV_ACCENT = "#0F2542";
const CV_GOLD = "#B8862E";

function cvPhotoHtml(size, borderColor) {
  const d = cvData;
  if (d.photo_url) {
    return `<img src="${d.photo_url}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; border:3px solid ${borderColor}; flex-shrink:0;" />`;
  }
  return `<div style="width:${size}px; height:${size}px; border-radius:50%; background:#e8ecf2; border:3px solid ${borderColor}; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:${Math.round(size * 0.4)}px; font-weight:800; color:${CV_ACCENT};">${escapeHtmlCv((d.full_name || "؟").charAt(0))}</div>`;
}

function sectionTitleHtml(text, color) {
  return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:11px; margin-top:4px;"><span style="width:16px; height:3px; background:${color || CV_GOLD}; display:inline-block;"></span><span style="font-weight:800; font-size:13px; letter-spacing:0.3px;">${text}</span></div>`;
}

// A4 = 210mm × 297mm. الصفحة مؤطرة بحد خارجي وهامش داخلي ثابت يناسب الطباعة.
function renderTemplateHtml(template) {
  const d = cvData;
  const { expHtml, eduHtml, poolHtml } = buildCvBodyHtml();
  const contact = [d.email, d.phone].filter(Boolean).join("   ·   ");

  const pageOuter = (innerHtml, frameColor) => `
    <div style="width:210mm; min-height:297mm; margin:0 auto; background:#fff; box-sizing:border-box; border:2px solid ${frameColor || CV_ACCENT}; padding:6mm; font-family:'Tajawal',Arial,sans-serif; direction:rtl; color:#222;">
      <div style="width:100%; height:100%; border:1px solid #d9dde5; box-sizing:border-box; padding:14mm 15mm;">
        ${innerHtml}
      </div>
    </div>`;

  if (template === "classic") {
    const inner = `
      <div style="display:flex; gap:18px; min-height:100%;">
        <div style="width:33%; background:${CV_ACCENT}; color:#fff; padding:22px 16px; border-radius:6px;">
          <div style="display:flex; justify-content:center; margin-bottom:14px;">${cvPhotoHtml(84, "#fff")}</div>
          <div style="text-align:center; font-size:17px; font-weight:800; margin-bottom:2px;">${escapeHtmlCv(d.full_name)}</div>
          <div style="text-align:center; font-size:11px; color:${CV_GOLD}; margin-bottom:18px;">${escapeHtmlCv(d.job_title)}</div>
          <div style="border-top:1px solid rgba(255,255,255,0.25); padding-top:12px; font-size:10.5px; line-height:2;">
            ${d.email ? `<div>${escapeHtmlCv(d.email)}</div>` : ""}${d.phone ? `<div>${escapeHtmlCv(d.phone)}</div>` : ""}
          </div>
          ${d.skills.length ? `<div style="border-top:1px solid rgba(255,255,255,0.25); margin-top:14px; padding-top:12px;"><div style="font-weight:700; font-size:11px; margin-bottom:8px;">المهارات</div>${d.skills.map((s) => `<div style="font-size:10.5px; padding:3px 0;">• ${escapeHtmlCv(s)}</div>`).join("")}</div>` : ""}
        </div>
        <div style="width:67%; padding-top:4px;">
          ${d.summary ? `<div style="font-size:11.5px; line-height:1.85; color:#444; margin-bottom:16px;">${escapeHtmlCv(d.summary)}</div>` : ""}
          ${expHtml ? sectionTitleHtml("الخبرة العملية") + expHtml : ""}
          ${eduHtml ? sectionTitleHtml("المؤهل العلمي") + eduHtml : ""}
          ${poolHtml}
        </div>
      </div>`;
    return pageOuter(inner);
  }

  if (template === "bold") {
    const inner = `
      <div style="background:${CV_ACCENT}; color:#fff; padding:22px 24px; border-radius:6px; display:flex; align-items:center; gap:18px; margin-bottom:20px;">
        ${cvPhotoHtml(76, CV_GOLD)}
        <div>
          <div style="font-size:21px; font-weight:800;">${escapeHtmlCv(d.full_name)}</div>
          <div style="font-size:12px; color:${CV_GOLD}; margin-top:3px;">${escapeHtmlCv(d.job_title)}</div>
          ${contact ? `<div style="font-size:10.5px; margin-top:8px; opacity:0.85;">${escapeHtmlCv(contact)}</div>` : ""}
        </div>
      </div>
      ${d.summary ? `<div style="font-size:11.5px; line-height:1.85; color:#444; margin-bottom:18px;">${escapeHtmlCv(d.summary)}</div>` : ""}
      ${d.skills.length ? `<div style="margin-bottom:18px;">${d.skills.map((s) => `<span style="display:inline-block; padding:5px 13px; margin:3px; border-radius:999px; font-size:10.5px; background:${CV_ACCENT}; color:#fff;">${escapeHtmlCv(s)}</span>`).join("")}</div>` : ""}
      ${expHtml ? sectionTitleHtml("الخبرة العملية") + expHtml : ""}
      ${eduHtml ? sectionTitleHtml("المؤهل العلمي") + eduHtml : ""}
      ${poolHtml}`;
    return pageOuter(inner, CV_GOLD);
  }

  // modern (افتراضي)
  const inner = `
    <div style="display:flex; align-items:center; gap:16px; border-bottom:3px solid ${CV_ACCENT}; padding-bottom:16px; margin-bottom:18px;">
      ${cvPhotoHtml(72, CV_ACCENT)}
      <div>
        <div style="font-size:20px; font-weight:800; color:${CV_ACCENT};">${escapeHtmlCv(d.full_name)}</div>
        <div style="font-size:12px; color:${CV_GOLD}; margin-top:2px;">${escapeHtmlCv(d.job_title)}</div>
        ${contact ? `<div style="font-size:10.5px; color:#888; margin-top:6px;">${escapeHtmlCv(contact)}</div>` : ""}
      </div>
    </div>
    ${d.summary ? `<div style="font-size:11.5px; line-height:1.85; color:#444; margin-bottom:18px;">${escapeHtmlCv(d.summary)}</div>` : ""}
    ${d.skills.length ? `<div style="margin-bottom:18px;">${d.skills.map((s) => `<span style="display:inline-block; padding:5px 13px; margin:3px; border-radius:999px; font-size:10.5px; background:#f0f1f6; border:1px solid #dde1ea;">${escapeHtmlCv(s)}</span>`).join("")}</div>` : ""}
    ${expHtml ? sectionTitleHtml("الخبرة العملية", CV_ACCENT) + expHtml : ""}
    ${eduHtml ? sectionTitleHtml("المؤهل العلمي", CV_ACCENT) + eduHtml : ""}
    ${poolHtml}`;
  return pageOuter(inner);
}

function updatePreview() {
  const wrap = document.getElementById("cvPreviewWrap");
  wrap.innerHTML = `<div style="padding:16px; background:#e9ebf0; display:flex; justify-content:center;">${renderTemplateHtml(cvData.template)}</div>`;
}

// ============ التنزيل ============

function downloadCvPdf() {
  const html = renderTemplateHtml(cvData.template);
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>السيرة الذاتية - ${escapeHtmlCv(cvData.full_name)}</title><style>@page{size:A4; margin:0;} body{margin:0;}</style></head><body>${html}</body></html>`);
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
