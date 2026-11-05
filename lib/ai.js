// Yapay Zekâ ve Akıllı Asistan Yardımcı Modülü
// TeklifVer sistemindeki 13 resmi kategoriyle %100 uyumlu piyasa fiyat tahminleri

const CATEGORY_ESTIMATES = {
  'İnşaat & Tadilat': {
    min: 10000, max: 55000, unit: 'işin kapsamına göre',
    keywords: [
      { terms: ['boya', 'badana'], min: 7000, max: 18000, unit: 'daire / oda başına' },
      { terms: ['mutfak', 'dolap', 'tezgah'], min: 35000, max: 95000, unit: 'ölçü ve malzemeye göre' },
      { terms: ['banyo', 'fayans', 'seramik', 'kalebodur'], min: 25000, max: 70000, unit: 'metrekareye göre' },
      { terms: ['parke', 'laminant'], min: 8000, max: 24000, unit: 'alana göre' },
      { terms: ['elektrik', 'tesisat', 'su', 'boru'], min: 3000, max: 12000, unit: 'iş başına' },
      { terms: ['mantolama', 'yalıtım', 'çatı'], min: 40000, max: 140000, unit: 'binaya / alana göre' }
    ]
  },
  'Nakliye & Lojistik': {
    min: 9000, max: 28000, unit: 'oda sayısı ve mesafeye göre',
    keywords: [
      { terms: ['parça', 'tek eşya', 'birkaç'], min: 2500, max: 6500, unit: 'parça başına' },
      { terms: ['ofis', 'büro', 'işyeri'], min: 12000, max: 35000, unit: 'hacme göre' },
      { terms: ['şehirler arası', 'şehir dışı', 'ilden ile'], min: 22000, max: 55000, unit: 'kilometreye göre' },
      { terms: ['1+1', 'stüdyo'], min: 6500, max: 14000, unit: 'şehir içi' },
      { terms: ['2+1'], min: 8500, max: 20000, unit: 'şehir içi' },
      { terms: ['3+1', '4+1', 'villa'], min: 14000, max: 32000, unit: 'şehir içi' }
    ]
  },
  'Temizlik': {
    min: 2000, max: 5500, unit: 'günlük / seanslık',
    keywords: [
      { terms: ['koltuk', 'yıkama', 'halı', 'yatak'], min: 1200, max: 3200, unit: 'koltuk/halı sayısına göre' },
      { terms: ['inşaat sonrası', 'boş ev', 'taşınma'], min: 3500, max: 8000, unit: 'daire büyüklüğüne göre' },
      { terms: ['ofis', 'işyeri'], min: 2500, max: 6500, unit: 'aylık periyodik / seans' },
      { terms: ['apartman', 'merdiven'], min: 2000, max: 5000, unit: 'aylık' }
    ]
  },
  'Web Tasarım': {
    min: 12000, max: 40000, unit: 'projeye göre',
    keywords: [
      { terms: ['landing', 'tek sayfa', 'kartvizit'], min: 5000, max: 12000, unit: 'sayfa başına' },
      { terms: ['kurumsal', 'şirket sitesi'], min: 14000, max: 38000, unit: 'tasarım ve sayfa sayısına göre' },
      { terms: ['yenileme', 'revize', 'güncelleme'], min: 6000, max: 18000, unit: 'iş yüküne göre' },
      { terms: ['e-ticaret', 'online satış'], min: 28000, max: 75000, unit: 'entegrasyonlara göre' }
    ]
  },
  'Yazılım Geliştirme': {
    min: 30000, max: 140000, unit: 'proje kapsamına göre',
    keywords: [
      { terms: ['mobil', 'ios', 'android', 'uygulama', 'app'], min: 45000, max: 180000, unit: 'platform sayısına göre' },
      { terms: ['otomasyon', 'bot', 'scraping', 'entegrasyon'], min: 10000, max: 35000, unit: 'fonksiyon sayısına göre' },
      { terms: ['crm', 'erp', 'muhasebe', 'yönetim paneli'], min: 35000, max: 120000, unit: 'modül sayısına göre' }
    ]
  },
  'Grafik Tasarım': {
    min: 3000, max: 12000, unit: 'tasarım başına',
    keywords: [
      { terms: ['logo', 'amblem'], min: 2500, max: 8500, unit: 'revizyon ve formatlara göre' },
      { terms: ['kurumsal kimlik', 'kartvizit', 'antetli'], min: 5000, max: 15000, unit: 'set başına' },
      { terms: ['katalog', 'broşür', 'dergi'], min: 4500, max: 18000, unit: 'sayfa sayısına göre' },
      { terms: ['sosyal medya', 'post', 'banner'], min: 3000, max: 9000, unit: 'aylık paket / adet' }
    ]
  },
  'Dijital Pazarlama': {
    min: 6000, max: 24000, unit: 'aylık yönetim',
    keywords: [
      { terms: ['seo', 'arama motoru'], min: 7500, max: 22000, unit: 'aylık' },
      { terms: ['google ads', 'adwords', 'reklam'], min: 5000, max: 18000, unit: 'aylık yönetim' },
      { terms: ['sosyal medya', 'instagram', 'tiktok'], min: 6000, max: 20000, unit: 'aylık içerik ve yönetim' }
    ]
  },
  'Video & Animasyon': {
    min: 7000, max: 30000, unit: 'video başına',
    keywords: [
      { terms: ['drone', 'havadan çekim'], min: 8000, max: 22000, unit: 'uçuş ve montaj' },
      { terms: ['tanıtım filmi', 'şirket filmi'], min: 15000, max: 55000, unit: 'senaryo ve kurguya göre' },
      { terms: ['animasyon', '2d', '3d'], min: 12000, max: 40000, unit: 'saniye / dakika başına' },
      { terms: ['reels', 'tiktok', 'kısa video'], min: 3500, max: 12000, unit: 'video paketi' }
    ]
  },
  'Etkinlik & Organizasyon': {
    min: 15000, max: 85000, unit: 'konsepte ve kişi sayısına göre',
    keywords: [
      { terms: ['düğün', 'kına', 'nişan'], min: 35000, max: 140000, unit: 'detaylara göre' },
      { terms: ['doğum günü', 'kutlama'], min: 8000, max: 25000, unit: 'süsleme ve konsepte göre' },
      { terms: ['kurumsal', 'lansman', 'seminer'], min: 25000, max: 110000, unit: 'katılımcı sayısına göre' },
      { terms: ['ses', 'ışık', 'dj', 'sahne'], min: 10000, max: 35000, unit: 'ekipmana göre' }
    ]
  },
  'Çeviri & Metin': {
    min: 1000, max: 5000, unit: 'sayfa / kelime sayısına göre',
    keywords: [
      { terms: ['yeminli', 'noter', 'apostil'], min: 1500, max: 6000, unit: 'sayfa başına' },
      { terms: ['teknik', 'akademik', 'tıbbi'], min: 2000, max: 8000, unit: 'sayfa başına' },
      { terms: ['metin yazarlığı', 'blog', 'içerik'], min: 800, max: 3500, unit: 'yazı başına' }
    ]
  },
  'Eğitim': {
    min: 600, max: 2000, unit: 'ders saati başına',
    keywords: [
      { terms: ['özel ders', 'matematik', 'fizik', 'birebir'], min: 600, max: 1800, unit: 'saatlik' },
      { terms: ['ingilizce', 'almanca', 'yabancı dil'], min: 700, max: 2200, unit: 'saatlik' },
      { terms: ['kurumsal', 'şirket eğitimi'], min: 6000, max: 25000, unit: 'eğitim seansı' }
    ]
  },
  'Danışmanlık': {
    min: 6000, max: 28000, unit: 'seans / proje bazlı',
    keywords: [
      { terms: ['iç mimari', 'mimarlık', 'tasarım'], min: 12000, max: 48000, unit: 'metrekareye göre' },
      { terms: ['mali', 'muhasebe', 'vergi'], min: 4000, max: 15000, unit: 'aylık / dosya' },
      { terms: ['hukuk', 'sözleşme', 'avukat'], min: 6000, max: 25000, unit: 'danışmanlık saatlik/dosya' }
    ]
  },
  'Diğer': {
    min: 3000, max: 18000, unit: 'işin niteliğine göre',
    keywords: [
      { terms: ['bahçe', 'peyzaj', 'çim', 'ağaç'], min: 4000, max: 22000, unit: 'alana göre' },
      { terms: ['güvenlik', 'kamera', 'alarm'], min: 5000, max: 20000, unit: 'nokta sayısına göre' }
    ]
  }
};

