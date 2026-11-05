// Canlı ortam denemesi: yalnızca üretim paketleriyle kurulmuş kopya, NODE_ENV=production, boş veritabanı.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { ROOT, startMongo, startSite, client, reporter, MINI_PNG } = require('../helpers/harness');

const { check, finish } = reporter();
const PORT = 3105;
const SITE_URL = 'https://teklifver.example';

const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teklifver-prod-'));
for (const item of ['config', 'lib', 'middleware', 'models', 'public', 'routes', 'scripts', 'views', 'server.js', 'package.json', 'package-lock.json']) {
  fs.cpSync(path.join(ROOT, item), path.join(copyDir, item), { recursive: true });
}
const entry = path.join(copyDir, 'server.js');

const env = extra => ({
  NODE_ENV: 'production',
  SESSION_SECRET: 'x'.repeat(40),
  SITE_URL,
  ADMIN_EMAIL: 'patron@teklifver.example',
  ...extra
});

// https vekil sunucusu arkasındaymış gibi istek yapar.
const https = c => ({
  get: c.get,
  post: (url, data) => c.post(url, data, { 'x-forwarded-proto': 'https' })
});

(async () => {
  execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: copyDir, stdio: 'ignore' });
  check('geliştirme paketi kurulmadı', !fs.existsSync(path.join(copyDir, 'node_modules', 'mongodb-memory-server')));

  const mongo = await startMongo();
  const uri = mongo.getUri('prod_test');
  const start = extra => startSite({ uri, port: PORT, cwd: copyDir, entry, env: env(extra) });

  try {
    // Güvensiz ayarlarla açılmaz
    const refuses = extra => {
      const merged = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, MONGODB_URI: uri, PORT: String(PORT), ...env(extra) };
      Object.keys(merged).forEach(key => merged[key] === undefined && delete merged[key]);
      return spawnSync(process.execPath, [entry], { cwd: copyDir, env: merged, encoding: 'utf8', timeout: 30000 }).status === 1;
    };
    check('kısa SESSION_SECRET reddi', refuses({ SESSION_SECRET: 'kisa' }));
    check('örnek SESSION_SECRET reddi', refuses({ SESSION_SECRET: 'buraya-uzun-ve-rastgele-bir-metin-yazin' }));
    check('SITE_URL zorunlu', refuses({ SITE_URL: undefined }));
    check('MONGODB_URI zorunlu', refuses({ MONGODB_URI: undefined }));

    let server = await start();
    check('sunucu uyarıları', server.logs.includes('SMTP tanımlı değil') && server.logs.includes('Sosyal giriş anahtarı'));

    const a = client(server.url);
    const health = await a.get('/healthz');
    check('sağlık kontrolü', health.status === 200 && health.text.includes('ok'));
    check('sağlıkta çerez yok', !health.setCookie);
    const home = await a.get('/');
    check('ana sayfa boş veritabanında açılır', home.status === 200);
    check('hsts', (home.headers.get('strict-transport-security') || '').includes('max-age'));
    check('örnek veri uyarısı yok', !home.text.includes('örnek veridir'));
    check('örnek firma yok', !home.text.includes('Usta Eller'));
    check('gerçek site aramalara açık', !home.text.includes('name="robots"'));
    const emptyService = await a.get('/hizmet/temizlik');
    check('içeriksiz hizmet sayfası aramalara kapalı', emptyService.status === 200 && emptyService.text.includes('name="robots" content="noindex"'));
    check('örnek reklam yok', !/Kodhane|Usta Eller Tadilat/.test(home.text));
    check('css uzun önbellekli', ((await a.get('/css/style.css')).headers.get('cache-control') || '').includes('max-age=2592000'));
    for (const p of ['/requests', '/companies', '/kategoriler', '/fiyat-rehberi', '/iller', '/iletisim', '/yardim', '/gizlilik', '/kullanim-kosullari', '/cerez-politikasi', '/reklam', '/register', '/forgot', '/robots.txt', '/hakkimizda', '/firmalar-icin', '/guvenli-hizmet', '/veri-silme']) {
      check(`${p} açılır`, (await a.get(p)).status === 200);
    }
    check('site haritası alan adı', (await a.get('/sitemap.xml')).text.includes(`${SITE_URL}/fiyat-rehberi`));
    check('canonical alan adı', home.text.includes(`<link rel="canonical" href="${SITE_URL}/"`));
    const login = await a.get('/login');
    check('örnek hesap butonu yok', !login.text.includes('data-demo-email') && !login.text.includes('demo1234'));
    check('anahtarsız sosyal buton yok', !login.text.includes('social-btn'));
    check('anahtarsız sosyal adres', (await a.get('/auth/google')).location === '/login');
    check('örnek yönetici girişi kapalı', (await client(server.url).post('/login', { email: 'yonetici@teklifver.test', password: 'demo1234' })).status === 401);
    const forgot = await a.post('/forgot', { email: 'kimse@test.local' });
    check('SMTP yokken şifre sıfırlama dürüst', (await a.get(forgot.location)).text.includes('E-posta gönderimi şu anda kapalı'));

    // Kayıt: https arkasında güvenli çerez
    const c = client(server.url);
    const reg = await https(c).post('/register', { role: 'customer', name: 'Patron', email: 'patron@teklifver.example', password: 'guclusifre123', terms: 'on' });
    check('kayıt', reg.status === 302 && reg.location === '/dashboard', String(reg.status));
    check('çerez Secure ve HttpOnly', /Secure/i.test(reg.setCookie) && /HttpOnly/i.test(reg.setCookie), reg.setCookie);
    check('SMTP yokken doğrulama istenmez', !(await c.get('/dashboard')).text.includes('E-posta adresiniz doğrulanmadı'));
    check('yönetici henüz değil', (await c.get('/admin')).status !== 200);

    // Görsel yükleme
    const fd = new FormData();
    fd.set('title', 'Kalıcı görsel'); fd.set('description', 'Açıklama'); fd.set('category', 'Diğer');
    fd.append('images', new Blob([MINI_PNG], { type: 'image/png' }), 'a.png');
    fd.append('images', new Blob([MINI_PNG], { type: 'image/png' }), 'b.png');
    const created = await c.form('/requests', fd);
    check('talep oluştu', created.status === 302, String(created.status));
    const detail = await c.get(created.location);
    const images = [...new Set(detail.text.match(/\/uploads\/[\w-]+\.webp/g) || [])].filter(name => !name.endsWith('_t.webp'));
    check('iki görsel', images.length === 2, images.join());
    check('diske yazılmadı', !fs.existsSync(path.join(copyDir, 'uploads')));
    const img = await client(server.url).get(images[0]);
    check('görsel açılır', img.status === 200 && (await sharp(img.buffer).metadata()).format === 'webp');
    check('görsel önbellek', (img.headers.get('cache-control') || '').includes('immutable'));
    check('görselde çerez yok', !img.setCookie);
    check('olmayan görsel 404', (await client(server.url).get('/uploads/yok.png')).status === 404);
    check('izinsiz uzantı 404', (await client(server.url).get('/uploads/x.html')).status === 404);
    check('dizin aşımı', (await client(server.url).get('/uploads/..%2F..%2Fserver.js')).status === 404);

    check('bilgisi olan il sayfası', (await client(server.url).get('/il/istanbul')).status === 200);

    // Yeniden başlatma: görsel ve oturum kalır, yönetici atanır
    await server.stop();
    server = await start();
    check('yeniden başlatınca görsel durur', (await client(server.url).get(images[0])).status === 200);
    check('yeniden başlatınca oturum durur', (await c.get('/dashboard')).status === 200);
    check('ADMIN_EMAIL yönetici yapar', (await c.get('/admin')).status === 200);
    check('örnek veri düğmesi yok', !(await c.get('/admin')).text.includes('Örnek Verileri Sil'));

    // Sosyal buton: anahtar varken görünür, adres SITE_URL
    await server.stop();
    server = await start({ GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec' });
    const s = client(server.url);
    const withKey = await s.get('/login');
    check('yalnız Google görünür', withKey.text.includes('Google ile devam et') && !withKey.text.includes('Facebook ile devam et'));
    const go = await s.get('/auth/google');
    check('dönüş adresi SITE_URL', new URL(go.location).searchParams.get('redirect_uri') === `${SITE_URL}/auth/google/callback`);

    // Silme görselleri temizler
    const removed = await c.post(`${created.location}?_method=DELETE`);
    await new Promise(r => setTimeout(r, 300));
    check('talep silindi', removed.status === 302, String(removed.status));
    check('silinen görsel kalkar', (await client(server.url).get(images[0])).status === 404);

    check('sunucu hatası yok', !/TypeError|ReferenceError|Unhandled/.test(server.logs), server.logs.slice(0, 400));
    await server.stop();

    // Vitrin modu: dolu görünür, hesaplara girilemez, panelden silinir
    const vitrinMongo = await startMongo();
    const vitrinUri = vitrinMongo.getUri('vitrin_test');
    const vitrin = await startSite({ uri: vitrinUri, port: PORT, cwd: copyDir, entry, env: env({ DEMO_DATA: 'showcase', ADMIN_EMAIL: 'patron@teklifver.example' }) });
    const v = client(vitrin.url);
    const vitrinHome = await v.get('/');
    check('vitrin dolu', vitrinHome.text.includes('Usta Eller') || (await v.get('/companies')).text.includes('Usta Eller'));
    check('vitrinde örnek veri uyarısı', vitrinHome.text.includes('örnek veridir'));
    check('vitrin aramalara kapalı', vitrinHome.text.includes('name="robots" content="noindex"'));
    check('vitrinde tek tıkla giriş yok', !(await v.get('/login')).text.includes('data-demo-email'));
    for (const email of ['yonetici@teklifver.test', 'musteri@teklifver.test', 'sirket@teklifver.test']) {
      check(`vitrinde ${email} giremez`, (await client(vitrin.url).post('/login', { email, password: 'demo1234' })).status === 401);
    }
    const boss = client(vitrin.url);
    await https(boss).post('/register', { role: 'customer', name: 'Patron', email: 'patron@teklifver.example', password: 'guclusifre123', terms: 'on' });
    await vitrin.stop();
    const vitrin2 = await startSite({ uri: vitrinUri, port: PORT, cwd: copyDir, entry, env: env({ DEMO_DATA: 'showcase', ADMIN_EMAIL: 'patron@teklifver.example' }) });
    check('panelde silme düğmesi', (await boss.get('/admin')).text.includes('Örnek Verileri Sil'));
    await boss.post('/admin/demo/remove');
    check('vitrin silinir', !(await client(vitrin2.url).get('/companies')).text.includes('Usta Eller'));
    check('uyarı kalkar', !(await client(vitrin2.url).get('/')).text.includes('örnek veridir'));
    await vitrin2.stop();
    const vitrin3 = await startSite({ uri: vitrinUri, port: PORT, cwd: copyDir, entry, env: env({ DEMO_DATA: 'showcase' }) });
    check('silinen vitrin geri gelmez', !(await client(vitrin3.url).get('/companies')).text.includes('Usta Eller'));
    await vitrin3.stop();
    await vitrinMongo.stop();
  } finally {
    await mongo.stop();
    fs.rmSync(copyDir, { recursive: true, force: true });
  }
  finish();
  process.exit(process.exitCode || 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
