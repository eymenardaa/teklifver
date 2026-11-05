// Geliştirme ortamı için örnek veri. Veritabanında hiç talep yoksa sunucu açılışında eklenir.
// Kapatmak için .env dosyasına DEMO_DATA=false yazın; silmek için: npm run demo:sil
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Request = require('../models/Request');
const Bid = require('../models/Bid');
const Message = require('../models/Message');
const Review = require('../models/Review');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const SavedSearch = require('../models/SavedSearch');

const DEMO_DOMAIN = 'teklifver.test';
const DEMO_PASSWORD = 'demo1234';

// Giriş sayfasındaki tek tıkla giriş butonları
const demoAccounts = [
  { label: 'Müşteri hesabı', email: `musteri@${DEMO_DOMAIN}`, password: DEMO_PASSWORD },
  { label: 'Firma hesabı', email: `sirket@${DEMO_DOMAIN}`, password: DEMO_PASSWORD },
  { label: 'Yönetici hesabı', email: `yonetici@${DEMO_DOMAIN}`, password: DEMO_PASSWORD }
];

// Örnek yorumlar: tamamlanan talebe göre [puan, yorum]
const demoReviews = {
  'Ofis derin temizlik (tadilat sonrası)': [5, 'Söz verdikleri gün geldiler, camlar dahil tertemiz bıraktılar.'],
  'Depo kurulumu ve palet taşıma': [4, 'İş sorunsuz bitti, sadece sabah biraz geç başladılar.'],
  'Teras su yalıtımı, 60 m2': [5, 'İlk yağmurda kontrol ettik, hiç sızıntı yok. Ustalar çok düzenliydi.'],
  'Ürün kataloğu tasarımı, 24 sayfa': [5, 'Revizyonlarda çok yardımcı oldular, baskı dosyaları eksiksizdi.'],
  'Kurumsal site yenileme': [4, 'Site hızlandı ve mobilde düzgün görünüyor. Teslim birkaç gün gecikti.'],
  'Banyo tadilatı, 5 m2 komple': [5, 'Söylenen fiyatın üstüne çıkmadılar, 10 günde bitti. Temiz çalıştılar.'],
  'Salon ve yatak odası boya': [4, 'İşçilik iyi, eşyaları güzel korudular. Bir gün geç başladılar.']
};

// Örnek bildirimler: [kişi, metin, kaçSaatÖnce, okundu, talep başlığı]
const demoNotifications = [
  ['elif', 'Usta Eller Tadilat, "Mutfak dolapları ve tezgah yenilenecek" talebinize teklif verdi.', 3, false, 'Mutfak dolapları ve tezgah yenilenecek'],
  ['elif', 'Temel Yapı İnşaat, "Mutfak dolapları ve tezgah yenilenecek" talebinize teklif verdi.', 2, false, 'Mutfak dolapları ve tezgah yenilenecek'],
  ['elif', 'Kodhane Yazılım, "Kafem için web sitesi yaptırmak istiyorum" talebinize teklif verdi.', 16, true, 'Kafem için web sitesi yaptırmak istiyorum'],
  ['usta', '"45 m2 salon ve koridor boya badana" talebindeki teklifiniz kabul edildi.', 190, true, '45 m2 salon ve koridor boya badana'],
  ['usta', 'İnşaat & Tadilat kategorisinde yeni talep: "3+1 daire komple boya, tavanlar dahil"', 2, false, '3+1 daire komple boya, tavanlar dahil'],
  ['usta', 'İnşaat & Tadilat kategorisinde yeni talep: "Lavabo gideri ve batarya değişimi"', 6, false, 'Lavabo gideri ve batarya değişimi']
];

const verifiedCompanies = ['usta', 'kodhane', 'mavi', 'kadraj', 'dilmer'];

const customers = {
  elif: { name: 'Elif Yılmaz', email: `musteri@${DEMO_DOMAIN}`, phone: '0555 000 00 01', months: 14 },
  burak: { name: 'Burak Aydın', months: 31 },
  zeynep: { name: 'Zeynep Kara', months: 8 },
  murat: { name: 'Murat Şahin', months: 22 },
  sevgi: { name: 'Sevgi Doğan', months: 5 },
  okan: { name: 'Okan Tekin', months: 41 },
  hatice: { name: 'Hatice Ünal', months: 17 },
  kerem: { name: 'Kerem Aksoy', months: 3 }
};