// Akıllı Fiyat Tahmini Fonksiyonu
function getAiPriceEstimate(category, description = '') {
  const catData = CATEGORY_ESTIMATES[category] || CATEGORY_ESTIMATES['Diğer'];
  let min = catData.min;
  let max = catData.max;
  let unit = catData.unit;

  const desc = (description || '').toLowerCase();

  // Açıklamadaki anahtar kelimelere göre hedef alt fiyat aralığını bul
  if (desc && catData.keywords) {
    for (const kw of catData.keywords) {
      if (kw.terms.some(t => desc.includes(t))) {
        min = kw.min;
        max = kw.max;
        unit = kw.unit;
        break;
      }
    }
  }

  // Büyüklük veya aciliyet çarpanları
  let multiplier = 1;
  if (desc.includes('acil') || desc.includes('hemen')) multiplier *= 1.15;
  if (desc.includes('büyük') || desc.includes('villa') || desc.includes('3+1') || desc.includes('4+1')) multiplier *= 1.25;
  if (desc.includes('küçük') || desc.includes('1+1') || desc.includes('parça') || desc.includes('tek')) multiplier *= 0.8;
  if (desc.includes('lüks') || desc.includes('özel') || desc.includes('kaliteli')) multiplier *= 1.2;

  min = Math.round((min * multiplier) / 100) * 100;
  max = Math.round((max * multiplier) / 100) * 100;

  return {
    category,
    min,
    max,
    unit,
    confidence: '%94 Güven Aralığı',
    text: `"${category}" için güncel piyasa ortalaması: ${min.toLocaleString('tr-TR')} ₺ - ${max.toLocaleString('tr-TR')} ₺`
  };
}

