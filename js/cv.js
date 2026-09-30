let cvData = {
  id: null, full_name: "", title: "", email: "", phone: "", summary: "",
  photo_url: "", experience: [], education: [], skills: [], languages: [],
  selected_sections: [], template: "modern"
};
let cvPortfolioPool = [];

async function renderCVSection(){
  const el = document.getElementById("contentArea");
  el.innerHTML = `<div class="loading-placeholder">جاري التحميل...</div>`;
  const { data: existing } = await supabaseClient.from("teacher_cv").select("*").limit(1).maybeSingle();
  if (existing) {
    cvData = {
      id: existing.id,
      full_name: existing.full_name || currentProfile?.full_name || "",
      title: existing.title || "",
      email: existing.email || "",
      phone: existing.phone || "",
      summary: existing.summary || "",
      photo_url: existing.photo_url || "",
      experience: existing.experience || [],
      education: existing.education || [],
      skills: existing.skills || [],
      languages: existing.languages || [],
      selected_sections: existing.selected_sections || [],
      template: existing.template || "modern"
    };
  } else {
    cvData.full_name = currentProfile?.full_name || "";
  }
  await loadPortfolioPool();
  renderCVEditor();
}

async function loadPortfolioPool(){
  const { data: roots } = await supabaseClient.from("content_sections").select("*").eq("module","portfolio").is("parent_id", null);
  cvPortfolioPool = roots || [];
}

function renderCVEditor(){
  const el = document.getElementById("contentArea");
  el.innerHTML = `
    <div class="page-head">
      <button class="btn-back" onclick="loadHomeStats()">${icon("back",18)}<span>رجوع للرئيسية</span></button>
      <h2>السيرة الذاتية</h2>
    </div>
    <div class="cv-editor-grid">
      <div class="cv-form-col">
        <label>الصورة الشخصية</label>
        <input type="file" id="cv_photo_input" accept="image/*" onchange="uploadCvPhoto()">
        <label>الاسم الكامل</label>
        <input type="text" id="cv_full_name" value="${cvData.full_name}" oninput="cvData.full_name=this.value;updatePreview()">
        <label>المسمى الوظيفي</label>
        <input type="text" id="cv_title" value="${cvData.title}" oninput="cvData.title=this.value;updatePreview()">
        <label>البريد الإلكتروني</label>
        <input type="text" id="cv_email" value="${cvData.email}" oninput="cvData.email=this.value;updatePreview()">
        <label>الجوال</label>
        <input type="text" id="cv_phone" value="${cvData.phone}" oninput="cvData.phone=this.value;updatePreview()">
        <label>نبذة عني</label>
        <textarea id="cv_summary" rows="3" oninput="cvData.summary=this.value;updatePreview()">${cvData.summary}</textarea>

        <div class="cv-list-editor">
          <strong>الخبرات</strong>
          <div id="expList"></div>
          <button type="button" class="btn-secondary" onclick="addExp()">${icon("plus",14)}<span>إضافة خبرة</span></button>
        </div>
        <div class="cv-list-editor">
          <strong>التعليم</strong>
          <div id="eduList"></div>
          <button type="button" class="btn-secondary" onclick="addEdu()">${icon("plus",14)}<span>إضافة مؤهل</span></button>
        </div>
        <div class="cv-list-editor">
          <strong>المهارات</strong>
          <input type="text" id="skillInput" placeholder="اكتب مهارة واضغط Enter" onkeydown="if(event.key==='Enter'){event.preventDefault();addSkill(this.value);this.value='';}">
          <div id="skillsTags" class="tags-row"></div>
        </div>
        <div class="cv-list-editor">
          <strong>اللغات</strong>
          <div id="langList"></div>
          <button type="button" class="btn-secondary" onclick="addLang()">${icon("plus",14)}<span>إضافة لغة</span></button>
        </div>
        <div class="cv-list-editor">
          <strong>أقسام من ملف الإنجاز</strong>
          <div id="poolChecks">
            ${cvPortfolioPool.map(p => `<label class="check-row"><input type="checkbox" class="pool-check" value="${p.id}" ${cvData.selected_sections.includes(p.id)?'checked':''} onchange="togglePoolSection('${p.id}',this.checked)"> ${p.title}</label>`).join("") || `<p class="muted">لا توجد أقسام.</p>`}
          </div>
        </div>
        <div class="cv-list-editor">
          <strong>القالب</strong>
          <div class="template-pick-row">
            <button type="button" class="pill ${cvData.template==='modern'?'active':''}" onclick="setTemplate('modern')">عصري</button>
            <button type="button" class="pill ${cvData.template==='classic'?'active':''}" onclick="setTemplate('classic')">كلاسيكي</button>
            <button type="button" class="pill ${cvData.template==='bold'?'active':''}" onclick="setTemplate('bold')">جريء</button>
            <button type="button" class="pill ${cvData.template==='wave'?'active':''}" onclick="setTemplate('wave')">موجي</button>
          </div>
        </div>

        <button class="btn-primary full" onclick="saveCv()">${icon("check",16)}<span>حفظ</span></button>
        <div class="toolbar-row" style="margin-top:10px;">
          <button class="btn-secondary" onclick="downloadCvPdf()">${icon("download",16)}<span>تنزيل PDF</span></button>
          <button class="btn-secondary" onclick="downloadCvWord()">${icon("download",16)}<span>تنزيل Word</span></button>
        </div>
      </div>
      <div class="cv-preview-col" id="cvPreviewCol"></div>
    </div>
  `;
  hydrateIcons(el);
  renderExpList(); renderEduList(); renderSkillsTags(); renderLangList();
  updatePreview();
}

