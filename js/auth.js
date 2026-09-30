async function checkExistingSession(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = "dashboard.html";
}
checkExistingSession();

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const errBox = document.getElementById("loginError");
    errBox.style.display = "none";
    const submitBtn = loginForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "جاري الدخول...";
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: profile, error: pErr } = await supabaseClient
        .from("users_profile")
        .select("*")
        .eq("id", data.user.id)
        .single();
      if (pErr || !profile) throw new Error("لا يوجد ملف مستخدم مرتبط بهذا الحساب");
      window.location.href = "dashboard.html";
    } catch (err) {
      errBox.textContent = "بيانات الدخول غير صحيحة، حاول مرة أخرى";
      errBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "دخول";
    }
  });
}
