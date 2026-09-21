// Sabit veriler: varsayilan gorev sablonlari, gunler, temalar, avatarlar.
// Bu dosyada hicbir cocuk adi hard-coded degildir.

export const SCHEMA_VERSION = 2;

export const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const FULL_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const DEFAULT_HOMEWORK_TASKS = [
  { id: 'sound', icon: '🔤', title: 'Ses / harf çalışması', desc: 'O günkü sesi tanı, oku ve yaz' },
  { id: 'areview', icon: '🐝', title: 'Haftanın sesi kısa tekrar', desc: '5–10 dk kısa tekrar' },
  { id: 'read', icon: '📖', title: 'Okuma çalışması', desc: 'Hece / kelime / kısa cümle' },
  { id: 'write', icon: '✏️', title: 'Yazma çalışması', desc: 'Güzel yazı ve satır çalışması' },
  { id: 'math', icon: '🔢', title: 'Matematik', desc: 'Sayı / eşleştirme / işlem' },
  { id: 'book', icon: '📚', title: 'Kitap / hikâye', desc: '10–15 dakika' },
  { id: 'activity', icon: '🎨', title: 'Sanat / etkinlik', desc: 'Kesme, boyama, yapıştırma, oyun' },
  { id: 'life', icon: '🌍', title: 'Hayat bilgisi / sohbet', desc: 'Günlük yaşam, gözlem, paylaşım' },
];

export const CARE_GROUPS = ['Sabah', 'Gün içinde', 'Akşam'];

export const DEFAULT_CARE_TASKS = [
  { id: 'toilet', cat: 'Sabah', icon: '🚽', title: 'Tuvalete gittim', desc: 'İhtiyacımı fark ettim ve temizliğimi yaptım' },
  { id: 'hands', cat: 'Sabah', icon: '🫧', title: 'Ellerimi yıkadım', desc: 'Sabun kullandım ve ellerimi kuruladım' },
  { id: 'face', cat: 'Sabah', icon: '💦', title: 'Elimi yüzümü yıkadım', desc: 'Sabah temizliğimi yaptım' },
  { id: 'teeth_am', cat: 'Sabah', icon: '🪥', title: 'Dişlerimi fırçaladım', desc: 'Sabah diş bakımımı yaptım' },
  { id: 'dress', cat: 'Sabah', icon: '👕', title: 'Giyindim', desc: 'Kıyafetlerimi giydim / yardım aldım' },
  { id: 'meal', cat: 'Gün içinde', icon: '🍽️', title: 'Yemeğimi güzel yedim', desc: 'Sofra düzenine dikkat ettim' },
  { id: 'water', cat: 'Gün içinde', icon: '💧', title: 'Suyumu içtim', desc: 'Gün içinde su içmeyi hatırladım' },
  { id: 'toys', cat: 'Gün içinde', icon: '🧸', title: 'Oyuncaklarımı topladım', desc: 'Kullandıklarımı yerine koydum' },
  { id: 'hair', cat: 'Gün içinde', icon: '🪮', title: 'Saçımı taradım', desc: 'Kişisel bakımımı tamamladım' },
  { id: 'teeth_pm', cat: 'Akşam', icon: '🪥', title: 'Dişlerimi fırçaladım', desc: 'Akşam diş bakımımı yaptım' },
  { id: 'pajama', cat: 'Akşam', icon: '🌙', title: 'Pijamamı giydim', desc: 'Uyku hazırlığına başladım' },
  { id: 'sleep', cat: 'Akşam', icon: '🛏️', title: 'Uykuya hazırlandım', desc: 'Yatağa hazırlanıp rutinimi tamamladım' },
];

// Pastel vurgu renkleri. Her cocuk profilinde secilir.
export const THEMES = {
  pink:   { label: 'Pembe',  accent: '#ff78ad', soft: '#ffe3ef', deep: '#a13b69' },
  purple: { label: 'Mor',    accent: '#9a7cf6', soft: '#ece4ff', deep: '#6d51b8' },
  blue:   { label: 'Mavi',   accent: '#57b6f5', soft: '#ddf1ff', deep: '#2b6c9c' },
  mint:   { label: 'Mint',   accent: '#57c79c', soft: '#dcf7ec', deep: '#2c7a5c' },
  yellow: { label: 'Sarı',   accent: '#efb340', soft: '#fff2d2', deep: '#8a6413' },
  peach:  { label: 'Şeftali', accent: '#ff9a76', soft: '#ffe7dd', deep: '#a8512f' },
};

export const THEME_ORDER = ['pink', 'purple', 'blue', 'mint', 'yellow', 'peach'];

export const AVATARS = ['🌸', '💜', '🐻', '🦊', '🐰', '🐨', '🦄', '🌈', '⭐', '🍓', '🐧', '🐢'];

export const CARE_GROUP_ICON = { 'Sabah': '☀️', 'Gün içinde': '🌼', 'Akşam': '🌙' };
