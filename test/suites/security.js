// Başka siteden gelen form, istek sınırı, görsel temizliği ve hata yönetimi.
const sharp = require('sharp');
const { startMongo, startSite, client, reporter, MINI_PNG } = require('../helpers/harness');

const { check, finish } = reporter();
const pw = 'guvenlik-test-sifre-1';

(async () => {
  const mongo = await startMongo();
  const site = await startSite({ uri: mongo.getUri('security_test'), port: 3104, env: { DEMO_DATA: 'false' } });

  try {
    const c = client(site.url);
    await c.post('/register', { role: 'customer', name: 'Güvenlik Testi', email: 'g@test.local', password: pw, terms: 'on' });

    // Başka siteden gelen form
    const before = await c.get('/dashboard');
    check('oturum açık', before.status === 200);
    let res = await c.post('/profile/sessions', {}, { origin: 'https://saldirgan.example' });
    check('yabancı Origin reddedilir', res.status === 403);
    res = await c.post('/profile/sessions', {}, { 'sec-fetch-site': 'cross-site' });
    check('cross-site reddedilir', res.status === 403);
    res = await c.post('/profile/sessions', {}, { origin: 'null' });
    check('boş Origin reddedilir', res.status === 403);
    res = await c.post('/profile/sessions', {}, { origin: site.url, 'sec-fetch-site': 'same-origin' });
    check('kendi sitesinden geçer', res.status === 302);
    res = await client(site.url).post('/login', { email: 'g@test.local', password: pw }, { 'sec-fetch-site': 'none' });
    check('doğrudan istek geçer', res.status === 302);

    // Giriş süresi hesabın varlığını ele vermez
    const timed = async email => {
      const started = Date.now();
      await client(site.url).post('/login', { email, password: 'yanlis-sifre-12345' });
      return Date.now() - started;
    };
    const missing = await timed('yok@test.local');
    const existing = await timed('g@test.local');
    check('olmayan hesapta da şifre karşılaştırılır', missing > 50 && existing / missing < 4, `${missing}ms / ${existing}ms`);

    // Kayıt tuzağı
    res = await client(site.url).post('/register', { role: 'customer', name: 'Bot', email: 'bot@test.local', password: pw, terms: 'on', website: 'http://spam.example' });
    check('tuzak alan kaydı engeller', res.status === 422);

    // Çok büyük form
    res = await c.post('/profile', { name: 'x'.repeat(200 * 1024) });
    check('çok büyük form 413', res.status === 413);

    // Görsel işleme
    const send = async (name, type, data) => {
      const form = new FormData();
      Object.entries({ title: 'Görsel', description: 'x', category: 'Diğer' }).forEach(([k, v]) => form.set(k, v));
      form.append('images', new Blob([data], { type }), name);
      return c.form('/requests', form);
    };
    res = await send('sahte.png', 'image/png', Buffer.from('<html><script>alert(1)</script></html>'));
    check('görsel olmayan içerik reddedilir', res.status === 422 && res.text.includes('Görsel okunamadı'));
    res = await send('sayfa.html', 'text/html', Buffer.from('<html></html>'));
    check('izinsiz tür reddedilir', res.status === 422 && res.text.includes('Yalnızca JPG'));

    // Konum bilgisi taşıyan büyük fotoğraf
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 80, b: 40 } } })
      .withExif({ IFD0: { Copyright: 'gizli-veri-123' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '41/1 0/1 0/1' } })
      .jpeg()
      .toBuffer();
    check('deneme fotoğrafında EXIF var', Boolean((await sharp(photo).metadata()).exif));
    res = await send('foto.jpg', 'image/jpeg', photo);
    check('fotoğraf yüklenir', res.status === 302, String(res.status));
    const detail = await c.get(res.location);
    const url = (detail.text.match(/href="(\/uploads\/[^"]+\.webp)"/) || [])[1];
    check('webp olarak kaydedilir', Boolean(url));
    const stored = await client(site.url).get(url);
    const info = await sharp(stored.buffer).metadata();
    check('boyut küçültülür', info.width === 1600 && info.format === 'webp', `${info.width} ${info.format}`);
    check('EXIF ve konum silinir', !info.exif && !stored.buffer.includes('gizli-veri-123'));
    check('içerik türü sabit', stored.headers.get('content-type') === 'image/webp' && stored.headers.get('x-content-type-options') === 'nosniff');
    const small = await client(site.url).get(url.replace('.webp', '_t.webp'));
    const smallInfo = await sharp(small.buffer).metadata();
    check('küçük sürüm üretilir', small.status === 200 && smallInfo.width === 480);
    check('liste küçük sürümü kullanır', (await client(site.url).get('/requests')).text.includes(url.replace('.webp', '_t.webp')));

    // Küçük görsel büyütülmez
    res = await send('kucuk.png', 'image/png', MINI_PNG);
    check('küçük görsel kabul edilir', res.status === 302);

    // Düzenlemede eski görsel silinir
    const editPath = `${(await c.get('/dashboard')).text.match(/\/requests\/[a-f0-9]{24}/)[0]}`;
    check('panel talepleri listeler', Boolean(editPath));

    // Sunucu güvenlik başlıkları
    const home = await client(site.url).get('/');
    check('CSP var', (home.headers.get('content-security-policy') || '').includes("script-src 'self'"));
    check('sayfa gömülemez', (home.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'"));
    check('sürüm başlığı yok', !home.headers.get('x-powered-by'));
    const robots = await client(site.url).get('/robots.txt');
    check('robots gizli yolları kapatır', robots.text.includes('Disallow: /admin') && robots.text.includes('Disallow: /email'));

    check('sunucu hatası yok', !/TypeError|ReferenceError/.test(site.logs), site.logs.slice(0, 500));
  } finally {
    await site.stop();
    await mongo.stop();
  }

  // Genel istek sınırı
  const mongo2 = await startMongo();
  const limited = await startSite({ uri: mongo2.getUri('limit_test'), port: 3104, env: { DEMO_DATA: 'false', RATE_LIMIT_PER_MINUTE: '5' } });
  try {
    const guest = client(limited.url);
    let last;
    for (let i = 0; i < 8; i += 1) last = await guest.get('/yardim');
    check('aşırı istek 429', last.status === 429 && last.text.includes('Çok fazla istek'));
    check('sağlık kontrolü sınırlanmaz', (await guest.get('/healthz')).status === 200);
    check('statik dosya sınırlanmaz', (await guest.get('/css/style.css')).status === 200);
  } finally {
    await limited.stop();
    await mongo2.stop();
  }

  finish();
  process.exit(process.exitCode || 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
