// Tek kaynak: kategori listesi hem modelde hem arayüzde buradan okunur.
// subs: [menüde görünen ad, arama kelimesi]
const categories = [
  {
    name: 'İnşaat & Tadilat',
    keywords: 'boya,badana,tadilat,mutfak,banyo,fayans,seramik,tesisat,kaçak,kombi,petek,elektrik,pano,parke,laminat,alçıpan,asma tavan,mantolama,çatı,kiremit,cam balkon,balkon,kapı,dolap,marangoz,su yalıtım,sıva,usta',
    subs: [['Boya Badana', 'boya'], ['Mutfak', 'mutfak'], ['Banyo', 'banyo'], ['Elektrik', 'elektrik'], ['Tesisat', 'tesisat'], ['Parke', 'parke'], ['Mantolama', 'mantolama']]
  },
  {
    name: 'Nakliye & Lojistik',
    keywords: 'nakliye,nakliyat,taşıma,taşınma,evden eve,ambar,palet,koli,kamyon,kamyonet,konteyner,lojistik,kargo',
    subs: [['Evden Eve', 'evden eve'], ['Ofis Taşıma', 'ofis'], ['Parça Eşya', 'parça'], ['Depo', 'depo']]
  },
  {
    name: 'Temizlik',
    keywords: 'temizlik,temizliği,koltuk yıkama,halı yıkama,cam silme,merdiven',
    subs: [['Ofis', 'ofis'], ['Apartman', 'apartman'], ['Koltuk', 'koltuk'], ['Ev', 'ev ']]
  },
  {
    name: 'Web Tasarım',
    keywords: 'web sitesi,web tasarım,wordpress,alan adı,hosting,internet sitesi',
    subs: [['Kurumsal Site', 'kurumsal'], ['Tanıtım Sitesi', 'tanıtım'], ['Site Yenileme', 'yenileme']]
  },
  {
    name: 'Yazılım Geliştirme',
    keywords: 'yazılım,mobil uygulama,e-ticaret,otomasyon,program,python,uygulama',
    subs: [['E-ticaret', 'e-ticaret'], ['Mobil Uygulama', 'mobil'], ['Otomasyon', 'otomasyon']]
  },
  {
    name: 'Grafik Tasarım',
    keywords: 'logo,kartvizit,katalog,broşür,afiş,arayüz,ambalaj,figma,grafik',
    subs: [['Logo', 'logo'], ['Katalog', 'katalog'], ['Arayüz', 'arayüz']]
  },
  {
    name: 'Dijital Pazarlama',
    keywords: 'instagram,sosyal medya,google ads,reklam,seo,facebook,pazarlama',
    subs: [['Sosyal Medya', 'instagram'], ['Google Ads', 'google'], ['SEO', 'seo']]
  },
  {
    name: 'Video & Animasyon',
    keywords: 'video,drone,tanıtım filmi,klip,animasyon,fotoğraf çekimi,düğün çekimi,düğün fotoğraf',
    subs: [['Tanıtım Filmi', 'tanıtım'], ['Düğün Çekimi', 'düğün'], ['Ürün Videosu', 'ürün']]
  },
  {
    name: 'Etkinlik & Organizasyon',
    keywords: 'organizasyon,düğün,kına,nişan,doğum günü,piknik,etkinlik,ses sistemi',
    subs: [['Düğün & Kına', 'kına'], ['Kurumsal Etkinlik', 'şirket'], ['Doğum Günü', 'doğum']]
  },
  {
    name: 'Çeviri & Metin',
    keywords: 'çeviri,tercüme,yeminli,metin yazar,noter',
    subs: [['Yeminli Çeviri', 'yeminli'], ['Teknik Çeviri', 'teknik'], ['Metin Yazarlığı', 'metin']]
  },
  {
    name: 'Eğitim',
    keywords: 'özel ders,ders,öğretmen,eğitim,kurs,lgs,yks,tyt',
    subs: [['Özel Ders', 'özel ders'], ['Yabancı Dil', 'ingilizce'], ['Kurumsal Eğitim', 'ekib']]
  },
  {
    name: 'Danışmanlık',
    keywords: 'muhasebe,mali müşavir,avukat,hukuk,danışman,şirket kuruluşu,gümrük',
    subs: [['Mali Müşavirlik', 'muhasebe'], ['Hukuk', 'hukuk'], ['İç Mimari', 'showroom']]
  },
  {
    name: 'Diğer',
    keywords: 'bahçe,peyzaj,kamera,alarm,tedarik',
    subs: [['Bahçe & Peyzaj', 'bahçe'], ['Güvenlik Sistemi', 'kamera'], ['Tedarik', 'tedarik']]
  }
];

module.exports = categories;
module.exports.names = categories.map(c => c.name);

// Talep başlığından kategori tahmini: en uzun eşleşen kelime kazanır. Tarayıcı da aynı kuralı izler.
module.exports.guess = text => {
  const title = String(text || '').toLocaleLowerCase('tr-TR');
  let best = '';
  let bestLength = 0;
  for (const category of categories) {
    for (const word of category.keywords.split(',')) {
      if (word.length > bestLength && title.includes(word)) {
        best = category.name;
        bestLength = word.length;
      }
    }
  }
  return best;
};
