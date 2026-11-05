// E-posta doğrulama, bildirim e-postaları ve şifre sıfırlama: gerçek SMTP protokolüyle, sahte sunucuya.
const { startMongo, startSite, startSmtpSink, client, reporter } = require('../helpers/harness');

const { check, finish } = reporter();
const SMTP_PORT = 2526;
const SITE_URL = 'https://teklifver.example';
const pw = 'eposta-test-sifre-1';

const linkIn = (sink, mail, pattern) => (sink.textOf(mail).match(pattern) || [])[0];
const pathOf = url => url.replace(SITE_URL, '');

(async () => {
  const sink = await startSmtpSink(SMTP_PORT);
  const mongo = await startMongo();
  const site = await startSite({
    uri: mongo.getUri('email_test'),
    port: 3103,
    env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SMTP_FROM: 'site@teklifver.example', SITE_URL, DEMO_DATA: 'false', ADMIN_EMAIL: 'patron@test.local' }
  });

  const newMail = async (to, subjectPart) => sink.waitFor(mail => mail.to.includes(to) && sink.textOf(mail).includes(subjectPart));
  const signup = async (email, role = 'customer') => {
    const c = client(site.url);
    const res = await c.post('/register', { role, name: 'Test Kişi', companyName: role === 'company' ? 'Test Firma' : '', email, password: pw, terms: 'on' });
    return { c, res };
  };
  const verify = async (email, c) => {
    const mail = await newMail(email, '/email/verify/');
    const url = linkIn(sink, mail, /https:\/\/teklifver\.example\/email\/verify\/[a-f0-9]+/);
    return c.get(pathOf(url));
  };
  const makeRequest = async (c, title) => {
    const form = new FormData();
    Object.entries({ title, description: 'Açıklama', category: 'Temizlik' }).forEach(([k, v]) => form.set(k, v));
    return c.form('/requests', form);
  };

  try {
    // Kayıt ve doğrulama
    const { c: owner, res } = await signup('sahip@test.local');
    check('kayıt olur', res.status === 302);
    const dashboard = await owner.get('/dashboard');
    check('doğrulama uyarısı görünür', dashboard.text.includes('E-posta adresiniz doğrulanmadı'));

    let blocked = await makeRequest(owner, 'Engelli');
    check('doğrulanmadan talep verilemez', blocked.location === '/dashboard');
    check('form sayfası da yönlenir', (await owner.get('/requests/new')).location === '/dashboard');

    const mail = await newMail('sahip@test.local', '/email/verify/');
    check('doğrulama e-postası gelir', Boolean(mail));
    check('bağlantı SITE_URL kullanır', Boolean(linkIn(sink, mail, /https:\/\/teklifver\.example\/email\/verify\/[a-f0-9]{64}/)));
    check('HTML ve düz metin var', /text\/html/.test(mail.raw) && /text\/plain/.test(mail.raw));

    check('yanlış bağlantı reddedilir', (await client(site.url).get(`/email/verify/${'a'.repeat(64)}`)).location === '/login');
    const verified = await verify('sahip@test.local', owner);
    check('doğrulama tamamlanır', verified.location === '/dashboard');
    check('uyarı kalkar', !(await owner.get('/dashboard')).text.includes('E-posta adresiniz doğrulanmadı'));
    const made = await makeRequest(owner, 'Doğrulanmış talep');
    check('doğrulanınca talep verilir', made.location.startsWith('/requests/'));
    const requestId = made.location.split('/').pop();

    // Bağlantıyı tekrar gönder
    const { c: late } = await signup('gec@test.local');
    await newMail('gec@test.local', '/email/verify/');
    sink.mails.length = 0;
    await late.post('/email/resend');
    check('tekrar gönderim çalışır', Boolean(await newMail('gec@test.local', '/email/verify/')));
    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const again = await late.post('/email/resend');
      if ((await late.get(again.location)).text.includes('Çok fazla e-posta')) limited = true;
    }
    check('tekrar gönderim sınırlı', limited);

    // Teklif bildirimi e-postası
    const { c: firm } = await signup('firma@test.local', 'company');
    const blockedBid = await firm.post('/bids', { requestId, amount: '100', deliveryTime: '1', description: 'x' });
    check('doğrulanmadan teklif verilemez', blockedBid.location === '/dashboard');
    await verify('firma@test.local', firm);
    sink.mails.length = 0;
    await firm.post('/bids', { requestId, amount: '100', deliveryTime: '1', description: 'x' });
    const bidMail = await newMail('sahip@test.local', 'teklif verdi');
    check('yeni teklif e-postası', Boolean(bidMail));
    check('e-postada bağlantı', sink.textOf(bidMail).includes(`${SITE_URL}/requests/${requestId}`));
    const unsub = linkIn(sink, bidMail, /https:\/\/teklifver\.example\/email\/unsub\/[^\s"<]+/);
    check('kapatma bağlantısı var', Boolean(unsub));

    // Bildirim kapatma: GET değiştirmez, POST değiştirir, imza korunur
    const anon = client(site.url);
    const unsubPage = await anon.get(pathOf(unsub));
    check('kapatma sayfası açılır', unsubPage.status === 200 && unsubPage.text.includes('teklif bildirimleri'));
    check('sahte imza reddedilir', (await anon.get(pathOf(unsub).slice(0, -3) + 'abc')).status === 404);
    check('sahte imzayla POST reddedilir', (await anon.post(pathOf(unsub).slice(0, -3) + 'abc')).status === 404);
    await anon.post(pathOf(unsub));
    sink.mails.length = 0;
    await firm.post(`/bids/${(await owner.get(`/requests/${requestId}`)).text.match(/\/bids\/([a-f0-9]{24})\/accept/)[1]}/edit`, { amount: '90', deliveryTime: '1', description: 'y' });
    await new Promise(r => setTimeout(r, 500));
    check('kapatılan bildirim e-postası gitmez', !sink.mails.some(m => m.to.includes('sahip@test.local')));
    check('site içi bildirim devam eder', (await owner.get('/notifications')).text.includes('teklifini güncelledi'));
    await owner.post('/profile/notifications', { bids: 'on', messages: 'on' });
    check('tercih geri açılır', (await owner.get('/profile')).text.includes('name="bids" checked'));
    check('kapalı tercih görünür', !(await owner.get('/profile')).text.includes('name="matches" checked'));

    // Mesaj e-postası
    sink.mails.length = 0;
    const ownerId = (await firm.get(`/requests/${requestId}`)).text.match(/\/messages\/[a-f0-9]{24}\/([a-f0-9]{24})/)[1];
    await firm.post(`/messages/${requestId}/${ownerId}`, { content: 'Merhaba' });
    check('mesaj e-postası', Boolean(await newMail('sahip@test.local', 'mesaj g')));

    // Şifre sıfırlama: Host başlığı bağlantıya girmez
    sink.mails.length = 0;
    await fetch(`${site.url}/forgot`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', host: 'saldirgan.example' },
      body: new URLSearchParams({ email: 'sahip@test.local' }).toString()
    });
    const resetMail = await newMail('sahip@test.local', '/reset/');
    check('sıfırlama e-postası gelir', Boolean(resetMail));
    check('sahte alan adı bağlantıya girmez', !sink.textOf(resetMail).includes('saldirgan.example') && sink.textOf(resetMail).includes(`${SITE_URL}/reset/`));
    const resetPath = pathOf(linkIn(sink, resetMail, /https:\/\/teklifver\.example\/reset\/[a-f0-9]+/));
    const device = client(site.url);
    await device.post('/login', { email: 'sahip@test.local', password: pw });
    await anon.post(resetPath, { password: 'yeni-sifre-12345' });
    check('sıfırlama diğer oturumları kapatır', (await device.get('/dashboard')).status === 302);
    check('değişiklik bildirimi gelir', Boolean(await newMail('sahip@test.local', 'diğer cihazlardaki')));
    check('sıfırlama bağlantısı tek kullanımlık', (await anon.get(resetPath)).status === 302);
    const newLogin = client(site.url);
    check('yeni şifre geçer', (await newLogin.post('/login', { email: 'sahip@test.local', password: 'yeni-sifre-12345' })).status === 302);

    // E-posta değiştirme
    let change = await newLogin.post('/profile/email', { newEmail: 'firma@test.local', emailPassword: 'yeni-sifre-12345' });
    check('kullanılan adres reddedilir', change.status === 422 && change.text.includes('başka bir hesapta'));
    change = await newLogin.post('/profile/email', { newEmail: 'yeni@test.local', emailPassword: 'yanlis' });
    check('yanlış şifre reddedilir', change.status === 422 && change.text.includes('Şifre hatalı'));
    sink.mails.length = 0;
    change = await newLogin.post('/profile/email', { newEmail: 'yeni@test.local', emailPassword: 'yeni-sifre-12345' });
    check('değişiklik başlar', change.status === 302);
    check('adres hemen değişmez', (await newLogin.get('/profile')).text.includes('Onay bekleyen yeni adres: yeni@test.local'));
    check('eski adrese uyarı', Boolean(await newMail('sahip@test.local', 'yeni@test.local')));
    const changeMail = await newMail('yeni@test.local', '/email/verify/');
    check('yeni adrese bağlantı', Boolean(changeMail));
    await newLogin.get(pathOf(linkIn(sink, changeMail, /https:\/\/teklifver\.example\/email\/verify\/[a-f0-9]+/)));
    const after = (await newLogin.get('/profile')).text;
    check('adres değişti', after.includes('<strong>yeni@test.local</strong>') && !after.includes('Onay bekleyen'));
    check('yeni adresle giriş', (await client(site.url).post('/login', { email: 'yeni@test.local', password: 'yeni-sifre-12345' })).status === 302);
    check('eski adresle giriş olmaz', (await client(site.url).post('/login', { email: 'sahip@test.local', password: 'yeni-sifre-12345' })).status === 401);

    // İletişim formu e-postası SITE_EMAIL olmadan da panele düşer (burada e-posta gitmez, kayıt tutulur)
    const contact = await anon.post('/iletisim', { name: 'Z', email: 'z@z.co', subject: 'Öneri', message: 'kayıt' });
    check('iletişim SITE_EMAIL olmadan çalışır', contact.location === '/iletisim');

    // ADMIN_EMAIL: doğrulanmamış hesap yönetici olmaz
    const { c: fake } = await signup('patron@test.local');
    const patronMail = await newMail('patron@test.local', '/email/verify/');
    await site.stop();
    const restarted = await startSite({
      uri: mongo.getUri('email_test'),
      port: 3103,
      env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SITE_URL, DEMO_DATA: 'false', ADMIN_EMAIL: 'patron@test.local' }
    });
    site.stop = restarted.stop;
    check('doğrulanmamış adres yönetici olmaz', (await fake.get('/admin')).status === 403);
    await fake.get(pathOf(linkIn(sink, patronMail, /https:\/\/teklifver\.example\/email\/verify\/[a-f0-9]+/)));
    await restarted.stop();
    const third = await startSite({
      uri: mongo.getUri('email_test'),
      port: 3103,
      env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SITE_URL, DEMO_DATA: 'false', ADMIN_EMAIL: 'patron@test.local' }
    });
    site.stop = third.stop;
    check('doğrulanan adres yönetici olur', (await fake.get('/admin')).status === 200);
    check('sunucu hatası yok', !/TypeError|ReferenceError/.test(third.logs), third.logs.slice(0, 300));
  } finally {
    await site.stop();
    await mongo.stop();
    await sink.stop().catch(() => {});
  }
  finish();
  process.exit(process.exitCode || 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