const companies = {
  usta: {
    name: 'Hakan Demir', companyName: 'Usta Eller Tadilat', email: `sirket@${DEMO_DOMAIN}`, phone: '0555 000 00 02',
    address: 'İstanbul', rating: 4.8, ratingCount: 127, months: 52, specialties: ['Mutfak', 'Banyo', 'Boya badana', 'Anahtar teslim'],
    companyDescription: '2012 yılından beri ev ve ofis tadilatı yapıyoruz. Keşif ücretsizdir, fiyatı yazılı veririz. İşçiliğe 2 yıl garanti.'
  },
  temel: {
    name: 'Serkan Polat', companyName: 'Temel Yapı İnşaat', address: 'Ankara', rating: 4.4, ratingCount: 58, months: 76,
    specialties: ['Kaba inşaat', 'Tadilat', 'Su yalıtımı'],
    companyDescription: 'Konut ve ticari yapılarda inşaat ve tadilat işleri. Ankara ve çevre illere hizmet veriyoruz.'
  },
  ege: {
    name: 'Tolga Er', companyName: 'Ege Dekorasyon', address: 'İzmir', rating: 4.6, ratingCount: 43, months: 39,
    specialties: ['İç mimari', 'Alçıpan', 'Parke', 'Boya'],
    companyDescription: 'İzmir genelinde dekorasyon ve tadilat. Alçıpan, asma tavan, parke ve boya işleri yapıyoruz.'
  },
  kodhane: {
    name: 'Can Öztürk', companyName: 'Kodhane Yazılım', address: 'İstanbul', rating: 4.9, ratingCount: 86, months: 47,
    specialties: ['Web sitesi', 'Mobil uygulama', 'E-ticaret'],
    companyDescription: 'Küçük işletmeler için web sitesi, e-ticaret ve mobil uygulama geliştiriyoruz. Teslim sonrası 3 ay ücretsiz destek.'
  },
  piksel: {
    name: 'Selin Arslan', companyName: 'Piksel Stüdyo', address: 'İzmir', rating: 4.7, ratingCount: 64, months: 28,
    specialties: ['Logo', 'Kurumsal kimlik', 'Ambalaj'],
    companyDescription: 'Logo, kurumsal kimlik ve ambalaj tasarımı. Her projede 2 revizyon hakkı.'
  },
  reklamhane: {
    name: 'Gökhan Tan', companyName: 'Reklamhane Ajans', address: 'Ankara', rating: 4.3, ratingCount: 31, months: 19,
    specialties: ['Google Ads', 'Sosyal medya', 'SEO'],
    companyDescription: 'Google Ads, Meta reklamları ve sosyal medya yönetimi. Aylık raporlama yapıyoruz.'
  },
  mavi: {
    name: 'Emre Çelik', companyName: 'Mavi Yol Nakliyat', address: 'Ankara', rating: 4.6, ratingCount: 212, months: 88,
    specialties: ['Evden eve', 'Ofis taşıma', 'Şehirler arası'],
    companyDescription: 'Sigortalı evden eve ve ofis taşımacılığı. Asansörlü taşıma, paketleme ve kurulum dahil.'
  },
  anadolu: {
    name: 'Fatih Güneş', companyName: 'Anadolu Lojistik', address: 'Kocaeli', rating: 4.2, ratingCount: 76, months: 60,
    specialties: ['Parsiyel', 'Komple araç', 'Depolama'],
    companyDescription: 'Türkiye geneli parsiyel ve komple yük taşıma, depolama hizmeti.'
  },
  isilti: {
    name: 'Ayşe Koç', companyName: 'Işıltı Temizlik', address: 'İstanbul', rating: 4.5, ratingCount: 98, months: 33,
    specialties: ['Ofis temizliği', 'İnşaat sonrası', 'Koltuk yıkama'],
    companyDescription: 'Ev, ofis ve inşaat sonrası temizlik. Malzemeler bize aittir, personelimiz sigortalıdır.'
  },
  piril: {
    name: 'Nuray Şen', companyName: 'Pırıl Temizlik', address: 'Bursa', rating: 4.1, ratingCount: 22, months: 12,
    specialties: ['Apartman', 'Ofis', 'Cam silme'],
    companyDescription: 'Bursa merkez ilçelerde apartman ve ofis temizliği.'
  },
  kadraj: {
    name: 'Deniz Yıldız', companyName: 'Kadraj Medya', address: 'Bursa', rating: 4.9, ratingCount: 37, months: 26,
    specialties: ['Tanıtım filmi', 'Drone çekimi', 'Düğün çekimi'],
    companyDescription: 'Tanıtım filmi, düğün ve etkinlik çekimi. Drone lisansımız mevcuttur.'
  },
  sahne: {
    name: 'Merve Aslan', companyName: 'Sahne Organizasyon', address: 'İstanbul', rating: 4.4, ratingCount: 51, months: 44,
    specialties: ['Düğün', 'Kurumsal etkinlik', 'Ses ışık'],
    companyDescription: 'Düğün, nişan, kurumsal etkinlik organizasyonu. Ses ve ışık sistemi kiralama.'
  },
  dilmer: {
    name: 'Aylin Korkmaz', companyName: 'Dilmer Çeviri ve Eğitim', address: 'Ankara', rating: 4.7, ratingCount: 45, months: 66,
    specialties: ['Yeminli çeviri', 'İş İngilizcesi', 'Noter onayı'],
    companyDescription: 'Yeminli tercüme ve kurumlara yabancı dil eğitimi veriyoruz.'
  },
  akin: {
    name: 'Volkan Akın', companyName: 'Akın Danışmanlık', address: 'İstanbul', rating: 4.5, ratingCount: 19, months: 30,
    specialties: ['Mali müşavirlik', 'Şirket kuruluşu', 'Teşvik'],
    companyDescription: 'Şirket kuruluşu, mali müşavirlik ve devlet teşvikleri konusunda danışmanlık.'
  }
};

// Kategoriye göre teklif verebilecek firmalar
const companiesByCategory = {
  'İnşaat & Tadilat': ['usta', 'temel', 'ege'],
  'Nakliye & Lojistik': ['mavi', 'anadolu'],
  Temizlik: ['isilti', 'piril'],
  'Web Tasarım': ['kodhane', 'piksel'],
  'Yazılım Geliştirme': ['kodhane'],
  'Grafik Tasarım': ['piksel', 'reklamhane'],
  'Dijital Pazarlama': ['reklamhane', 'piksel'],
  'Video & Animasyon': ['kadraj'],
  'Etkinlik & Organizasyon': ['sahne', 'kadraj'],
  'Çeviri & Metin': ['dilmer'],
  Eğitim: ['dilmer'],
  Danışmanlık: ['akin'],
  Diğer: ['usta', 'isilti']
};

const bidTexts = [
  'Fiyata işçilik ve malzeme dahildir. Keşif sonrası kesin fiyat verilir.',
  'Daha önce benzer işler yaptık, referans gönderebiliriz. Ödeme iş bitiminde.',
  'Hemen başlayabiliriz. %30 avans, kalanı teslimde.',
  'Fiyata KDV dahil değildir. Fatura kesilir.',
  'Detayları görüşmek için aranabiliriz, uygun fiyat çıkarırız.',
  'Süre iş programımıza göre verilmiştir, gerekirse kısaltılabilir.'
];

const img = (...names) => names.map(name => `/img/ilan/${name}.jpg`);

