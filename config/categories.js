// Tek kaynak: kategori listesi hem modelde hem arayüzde buradan okunur.
// subs: [menüde görünen ad, arama kelimesi]
const categories = [
  {
    name: 'İnşaat & Tadilat', icon: 'hammer',
    subs: [['Boya Badana', 'boya'], ['Mutfak', 'mutfak'], ['Banyo', 'banyo'], ['Elektrik', 'elektrik'], ['Tesisat', 'tesisat'], ['Parke', 'parke'], ['Mantolama', 'mantolama']]
  },
  {
    name: 'Nakliye & Lojistik', icon: 'truck',
    subs: [['Evden Eve', 'evden eve'], ['Ofis Taşıma', 'ofis'], ['Parça Eşya', 'parça'], ['Depo', 'depo']]
  },
  {
    name: 'Temizlik', icon: 'spray-can',
    subs: [['Ofis', 'ofis'], ['Apartman', 'apartman'], ['Koltuk', 'koltuk'], ['Ev', 'ev ']]
  },
  {
    name: 'Web Tasarım', icon: 'layout-template',
    subs: [['Kurumsal Site', 'kurumsal'], ['Tanıtım Sitesi', 'tanıtım'], ['Site Yenileme', 'yenileme']]
  },
  {
    name: 'Yazılım Geliştirme', icon: 'code-xml',
    subs: [['E-ticaret', 'e-ticaret'], ['Mobil Uygulama', 'mobil'], ['Otomasyon', 'otomasyon']]
  },
  {
    name: 'Grafik Tasarım', icon: 'palette',
    subs: [['Logo', 'logo'], ['Katalog', 'katalog'], ['Arayüz', 'arayüz']]
  },
  {
    name: 'Dijital Pazarlama', icon: 'megaphone',
    subs: [['Sosyal Medya', 'instagram'], ['Google Ads', 'google'], ['SEO', 'seo']]
  },
  {
    name: 'Video & Animasyon', icon: 'clapperboard',
    subs: [['Tanıtım Filmi', 'tanıtım'], ['Düğün Çekimi', 'düğün'], ['Ürün Videosu', 'ürün']]
  },
  {
    name: 'Etkinlik & Organizasyon', icon: 'party-popper',
    subs: [['Düğün & Kına', 'kına'], ['Kurumsal Etkinlik', 'şirket'], ['Doğum Günü', 'doğum']]
  },
  {
    name: 'Çeviri & Metin', icon: 'languages',
    subs: [['Yeminli Çeviri', 'yeminli'], ['Teknik Çeviri', 'teknik'], ['Metin Yazarlığı', 'metin']]
  },
  {
    name: 'Eğitim', icon: 'graduation-cap',
    subs: [['Özel Ders', 'özel ders'], ['Yabancı Dil', 'ingilizce'], ['Kurumsal Eğitim', 'ekib']]
  },
  {
    name: 'Danışmanlık', icon: 'messages-square',
    subs: [['Mali Müşavirlik', 'muhasebe'], ['Hukuk', 'hukuk'], ['İç Mimari', 'showroom']]
  },
  {
    name: 'Diğer', icon: 'shapes',
    subs: [['Bahçe & Peyzaj', 'bahçe'], ['Güvenlik Sistemi', 'kamera'], ['Tedarik', 'tedarik']]
  }
];

module.exports = categories;
module.exports.names = categories.map(c => c.name);
