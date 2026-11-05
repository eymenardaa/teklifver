// Hizmet sayfalarının özgün metinleri: arama motorları ve ziyaretçiler için.
// intro: ne tür işler için talep verilir; factors: fiyatı neler etkiler;
// questions: firmaya ne sorulmalı; example: iyi yazılmış bir talep.
module.exports = {
  'İnşaat & Tadilat': {
    intro: 'Boya badana, mutfak ve banyo yenileme, tesisat, elektrik, parke ve mantolama gibi işler için talebinizi yazın, usta ve firmalardan fiyat teklifi alın.',
    factors: ['Alanın metrekaresi', 'Malzemeyi kimin alacağı', 'Binanın yaşı ve kırım gereksinimi', 'İşin aciliyeti'],
    questions: ['Keşif ücretli mi, ne zaman gelebilirsiniz?', 'Fiyata malzeme dahil mi, marka ve kaliteyi yazabilir misiniz?', 'İşçiliğe ne kadar garanti veriyorsunuz?', 'Moloz ve iş sonu temizliği kimde?'],
    example: { title: "Banyo komple yenilenecek, 5 m2", text: "Fayans, lavabo, klozet ve duş kabini değişecek. Tesisat eski, o da yenilenmeli. 3. kat, asansör var. Bu ay başlanabilir." }
  },
  'Nakliye & Lojistik': {
    intro: 'Evden eve nakliyat, ofis taşıma, parça eşya ve depolama için talep verin, nakliye firmalarının fiyatlarını karşılaştırın.',
    factors: ['İki adres arasındaki mesafe', 'Eşya miktarı', 'Kat sayısı ve asansör durumu', 'Paketleme ve kurulum hizmeti'],
    questions: ['Fiyata paketleme ve asansör dahil mi?', 'Eşyalar sigortalı mı, hasar olursa ne oluyor?', 'Mobilyaları söküp takıyor musunuz?', 'Araçta başka yük de olacak mı?'],
    example: { title: "Kadıköy - Ataşehir evden eve nakliyat, 3+1", text: "3. kat asansörsüz, yeni ev 5. kat asansörlü. Beyaz eşyalar sökülüp takılacak. Ay sonunda taşınacağız." }
  },
  'Temizlik': {
    intro: 'Ev, ofis, apartman, koltuk ve inşaat sonrası temizlik için talebinizi yazın, temizlik firmalarından teklif alın.',
    factors: ['Alanın büyüklüğü ve oda sayısı', 'Tek seferlik veya düzenli olması', 'Kirlilik düzeyi', 'Malzemenin firmadan olup olmadığı'],
    questions: ['Kaç kişi gelecek, kaç saat sürer?', 'Malzeme sizden mi?', 'Personel sigortalı mı?', 'Beğenmediğimiz yeri tekrar yapıyor musunuz?'],
    example: { title: "Taşınmadan önce 3+1 ev temizliği", text: "Ev boş. Mutfak dolaplarının içi, camlar ve banyolar dahil. Hafta sonu olursa iyi olur." }
  },
  'Web Tasarım': {
    intro: 'Kurumsal site, tanıtım sitesi ve site yenileme işleriniz için ihtiyacınızı anlatın, web tasarım firmalarından fiyat alın.',
    factors: ['Sayfa sayısı', 'Özel tasarım veya hazır tema', 'İçeriğin hazır olup olmaması', 'Bakım ve barındırma hizmeti'],
    questions: ['Alan adı ve hosting kimin adına kayıtlı olacak?', 'İçeriği sonradan kendim değiştirebilecek miyim?', 'Teslimden sonra destek ne kadar sürüyor?', 'Yaptığınız 2-3 siteyi görebilir miyim?'],
    example: { title: "Diş kliniği için tanıtım sitesi", text: "5-6 sayfa, randevu formu olsun. Telefonda düzgün görünmeli. Yazılar ve fotoğraflar bizde var, alan adımız hazır." }
  },
  'Yazılım Geliştirme': {
    intro: 'E-ticaret, mobil uygulama ve otomasyon projeleriniz için talep verin, yazılım firmalarının teklif ve sürelerini karşılaştırın.',
    factors: ['Özelliklerin kapsamı', 'Kullanılacak platformlar', 'Mevcut sistemlerle bağlantı', 'Teslim sonrası destek'],
    questions: ['Kaynak kod bana teslim edilecek mi?', 'İş adım adım mı teslim edilecek, ödeme nasıl bölünüyor?', 'Yayından sonra çıkan hataları ne kadar süre ücretsiz düzeltiyorsunuz?', 'Aylık sunucu ve bakım masrafı ne kadar tutar?'],
    example: { title: "Kuaför salonu için randevu uygulaması", text: "Müşteriler telefondan randevu alsın, biz de panelden görelim. SMS hatırlatma olursa iyi olur. iOS ve Android." }
  },
  'Grafik Tasarım': {
    intro: 'Logo, katalog, ambalaj ve arayüz tasarımı için talebinizi yazın, tasarımcı ve ajanslardan teklif alın.',
    factors: ['Taslak ve revizyon sayısı', 'Kurumsal kimlik kapsamı', 'Sayfa veya ürün adedi', 'Baskıya hazır dosya ihtiyacı'],
    questions: ['Kaç taslak göreceğim, kaç revizyon dahil?', 'Açık dosyalar (AI, PSD) teslim ediliyor mu?', 'Baskıya hazır dosya fiyata dahil mi?', 'Çalışma tamamen size mi ait, hazır şablon kullanılıyor mu?'],
    example: { title: "Pastane için logo ve kutu etiketi", text: "Yeni açılan küçük bir pastane. Sade, eski usul bir şey istiyoruz. Renk konusunda öneriye açığız." }
  },
  'Dijital Pazarlama': {
    intro: 'Sosyal medya yönetimi, Google Ads ve SEO hizmetleri için talep verin, ajansların fiyatlarını karşılaştırın.',
    factors: ['Yönetilecek kanal sayısı', 'Aylık reklam bütçesi', 'Hedef bölge', 'İçerik üretimi ve raporlama'],
    questions: ['Reklam bütçesi fiyata dahil mi, hizmet bedeli ayrı mı?', 'Reklam hesapları benim adıma mı açılacak?', 'Ne sıklıkla rapor alacağım?', 'Sözleşme süresi var mı, istediğimde bırakabilir miyim?'],
    example: { title: "Butik otel için Instagram ve Google reklamları", text: "Aylık 15 bin TL reklam bütçemiz var. Hedefimiz yaz sezonu rezervasyonu. Fotoğraflarımız hazır." }
  },
  'Video & Animasyon': {
    intro: 'Tanıtım filmi, düğün çekimi, ürün videosu ve animasyon işleri için talebinizi yazın, prodüksiyon firmalarından teklif alın.',
    factors: ['Videonun süresi', 'Çekim günü ve mekan sayısı', 'Drone ve özel ekipman', 'Kurgu ve müzik hakları'],
    questions: ['Kaç gün çekim var, ham görüntüler teslim ediliyor mu?', 'Kurgudan sonra kaç değişiklik hakkım var?', 'Müzik lisansı fiyata dahil mi?', 'Hava bozarsa veya tarih değişirse ne oluyor?'],
    example: { title: "Restoran için 1 dakikalık tanıtım videosu", text: "Mutfak ve salon çekilecek, Instagram'da da kullanacağız. Dikey ve yatay olsun." }
  },
  'Etkinlik & Organizasyon': {
    intro: 'Düğün, kına, kurumsal etkinlik ve doğum günü organizasyonu için talep verin, organizasyon firmalarının tekliflerini görün.',
    factors: ['Kişi sayısı', 'Mekan ve tarih', 'Yemek ve ikram', 'Süsleme, ses ve ışık'],
    questions: ['Fiyata neler dahil: süsleme, ses, ikram, ulaşım?', 'Kapora ne kadar, iptalde geri veriliyor mu?', 'Etkinlik günü sorumlu kişi kim olacak?', 'Yaptığınız işlerden fotoğraf görebilir miyim?'],
    example: { title: "Bahçede nişan organizasyonu, 50 kişi", text: "Haziran sonu, cumartesi. Masa, süsleme ve ses sistemi lazım. Yemeği biz ayarlıyoruz." }
  },
  'Çeviri & Metin': {
    intro: 'Yeminli çeviri, teknik çeviri ve metin yazarlığı için talebinizi yazın, çevirmen ve bürolardan fiyat alın.',
    factors: ['Kelime veya sayfa sayısı', 'Kaynak ve hedef dil', 'Yeminli veya noter onayı', 'Teslim süresi'],
    questions: ['Çeviri yeminli mi, noter işlemini siz takip ediyor musunuz?', 'Fiyat kelime başına mı, sayfa başına mı?', 'Teslim tarihi kesin mi?', 'Çeviriyi kontrol eden ikinci biri var mı?'],
    example: { title: "Transkript ve diploma, İngilizce yeminli çeviri", text: "4 sayfa, noter onayı lazım. Üniversite başvurusu için 1 hafta içinde gerekiyor." }
  },
  'Eğitim': {
    intro: 'Özel ders, yabancı dil ve kurumsal eğitim için talep verin, öğretmen ve eğitim firmalarından teklif alın.',
    factors: ['Ders sayısı ve süresi', 'Yüz yüze veya çevrim içi olması', 'Seviye ve konu', 'Katılımcı sayısı'],
    questions: ['Deneme dersi yapıyor musunuz?', 'Ders ücreti saatlik mi, aylık mı?', 'Ders nerede olacak, ulaşım ücrete dahil mi?', 'Öğrencinin gidişatını nasıl takip ediyorsunuz?'],
    example: { title: "8. sınıf matematik, haftada 2 gün", text: "LGS'ye hazırlanıyor, problemlerde zorlanıyor. Yüz yüze tercih ederiz, hafta sonu da olabilir." }
  },
  'Danışmanlık': {
    intro: 'Mali müşavirlik, hukuk ve iç mimari gibi danışmanlık hizmetleri için ihtiyacınızı yazın, uzmanlardan teklif alın.',
    factors: ['İşin kapsamı', 'Tek seferlik veya sürekli olması', 'Şirketin büyüklüğü', 'Uzmanlık alanı'],
    questions: ['Ücret sabit mi, saatlik mi?', 'Bu konuda daha önce kaç iş yaptınız?', 'Belgeleri kim hazırlayacak, benden ne gerekiyor?', 'Görüşme uzaktan da olur mu?'],
    example: { title: "Limited şirket kuruluşu ve aylık muhasebe", text: "İki ortaklıyız, e-ticaret yapacağız. Kuruluş ve ilk yıl muhasebesi için fiyat almak istiyoruz." }
  },
  'Diğer': {
    intro: 'Bahçe düzenleme, güvenlik sistemi, tedarik ve diğer tüm hizmetler için talebinizi yazın, firmalardan teklif alın.',
    factors: ['İşin kapsamı', 'Yer ve tarih', 'Malzeme durumu', 'Özel istekler'],
    questions: ['Fiyata neler dahil, sonradan ek ücret çıkar mı?', 'İşe ne zaman başlar, ne zaman bitirirsiniz?', 'Fatura kesiyor musunuz?', 'Yaptığınız benzer bir işi görebilir miyim?'],
    example: { title: "Bahçe için otomatik sulama sistemi", text: "Yaklaşık 200 m2 bahçe. Keşfe gelip önerinizi yazın. Su deposu var." }
  }
};