// [sahip, başlık, kategori, il, ilçe, enAz, enFazla, kaçSaatÖnce, görüntülenme, teklifSayısı, fotoğraflar, açıklama, ek]
const listings = [
  ['elif', 'Mutfak dolapları ve tezgah yenilenecek', 'İnşaat & Tadilat', 'İstanbul', 'Kadıköy', 60000, 95000, 5, 186, 0, img('mutfak2', 'mutfak3', 'usta'),
    'Yaklaşık 12 m2 mutfak. Eski dolaplar sökülecek, moloz alınacak. Tezgah kuvars olsun istiyorum ama başka önerilere de açığım.\n\nAnkastre fırın ve ocak bende var, aynısını kullanacağım. Kat 3, asansör var.',
    { deadline: 40, bids: [['usta', 78000, 21, 'Keşif ücretsizdir. Söküm, moloz, MDF lake dolap ve kuvars tezgah fiyata dahildir. İşçiliğe 2 yıl garanti.', 'pending'], ['temel', 91000, 30, 'Özel ölçü dolap, kuvars tezgah ve aydınlatma dahil anahtar teslim.', 'pending']] }],
  ['elif', 'Kafem için web sitesi yaptırmak istiyorum', 'Web Tasarım', 'İstanbul', 'Beşiktaş', 15000, 30000, 20, 142, 0, img('kafe', 'web'),
    'Yeni açtığımız kafe için menü, konum ve iletişim sayfası olan sade bir site lazım. Telefonda düzgün görünsün. Menüyü kendim güncelleyebilmeliyim.\n\nAlan adı ve hosting de dahil olursa iyi olur.',
    { deadline: 30, bids: [['kodhane', 22000, 14, 'Tasarım, kurulum ve 1 yıl hosting dahil. Menü için yönetim paneli de ekliyoruz.', 'pending'], ['piksel', 18500, 21, 'Markanıza özel tasarım. Alan adı ilk yıl bizden.', 'pending']] }],
  ['elif', '45 m2 salon ve koridor boya badana', 'İnşaat & Tadilat', 'İstanbul', 'Üsküdar', 12000, 20000, 216, 74, 0, img('boya', 'salon'),
    'Salon ve koridor boyanacak. Birkaç yerde küçük çatlak var, alçı tamiri gerekiyor. Eşyalar evde, üstleri örtülmeli.',
    { status: 'in_progress', bids: [['usta', 16500, 4, 'Silinebilir boya ve alçı tamiri dahil. Mobilyaları koruyup 4 günde bitiriyoruz.', 'accepted']] }],
  ['elif', 'Ofis derin temizlik (tadilat sonrası)', 'Temizlik', 'İstanbul', 'Şişli', 4000, 8000, 504, 58, 0, img('temizlik'),
    '120 m2 ofis. Tadilat yeni bitti, cam, zemin ve mutfak dahil derin temizlik yapılacak.',
    { status: 'completed', bids: [['isilti', 6200, 1, '4 kişilik ekiple tek günde bitiriyoruz. Malzemeler bize ait.', 'accepted']] }],
  ['burak', 'Banyo komple tadilat, 6 m2', 'İnşaat & Tadilat', 'Ankara', 'Çankaya', 70000, 0, 9, 163, 0, img('banyo', 'banyo2'),
    'Fayans, lavabo, klozet ve duş kabini değişecek. Tesisat 25 yıllık, o da yenilenmeli. Malzemeyi birlikte seçebiliriz.',
    { deadline: 25, bids: [['usta', 82000, 12, 'Tesisat, seramik işçiliği ve vitrifiye montajı dahil. Malzeme seçiminde yardımcı oluyoruz.', 'pending'], ['temel', 76500, 15, 'Ankara içi keşif ücretsiz. Su yalıtımı dahil.', 'pending']] }],
  ['burak', '12 kişilik ofis taşınacak Kızılay - Söğütözü', 'Nakliye & Lojistik', 'Ankara', 'Çankaya', 0, 40000, 30, 97, 2, img('tasima', 'ofis'),
    'Masalar, dolaplar, sunucu kabini ve ekipman var. Paketleme ve yeni ofiste kurulum dahil olmalı. Hafta sonu taşınmak istiyoruz.', { deadline: 14 }],
  ['zeynep', 'Seramik markam için logo ve etiket tasarımı', 'Grafik Tasarım', 'İzmir', 'Karşıyaka', 8000, 18000, 3, 51, 2, img('logo', 'grafik'),
    'El yapımı seramik satacağız. Logo, renk paleti, kartvizit ve ambalaj etiketi lazım. Sade ve sıcak bir şey olsun.', { deadline: 20 }],
  ['zeynep', '200 ürünlük butik için e-ticaret sitesi', 'Yazılım Geliştirme', 'İzmir', 'Konak', 40000, 75000, 48, 221, 1, img('magaza', 'odeme'),
    'Sanal POS, kargo entegrasyonu ve stok takibi olmalı. Ürünleri kendim ekleyeceğim. Hazır altyapı da olur, özel yazılım da.', { deadline: 45 }],
  ['murat', 'Fabrika tanıtım filmi (yaklaşık 2 dk)', 'Video & Animasyon', 'Bursa', 'Nilüfer', 35000, 60000, 14, 69, 1, img('montaj', 'klaket'),
    'Tekstil fabrikamızın üretim sürecini anlatan film. Fuarda ve web sitesinde kullanacağız. Dış ses ve İngilizce altyazı gerekli.', { deadline: 35 }],
  ['murat', 'Restoran zinciri için mobil sipariş uygulaması', 'Yazılım Geliştirme', 'Bursa', 'Osmangazi', 90000, 160000, 72, 233, 1, img('mobil', 'yazilimci'),
    'iOS ve Android. Üyelik, sepet, online ödeme, şube seçimi. Kasa sistemiyle entegrasyon olursa artı.', { deadline: 60 }],
  ['murat', 'Satış ekibine iş İngilizcesi eğitimi', 'Eğitim', 'Bursa', 'Osmangazi', 20000, 35000, 40, 44, 0, img('ingilizce', 'egitim'),
    '8 kişi, haftada 2 gün, 3 ay. Yüz yüze ya da online olabilir. Seviyeler karışık.', { deadline: 21 }],
  ['zeynep', '80 m2 showroom yerleşim ve aydınlatma', 'Danışmanlık', 'İzmir', 'Bornova', 10000, 25000, 60, 38, 1, img('oda2', 'sandalye'),
    'Mobilya showroomumuz var. Yerleşim planı ve aydınlatma için danışmanlık almak istiyoruz. 3D görsel olursa iyi olur.', { deadline: 28 }],
  ['burak', 'Şirket yıl sonu yemeği, 120 kişi', 'Etkinlik & Organizasyon', 'Ankara', 'Çankaya', 80000, 130000, 16, 57, 2, img('davet', 'konferans'),
    'Mekan, menü, sahne, ses sistemi ve canlı müzik dahil. Aralık ayının ikinci haftası düşünüyoruz.', { deadline: 32 }],
  ['zeynep', 'Instagram ve reklam yönetimi (aylık)', 'Dijital Pazarlama', '', '', 12000, 22000, 26, 49, 2, img('analiz'),
    'Aylık içerik planı, görsel üretimi ve reklam yönetimi lazım. Uzaktan çalışılabilir.', {}],
  ['sevgi', '3+1 daire komple boya, tavanlar dahil', 'İnşaat & Tadilat', 'Antalya', 'Muratpaşa', 18000, 28000, 2, 34, 1, img('daire'),
    '110 m2 boş daire. Kiracı çıktı, komple boyanacak. Renk beyaz, bir duvar açık gri olabilir. Bu hafta başlanabilir.', { deadline: 7 }],
  ['sevgi', 'Evden eve nakliyat Antalya - İstanbul', 'Nakliye & Lojistik', 'Antalya', 'Kepez', 25000, 45000, 11, 121, 2, img('tir'),
    '3+1 ev eşyası. Antalya 2. kat asansörsüz, İstanbul Ataşehir 7. kat asansörlü. Ocak başında taşınacağım. Sigortalı olsun.', { deadline: 50 }],
  ['okan', 'Bahçe düzenleme ve çim serimi', 'Diğer', 'Muğla', 'Bodrum', 40000, 70000, 33, 83, 1, img('bahce', 'villa'),
    'Villa bahçesi yaklaşık 300 m2. Çim, sulama sistemi ve birkaç ağaç dikimi yapılacak. Peyzaj önerisi de alırım.', {}],
  ['okan', 'Villa için akıllı ev ve kamera sistemi', 'Diğer', 'Muğla', 'Bodrum', 55000, 90000, 52, 102, 0, img('kilit', 'ev'),
    'Akıllı kilit, 6 kamera, alarm ve aydınlatma kontrolü. Telefondan yönetilebilsin. Kablolama için tadilat istemiyorum.', {}],
  ['okan', 'Elektrik tesisatı yenilenecek, eski bina', 'İnşaat & Tadilat', 'Muğla', 'Milas', 30000, 50000, 80, 66, 2, img('elektrik'),
    '30 yıllık 2 katlı ev. Pano ve hatlar komple yenilenecek. Yetki belgeli usta olsun, ruhsat işleri için de yardım lazım.', {}],
  ['hatice', 'Mutfak ve banyo su kaçağı, tesisat', 'İnşaat & Tadilat', 'Konya', 'Selçuklu', 8000, 20000, 7, 92, 1, img('tesisat'),
    'Alt komşuya su sızıyor. Cihazla kaçak tespiti ve tamir yapacak usta arıyorum. Acele.', { deadline: 4 }],
  ['hatice', 'Apartman merdiven temizliği, haftada 2 gün', 'Temizlik', 'Konya', 'Meram', 3000, 5000, 28, 40, 1, img('cam'),
    '6 katlı, 12 daireli apartman. Merdiven, asansör ve giriş temizliği. Yıllık anlaşma yapılabilir.', {}],
  ['hatice', 'Diploma ve transkript yeminli İngilizce çeviri', 'Çeviri & Metin', 'Konya', 'Selçuklu', 500, 2000, 18, 29, 1, [],
    '4 sayfa. Noter onaylı olacak. Yurt dışı başvurusu için 1 hafta içinde lazım.', { deadline: 7 }],
  ['kerem', 'Limited şirket kuruluşu ve muhasebe', 'Danışmanlık', 'Eskişehir', 'Tepebaşı', 8000, 15000, 22, 56, 1, img('sozlesme'),
    'İki ortaklı yazılım şirketi kuracağız. Kuruluş işlemleri ve aylık muhasebe için fiyat almak istiyoruz. Genç girişimci desteği hakkında da bilgi alırım.', {}],
  ['kerem', 'Uygulama için arayüz tasarımı (Figma)', 'Grafik Tasarım', 'Eskişehir', 'Odunpazarı', 15000, 30000, 44, 77, 2, img('tablet'),
    'Yaklaşık 25 ekranlık mobil uygulama. Wireframe bizde hazır, görsel tasarım lazım.', {}],
  ['kerem', 'Tanıtım sitesi + SEO, yazılım şirketi', 'Web Tasarım', 'Eskişehir', 'Tepebaşı', 12000, 25000, 96, 88, 2, img('yazilimci'),
    '5 sayfalık kurumsal site ve temel SEO çalışması. İçerikleri biz vereceğiz.', {}],
  ['sevgi', 'Salon parke değişimi, 35 m2', 'İnşaat & Tadilat', 'Antalya', 'Konyaaltı', 14000, 24000, 36, 71, 2, img('salon2'),
    'Laminat parke sökülüp yenisi döşenecek. Süpürgelik dahil. Malzemeyi firma getirsin.', {}],
  ['burak', 'Alçıpan asma tavan ve spot aydınlatma', 'İnşaat & Tadilat', 'Ankara', 'Etimesgut', 10000, 18000, 58, 64, 2, img('oda'),
    'Salon ve antre, toplam 40 m2. Gizli led ve 12 spot yapılacak.', {}],
  ['murat', 'Depo kurulumu ve palet taşıma', 'Nakliye & Lojistik', 'Bursa', 'Nilüfer', 30000, 55000, 672, 102, 0, img('depo'),
    '400 m2 deponun raf ve paletleri yeni depoya taşınacak.',
    { status: 'completed', bids: [['mavi', 42000, 3, 'Forklift, 3 kamyon ve 6 kişilik ekip dahil. Raf kurulumu bizden.', 'accepted'], ['anadolu', 48000, 4, 'Komple araçla taşıma, sigorta dahil.', 'rejected']] }],
  ['burak', 'Teras su yalıtımı, 60 m2', 'İnşaat & Tadilat', 'Ankara', 'Etimesgut', 18000, 32000, 360, 71, 0, img('santiye'),
    'Teras katta su sızıntısı var. Yalıtım yenilenecek.',
    { status: 'completed', bids: [['temel', 26000, 6, 'Söküm, iki kat yalıtım ve seramik dahil. 5 yıl garanti.', 'accepted'], ['usta', 29500, 8, 'Yalıtım ve seramik işçiliği dahil, 2 yıl garanti.', 'rejected']] }],
  ['zeynep', 'Ürün kataloğu tasarımı, 24 sayfa', 'Grafik Tasarım', 'İzmir', 'Konak', 6000, 14000, 840, 88, 0, img('kitap'),
    'Yeni sezon ürünleri için baskıya hazır katalog.',
    { status: 'completed', bids: [['piksel', 9500, 12, 'Sayfa düzeni, görsel düzenleme ve baskı dosyası dahil.', 'accepted']] }],
  ['burak', 'Kurumsal site yenileme', 'Web Tasarım', 'Ankara', 'Çankaya', 25000, 45000, 1150, 164, 0, img('toplanti'),
    '10 yıllık siteyi mobil uyumlu ve hızlı hale getirmek istiyoruz.',
    { status: 'completed', bids: [['kodhane', 36000, 25, 'Yeni tasarım, içerik aktarımı ve 1 yıl bakım dahil.', 'accepted'], ['piksel', 41000, 30, 'Tasarım ağırlıklı çözüm.', 'rejected']] }],
  ['murat', 'Fuar standı için ürün videosu', 'Video & Animasyon', 'Bursa', 'Osmangazi', 15000, 28000, 144, 53, 0, img('kamera'),
    '45 saniyelik, sessiz, döngülü ürün videosu. Fuar ekranlarında dönecek.',
    { status: 'in_progress', bids: [['kadraj', 22000, 10, 'Stüdyo çekimi, kurgu ve döngüye uygun çıktı dahil.', 'accepted']] }],
  ['zeynep', 'Ofis için haftalık temizlik', 'Temizlik', 'İzmir', 'Bornova', 3000, 6000, 23, 34, 1, [],
    '90 m2 ofis, haftada 2 gün. Malzeme firmadan.', { deadline: 10 }],
  ['okan', 'Yazlık ev açılış temizliği', 'Temizlik', 'Muğla', 'Datça', 2500, 5000, 66, 47, 1, img('salon3'),
    '2+1 yazlık. Kışın kapalı kaldı, cam dahil genel temizlik yapılacak.', {}],
  ['kerem', 'Python ile veri raporlama aracı', 'Yazılım Geliştirme', 'Eskişehir', 'Tepebaşı', 20000, 40000, 110, 95, 1, img('kod'),
    'Excel dosyalarından haftalık rapor çıkaran basit bir araç. Windows üzerinde çalışacak.', {}],
  ['sevgi', 'Düğün fotoğraf ve video çekimi', 'Video & Animasyon', 'Antalya', 'Muratpaşa', 20000, 40000, 13, 118, 1, img('balon'),
    'Haziran ayında kır düğünü. Dış çekim, drone ve klip dahil paket arıyorum.', { deadline: 90 }],
  ['hatice', 'Kına gecesi organizasyonu, 80 kişi', 'Etkinlik & Organizasyon', 'Konya', 'Karatay', 25000, 45000, 38, 62, 1, [],
    'Salon var, süsleme, ses sistemi ve yemek ayarlanacak.', { deadline: 45 }],
  ['kerem', 'Google Ads kurulumu, küçük bütçe', 'Dijital Pazarlama', 'Eskişehir', 'Tepebaşı', 3000, 8000, 54, 41, 1, [],
    'Aylık 10 bin TL reklam bütçesi için kampanya kurulumu ve optimizasyon.', {}],
  ['okan', 'Teknik şartname çevirisi, 60 sayfa', 'Çeviri & Metin', 'Muğla', 'Bodrum', 8000, 15000, 120, 31, 1, [],
    'Türkçeden Almancaya. Makine sektörü, teknik terimler var.', {}],
  ['sevgi', 'Çocuğuma matematik özel ders (8. sınıf)', 'Eğitim', 'Antalya', 'Konyaaltı', 0, 6000, 8, 27, 1, [],
    'LGS hazırlık, haftada 2 gün. Yüz yüze tercih ederim.', {}],
  ['hatice', 'Konya - Ankara parça eşya gönderimi', 'Nakliye & Lojistik', 'Konya', 'Selçuklu', 0, 7000, 19, 37, 2, img('kargo'),
    'Bir buzdolabı, bir çamaşır makinesi ve 10 koli. Ambalajlı alınsın.', {}],
  ['burak', 'İthalat için gümrük ve lojistik danışmanlığı', 'Danışmanlık', 'Ankara', 'Yenimahalle', 0, 0, 130, 45, 1, img('konteyner'),
    'Çin\'den ilk kez konteyner getireceğim. Süreç hakkında destek arıyorum.', {}],
  ['elif', 'Eski koltuk takımı yıkama', 'Temizlik', 'İstanbul', 'Kadıköy', 0, 2000, 170, 26, 0, [],
    '3+3+1 koltuk takımı. Yerinde yıkama olsun.', {}],
  ['okan', 'Müstakil ev dış cephe mantolama', 'İnşaat & Tadilat', 'Muğla', 'Milas', 120000, 200000, 15, 138, 3, img('ev', 'insaat'),
    '2 katlı müstakil ev. Yaklaşık 220 m2 cephe. Mantolama, sıva ve boya yapılacak.', { deadline: 60 }],
  ['kerem', 'Ofis için ergonomik sandalye tedariği', 'Diğer', 'Eskişehir', 'Tepebaşı', 25000, 40000, 74, 39, 1, img('sandalye'),
    '10 adet ofis sandalyesi lazım. Faturalı, teslim dahil fiyat.', {}],
  ['sevgi', 'Salon için özel ölçü TV ünitesi', 'İnşaat & Tadilat', 'Antalya', 'Kepez', 15000, 28000, 90, 58, 1, img('salon4', 'marangoz'),
    'Duvar boyu TV ünitesi, kapaklı raflarla. Marangoz arıyorum, ölçüleri paylaşabilirim.', {}],
  ['hatice', 'Dükkan vitrin ve iç düzenleme', 'İnşaat & Tadilat', 'Konya', 'Karatay', 35000, 60000, 26, 79, 2, img('salon5'),
    'Giyim mağazası, 70 m2. Raf sistemi, vitrin ve aydınlatma yenilenecek.', { deadline: 30 }],
  ['murat', 'Toplantı odası ses ve görüntü sistemi', 'Diğer', 'Bursa', 'Nilüfer', 30000, 50000, 100, 48, 1, img('proje'),
    'Video konferans ekranı, kamera, tavan mikrofonu. Kurulum dahil teklif rica ederim.', {}],
  ['burak', '2+1 daire boya, kapılar dahil', 'İnşaat & Tadilat', 'Ankara', 'Keçiören', 15000, 22000, 4, 53, 2, img('oda'),
    'Yaklaşık 85 m2. İç kapılar ve pervazlar da boyanacak. Daire boş, bu ay bitmeli.', { deadline: 6 }],
  ['murat', 'Dükkan elektrik panosu ve aydınlatma', 'İnşaat & Tadilat', 'Bursa', 'Yıldırım', 18000, 32000, 21, 61, 2, img('elektrik'),
    '60 m2 dükkan. Pano yenilenecek, led aydınlatmaya geçilecek. Belgeli usta arıyorum.', {}],
  ['elif', 'Lavabo gideri ve batarya değişimi', 'İnşaat & Tadilat', 'İstanbul', 'Maltepe', 1500, 4000, 6, 38, 2, img('tesisat'),
    'Banyo lavabosu su kaçırıyor, batarya da değişecek. Hafta içi akşam gelebilecek usta olursa iyi olur.', { deadline: 3 }],
  ['zeynep', 'Laminat parke döşeme, 90 m2', 'İnşaat & Tadilat', 'İzmir', 'Buca', 28000, 45000, 31, 67, 2, img('salon5'),
    'Eski parkeler sökülecek. 8 mm laminat, süpürgelik ve işçilik dahil fiyat rica ediyorum.', {}],
  ['sevgi', 'Apartman dış cephe mantolama, 5 kat', 'İnşaat & Tadilat', 'Antalya', 'Kepez', 450000, 700000, 50, 205, 3, img('insaat', 'santiye'),
    'Yönetim olarak fiyat topluyoruz. Yaklaşık 900 m2 cephe, iskele dahil. Karar toplantıda verilecek.', { deadline: 21 }],
  ['kerem', 'Mutfak dolabı kapak değişimi', 'İnşaat & Tadilat', 'Eskişehir', 'Odunpazarı', 12000, 22000, 17, 49, 2, img('mutfak3'),
    'Gövdeler sağlam, sadece kapaklar ve kulplar değişecek. 14 kapak var.', {}],
  ['hatice', 'Banyo fayans tamiri ve derz yenileme', 'İnşaat & Tadilat', 'Konya', 'Meram', 5000, 12000, 42, 44, 2, img('banyo2'),
    'Birkaç kırık fayans ve eskimiş derzler var. Komple yenileme istemiyorum.', {}],
  ['okan', 'Sürgülü cam balkon yaptırılacak', 'İnşaat & Tadilat', 'Muğla', 'Fethiye', 45000, 80000, 28, 90, 2, img('daire'),
    '8 metre balkon. Isıcamlı katlanır sistem. Fiyatta montaj olsun.', {}],
  ['burak', 'Evden eve nakliyat Ankara içi, 2+1', 'Nakliye & Lojistik', 'Ankara', 'Mamak', 8000, 15000, 3, 84, 2, img('kargo'),
    '4. kat asansörsüz, yeni ev 2. kat asansörlü. Ay sonunda taşınacağız.', { deadline: 5 }],
  ['murat', 'Bursa - İzmir parça eşya, 2 palet', 'Nakliye & Lojistik', 'Bursa', 'Nilüfer', 0, 9000, 12, 47, 2, img('depo'),
    'Paletli tekstil ürünü, toplam 800 kg. Haftaya gidecek. Faturalı.', { deadline: 7 }],
  ['elif', 'Evden eve nakliyat İstanbul - Bursa', 'Nakliye & Lojistik', 'İstanbul', 'Ataşehir', 22000, 38000, 37, 112, 2, img('tir'),
    '3+1 ev, sigortalı olsun. Mobilya söküm ve kurulum dahil fiyat istiyorum.', {}],
  ['kerem', 'Konteyner ile ihracat taşıması', 'Nakliye & Lojistik', 'Eskişehir', 'Tepebaşı', 0, 0, 86, 58, 1, img('konteyner'),
    'İzmir limanına kadar 20 ft konteyner taşınacak. Aylık düzenli iş olabilir.', {}],
  ['zeynep', 'Ev temizliği, haftalık düzenli', 'Temizlik', 'İzmir', 'Karşıyaka', 2500, 4500, 10, 41, 2, img('cam'),
    '3+1 ev, haftada 1 gün. Referansı olan kişi veya firma arıyorum.', {}],
  ['murat', 'Koltuk ve halı yıkama, ofis', 'Temizlik', 'Bursa', 'Osmangazi', 3000, 7000, 46, 35, 2, img('temizlik'),
    'Bekleme salonundaki koltuklar ve 40 m2 halı yerinde yıkanacak.', {}],
  ['burak', 'İnşaat sonrası ev temizliği', 'Temizlik', 'Ankara', 'Çankaya', 5000, 9000, 15, 52, 1, img('salon3'),
    '140 m2 dubleks. Tadilat bitti, boya ve toz temizliği yapılacak.', { deadline: 5 }],
  ['sevgi', 'Pansiyonum için web sitesi', 'Web Tasarım', 'Antalya', 'Kaş', 15000, 28000, 19, 74, 2, img('web'),
    'Rezervasyon formu, fotoğraf galerisi ve iki dil lazım. Telefondan rahat kullanılmalı.', {}],
  ['okan', 'Emlak ofisi kurumsal web sitesi', 'Web Tasarım', 'Muğla', 'Bodrum', 25000, 45000, 63, 96, 2, img('toplanti'),
    'İlan ekleme paneli olmalı. Kurumsal görünüm istiyorum, hazır tema da olabilir.', {}],
  ['hatice', 'WordPress sitemde site yenileme', 'Web Tasarım', 'Konya', 'Selçuklu', 6000, 12000, 25, 43, 2, img('tablet'),
    'Mevcut site yavaş ve telefonda bozuk. Tasarım yenilenecek, içerik aynı kalacak.', {}],
  ['murat', 'Stok ve üretim takip otomasyonu', 'Yazılım Geliştirme', 'Bursa', 'Nilüfer', 120000, 220000, 34, 148, 1, img('yazilimci'),
    'Tekstil atölyesi için sipariş, üretim ve stok takibi. Barkod desteği olmalı.', { deadline: 45 }],
  ['sevgi', 'Pansiyon için mobil rezervasyon uygulaması', 'Yazılım Geliştirme', 'Antalya', 'Kaş', 60000, 110000, 77, 83, 1, img('mobil'),
    'iOS ve Android. Oda takvimi, ödeme ve bildirim olmalı.', {}],
  ['elif', 'Kafe için menü ve kartvizit tasarımı', 'Grafik Tasarım', 'İstanbul', 'Beşiktaş', 3000, 7000, 8, 39, 2, img('grafik'),
    'A4 menü, masa üstü kart ve kartvizit. Logomuz var.', {}],
  ['burak', 'Şirket logosu yenileme', 'Grafik Tasarım', 'Ankara', 'Yenimahalle', 5000, 12000, 56, 62, 2, img('logo'),
    'Eski logoyu modernleştirmek istiyoruz. Üç alternatif görmek isterim.', {}],
  ['okan', 'Emlak ofisi için Instagram yönetimi', 'Dijital Pazarlama', 'Muğla', 'Bodrum', 10000, 18000, 39, 55, 2, img('analiz'),
    'Haftada 3 paylaşım, reklam yönetimi ve aylık rapor.', {}],
  ['sevgi', 'Yerel SEO ve Google işletme profili', 'Dijital Pazarlama', 'Antalya', 'Kaş', 5000, 12000, 68, 36, 2, [],
    'Pansiyon aramalarında üst sıralara çıkmak istiyorum. SEO çalışması ve Google profili düzenlenecek.', {}],
  ['zeynep', 'Ürün videosu, Instagram için 5 adet', 'Video & Animasyon', 'İzmir', 'Konak', 12000, 22000, 29, 60, 1, img('klaket'),
    'Seramik ürünlerimizin kısa dikey videoları. Stüdyo veya atölyemizde çekilebilir.', {}],
  ['kerem', 'Uygulama tanıtım animasyonu', 'Video & Animasyon', 'Eskişehir', 'Tepebaşı', 8000, 16000, 92, 42, 1, img('montaj'),
    '60 saniyelik 2D tanıtım animasyonu. Senaryo bizde hazır.', {}],
  ['elif', 'Doğum günü organizasyonu, 40 kişi', 'Etkinlik & Organizasyon', 'İstanbul', 'Kadıköy', 15000, 28000, 24, 66, 2, img('balon'),
    '5 yaş doğum günü. Süsleme, pasta ve animatör dahil. Mekan bizde.', { deadline: 18 }],
  ['murat', 'Şirket pikniği ve ses sistemi', 'Etkinlik & Organizasyon', 'Bursa', 'İnegöl', 30000, 55000, 83, 51, 2, img('davet'),
    '150 kişilik şirket pikniği. Ses sistemi, sahne ve oyun alanı lazım.', {}],
  ['kerem', 'Web sitesi metin yazarlığı, 10 sayfa', 'Çeviri & Metin', 'Eskişehir', 'Tepebaşı', 4000, 9000, 45, 33, 1, img('kitap'),
    'Yazılım firmamız için hizmet sayfası metinleri. SEO bilgisi olmalı.', {}],
  ['burak', 'Sözleşme yeminli çeviri Almanca', 'Çeviri & Metin', 'Ankara', 'Çankaya', 1500, 4000, 35, 28, 1, img('sozlesme'),
    '12 sayfa ticari sözleşme, noter onayı gerekli.', { deadline: 6 }],
  ['zeynep', 'Üniversite sınavı özel ders, fizik', 'Eğitim', 'İzmir', 'Bornova', 0, 8000, 13, 40, 1, img('egitim'),
    'Haftada 2 gün yüz yüze özel ders. 12. sınıf öğrencisi.', {}],
  ['okan', 'Personele ilk yardım eğitimi', 'Eğitim', 'Muğla', 'Bodrum', 6000, 12000, 98, 25, 1, [],
    '20 kişilik otel ekibimiz için sertifikalı ilk yardım eğitimi.', {}],
  ['hatice', 'Kira sözleşmesi için hukuk danışmanlığı', 'Danışmanlık', 'Konya', 'Selçuklu', 2000, 6000, 20, 37, 1, img('sozlesme'),
    'Dükkan kiralama sözleşmesini avukata kontrol ettirmek istiyorum.', {}],
  ['sevgi', 'Pansiyon için muhasebe hizmeti', 'Danışmanlık', 'Antalya', 'Kaş', 0, 5000, 71, 29, 1, [],
    'Aylık muhasebe ve beyanname takibi. Uzaktan olabilir.', {}],
  ['kerem', 'Ofis mobilyası tedarik, 6 masa', 'Diğer', 'Eskişehir', 'Tepebaşı', 30000, 50000, 27, 46, 1, img('salon4'),
    'Masa, dolap ve toplantı masası tedarik edilecek. Teslimat ve montaj dahil.', {}],
  ['hatice', 'Banyo tadilatı, 5 m2 komple', 'İnşaat & Tadilat', 'İstanbul', 'Bakırköy', 45000, 70000, 1400, 143, 0, img('banyo2'),
    'Fayans, vitrifiye ve tesisat komple yenilendi.',
    { status: 'completed', bids: [['usta', 58000, 10, 'Malzeme seçimi dahil anahtar teslim.', 'accepted']] }],
  ['zeynep', 'Salon ve yatak odası boya', 'İnşaat & Tadilat', 'İstanbul', 'Maltepe', 9000, 16000, 900, 88, 0, img('salon5'),
    'İki oda boyanacak, eşyalar evde.',
    { status: 'completed', bids: [['usta', 12500, 3, 'Silinebilir boya, koruma örtüsü dahil.', 'accepted'], ['temel', 15000, 5, 'İşçilik ve malzeme dahil.', 'rejected']] }],
  ['okan', 'Küçük depo eşyası taşınacak, 30 koli', 'Nakliye & Lojistik', 'Muğla', 'Milas', 0, 6000, 9, 31, 2, img('kargo'),
    'Depodaki 30 koli ve birkaç raf ilçe içinde taşınacak. Kamyonet yeterli.', {}],
  ['hatice', 'Yeni sezon ürün kataloğu ve broşür', 'Grafik Tasarım', 'Konya', 'Selçuklu', 5000, 11000, 30, 48, 2, img('tablet'),
    'Mobilya firmamız için 16 sayfa katalog ve tek sayfa broşür. Fotoğraflar hazır.', {}],
  ['elif', 'Teras için bahçe mobilyası ve bitki', 'Diğer', 'İstanbul', 'Sarıyer', 20000, 40000, 44, 57, 1, img('bahce'),
    '30 m2 teras. Oturma grubu, saksı ve bitki önerisiyle birlikte fiyat istiyorum.', {}]
];

