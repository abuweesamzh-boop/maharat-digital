// ============================================
// إعداد الاتصال بـ Supabase
// ============================================
const SUPABASE_URL = "https://lmtyoyvsrbxkddobqlxv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtdHlveXZzcmJ4a2Rkb2JxbHh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODAyMzAsImV4cCI6MjA5OTQ1NjIzMH0.o6BDNzFculLSboR2AV2RfsziTuW1DtYFt19d0MSpGpE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
