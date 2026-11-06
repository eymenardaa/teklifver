// Kayıt ve giriş kodu, bildirim e-postaları ve şifre sıfırlama: gerçek SMTP protokolüyle, sahte sunucuya.
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
  const codeOf = mail => (mail && (sink.textOf(mail).match(/kodunuz: (\d{6})/) || [])[1]) || '';
  // Kod e-postası beklenmeden önce kutu boşaltılır; eski bir kod okunmasın.
  const signup = async (email, role = 'customer') => {
    const c = client(site.url);
    sink.mails.length = 0;
    const res = await c.post('/register', { role, name: 'Test Kişi', companyName: role === 'company' ? 'Test Firma' : '', email, password: pw, terms: 'on' });
    return { c, res };
  };
  const enterCode = async (c, email, path) => c.post(path, { verifyStep: '1', code: codeOf(await newMail(email, 'kodunuz')) });
  const join = async (email, role) => {
    const { c } = await signup(email, role);
    await enterCode(c, email, '/register');
    return c;
  };
  const login = async (email, password = pw) => {
    const c = client(site.url);
    sink.mails.length = 0;
    const first = await c.post('/login', { email, password });
    if (first.status !== 200) return { c, res: first };
    return { c, res: await enterCode(c, email, '/login') };
  };
  const makeRequest = async (c, title) => {
    const form = new FormData();
    Object.entries({ title, description: 'Mutfak ve banyo dahil 3+1 daire temizliği.', category: 'Temizlik' }).forEach(([k, v]) => form.set(k, v));
    return c.form('/requests', form);
  };

  try {
    // Kayıt: e-postaya gelen kod girilmeden hesap açılmaz
    const { c: owner, res } = await signup('sahip@test.local');
    check('kayıt kod adımına geçer', res.status === 200 && res.text.includes('altı haneli bir kod'));
    check('adres gizlenir', res.text.includes('sa***p@test.local') && !res.text.includes('sahip@test.local'));
    check('kod girilmeden oturum açılmaz', (await owner.get('/dashboard')).status === 302);
    const codeMail = await newMail('sahip@test.local', 'kodunuz');
    check('kod e-postası gelir', Boolean(codeMail));
    check('HTML ve düz metin var', Boolean(codeMail) && /text\/html/.test(codeMail.raw) && /text\/plain/.test(codeMail.raw));
    const code = codeOf(codeMail);
    const wrongCode = code === '000000' ? '111111' : '000000';
    const wrong = await owner.post('/register', { verifyStep: '1', code: wrongCode });
    check('yanlış kod reddedilir', wrong.status === 422 && wrong.text.includes('Kod hatalı'));
    const stranger = await client(site.url).post('/register', { verifyStep: '1', code });
    check('kod başka tarayıcıdan girilemez', stranger.status === 302 && stranger.location === '/login');
    const forged = await client(site.url).post('/login', { verifyStep: '1', email: 'sahip@test.local', code });
    check('e-posta yazarak başka hesabın kodu denenemez', forged.status === 302 && forged.location === '/login');
    const joined = await owner.post('/register', { verifyStep: '1', code });
    check('doğru kodla hesap açılır', joined.status === 302 && joined.location === '/dashboard');
    check('doğrulama uyarısı yok', !(await owner.get('/dashboard')).text.includes('E-posta adresiniz doğrulanmadı'));
    check('kod ikinci kez kullanılamaz', (await client(site.url).post('/register', { verifyStep: '1', code })).location === '/login');
    const made = await makeRequest(owner, 'Doğrulanmış talep');
    check('kod sonrası talep verilir', made.location.startsWith('/requests/'));
    const requestId = made.location.split('/').pop();

    // Kod tahmin edilemez: beş yanlıştan sonra doğru kod da geçmez
    const { c: guesser } = await signup('tahmin@test.local');
    const realCode = codeOf(await newMail('tahmin@test.local', 'kodunuz'));
    const badCode = realCode === '999999' ? '888888' : '999999';
    let lastTry = null;
    for (let i = 0; i < 5; i += 1) lastTry = await guesser.post('/register', { verifyStep: '1', code: badCode });
    check('beş yanlıştan sonra kilitlenir', lastTry.text.includes('Çok fazla yanlış deneme'));
    check('kilitliyken doğru kod geçmez', (await guesser.post('/register', { verifyStep: '1', code: realCode })).status === 422);
    check('yeni kod için bir dakika beklenir', (await guesser.post('/verify-code/resend')).status === 429);

    // Giriş: şifreden sonra koda geçilir
    sink.mails.length = 0;
    const badPassword = await client(site.url).post('/login', { email: 'sahip@test.local', password: 'yanlis-sifre-1' });
    check('yanlış şifrede kod gönderilmez', badPassword.status === 401 && !(await newMail('sahip@test.local', 'kodunuz')));
    const signedIn = await login('sahip@test.local');
    check('girişte kod istenir ve kodla açılır', signedIn.res.status === 302 && signedIn.res.location === '/dashboard');

    // Doğrulama bağlantısını tekrar gönderme sınırlı (sınır kullanıcı başına; ayrı bir hesapla denenir)
    const busy = await join('sinir@test.local');
    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const again = await busy.post('/email/resend');
      if ((await busy.get(again.location)).text.includes('Çok fazla e-posta')) limited = true;
    }
    check('tekrar gönderim sınırlı', limited);

    // Teklif bildirimi e-postası
    const firm = await join('firma@test.local', 'company');
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
    const { c: device } = await login('sahip@test.local');
    await anon.post(resetPath, { password: 'yeni-sifre-12345' });
    check('sıfırlama diğer oturumları kapatır', (await device.get('/dashboard')).status === 302);
    check('değişiklik bildirimi gelir', Boolean(await newMail('sahip@test.local', 'diğer cihazlardaki')));
    check('sıfırlama bağlantısı tek kullanımlık', (await anon.get(resetPath)).status === 302);
    const { c: newLogin, res: newLoginRes } = await login('sahip@test.local', 'yeni-sifre-12345');
    check('yeni şifre geçer', newLoginRes.status === 302 && newLoginRes.location === '/dashboard');

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
    check('yeni adresle giriş', (await login('yeni@test.local', 'yeni-sifre-12345')).res.location === '/dashboard');
    check('eski adresle giriş olmaz', (await client(site.url).post('/login', { email: 'sahip@test.local', password: 'yeni-sifre-12345' })).status === 401);

    // İletişim formu e-postası SITE_EMAIL olmadan da panele düşer (burada e-posta gitmez, kayıt tutulur)
    const contact = await anon.post('/iletisim', { name: 'Z', email: 'z@z.co', subject: 'Öneri', message: 'kayıt' });
    check('iletişim SITE_EMAIL olmadan çalışır', contact.location === '/iletisim');

    // ADMIN_EMAIL: kodu girilmemiş hesap yönetici olmaz
    const { c: fake } = await signup('patron@test.local');
    const patronCode = codeOf(await newMail('patron@test.local', 'kodunuz'));
    await site.stop();
    const restarted = await startSite({
      uri: mongo.getUri('email_test'),
      port: 3103,
      env: { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), SITE_URL, DEMO_DATA: 'false', ADMIN_EMAIL: 'patron@test.local' }
    });
    site.stop = restarted.stop;
    check('doğrulanmamış adres yönetici olmaz', (await fake.get('/admin')).status !== 200);
    await fake.post('/register', { verifyStep: '1', code: patronCode });
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