// Örnek konuşmalar: [talep başlığı, kişi 1, kişi 2, [[gönderen, metin, kaçSaatÖnce, okundu], ...]]
const conversations = [
  ['Mutfak dolapları ve tezgah yenilenecek', 'elif', 'usta', [
    ['usta', 'Merhaba, keşif için bu hafta uygun olduğunuz bir gün var mı?', 4, true],
    ['elif', 'Merhaba, perşembe öğleden sonra evdeyim.', 3.5, true],
    ['usta', 'Tamam, perşembe 15.00 gibi gelelim. Tezgah için birkaç numune de getiririz.', 3, false]
  ]],
  ['Kafem için web sitesi yaptırmak istiyorum', 'elif', 'kodhane', [
    ['elif', 'Menüyü sonradan kendim güncelleyebilecek miyim?', 12, true],
    ['kodhane', 'Evet, yönetim paneli teklife dahil. Fiyatları ve fotoğrafları kendiniz değiştirebilirsiniz.', 11, true],
    ['elif', 'Süper, teşekkürler. Birkaç gün içinde dönüş yaparım.', 10, true]
  ]],
  ['45 m2 salon ve koridor boya badana', 'elif', 'usta', [
    ['usta', 'Pazartesi sabah 09.00 gibi başlıyoruz, anahtar için arayacağım.', 40, true],
    ['elif', 'Tamamdır, kapıcıya bırakırım.', 38, true]
  ]],
  ['Banyo komple tadilat, 6 m2', 'burak', 'usta', [
    ['usta', 'Merhaba, tesisatın yenilenmesi için su kesintisi 1-2 gün sürer, sorun olur mu?', 5, true],
    ['burak', 'Olmaz, ama işe hafta içi başlanırsa daha iyi olur. Fayans seçimini de görüşmek isterim.', 2, false]
  ]]
];

