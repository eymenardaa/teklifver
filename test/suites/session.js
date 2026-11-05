// Oturum veritabanı yavaşken (uzak veritabanı gibi) giriş ve uyarı mesajları kaybolmamalı.
// Tarayıcı yönlendirmeyi başlıkları alır almaz izler; oturum o ana kadar yazılmış olmalı.
const path = require('path');
const { startMongo, startSite, reporter } = require('../helpers/harness');

const { check, finish } = reporter();
const form = data => ({
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data).toString()
});
const pw = 'yavas-oturum-sifre-1';

(async () => {
  const mongo = await startMongo();
  const site = await startSite({
    uri: mongo.getUri('session_test'),
    port: 3108,
    preload: path.join(__dirname, '..', 'helpers', 'slow-session.js'),
    env: { DEMO_DATA: 'false', RATE_LIMIT_PER_MINUTE: '100000' }
  });
  const base = site.url;

  try {
    // Gövde okunmadan hemen sonraki istek: tarayıcının yönlendirmeyi izlemesi gibi
    const register = await fetch(`${base}/register`, form({ role: 'customer', name: 'Yavaş Oturum', email: 'y@test.local', password: pw, terms: 'on' }));
    const registerCookie = (register.headers.get('set-cookie') || '').split(';')[0];
    const afterRegister = await fetch(`${base}${register.headers.get('location')}`, { redirect: 'manual', headers: { cookie: registerCookie } });
    check('kayıttan hemen sonra oturum açık', afterRegister.status === 200, String(afterRegister.status));
    check('hoş geldin mesajı kaybolmaz', (await afterRegister.text()).includes('Hoş geldin'));

    const login = await fetch(`${base}/login`, form({ email: 'y@test.local', password: pw }));
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const afterLogin = await fetch(`${base}${login.headers.get('location')}`, { redirect: 'manual', headers: { cookie } });
    check('girişten hemen sonra oturum açık', afterLogin.status === 200, String(afterLogin.status));

    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(`${base}/dashboard/searches`, { ...form({ query: 'category=Temizlik' }), headers: { ...form({}).headers, cookie } });
      const page = await fetch(`${base}${res.headers.get('location')}`, { headers: { cookie } });
      check(`uyarı mesajı hemen görünür (${i + 1})`, /Arama kaydedildi|zaten kaydettiniz/.test(await page.text()));
    }

    const logout = await fetch(`${base}/logout`, { method: 'POST', redirect: 'manual', headers: { cookie } });
    check('çıkış çalışır', logout.status === 302);
    check('çıkıştan sonra oturum kapalı', (await fetch(`${base}/dashboard`, { redirect: 'manual', headers: { cookie } })).status === 302);

    // Giriş yapmamış ziyaretçi için boş oturum kaydı oluşmaz
    const guest = await fetch(`${base}/yok-boyle-yonlendirme`, { redirect: 'manual' });
    check('misafire gereksiz çerez verilmez', !guest.headers.get('set-cookie'));
    const guestRedirect = await fetch(`${base}/il/`, { redirect: 'manual' });
    check('misafir isteği hatasız', guestRedirect.status < 500);
    const { MongoClient } = require('mongodb');
    const client = await MongoClient.connect(mongo.getUri());
    const before = await client.db('session_test').collection('sessions').countDocuments();
    await fetch(`${base}/reklam-tik/abc`, { redirect: 'manual' });
    await new Promise(resolve => setTimeout(resolve, 400));
    check('misafir yönlendirmesi oturum kaydı açmaz', (await client.db('session_test').collection('sessions').countDocuments()) === before);
    await client.close();
  } finally {
    await site.stop();
    await mongo.stop();
  }
  finish();
  process.exit(process.exitCode || 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