function renderExpList(){
  const holder = document.getElementById("expList");
  holder.innerHTML = cvData.experience.map((e,i)=>`
    <div class="cv-sub-item">
      <input type="text" placeholder="المسمى" value="${e.title||''}" oninput="cvData.experience[${i}].title=this.value;updatePreview()">
      <input type="text" placeholder="الجهة" value="${e.org||''}" oninput="cvData.experience[${i}].org=this.value;updatePreview()">
      <input type="text" placeholder="الفترة" value="${e.period||''}" oninput="cvData.experience[${i}].period=this.value;updatePreview()">
      <textarea placeholder="الوصف" rows="2" oninput="cvData.experience[${i}].desc=this.value;updatePreview()">${e.desc||''}</textarea>
      <button type="button" class="mini-btn danger" onclick="cvData.experience.splice(${i},1);renderExpList();updatePreview()">${icon("trash",14)}</button>
    </div>`).join("");
  hydrateIcons(holder);
}
function addExp(){ cvData.experience.push({title:"",org:"",period:"",desc:""}); renderExpList(); }

function renderEduList(){
  const holder = document.getElementById("eduList");
  holder.innerHTML = cvData.education.map((e,i)=>`
    <div class="cv-sub-item">
      <input type="text" placeholder="المؤهل" value="${e.degree||''}" oninput="cvData.education[${i}].degree=this.value;updatePreview()">
      <input type="text" placeholder="الجهة" value="${e.institution||''}" oninput="cvData.education[${i}].institution=this.value;updatePreview()">
      <input type="text" placeholder="السنة" value="${e.year||''}" oninput="cvData.education[${i}].year=this.value;updatePreview()">
      <button type="button" class="mini-btn danger" onclick="cvData.education.splice(${i},1);renderEduList();updatePreview()">${icon("trash",14)}</button>
    </div>`).join("");
  hydrateIcons(holder);
}
function addEdu(){ cvData.education.push({degree:"",institution:"",year:""}); renderEduList(); }

function renderSkillsTags(){
  const holder = document.getElementById("skillsTags");
  holder.innerHTML = cvData.skills.map((s,i)=>`<span class="tag">${s} <button type="button" onclick="cvData.skills.splice(${i},1);renderSkillsTags();updatePreview()">×</button></span>`).join("");
}
function addSkill(val){
  const v = (val||"").trim();
  if (!v) return;
  cvData.skills.push(v);
  renderSkillsTags(); updatePreview();
}