const hoursAgo = hours => new Date(Date.now() - hours * 60 * 60 * 1000);
const daysFromNow = days => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// Örnek veriler her kurulumda aynı çıksın diye sabit tohumlu sayı üreteci
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// Tarihlerin korunması için Mongoose zaman damgası atlanır, doğrulama yine de çalışır.
async function insertRaw(Model, data) {
  const doc = new Model(data);
  await doc.validate();
  await Model.collection.insertOne(doc.toObject());
  return doc;
}

async function removeDemoData() {
  const users = await User.find({ email: new RegExp(`@${DEMO_DOMAIN.replace('.', '\\.')}$`) }).select('_id');
  const ids = users.map(user => user._id);
  const demoRequests = await Request.find({ customer: { $in: ids } }).select('_id');
  const requestIds = demoRequests.map(request => request._id);

  await Bid.deleteMany({ $or: [{ company: { $in: ids } }, { request: { $in: requestIds } }] });
  await Message.deleteMany({
    $or: [{ sender: { $in: ids } }, { receiver: { $in: ids } }, { request: { $in: requestIds } }]
  });
  await Review.deleteMany({ $or: [{ company: { $in: ids } }, { customer: { $in: ids } }, { request: { $in: requestIds } }] });
  await Report.deleteMany({ $or: [{ reporter: { $in: ids } }, { request: { $in: requestIds } }] });
  await Notification.deleteMany({ user: { $in: ids } });
  await SavedSearch.deleteMany({ user: { $in: ids } });
  await Request.deleteMany({ _id: { $in: requestIds } });
  await User.updateMany({}, { $pull: { favorites: { $in: requestIds } } });
  await User.deleteMany({ _id: { $in: ids } });
  return { users: ids.length, requests: requestIds.length };
}

