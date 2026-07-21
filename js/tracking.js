// ============================================
// قسم: سجل متابعة الطلاب
// ============================================

let selectedStudentId = null;

async function renderTrackingSection() {
  document.getElementById("pageTitle").textContent = "سجل متابعة الطلاب";
  const contentArea = document.getElementById("contentArea");

  contentArea.innerHTML = `
    <div class="section-card" style="margin-bottom:20px;">
      <div class="section-head"><h3>اختر الطالب</h3></div>
      <select id="studentSelect" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body); font-size:15px;">
        <option value="">جاري تحميل قائمة الطلاب...</option>
      </select>
    </div>
    <div id="trackingArea"></div>
  `;

  const { data: students, error } = await supabaseClient
    .from("students")
    .select("*")
    .order("grade").order("class_name").order("student_number");

  const selectEl = document.getElementById("studentSelect");

  if (error || !students || students.length === 0) {
    selectEl.innerHTML = `<option value="">ما فيه طلاب مسجلين — أضفهم من قسم "بيانات الطلاب" أولاً</option>`;
    return;
  }

  selectEl.innerHTML = `<option value="">-- اختر طالب --</option>` +
    students.map((s) => `<option value="${s.id}">${escapeHtml(s.full_name)} (${escapeHtml(s.grade)}/${escapeHtml(s.class_name)})</option>`).join("");

  selectEl.addEventListener("change", () => {
    selectedStudentId = selectEl.value;
    if (selectedStudentId) {
      loadStudentTracking(selectedStudentId);
    } else {
      document.getElementById("trackingArea").innerHTML = "";
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

async function loadStudentTracking(studentId) {
  const area = document.getElementById("trackingArea");
  area.innerHTML = `
    <div class="section-card">
      <div class="section-head">
        <h3>سجل المتابعة</h3>
        <button class="btn-add" id="addTrackingBtn">+ إضافة ملاحظة</button>
      </div>
      <div id="trackingList"><div class="empty-state">جاري التحميل...</div></div>
    </div>
  `;

  document.getElementById("addTrackingBtn").addEventListener("click", () => openAddTrackingModal(studentId));

  const { data, error } = await supabaseClient
    .from("student_tracking")
    .select("*")
    .eq("student_id", studentId)
    .order("tracked_date", { ascending: false });

  const listEl = document.getElementById("trackingList");

  if (error) { listEl.innerHTML = `<div class="empty-state">حدث خطأ</div>`; return; }

  if (!data || data.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="ico">📋</div><div>ما فيه ملاحظات متابعة لهذا الطالب بعد</div></div>`;
    return;
  }

  listEl.innerHTML = data.map((t) => `
    <div class="item-row">
      <div class="info">
        <div class="t">${t.rating ? "⭐ " + escapeHtml(t.rating) : ""} ${t.tracked_date ? "· " + escapeHtml(t.tracked_date) : ""}</div>
        <div class="d">${escapeHtml(t.note || "")}</div>
      </div>
      <div class="actions">
        <button class="icon-btn danger" onclick="deleteTracking('${t.id}')" title="حذف">🗑️</button>
      </div>
    </div>
  `).join("");
}

function openAddTrackingModal(studentId) {
  document.getElementById("modalTitle").textContent = "إضافة ملاحظة متابعة";
  document.getElementById("modalFields").innerHTML = `
    <div class="field">
      <label>التقييم</label>
      <select id="tr_rating" style="width:100%; background:var(--bg-surface); border:1px solid var(--border-soft); border-radius:10px; padding:13px 14px; color:var(--text-primary); font-family:var(--font-body); font-size:15px;">
        <option value="ممتاز">ممتاز</option>
        <option value="جيد جداً">جيد جداً</option>
        <option value="جيد">جيد</option>
        <option value="يحتاج متابعة">يحتاج متابعة</option>
      </select>
    </div>
    <div class="field"><label>التاريخ</label><input type="date" id="tr_date" value="${new Date().toISOString().split("T")[0]}" /></div>
    <div class="field"><label>الملاحظة</label><input type="text" id="tr_note" /></div>
  `;

  document.getElementById("modalOverlay").classList.add("show");

  document.getElementById("modalForm").onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("modalSubmit");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spin"></span>';

    const rating = document.getElementById("tr_rating").value;
    const tracked_date = document.getElementById("tr_date").value;
    const note = document.getElementById("tr_note").value.trim();

    const { data: sessionData } = await supabaseClient.auth.getSession();

    const { error } = await supabaseClient.from("student_tracking").insert({
      student_id: studentId, rating, tracked_date, note, created_by: sessionData.session.user.id,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "حفظ";

    if (error) { alert("تعذر الحفظ"); return; }

    document.getElementById("modalOverlay").classList.remove("show");
    await loadStudentTracking(studentId);
  };

  document.getElementById("modalCancel").onclick = () => {
    document.getElementById("modalOverlay").classList.remove("show");
  };
}

async function deleteTracking(id) {
  if (!confirm("متأكد تبي تحذف هذي الملاحظة؟")) return;
  const { error } = await supabaseClient.from("student_tracking").delete().eq("id", id);
  if (error) { alert("تعذر الحذف"); return; }
  await loadStudentTracking(selectedStudentId);
}
