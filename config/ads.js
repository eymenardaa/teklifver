// Reklam alanları buradan yönetilir. Yeni reklam için listeye bir satır eklemek yeterlidir.
//
// title, text, cta : Reklamdaki yazılar
// url              : Tıklanınca gidilen adres (site içi veya https://...)
// image            : Küçük görsel (isteğe bağlı)
// banner           : Hazır banner görseli (örn. /img/reklam/kampanya.jpg). Verilirse yazılar yerine görsel gösterilir.
// demo             : true ise yalnızca örnek veriler açıkken gösterilir (uydurma firmalar için)
module.exports = [
  {
    title: 'Mutfak ve banyo tadilatında ücretsiz keşif',
    text: 'Demir Tadilat: yazılı fiyat, 2 yıl işçilik garantisi.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Demir',
    demo: true
  },
  {
    title: 'Sigortalı evden eve nakliyat',
    text: 'Çelik Nakliyat: asansörlü taşıma, paketleme ve kurulum dahil.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Çelik',
    demo: true
  },
  {
    title: 'İşletmenize web sitesi ve e-ticaret',
    text: 'Öztürk Bilişim: teslimden sonra 3 ay ücretsiz destek.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Öztürk',
    demo: true
  },
  {
    title: 'Tanıtım filmi ve düğün çekimi',
    text: 'Deniz Yıldız Fotoğraf: senaryo, drone çekimi ve kurgu.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Deniz',
    demo: true
  },
  {
    title: 'Burada sizin firmanız görünebilir',
    text: 'İş yaptıracak kişilerin baktığı yerde reklam verin.',
    cta: 'Reklam Ver',
    url: '/reklam'
  }
];