// Otomatik teklif: bütçeye yakın tutar, kategoriye uygun firma
function makeBids(category, min, max, count, status, random) {
  const pool = companiesByCategory[category] || companiesByCategory['Diğer'];
  const base = max || (min ? min * 1.2 : 5000 + random() * 20000);
  // Teklifler hep aynı firmadan gelmesin diye başlangıç sırası değişir.
  const start = Math.floor(random() * pool.length);
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.slice(0, Math.min(count, pool.length)).map((company, index) => {
    const amount = Math.round((base * (0.72 + random() * 0.26)) / 100) * 100;
    const days = 3 + Math.floor(random() * 25);
    const text = bidTexts[Math.floor(random() * bidTexts.length)];
    const bidState = status === 'open' ? 'pending' : index === 0 ? 'accepted' : 'rejected';
    return [company, amount, days, text, bidState];
  });
}

async function createDemoData({ showcase = false } = {}) {
  await removeDemoData();
  // Vitrin modunda (canlıda) örnek hesaplara kimse giremesin diye şifre rastgeledir.
  const password = await bcrypt.hash(showcase ? crypto.randomBytes(32).toString('hex') : DEMO_PASSWORD, 10);
  const monthsAgo = months => hoursAgo(months * 30 * 24);

  const people = {};
  for (const [key, { months, email, ...data }] of Object.entries(customers)) {
    people[key] = await insertRaw(User, {
      ...data, password, role: 'customer', email: email || `${key}@${DEMO_DOMAIN}`,
      createdAt: monthsAgo(months), updatedAt: monthsAgo(1)
    });
  }
  for (const [key, { months, email, ...data }] of Object.entries(companies)) {
    people[key] = await insertRaw(User, {
      ...data, password, role: 'company', email: email || `${key}@${DEMO_DOMAIN}`,
      categories: Object.keys(companiesByCategory).filter(category => companiesByCategory[category].includes(key)),
      verified: verifiedCompanies.includes(key),
      createdAt: monthsAgo(months), updatedAt: monthsAgo(1)
    });
  }
  await insertRaw(User, {
    name: 'Site Yöneticisi', email: `yonetici@${DEMO_DOMAIN}`, password, role: 'customer', isAdmin: true,
    createdAt: monthsAgo(60), updatedAt: monthsAgo(1)
  });

  const random = seededRandom(20261104);
  const requestIds = new Map();

  for (const [owner, title, category, city, location, min, max, hours, views, autoBids, images, description, extra] of listings) {
    const status = extra.status || 'open';
    const requestId = new mongoose.Types.ObjectId();
    requestIds.set(title, requestId);
    const planned = extra.bids || makeBids(category, min, max, autoBids, status, random);
    const bidDocs = [];

    for (const [company, amount, deliveryTime, text, bidState] of planned) {
      const age = hours * (0.2 + random() * 0.75);
      bidDocs.push(await insertRaw(Bid, {
        request: requestId,
        company: people[company]._id,
        amount,
        deliveryTime,
        description: text,
        status: bidState,
        createdAt: hoursAgo(age),
        updatedAt: hoursAgo(age)
      }));
    }

    const accepted = bidDocs.find(bid => bid.status === 'accepted');
    if (status === 'completed' && accepted && demoReviews[title]) {
      const [rating, comment] = demoReviews[title];
      await insertRaw(Review, {
        company: accepted.company,
        customer: people[owner]._id,
        request: requestId,
        rating,
        comment,
        createdAt: hoursAgo(hours * 0.3),
        updatedAt: hoursAgo(hours * 0.3)
      });
    }
    await insertRaw(Request, {
      _id: requestId,
      title,
      description,
      category,
      budget: { min, max },
      city: city || undefined,
      location,
      images,
      customer: people[owner]._id,
      status,
      acceptedBid: accepted ? accepted._id : undefined,
      bidCount: bidDocs.length,
      viewCount: views,
      deadline: extra.deadline ? daysFromNow(extra.deadline) : undefined,
      createdAt: hoursAgo(hours),
      updatedAt: hoursAgo(hours)
    });
  }

  for (const [person, text, age, read, title] of demoNotifications) {
    await insertRaw(Notification, {
      user: people[person]._id,
      text,
      url: `/requests/${requestIds.get(title)}`,
      read,
      createdAt: hoursAgo(age),
      updatedAt: hoursAgo(age)
    });
  }

  for (const [title, first, second, messages] of conversations) {
    for (const [from, content, age, read] of messages) {
      const to = from === first ? second : first;
      await insertRaw(Message, {
        request: requestIds.get(title),
        sender: people[from]._id,
        receiver: people[to]._id,
        content,
        read,
        createdAt: hoursAgo(age),
        updatedAt: hoursAgo(age)
      });
    }
  }
}

// Yönetici örnek verileri sildiyse sunucu yeniden başlayınca geri gelmesin.
const siteState = () => mongoose.connection.collection('site_state');
const markDemoRemoved = () => siteState().updateOne({ _id: 'demo' }, { $set: { removed: true } }, { upsert: true });

// Boş veritabanına örnek veri ekler; örnek verinin varlığını döndürür.
async function seedDemoData({ showcase = false } = {}) {
  if (process.env.DEMO_DATA === 'false') return false;
  const state = await siteState().findOne({ _id: 'demo' });
  if (state && state.removed) return false;
  if ((await Request.countDocuments()) === 0) {
    await createDemoData({ showcase });
    console.log('  Örnek veriler eklendi.');
  }
  return (await User.countDocuments({ email: demoAccounts[0].email })) > 0;
}

module.exports = { seedDemoData, removeDemoData, markDemoRemoved, demoAccounts };
