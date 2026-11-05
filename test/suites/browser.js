// Gerçek tarayıcıyla uçtan uca akış. Tarayıcının kendi eklediği başlıklar (Origin, Sec-Fetch-Site),
// CSP ve sayfa betikleri ancak burada sınanır. Chrome veya Edge yoksa takım atlanır.
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { startMongo, startSite, reporter } = require('../helpers/harness');

const { check, finish } = reporter();
const PORT = 3106;
const CDP_PORT = 9355;
const BASE = `http://localhost:${PORT}`;
const stamp = Date.now();
const pw = 'tarayici-test-1234';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  return candidates.find(item => item && fs.existsSync(item));
}

async function openBrowser(executable) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'teklifver-browser-'));
  const proc = spawn(executable, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'
  ], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 80 && !target; i += 1) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find(item => item.type === 'page');
    } catch { /* açılıyor */ }
  }
  if (!target) throw new Error('Tarayıcı açılmadı');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => { socket.onopen = resolve; });
  let seq = 0;
  const pending = new Map();
  const waiters = [];
  const problems = [];

  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result || {});
      pending.delete(message.id);
      return;
    }
    if (message.method === 'Page.loadEventFired') waiters.splice(0).forEach(resolve => resolve());
    if (message.method === 'Runtime.exceptionThrown') problems.push(message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      problems.push(`${message.params.entry.text} ${message.params.entry.url || ''}`);
    }
  };

  const send = (method, params = {}) => new Promise(resolve => {
    seq += 1;
    pending.set(seq, resolve);
    socket.send(JSON.stringify({ id: seq, method, params }));
  });
  const nextLoad = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sayfa yüklenmedi')), 20000);
    waiters.push(() => { clearTimeout(timer); resolve(); });
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('DOM.enable');

  const evaluate = async expression => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(`${exceptionDetails.exception ? exceptionDetails.exception.description : exceptionDetails.text} :: ${expression.slice(0, 120)}`);
    return result.value;
  };
  const q = selector => JSON.stringify(selector);

  const page = {
    problems,
    send,
    evaluate,
    goto: async url => {
      const loaded = nextLoad();
      await send('Page.navigate', { url: url.startsWith('http') ? url : BASE + url });
      await loaded;
    },
    url: () => evaluate('location.pathname + location.search'),
    text: () => evaluate('document.body.innerText'),
    title: () => evaluate('document.title'),
    has: selector => evaluate(`Boolean(document.querySelector(${q(selector)}))`),
    fill: (selector, value) => evaluate(`(() => {
      const el = document.querySelector(${q(selector)});
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`),
    click: selector => evaluate(`document.querySelector(${q(selector)}).click()`),
    clickAndWait: async selector => {
      const loaded = nextLoad();
      await evaluate(`document.querySelector(${q(selector)}).click()`);
      await loaded;
    },
    upload: async (selector, file) => {
      const { root } = await send('DOM.getDocument');
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      await send('DOM.setFileInputFiles', { nodeId, files: [file] });
      await evaluate(`document.querySelector(${q(selector)}).dispatchEvent(new Event('change', { bubbles: true }))`);
    },
    clearCookies: () => send('Network.clearBrowserCookies'),
    close: async () => {
      socket.close();
      proc.kill();
      await sleep(500);
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    }
  };
  await send('Network.enable');
  return page;
}

async function register(page, { role, name, email, company }) {
  await page.goto('/register');
  if (role === 'company') {
    await page.click('input[name="role"][value="company"]');
    await page.fill('#companyName', company);
  }
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', pw);
  await page.click('input[name="terms"]');
  await page.clickAndWait('form[action="/register"] button[type="submit"]');
}

const logout = async page => page.clickAndWait('form[action="/logout"] button');