function renderLangList(){
  const holder = document.getElementById("langList");
  holder.innerHTML = cvData.languages.map((l,i)=>`
    <div class="cv-sub-item">
      <input type="text" placeholder="اللغة" value="${l.name||''}" oninput="cvData.languages[${i}].name=this.value;updatePreview()">
      <select onchange="cvData.languages[${i}].level=this.value;updatePreview()">
        ${["ممتاز","جيد جداً","جيد","متوسط"].map(lv=>`<option value="${lv}" ${l.level===lv?'selected':''}>${lv}</option>`).join("")}
      </select>
      <button type="button" class="mini-btn danger" onclick="cvData.languages.splice(${i},1);renderLangList();updatePreview()">${icon("trash",14)}</button>
    </div>`).join("");
  hydrateIcons(holder);
}
function addLang(){ cvData.languages.push({name:"", level:"جيد"}); renderLangList(); }

function togglePoolSection(id, checked){
  if (checked) { if (!cvData.selected_sections.includes(id)) cvData.selected_sections.push(id); }
  else { cvData.selected_sections = cvData.selected_sections.filter(x => x !== id); }
  updatePreview();
}
function setTemplate(t){
  cvData.template = t;
  document.querySelectorAll(".template-pick-row .pill").forEach(p=>p.classList.remove("active"));
  event.target.classList.add("active");
  updatePreview();
}

async function uploadCvPhoto(){
  const file = document.getElementById("cv_photo_input").files[0];
  if (!file) return;
  const path = `cv/${Date.now()}_${file.name}`;
  const { error } = await supabaseClient.storage.from("maharat-files").upload(path, file);
  if (error) { alert("فشل رفع الصورة: " + error.message); return; }
  const { data: pub } = supabaseClient.storage.from("maharat-files").getPublicUrl(path);
  cvData.photo_url = pub.publicUrl;
  updatePreview();
}

async function saveCv(){
  const payload = {
    full_name: cvData.full_name, title: cvData.title, email: cvData.email, phone: cvData.phone,
    summary: cvData.summary, photo_url: cvData.photo_url, experience: cvData.experience,
    education: cvData.education, skills: cvData.skills, languages: cvData.languages,
    selected_sections: cvData.selected_sections, template: cvData.template,
    teacher_id: currentProfile?.id || null
  };
  if (cvData.id) {
    await supabaseClient.from("teacher_cv").update(payload).eq("id", cvData.id);
  } else {
    const { data } = await supabaseClient.from("teacher_cv").insert(payload).select().single();
    if (data) cvData.id = data.id;
  }
  alert("تم حفظ السيرة الذاتية");
}

function cvPhotoHtml(size, borderColor){
  if (cvData.photo_url) {
    return `<img src="${cvData.photo_url}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:3px solid ${borderColor};">`;
  }
  const letter = (cvData.full_name||"ف").trim()[0] || "ف";
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0F2542;color:#fff;display:flex;align-items:center;justify-content:center;font-size:${size*0.4}px;font-weight:700;border:3px solid ${borderColor};">${letter}</div>`;
}
function sectionTitleHtml(text, color){
  return `<div style="display:flex;align-items:center;gap:8px;margin:14px 0 8px;"><span style="width:4px;height:18px;background:${color||'#B8862E'};display:inline-block;border-radius:2px;"></span><h3 style="margin:0;font-size:15px;">${text}</h3></div>`;
}
function poolSectionsHtml(){
  const selected = cvPortfolioPool.filter(p => cvData.selected_sections.includes(p.id));
  if (!selected.length) return "";
  return selected.map(p => `<div style="margin-bottom:6px;font-size:13px;">• ${p.title}</div>`).join("");
}
function expHtml(){
  return cvData.experience.map(e => `
    <div style="margin-bottom:10px;">
      <div style="font-weight:700;font-size:13px;">${e.title||''} ${e.org?('— '+e.org):''}</div>
      <div style="font-size:11px;color:#888;">${e.period||''}</div>
      <div style="font-size:12px;">${e.desc||''}</div>
    </div>`).join("") || `<p style="font-size:12px;color:#999;">لا يوجد</p>`;
}
function eduHtml(){
  return cvData.education.map(e => `
    <div style="margin-bottom:8px;">
      <div style="font-weight:700;font-size:13px;">${e.degree||''}</div>
      <div style="font-size:11px;color:#888;">${e.institution||''} ${e.year?('- '+e.year):''}</div>
    </div>`).join("") || `<p style="font-size:12px;color:#999;">لا يوجد</p>`;
}
function skillsHtml(light){
  const color = light ? "#fff" : "#0F2542";
  const bg = light ? "rgba(255,255,255,0.15)" : "#F0F1F6";
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;">${cvData.skills.map(s=>`<span style="background:${bg};color:${color};padding:4px 10px;border-radius:20px;font-size:11px;">${s}</span>`).join("")}</div>`;
}
function langsHtml(light){
  const color = light ? "#fff" : "#0F2542";
  return cvData.languages.map(l => `
    <div style="margin-bottom:6px;font-size:12px;color:${color};">
      <div style="display:flex;justify-content:space-between;"><span>${l.name}</span><span style="opacity:.8;">${l.level}</span></div>
    </div>`).join("");
}

