// Настройки проекта. Файл подключается до main.js обычным <script>.
// Чтобы скелеты и прогресс сохранялись не только в браузере, заведи бесплатный проект
// на supabase.com, выполни SQL из README (раздел «База») и впиши сюда URL и anon-ключ.
// anon-ключ публичный по замыслу Supabase — его можно коммитить.
window.MINSK_CONFIG = {
  supabase: {
    url: 'https://hdfqadnfcgseqtxlwlga.supabase.co',       // например 'https://abcdefgh.supabase.co'
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZnFhZG5mY2dzZXF0eGx3bGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNjQ3MDcsImV4cCI6MjEwODg0MDcwN30.4PYTl_Em8PQTufRRzw0ZZg9q4pQkHbo5SwH3wL5-KJk',   // 'eyJhbGciOi...'
    table: 'skeletons',
  },
};