(async () => {
  const executable = findBrowser();
  if (!executable) {
    console.log('Chrome veya Edge bulunamadı, atlandı.');
    return;
  }

  const mongo = await startMongo();
  const site = await startSite({ uri: mongo.getUri('browser_test'), port: PORT, env: { RATE_LIMIT_PER_MINUTE: '100000' } });
  const page = await openBrowser(executable);

  // Başka siteden gönderilen gerçek form
  const attacker = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.setHeader('referrer-policy', 'no-referrer');
    res.end(`<form id="f" action="${BASE}/profile/sessions" method="POST"></form><script>document.getElementById('f').submit()</script>`);
  });
  await new Promise(resolve => attacker.listen(3107, resolve));

  const photo = path.join(os.tmpdir(), `teklifver-foto-${stamp}.png`);
  fs.writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

  try {
    // Çerez onayı
    await page.goto('/');
    check('çerez penceresi açılır', await page.evaluate(`!document.getElementById('cookieBanner').hidden`));
    await page.click('[data-cookie="all"]');
    await page.goto('/');
    check('çerez seçimi hatırlanır', await page.evaluate(`document.getElementById('cookieBanner').hidden`));

    // Tema
    const background = () => page.evaluate('getComputedStyle(document.body).backgroundColor');
    const themeOf = () => page.evaluate('document.documentElement.dataset.theme');
    check('ilk tema ayarlanır', ['light', 'dark'].includes(await themeOf()));
    await page.evaluate(`localStorage.setItem('theme', 'light')`);
    await page.goto('/');
    const lightBackground = await background();
    check('beyaz tema arka planı açık', lightBackground === 'rgb(242, 243, 245)', lightBackground);
    check('düğme siyah temayı önerir', (await page.text()).includes('Siyah Tema'));
    await page.click('[data-theme-toggle]');
    await sleep(100);
    check('düğmeyle siyah tema açılır', (await themeOf()) === 'dark' && (await background()) === 'rgb(0, 0, 0)');
    check('düğme beyaz temayı önerir', (await page.text()).includes('Beyaz Tema'));
    check('tarayıcı çubuğu rengi değişir', (await page.evaluate(`document.querySelector('meta[name="theme-color"]').content`)) === '#0b0b0b');
    await page.goto('/requests');
    check('siyah tema sayfalar arasında kalır', (await themeOf()) === 'dark' && (await background()) === 'rgb(0, 0, 0)');
    check('kutular koyu', (await page.evaluate(`getComputedStyle(document.querySelector('.box')).backgroundColor`)) === 'rgb(17, 17, 17)');
    await page.send('Emulation.setEmulatedMedia', { media: 'print' });
    check('yazdırırken beyaz kalır', (await page.evaluate(`getComputedStyle(document.querySelector('.box')).backgroundColor`)) === 'rgb(255, 255, 255)');
    await page.send('Emulation.setEmulatedMedia', { media: '' });
    await page.click('[data-theme-toggle]');
    await page.goto('/');
    check('beyaz temaya dönülür', (await themeOf()) === 'light' && (await background()) === lightBackground);
    await page.evaluate(`localStorage.removeItem('theme')`);
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await page.goto('/');
    check('seçim yoksa cihaz ayarı izlenir', (await themeOf()) === 'dark');
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await sleep(100);
    check('cihaz ayarı değişince tema değişir', (await themeOf()) === 'light');
    await page.send('Emulation.setEmulatedMedia', { features: [] });

    // Arama önerisi
    await page.fill('#siteSearch', 'temiz');
    await sleep(800);
    check('arama önerisi gelir', await page.evaluate(`!document.getElementById('searchSuggest').hidden`));

    // Örnek hesapla tek tıkla giriş
    await page.goto('/login');
    await page.clickAndWait('[data-demo-email="yonetici@teklifver.test"]');
    check('örnek hesap düğmesiyle giriş', (await page.url()) === '/dashboard', await page.title());
    await page.goto('/admin');
    check('yönetim paneli açılır', (await page.text()).includes('Sunucu Kontrolü'));
    check('tarayıcıda IP görünür', (await page.text()).includes('Sitenin gördüğü IP'));
    await page.goto('/admin/ads');
    await page.fill('#adTitle', `Tarayıcı reklamı ${stamp}`);
    await page.fill('#adUrl', '/yardim');
    await page.clickAndWait('form[action="/admin/ads"] button[type="submit"]');
    check('reklam formu çalışır', (await page.text()).includes(`Tarayıcı reklamı ${stamp}`));
    await logout(page);
    check('çıkış çalışır', (await page.url()) === '/');

    // Müşteri kaydı ve talep
    await register(page, { role: 'customer', name: 'Tarayıcı Müşteri', email: `tm${stamp}@test.local` });
    check('kayıt formu çalışır', (await page.url()) === '/dashboard', `${await page.url()} ${await page.title()}`);

    await page.goto('/requests/new');
    await page.fill('#category', 'Temizlik');
    check('kategori soruları görünür', await page.evaluate(`!document.getElementById('categoryTip').hidden`));
    await page.click('#categoryTipAdd');
    check('sorular açıklamaya eklenir', (await page.evaluate(`document.getElementById('description').value`)).includes('Temizlenecek yer'));
    await page.fill('#title', `Tarayıcı talebi ${stamp}`);
    await sleep(600);
    await page.goto('/requests/new');
    check('taslak geri gelir', (await page.evaluate(`document.getElementById('title').value`)) === `Tarayıcı talebi ${stamp}`);
    await page.upload('#images', photo);
    await page.clickAndWait('form[data-draft] button[type="submit"]');
    const requestUrl = await page.url();
    check('talep formu çalışır', /^\/requests\/[a-f0-9]{24}$/.test(requestUrl), requestUrl);
    await sleep(500);
    check('yüklenen görsel görünür', await page.evaluate(`document.querySelector('.gallery-main img').naturalWidth > 0`));
    await page.goto('/requests/new');
    check('gönderilen taslak silinir', (await page.evaluate(`document.getElementById('title').value`)) === '');
    await logout(page);

    // Firma: teklif, favori, mesaj
    await register(page, { role: 'company', name: 'Tarayıcı Firma', email: `tf${stamp}@test.local`, company: `Tarayıcı AŞ ${stamp}` });
    check('firma kaydı çalışır', (await page.url()) === '/dashboard');
    await page.goto(requestUrl);
    await page.fill('#amount', '4321');
    await page.fill('#deliveryTime', '6');
    await page.fill('#bidDescription', 'Tarayıcıdan teklif');
    await page.clickAndWait('form[action="/bids"] button[type="submit"]');
    check('teklif formu çalışır', (await page.text()).includes('Teklifiniz gönderildi'));

    await page.click('form.fav-form button');
    await sleep(600);
    check('favori sayfa yenilenmeden eklenir', await page.evaluate(`document.querySelector('form.fav-form button').classList.contains('is-active')`));

    await page.clickAndWait('a[href^="/messages/"]');
    await page.fill('#messageContent', 'Tarayıcıdan mesaj');
    await page.clickAndWait('form.thread-form button[type="submit"]');
    check('mesaj formu çalışır', (await page.text()).includes('Tarayıcıdan mesaj'));

    await page.goto('/profile');
    await page.fill('#phone', '0555 111 22 33');
    await page.clickAndWait('form[action="/profile"] button[type="submit"]');
    check('profil formu çalışır', (await page.text()).includes('Bilgileriniz güncellendi'));
    await page.upload('form[action="/profile/portfolio"] input[type="file"]', photo);
    await page.clickAndWait('form[action="/profile/portfolio"] button[type="submit"]');
    check('iş örneği yüklenir', (await page.text()).includes('İş örnekleri eklendi'));

    // Başka siteden gelen form tarayıcıda da reddedilir
    await page.goto('http://localhost:3107/');
    await sleep(800);
    check('başka siteden form reddedilir', (await page.title()).includes('İstek reddedildi'), await page.title());
    await page.goto('/dashboard');
    await logout(page);

    // Müşteri: şifreyle giriş, onay penceresiyle kabul ve iptal
    await page.goto('/login');
    await page.fill('#email', `tm${stamp}@test.local`);
    await page.fill('#password', pw);
    await page.clickAndWait('#loginForm button[type="submit"]');
    check('giriş formu çalışır', (await page.url()) === '/dashboard', `${await page.url()} ${await page.title()}`);
    check('okunmamış sayılar görünür', await page.evaluate(`!document.querySelector('.topbar [data-count="messages"]').hidden`));

    await page.goto(requestUrl);
    check('sahip teklifi görür', (await page.text()).includes('Tarayıcıdan teklif'));
    await page.click('form[action$="/accept"] button');
    await sleep(200);
    check('onay penceresi açılır', await page.evaluate(`document.getElementById('confirmDialog').open`));
    await page.clickAndWait('#confirmAccept');
    check('kabul çalışır', (await page.text()).includes('İletişim Bilgileri'));
    await page.click('form[action$="/cancel"] button');
    await sleep(200);
    await page.clickAndWait('#confirmAccept');
    check('anlaşma iptali çalışır', (await page.text()).includes('yeniden yayında'));

    // Galeri ve mobil görünüm
    await send375(page);
    await page.goto('/');
    check('mobil alt menü görünür', await page.evaluate(`getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none'`));
    check('mobilde yatay taşma yok', await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    await page.goto('/profile');
    check('mobil profilde taşma yok', await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));

    // Örnek veri ve iletişim formu
    await page.goto('/iletisim');
    await page.fill('#contactMessage', 'Tarayıcıdan iletişim');
    await page.fill('#contactSubject', 'Öneri');
    await page.clickAndWait('form[action="/iletisim"] button[type="submit"]');
    check('iletişim formu çalışır', (await page.text()).includes('Mesajınız alındı'));

    const unexpected = page.problems.filter(item => !item.includes('status of 403'));
    check('konsol hatası ve CSP ihlali yok', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
    check('sunucu hatası yok', !/TypeError|ReferenceError/.test(site.logs), site.logs.slice(-300));
  } finally {
    attacker.close();
    fs.rmSync(photo, { force: true });
    await page.close();
    await site.stop();
    await mongo.stop();
  }
  finish();
  process.exit(process.exitCode || 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});

function send375(page) {
  return page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
}