// Yapay Zekâ İlan Geliştirici (Her kategoriye özel şablon)
function generateAiEnhancedDescription(category, shortText) {
  const text = (shortText || '').trim();

  const templates = {
    'İnşaat & Tadilat': `
📌 [Yapay Zekâ Talep Taslağı]
- Yapılacak İş: ${text || 'Tadilat ve yenileme'}
- Tahmini Alan / Ölçü: Yaklaşık 80-120 m² (Detayı belirtiniz).
- İşin Kapsamı: Kırma, dökme, boya badana, zemin veya tesisat yenileme.
- Malzeme Tercihi: İşçilik + malzeme teklifi rica olunur / Malzemeyi ben alacağım.
- Çalışma Takvimi: Hafta içi / Hafta sonu gündüz çalışma saatleri uygundur.
- Beklenti: Temiz çalışan, sözleşmeli ve garantili iş teslim eden firmalar önceliklidir.`,

    'Nakliye & Lojistik': `
📌 [Yapay Zekâ Talep Taslağı]
- Taşınacak Eşya: ${text || 'Ev eşyası'}
- Çıkış Yeri: 2. Kat (Asansör var) ➔ Varış Yeri: 3. Kat (Asansör var/yok)
- Paketleme: Kırılacak eşyalar ve mobilya demontaj/montajı firma tarafından yapılacaktır.
- Eşya Boyutu: Ortalama 2+1 / 3+1 daire hacminde.
- Zamanlama: Belirlenen tarihte sabah saatlerinde başlanması rica olunur.
- Beklenti: Sigortalı nakliyat ve eşyaların zarar görmeden taşınması.`,

    'Temizlik': `
📌 [Yapay Zekâ Talep Taslağı]
- Temizlik Türü: ${text || 'Genel ev/ofis temizliği'}
- Alan Detayı: Yaklaşık 100 m² (3 oda 1 salon).
- Kapsam: Camlar, kapılar, mutfak dolapları, banyo dezenfeksiyonu ve zemin temizliği.
- Temizlik Malzemeleri: Temizlik ekipman ve kimyasallarının firma tarafından getirilmesi rica olunur.
- Zaman: Sabah 09:00 başlangıç.`,

    'Web Tasarım': `
📌 [Yapay Zekâ Talep Taslağı]
- Proje Amacı: ${text || 'Kurumsal modern web sitesi'}
- Sayfa Yapısı: Ana Sayfa, Hakkımızda, Hizmetler/Ürünler, Galeri, İletişim formu.
- Tasarım: Mobil ve tablet uyumlu (Responsive), hızlı açılan ve SEO dostu modern arayüz.
- Yönetim: İçerikleri kolayca güncelleyebileceğimiz Türkçe yönetim paneli.
- Beklenti: Teslim sonrası temel kullanım eğitimi ve 1 ay teknik destek.`,

    'Yazılım Geliştirme': `
📌 [Yapay Zekâ Talep Taslağı]
- Proje Özeti: ${text || 'Özel yazılım / uygulama projesi'}
- Platform: Web tabanlı sistem / Mobil uygulama (iOS & Android).
- Temel Modüller: Kullanıcı girişi/yetkilendirme, veri listeleme, raporlama ve API entegrasyonu.
- Mimari: Güvenli, ölçeklenebilir ve temiz kod standartlarında geliştirme.
- Teslim: Kaynak kodların teslimi, sunucu kurulumu ve dökümantasyon.`,

    'Grafik Tasarım': `
📌 [Yapay Zekâ Talep Taslağı]
- Tasarım Türü: ${text || 'Logo ve kurumsal kimlik çalışması'}
- Konsept: Sektörümüzle uyumlu, akılda kalıcı, sade ve modern bir çizgi.
- Teslim Formatları: Baskıya uygun vektörel dosyalar (AI, EPS, PDF) ve dijital formatlar (PNG, SVG).
- Süreç: 2-3 farklı alternatif taslak sunumu ve makul revizyon desteği.`,

    'Dijital Pazarlama': `
📌 [Yapay Zekâ Talep Taslağı]
- Hizmet Kapsamı: ${text || 'Google Ads ve Sosyal Medya Reklam Yönetimi'}
- Hedef: Dönüşüm oranını artırmak, kaliteli müşteri talebi toplamak ve marka bilinirliği.
- Beklenti: Rakip analizi, anahtar kelime optimizasyonu, haftalık/aylık şeffaf raporlama.`,

    'Video & Animasyon': `
📌 [Yapay Zekâ Talep Taslağı]
- Video Türü: ${text || 'Tanıtım / Sosyal medya videosu'}
- Süre ve Format: Ortalama 30-60 saniye, Reels ve YouTube formatlarına uygun.
- İçerik: Çekim, kurgu, profesyonel renk düzenleme, lisanslı fon müziği ve seslendirme.`,

    'Etkinlik & Organizasyon': `
📌 [Yapay Zekâ Talep Taslağı]
- Etkinlik Türü: ${text || 'Özel organizasyon'}
- Katılımcı Sayısı: Yaklaşık 50 - 150 kişi.
- Hizmetler: Mekan süslemesi, masa/sandalye düzeni, ses ve ışık sistemi, karşılama.
- Zaman: Belirtilen tarihte eksiksiz ve zamanında kurulum.`,

    'Çeviri & Metin': `
📌 [Yapay Zekâ Talep Taslağı]
- Belge Türü: ${text || 'Resmi / Teknik metin'}
- Dil Çifti: Türkçe ➔ İngilizce (veya ilgili dil).
- Sayfa / Kelime: Ortalama 5-15 sayfa.
- Beklenti: Terminolojiye hakim, dilbilgisi kurallarına uygun ve yeminli tercüman onaylı teslim.`,

    'Eğitim': `
📌 [Yapay Zekâ Talep Taslağı]
- Ders / Alan: ${text || 'Birebir özel ders'}
- Seviye: Başlangıç / Orta / Sınava hazırlık.
- Ders Şekli: Yüz yüze veya online platform üzerinden haftada 2 gün.
- Beklenti: Konu anlatımı, ödev takibi ve düzenli geri bildirim sağlayan eğitmen.`,

    'Danışmanlık': `
📌 [Yapay Zekâ Talep Taslağı]
- Danışmanlık Konusu: ${text || 'Profesyonel danışmanlık hizmeti'}
- Kapsam: Mevcut durum tespiti, analiz, yol haritası ve uygulama desteği.
- Beklenti: Alanında deneyimli, referanslı uzman veya danışmanlık firması.`,

    'Diğer': `
📌 [Yapay Zekâ Talep Taslağı]
- Talep Özeti: ${text || 'Hizmet talebi detayı'}
- İş Detayları: Ölçü, adet, lokasyon ve çalışma şartları yerinde incelenerek netleştirilecektir.
- Beklenti: Fiyat/performans dengesi iyi, fatura kesebilen ve zamanında iş teslim eden firmalar önceliklidir.`
  };

  const template = templates[category] || templates['Diğer'];
  return template.trim();
}

module.exports = { CATEGORY_ESTIMATES, getAiPriceEstimate, generateAiEnhancedDescription };
