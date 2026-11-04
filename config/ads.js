// Reklam alanları buradan yönetilir. Yeni reklam için listeye bir satır eklemek yeterlidir.
//
// title, text, cta : Banner üzerindeki yazılar
// url              : Tıklanınca gidilen adres (site içi veya https://...)
// image            : Küçük görsel (isteğe bağlı)
// color            : orange | navy | green | yellow | red
// banner           : Hazır banner görseli (örn. /img/reklam/kampanya.jpg). Verilirse yazılar yerine görsel gösterilir.
// demo             : true ise yalnızca örnek veriler açıkken gösterilir (uydurma firmalar için)
module.exports = [
  {
    title: 'Mutfak ve banyo tadilatında ücretsiz keşif',
    text: 'Usta Eller Tadilat: yazılı fiyat, 2 yıl işçilik garantisi.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Usta',
    image: '/img/ilan/mutfak3.jpg',
    color: 'orange',
    demo: true
  },
  {
    title: 'Sigortalı evden eve nakliyat',
    text: 'Mavi Yol Nakliyat: asansörlü taşıma, paketleme ve kurulum dahil.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Mavi',
    image: '/img/ilan/tir.jpg',
    color: 'navy',
    demo: true
  },
  {
    title: 'İşletmenize web sitesi ve e-ticaret',
    text: 'Kodhane Yazılım: teslim sonrası 3 ay ücretsiz destek.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Kodhane',
    image: '/img/ilan/web.jpg',
    color: 'green',
    demo: true
  },
  {
    title: 'Tanıtım filminiz için profesyonel çekim',
    text: 'Kadraj Medya: senaryo, drone çekimi ve kurgu.',
    cta: 'Firmayı İncele',
    url: '/companies?search=Kadraj',
    image: '/img/ilan/kamera.jpg',
    color: 'red',
    demo: true
  },
  {
    title: 'Firmanızı hizmet arayanlara tanıtın',
    text: 'Firma hesabı açın, size uygun işlere hemen teklif verin.',
    cta: 'Firma Hesabı Aç',
    url: '/register?role=company',
    color: 'yellow'
  },
  {
    title: 'Reklamınız burada yer alsın',
    text: 'Hizmet arayan kişilere doğrudan ulaşın.',
    cta: 'Reklam Ver',
    url: '/reklam',
    color: 'navy'
  }
];
