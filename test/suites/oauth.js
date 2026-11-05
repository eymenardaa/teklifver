// Sosyal giriş ve yeni sayfalar: geçici veritabanı, sahte sağlayıcı.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { MongoMemoryServer } = require(path.join(ROOT, 'node_modules', 'mongodb-memory-server'));
const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));

const PORT = 3102;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0; let fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) pass += 1; else { fail += 1; console.log('  HATA:', name, extra); }
};

function client() {
  let cookie = '';
  const req = async (url, opts = {}) => {
    const res = await fetch(url.startsWith('http') ? url : BASE + url, {
      redirect: 'manual', ...opts,
      headers: { ...(opts.headers || {}), cookie, ...(opts.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, location: res.headers.get('location') || '', text: await res.text() };
  };
  return {
    get: url => req(url),
    post: (url, data = {}) => req(url, { method: 'POST', body: new URLSearchParams(data).toString() }),
    follow: async url => { let r = await req(url); while (r.status >= 300 && r.status < 400) r = await req(r.location); return r; }
  };
}
const code = profile => Buffer.from(JSON.stringify(profile)).toString('base64url');

async function social(c, provider, profile, startUrl) {
  const start = startUrl || await c.get(`/auth/${provider}`);
  const url = new URL(start.location);
  return c.get(`/auth/${provider}/callback?state=${url.searchParams.get('state')}&code=${code(profile)}`);
}

(async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-test-'));
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('oauth_test');
  const server = spawn(process.execPath, ['-r', path.join(__dirname, '..', 'helpers', 'oauth-mock.js'), path.join(ROOT, 'server.js')], {
    cwd,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, MONGODB_URI: uri, PORT: String(PORT), SESSION_SECRET: 'test-secret',
      GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsec', FACEBOOK_CLIENT_ID: 'fid', FACEBOOK_CLIENT_SECRET: 'fsec'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  server.stdout.on('data', d => { logs += d; });
  server.stderr.on('data', d => { logs += d; });

  try {
    for (let i = 0; i < 120; i += 1) {
      try { if ((await fetch(BASE + '/')).ok) break; } catch { /* açılıyor */ }
      await new Promise(r => setTimeout(r, 500));
    }
    await mongoose.connect(uri);
    const User = mongoose.connection.collection('users');

    // Butonlar
    const anon = client();
    for (const page of ['/login', '/register']) {
      const html = (await anon.get(page)).text;
      check(`${page} 3 buton`, (html.match(/class="social-btn"/g) || []).length === 3);
      for (const p of ['Google', 'Facebook', 'Microsoft']) check(`${page} ${p}`, html.includes(`${p} ile devam et`));
    }
    check('firma kaydında rol taşınır', (await anon.get('/register?role=company')).text.includes('/auth/google?role=company'));
    check('next taşınır', (await anon.get('/login?next=/companies')).text.includes('/auth/google?next=%2Fcompanies'));

    // Tanımsız sağlayıcı
    const ms = client();
    const msRes = await ms.get('/auth/microsoft');
    check('microsoft tanımsız login a döner', msRes.location === '/login');
    check('microsoft uyarı', (await ms.get('/login')).text.includes('Microsoft ile giriş henüz açılmadı'));
    check('bilinmeyen sağlayıcı', (await client().get('/auth/twitter')).location === '/login');

    // Yönlendirme
    const flow = client();
    const start = await flow.get('/auth/google');
    const u = new URL(start.location);
    check('google adresi', u.origin === 'https://accounts.google.com');
    check('state var', (u.searchParams.get('state') || '').length > 20);
    check('pkce var', u.searchParams.get('code_challenge_method') === 'S256');
    check('secret adreste yok', !start.location.includes('gsec'));
    check('redirect uri', u.searchParams.get('redirect_uri') === `${BASE}/auth/google/callback`);

    // Hatalı state
    const profile = { sub: 'g-100', name: 'Ayşe Sosyal', email: 'ayse@teklifver.test', email_verified: true };
    const bad = await flow.get(`/auth/google/callback?state=yanlis&code=${code(profile)}`);
    check('yanlış state reddedilir', bad.location === '/login');
    check('yanlış state hesap açmaz', !(await User.findOne({ email: 'ayse@teklifver.test' })));
    const replayStart = await client();
    check('state olmadan', (await replayStart.get(`/auth/google/callback?code=${code(profile)}`)).location === '/login');
    const crossFlow = client();
    const crossStart = await crossFlow.get('/auth/google');
    const crossState = new URL(crossStart.location).searchParams.get('state');
    check('başka sağlayıcıya state', (await crossFlow.get(`/auth/facebook/callback?state=${crossState}&code=${code(profile)}`)).location === '/login');

    // İptal ve sağlayıcı hatası
    const cancel = client();
    const cs = new URL((await cancel.get('/auth/google')).location).searchParams.get('state');
    await cancel.get(`/auth/google/callback?state=${cs}&error=access_denied`);
    check('iptal mesajı', (await cancel.get('/login')).text.includes('Google ile giriş iptal edildi'));
    const broken = client();
    const bs = new URL((await broken.get('/auth/google')).location).searchParams.get('state');
    await broken.get(`/auth/google/callback?state=${bs}&code=bozuk`);
    check('sağlayıcı hatası kullanıcıya düzgün', (await broken.get('/login')).text.includes('bağlantı kurulamadı'));

    // Doğrulanmamış e-posta
    const unv = client();
    await social(unv, 'google', { sub: 'g-200', name: 'X', email: 'kurban@teklifver.test', email_verified: false });
    check('doğrulanmamış e-posta hesap açmaz', !(await User.findOne({ email: 'kurban@teklifver.test' })));
    check('doğrulanmamış uyarı', (await unv.get('/login')).text.includes('doğrulanmış bir e-posta'));

    // Yeni hesap
    const c = client();
    const first = await social(c, 'google', profile);
    check('kayıt tamamlamaya gider', first.location === '/auth/complete');
    check('hesap henüz yok', !(await User.findOne({ email: 'ayse@teklifver.test' })));
    const form = await c.get('/auth/complete');
    check('form ad ve e-posta', form.text.includes('Ayşe Sosyal') && form.text.includes('ayse@teklifver.test'));
    check('koşul zorunlu', (await c.post('/auth/complete', { role: 'customer', name: 'Ayşe' })).status === 422);
    check('firma adı zorunlu', (await c.post('/auth/complete', { role: 'company', name: 'Ayşe', terms: 'on' })).status === 422);
    const done = await c.post('/auth/complete', { role: 'customer', name: 'Ayşe Sosyal', terms: 'on', email: 'saldirgan@x.test' });
    check('kayıt tamam', done.location === '/dashboard', done.status);
    const created = await User.findOne({ email: 'ayse@teklifver.test' });
    check('hesap oluştu', created && created.role === 'customer');
    check('sosyal hesap doğrulanmış sayılır', created && created.emailVerified === true);
    check('şifre yok', created && !created.password);
    check('sosyal kayıtlı', created && created.socialAccounts[0].providerId === 'g-100');
    check('form e-postayı değiştiremez', !(await User.findOne({ email: 'saldirgan@x.test' })));
    check('koşul tarihi', created && created.termsAcceptedAt);
    const dash = await c.get('/dashboard');
    check('panel açılır, doluluk var', dash.status === 200 && dash.text.includes('Profiliniz %0 dolu'));
    let prof = (await c.get('/profile')).text;
    check('şifre belirle görünür', prof.includes('Şifre Belirle') && !prof.includes('currentPassword'));
    check('bağlı hesaplar', prof.includes('Bağlı Hesaplar') && prof.includes('· Bağlı'));
    check('silmede e-posta onayı', prof.includes('confirmEmail'));

    // Tekrar giriş
    await c.post('/logout');
    const again = await social(c, 'google', profile);
    check('tekrar giriş panele', again.location === '/dashboard');
    check('oturum açık', (await c.get('/dashboard')).status === 200);

    // Şifresiz hesaba şifreyle giriş
    const pw = client();
    check('şifresiz hesap şifreyle girilemez', (await pw.post('/login', { email: 'ayse@teklifver.test', password: 'herhangi1234' })).status === 401);

    // E-posta çakışması: kayıtlı hesaba otomatik bağlanmaz
    const clash = client();
    const clashRes = await social(clash, 'facebook', { id: 'f-1', name: 'Saldırgan', email: 'musteri@teklifver.test' });
    check('çakışma giriş açmaz', clashRes.location === '/login');
    check('çakışma mesajı', (await clash.get('/login')).text.includes('zaten bir hesabınız var'));
    check('çakışma panele girmez', (await clash.get('/dashboard')).status === 302);
    const victim = await User.findOne({ email: 'musteri@teklifver.test' });
    check('kurbana bağlanmadı', !(victim.socialAccounts || []).length);

    // Google adresi doğruladığı için doğrulanmış hesaba doğrudan bağlanır
    await User.updateOne({ email: 'musteri@teklifver.test' }, { $set: { emailVerified: true } });
    const googleLink = client();
    check('google doğrulanmış hesaba bağlanır', (await social(googleLink, 'google', { sub: 'g-500', name: 'Elif', email: 'musteri@teklifver.test', email_verified: true })).location === '/dashboard');
    check('şifre korunur', (await client().post('/login', { email: 'musteri@teklifver.test', password: 'demo1234' })).status === 302);
    await User.updateOne({ email: 'musteri@teklifver.test' }, { $set: { socialAccounts: [] } });

    // Doğrulanmamış hesap: gerçek sahibi Google ile gelince eski şifre ve oturum geçersiz olur
    const squatter = client();
    await squatter.post('/register', { role: 'customer', name: 'Sahte', email: 'kurban2@teklifver.test', password: 'saldirgan-sifre-1', terms: 'on' });
    check('saldırgan oturumu açık', (await squatter.get('/dashboard')).status === 200);
    const realOwner = client();
    check('gerçek sahip girer', (await social(realOwner, 'google', { sub: 'g-600', name: 'Gerçek', email: 'kurban2@teklifver.test', email_verified: true })).location === '/dashboard');
    check('saldırganın oturumu kapanır', (await squatter.get('/dashboard')).status === 302);
    check('saldırganın şifresi geçmez', (await client().post('/login', { email: 'kurban2@teklifver.test', password: 'saldirgan-sifre-1' })).status === 401);
    const claimed = await User.findOne({ email: 'kurban2@teklifver.test' });
    check('hesap doğrulandı', claimed.emailVerified === true && !claimed.password);

    // E-postasız Facebook
    const noMail = client();
    await social(noMail, 'facebook', { id: 'f-9', name: 'E Yok' });
    check('e-postasız uyarı', (await noMail.get('/login')).text.includes('doğrulanmış bir e-posta'));

    // Hesap bağlama
    const m = client();
    check('müşteri girişi', (await m.post('/login', { email: 'musteri@teklifver.test', password: 'demo1234' })).status === 302);
    prof = (await m.get('/profile')).text;
    check('bağla butonu', prof.includes('/auth/facebook/link'));
    const linkStart = await m.post('/auth/facebook/link');
    check('bağlama facebook a gider', linkStart.location.startsWith('https://www.facebook.com/'));
    const linked = await social(m, 'facebook', { id: 'f-1', name: 'Elif', email: 'baska@x.test' }, linkStart);
    check('bağlandı profile döner', linked.location === '/profile');
    check('bağ kayıtlı', (await User.findOne({ email: 'musteri@teklifver.test' })).socialAccounts.length === 1);
    const viaFb = client();
    check('facebook ile giriş', (await social(viaFb, 'facebook', { id: 'f-1', name: 'Elif', email: 'baska@x.test' })).location === '/dashboard');
    const whoami = await viaFb.get('/profile');
    check('doğru hesap', whoami.text.includes('musteri@teklifver.test'));
    // Başkasının hesabını bağlama
    const f = client();
    await f.post('/login', { email: 'sirket@teklifver.test', password: 'demo1234' });
    const fStart = await f.post('/auth/facebook/link');
    await social(f, 'facebook', { id: 'f-1', name: 'Elif' }, fStart);
    check('başka kullanıcıya bağlı uyarısı', (await f.get('/profile')).text.includes('başka bir kullanıcıya bağlı'));
    check('firma hesabına bağlanmadı', !((await User.findOne({ email: 'sirket@teklifver.test' })).socialAccounts || []).length);
    // Şifreli hesapta kaldırma
    await m.post('/profile/social/facebook/unlink');
    check('kaldırıldı', (await User.findOne({ email: 'musteri@teklifver.test' })).socialAccounts.length === 0);

    // Şifresiz hesapta son bağ kaldırılamaz
    await c.post('/profile/social/google/unlink');
    check('son giriş yolu kalır', (await User.findOne({ email: 'ayse@teklifver.test' })).socialAccounts.length === 1);
    check('kısa şifre reddi', (await c.post('/profile/password', { newPassword: '123' })).status === 422);
    await c.post('/profile/password', { newPassword: 'yeniSifre123' });
    check('şifre kaydedildi', Boolean((await User.findOne({ email: 'ayse@teklifver.test' })).password));
    const pw2 = client();
    check('yeni şifreyle giriş', (await pw2.post('/login', { email: 'ayse@teklifver.test', password: 'yeniSifre123' })).status === 302);
    await c.post('/profile/social/google/unlink');
    check('şifre varken kaldırılır', (await User.findOne({ email: 'ayse@teklifver.test' })).socialAccounts.length === 0);

    // Şifresiz hesabı silme
    const del = client();
    await social(del, 'google', { sub: 'g-300', name: 'Silinecek', email: 'sil@teklifver.test', email_verified: true });
    await del.post('/auth/complete', { role: 'company', name: 'Sil', companyName: 'Sil AŞ', terms: 'on' });
    check('firma sosyal kayıt', (await User.findOne({ email: 'sil@teklifver.test' })).role === 'company');
    check('yanlış e-posta silmez', (await del.post('/profile/delete', { confirmEmail: 'yanlis@x.test' })).status === 422);
    check('doğru e-posta siler', (await del.post('/profile/delete', { confirmEmail: 'SIL@teklifver.test'.toLowerCase() })).location === '/');
    check('silindi', !(await User.findOne({ email: 'sil@teklifver.test' })));

    // Süresi dolmuş veya olmayan tamamlama
    check('bekleyen yoksa', (await client().get('/auth/complete')).location === '/register');

    // Yeni sayfalar
    const v = client();
    const cats = (await v.get('/kategoriler')).text;
    check('kategoriler', cats.includes('İnşaat &amp; Tadilat') && cats.includes('Boya Badana'));
    const guide = (await v.get('/fiyat-rehberi')).text;
    check('fiyat rehberi', guide.includes('Ortalama Teklif') && /[\d.]+ TL/.test(guide));
    const iller = (await v.get('/iller')).text;
    check('81 il', (iller.split('class="link-grid"')[1].split('</section>')[0].match(/href="\/il\//g) || []).length === 81);
    const home = (await v.get('/')).text;
    check('yorumlar ana sayfada', home.includes('Son Yorumlar') && (home.match(/class="review-card"/g) || []).length === 4);
    check('atlama bağlantısı', home.includes('skip-link'));
    const contact = await v.post('/iletisim', { name: '', email: 'x', subject: 'Yok', message: '' });
    check('iletişim doğrulama', contact.status === 422 && contact.text.includes('Geçerli bir e-posta'));
    logs = '';
    const honey = await v.post('/iletisim', { name: 'B', email: 'b@b.co', subject: 'Öneri', message: 'spam', website: 'x' });
    check('tuzak alan mail atmaz', honey.status === 302 && !logs.includes('[E-POSTA]'));
    const sent = await v.post('/iletisim', { name: 'Ali', email: 'ali@ali.co', subject: 'Öneri', message: 'Merhaba' });
    await new Promise(r => setTimeout(r, 100));
    check('iletişim kaydedilir', sent.location === '/iletisim');
    check('başarı mesajı', (await v.get('/iletisim')).text.includes('Mesajınız alındı'));

    // Talep formu
    const nf = (await m.get('/requests/new')).text;
    check('kategori ipucu', nf.includes('data-tip="Yapılacak iş:') && nf.includes('id="categoryTip"'));
    check('taslak', nf.includes('data-draft="request-draft"'));

    check('sunucu hatası yok', !/TypeError|ReferenceError|at .*\.js:\d+/.test(logs), logs.slice(0, 500));
  } finally {
    server.kill();
    await mongoose.disconnect();
    await mongo.stop();
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  console.log(`\n${pass} geçti, ${fail} hata`);
  // Canlı ortam: anahtarsız sağlayıcı görünmez
  const out = execFileSync(process.execPath, ['-e', `process.env.NODE_ENV='production';process.env.GOOGLE_CLIENT_ID='a';process.env.GOOGLE_CLIENT_SECRET='b';console.log(require(${JSON.stringify(path.join(ROOT, 'lib', 'oauth.js'))}).visibleProviders().map(p=>p.key).join(','))`], { encoding: 'utf8' }).trim();
  console.log('canlıda görünen:', out);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
