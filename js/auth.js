// ============================================
// تسجيل الدخول
// ============================================

const loginForm = document.getElementById("loginForm");
const errorBox = document.getElementById("errorBox");
const loginBtn = document.getElementById("loginBtn");

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("show");
}

function hideError() {
  errorBox.classList.remove("show");
}

// لو فيه جلسة شغالة أصلاً، حوّل مباشرة للوحة التحكم
(async function checkExistingSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    window.location.href = "dashboard.html";
  }
})();

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading-spin"></span>';

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      loginBtn.disabled = false;
      loginBtn.textContent = "دخول";
      showError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      return;
    }

    // تحقق من وجود بروفايل للمستخدم (دور محدد)
    const { data: profile, error: profileError } = await supabaseClient
      .from("users_profile")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      loginBtn.disabled = false;
      loginBtn.textContent = "دخول";
      showError("الحساب غير مفعّل بعد. تواصل مع إدارة الموقع.");
      await supabaseClient.auth.signOut();
      return;
    }

    window.location.href = "dashboard.html";
  });
}
