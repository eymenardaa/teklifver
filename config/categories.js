// Tek kaynak: kategori listesi hem modelde hem arayüzde buradan okunur.
// subs: [menüde görünen ad, arama kelimesi]
const categories = [
  {
    name: 'İnşaat & Tadilat',
    subs: [['Boya Badana', 'boya'], ['Mutfak', 'mutfak'], ['Banyo', 'banyo'], ['Elektrik', 'elektrik'], ['Tesisat', 'tesisat'], ['Parke', 'parke'], ['Mantolama', 'mantolama']]
  },
  {
    name: 'Nakliye & Lojistik',
    subs: [['Evden Eve', 'evden eve'], ['Ofis Taşıma', 'ofis'], ['Parça Eşya', 'parça'], ['Depo', 'depo']]
  },
  {
    name: 'Temizlik',
    subs: [['Ofis', 'ofis'], ['Apartman', 'apartman'], ['Koltuk', 'koltuk'], ['Ev', 'ev ']]
  },
  {
    name: 'Web Tasarım',
    subs: [['Kurumsal Site', 'kurumsal'], ['Tanıtım Sitesi', 'tanıtım'], ['Site Yenileme', 'yenileme']]
  },
  {
    name: 'Yazılım Geliştirme',
    subs: [['E-ticaret', 'e-ticaret'], ['Mobil Uygulama', 'mobil'], ['Otomasyon', 'otomasyon']]
  },
  {
    name: 'Grafik Tasarım',
    subs: [['Logo', 'logo'], ['Katalog', 'katalog'], ['Arayüz', 'arayüz']]
  },
  {
    name: 'Dijital Pazarlama',
    subs: [['Sosyal Medya', 'instagram'], ['Google Ads', 'google'], ['SEO', 'seo']]
  },
  {
    name: 'Video & Animasyon',
    subs: [['Tanıtım Filmi', 'tanıtım'], ['Düğün Çekimi', 'düğün'], ['Ürün Videosu', 'ürün']]
  },
  {
    name: 'Etkinlik & Organizasyon',
    subs: [['Düğün & Kına', 'kına'], ['Kurumsal Etkinlik', 'şirket'], ['Doğum Günü', 'doğum']]
  },
  {
    name: 'Çeviri & Metin',
    subs: [['Yeminli Çeviri', 'yeminli'], ['Teknik Çeviri', 'teknik'], ['Metin Yazarlığı', 'metin']]
  },
  {
    name: 'Eğitim',
    subs: [['Özel Ders', 'özel ders'], ['Yabancı Dil', 'ingilizce'], ['Kurumsal Eğitim', 'ekib']]
  },
  {
    name: 'Danışmanlık',
    subs: [['Mali Müşavirlik', 'muhasebe'], ['Hukuk', 'hukuk'], ['İç Mimari', 'showroom']]
  },
  {
    name: 'Diğer',
    subs: [['Bahçe & Peyzaj', 'bahçe'], ['Güvenlik Sistemi', 'kamera'], ['Tedarik', 'tedarik']]
  }
];

module.exports = categories;
module.exports.names = categories.map(c => c.name);