function pageOuter(innerHtml, frameColor){
  return `
  <div style="width:210mm;min-height:297mm;background:#fff;border:2px solid ${frameColor};box-sizing:border-box;position:relative;">
    <div style="position:absolute;inset:6px;border:1px solid #ddd;box-sizing:border-box;"></div>
    <div style="position:relative;padding:14mm 15mm;box-sizing:border-box;min-height:297mm;">
      ${innerHtml}
    </div>
  </div>`;
}

function renderTemplateHtml(template){
  if (template === "classic") {
    return pageOuter(`
      <div style="display:flex;gap:24px;">
        <div style="width:35%;background:#0F2542;color:#fff;padding:18px;border-radius:10px;">
          <div style="text-align:center;margin-bottom:14px;">${cvPhotoHtml(100,'#B8862E')}</div>
          <h2 style="text-align:center;font-size:18px;margin:0 0 4px;">${cvData.full_name}</h2>
          <p style="text-align:center;color:#B8862E;font-size:12px;margin:0 0 14px;">${cvData.title}</p>
          ${sectionTitleHtml("تفاصيل التواصل","#B8862E")}
          <p style="font-size:11px;">${cvData.email}</p>
          <p style="font-size:11px;">${cvData.phone}</p>
          ${sectionTitleHtml("المهارات","#B8862E")}
          ${skillsHtml(true)}
          ${cvData.languages.length ? sectionTitleHtml("اللغات","#B8862E") + langsHtml(true) : ""}
        </div>
        <div style="width:65%;">
          ${sectionTitleHtml("نبذة عني")}
          <p style="font-size:12px;">${cvData.summary}</p>
          ${sectionTitleHtml("الخبرات")}${expHtml()}
          ${sectionTitleHtml("التعليم")}${eduHtml()}
          ${cvData.selected_sections.length ? sectionTitleHtml("من ملف الإنجاز") + poolSectionsHtml() : ""}
        </div>
      </div>
    `, "#0F2542");
  }
  if (template === "bold") {
    return pageOuter(`
      <div style="background:#0F2542;color:#fff;padding:20px;border-radius:12px;display:flex;align-items:center;gap:18px;margin-bottom:18px;">
        ${cvPhotoHtml(90,'#B8862E')}
        <div><h2 style="margin:0;font-size:20px;">${cvData.full_name}</h2><p style="color:#D9A94A;margin:4px 0 0;">${cvData.title}</p></div>
      </div>
      <div style="display:flex;gap:20px;font-size:12px;color:#555;margin-bottom:10px;"><span>${cvData.email}</span><span>${cvData.phone}</span></div>
      ${sectionTitleHtml("نبذة عني")}<p style="font-size:12px;">${cvData.summary}</p>
      <div style="display:flex;gap:24px;">
        <div style="width:60%;">
          ${sectionTitleHtml("الخبرات")}${expHtml()}
          ${sectionTitleHtml("التعليم")}${eduHtml()}
        </div>
        <div style="width:40%;">
          ${sectionTitleHtml("المهارات")}${skillsHtml(false)}
          ${cvData.languages.length ? sectionTitleHtml("اللغات") + langsHtml(false) : ""}
          ${cvData.selected_sections.length ? sectionTitleHtml("من ملف الإنجاز") + poolSectionsHtml() : ""}
        </div>
      </div>
    `, "#B8862E");
  }
  if (template === "wave") {
    return pageOuter(`
      <div style="display:flex;gap:0;margin:-14mm -15mm;min-height:297mm;">
        <div style="width:36%;background:#1B2430;color:#fff;padding:28px 20px;position:relative;">
          <div style="text-align:center;margin-bottom:16px;">${cvPhotoHtml(110,'#B8862E')}</div>
          <h2 style="text-align:center;font-size:17px;margin:0 0 2px;">${cvData.full_name}</h2>
          <p style="text-align:center;color:#B8862E;font-size:12px;margin:0 0 20px;">${cvData.title}</p>
          <div style="background:#fff;color:#1B2430;border-radius:0 40px 40px 0;padding:14px 16px;margin:0 -20px 18px 0;">
            <strong style="font-size:13px;">التعليم</strong>
            <div style="margin-top:8px;">${eduHtml()}</div>
          </div>
          <div style="background:#25303F;border-radius:0 40px 40px 0;padding:14px 16px;margin:0 -20px 18px 0;">
            <strong style="font-size:13px;color:#B8862E;">المهارات</strong>
            <div style="margin-top:8px;">${skillsHtml(true)}</div>
          </div>
          ${cvData.languages.length ? `
          <div style="background:#fff;color:#1B2430;border-radius:0 40px 40px 0;padding:14px 16px;margin:0 -20px 18px 0;">
            <strong style="font-size:13px;">اللغات</strong>
            <div style="margin-top:8px;">${langsHtml(false)}</div>
          </div>` : ""}
        </div>
        <div style="width:64%;padding:28px 26px;">
          ${sectionTitleHtml("نبذة عني")}<p style="font-size:12px;">${cvData.summary}</p>
          ${sectionTitleHtml("تفاصيل التواصل")}<p style="font-size:11px;">${cvData.email} — ${cvData.phone}</p>
          ${sectionTitleHtml("خبرات العمل")}${expHtml()}
          ${cvData.selected_sections.length ? sectionTitleHtml("من ملف الإنجاز") + poolSectionsHtml() : ""}
        </div>
      </div>
    `, "#1B2430");
  }
  // modern (default)
  return pageOuter(`
    <div style="display:flex;align-items:center;gap:18px;border-bottom:3px solid #0F2542;padding-bottom:16px;margin-bottom:18px;">
      ${cvPhotoHtml(90,'#B8862E')}
      <div><h2 style="margin:0;font-size:20px;color:#0F2542;">${cvData.full_name}</h2><p style="color:#B8862E;margin:4px 0 0;">${cvData.title}</p>
      <p style="font-size:12px;color:#666;margin:6px 0 0;">${cvData.email} · ${cvData.phone}</p></div>
    </div>
    ${sectionTitleHtml("نبذة عني")}<p style="font-size:12px;">${cvData.summary}</p>
    <div style="display:flex;gap:24px;">
      <div style="width:60%;">
        ${sectionTitleHtml("الخبرات")}${expHtml()}
        ${sectionTitleHtml("التعليم")}${eduHtml()}
      </div>
      <div style="width:40%;">
        ${sectionTitleHtml("المهارات")}${skillsHtml(false)}
        ${cvData.languages.length ? sectionTitleHtml("اللغات") + langsHtml(false) : ""}
        ${cvData.selected_sections.length ? sectionTitleHtml("من ملف الإنجاز") + poolSectionsHtml() : ""}
      </div>
    </div>
  `, "#0F2542");
}

function updatePreview(){
  const holder = document.getElementById("cvPreviewCol");
  if (!holder) return;
  holder.innerHTML = `<div style="background:#e9ebf0;padding:20px;display:flex;justify-content:center;overflow:auto;">
    <div id="cvPrintable">${renderTemplateHtml(cvData.template)}</div>
  </div>`;
}

function downloadCvPdf(){
  const w = window.open("", "_blank");
  w.document.write(`<html dir="rtl"><head><title>CV</title><style>@page{size:A4;margin:0;}body{margin:0;font-family:Tajawal,Arial;}</style></head><body>${renderTemplateHtml(cvData.template)}</body></html>`);
  w.document.close();
  setTimeout(()=>w.print(), 500);
}

function downloadCvWord(){
  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset="utf-8"><title>CV</title></head>
    <body dir="rtl">${renderTemplateHtml(cvData.template)}</body></html>`;
  const blob = new Blob(['﻿', html], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `السيرة_الذاتية_${cvData.full_name || "cv"}.doc`;
  link.click();
}
