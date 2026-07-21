// ============================================
// إعداد الاتصال بـ Supabase
// ============================================
const SUPABASE_URL = "https://omrixziuniedjbrsitdg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tcml4eml1bmllZGpicnNpdGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzU1NDksImV4cCI6MjEwMDE1MTU0OX0.HNY1N4TCar1kXDEe3POwSfgfNn1TTU-BwFvjvWr1dMI";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
