// Настройки проекта. Файл подключается до main.js обычным <script>.
// Чтобы скелеты и прогресс сохранялись не только в браузере, заведи бесплатный проект
// на supabase.com, выполни SQL из README (раздел «База») и впиши сюда URL и anon-ключ.
// anon-ключ публичный по замыслу Supabase — его можно коммитить.
window.MINSK_CONFIG = {
  supabase: {
    url: '',       // например 'https://abcdefgh.supabase.co'
    anonKey: '',   // 'eyJhbGciOi...'
    table: 'skeletons',
  },
};
