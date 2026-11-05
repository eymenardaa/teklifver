// Bu turda eklenen özelliklerin tamamını uçtan uca doğrular.
const fs = require('fs');
const { MongoClient, ObjectId } = require('mongodb');

// Geçmiş son tarih formdan girilemediği için süresi dolmuş talep doğrudan veritabanında hazırlanır.
async function setDeadline(id, date) {
  const mongo = await MongoClient.connect(process.env.MONGO_URI);
  await mongo.db().collection('requests').updateOne({ _id: new ObjectId(id) }, { $set: { deadline: date } });
  await mongo.close();
}
const BASE = process.env.BASE || 'http://localhost:3000';
const LOG = process.env.APP_LOG;
const stamp = Date.now();
const pw = 'test-' + stamp;
let failures = 0;
let passed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (ok) passed += 1; else failures += 1;
};

const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
const body = data => new URLSearchParams(data).toString();
const signup = async fields => {
  const res = await fetch(BASE + '/register', { method: 'POST', redirect: 'manual', headers: formHeaders, body: body({ ...fields, password: pw, terms: 'on' }) });
  if (res.status !== 302) throw new Error('kayıt ' + fields.email + ' ' + res.status);
  return res.headers.get('set-cookie').split(';')[0];
};
const login = async (email, password = 'demo1234') => {
  const res = await fetch(BASE + '/login', { method: 'POST', redirect: 'manual', headers: formHeaders, body: body({ email, password }) });
  return { status: res.status, cookie: (res.headers.get('set-cookie') || '').split(';')[0], text: res.status === 302 ? '' : await res.text() };
};
const get = async (cookie, path) => {
  const res = await fetch(BASE + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  return { status: res.status, location: res.headers.get('location'), headers: res.headers, text: await res.text() };
};
const post = (cookie, path, data = {}) => fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { ...formHeaders, cookie }, body: body(data) });
const newRequest = async (cookie, fields) => {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(BASE + '/requests', { method: 'POST', redirect: 'manual', headers: { cookie }, body: form });
  return res.headers.get('location');
};
const notifCount = html => Number((html.match(/Bildirimler <span class="unread-count"[^>]*>(\d+)/) || [])[1] || 0);

(async () => {
  const owner = await signup({ role: 'customer', name: 'Sahip Test', email: `sahip${stamp}@test.local` });
  const prefilled = (await get(owner, '/requests/new?title=' + encodeURIComponent('Balkon boyanacak') + '&city=' + encodeURIComponent('Ankara'))).text;
  check('ana sayfadan gelen başlık ve il forma yazılır', prefilled.includes('value="Balkon boyanacak"') && prefilled.includes('value="Ankara" selected'));
  const firm = await signup({ role: 'company', name: 'Firma', companyName: `Test Firma ${stamp}`, email: `firma${stamp}@test.local` });
  const firm2 = await signup({ role: 'company', name: 'Firma2', companyName: `Ikinci Firma ${stamp}`, email: `firma2${stamp}@test.local` });
  const firmId = ((await get(firm, '/dashboard')).text.match(/href="\/companies\/([a-f0-9]{24})"/) || [])[1];

  // 1-3 Firma kategorisi, uygun talep bildirimi, Size Uygun Talepler
  check('kategori seçmeden uygun talep sayfası yönlendirir', (await get(firm, '/dashboard/matches')).text.includes('Henüz kategori seçmediniz'));
  await post(firm, '/profile', { name: 'Firma', companyName: `Test Firma ${stamp}`, specialties: 'Boya, Parke, Alçıpan', categories: 'Temizlik' });
  const profileHtml = (await get(firm, '/profile')).text;
  check('hizmet ve kategori kaydedilir', profileHtml.includes('value="Boya, Parke, Alçıpan"') && /value="Temizlik" checked/.test(profileHtml));
  const notifBefore = notifCount((await get(firm, '/')).text);
  const requestPath = await newRequest(owner, { title: `Ozellik testi ${stamp}`, description: 'Aciklama', category: 'Temizlik', budgetMax: '5000', city: 'Ankara' });
  const requestId = requestPath.split('/').pop();
  check('yeni talep firmaya bildirim düşürür', notifCount((await get(firm, '/')).text) === notifBefore + 1);
  check('ikinci firmaya (kategorisiz) düşmez', notifCount((await get(firm2, '/')).text) === 0);
  check('talep "Size Uygun Talepler"de görünür', (await get(firm, '/dashboard/matches')).text.includes(requestPath));

  // 4 Bildirim merkezi
  let notifs = (await get(firm, '/notifications')).text;
  check('bildirim merkezinde metin var', notifs.includes(`Ozellik testi ${stamp}`) && notifs.includes('is-unread'));
  const openLink = (notifs.match(/\/notifications\/[a-f0-9]{24}\/open/) || [])[0];
  const opened = await get(firm, openLink);
  check('bildirim açılınca ilgili sayfaya gider', opened.status === 302 && opened.location === requestPath);
  check('başkasının bildirimi okunmaz', (await get(firm2, openLink)).location === '/notifications');

  // 5-8 Teklif, bildirim, düzenleme, geri çekme
  await post(firm, '/bids', { requestId, amount: '4000', deliveryTime: '5', description: 'Ilk teklif' });
  check('yeni teklif sahibine bildirim düşürür', notifCount((await get(owner, '/')).text) === 1);
  check('teklif verince talep uygun listeden çıkar', !(await get(firm, '/dashboard/matches')).text.includes(requestPath));
  let firmView = (await get(firm, requestPath)).text;
  const bidId = (firmView.match(/\/bids\/([a-f0-9]{24})\/edit/) || [])[1];
  check('firma düzenleme formu görür', Boolean(bidId) && firmView.includes('Teklifimi Düzenle'));
  let res = await post(firm, `/bids/${bidId}/edit`, { amount: '3500', deliveryTime: '4', description: 'Guncel teklif' });
  firmView = (await get(firm, requestPath)).text;
  check('teklif düzenlenir', firmView.includes('3.500 TL') && firmView.includes('Guncel teklif'));
  res = await post(firm2, `/bids/${bidId}/edit`, { amount: '1', deliveryTime: '1', description: 'hack' });
  check('başka firma teklifi düzenleyemez', !(await get(firm, requestPath)).text.includes('hack'));
  res = await post(firm2, `/bids/${bidId}/withdraw`);
  check('başka firma geri çekemez', (await get(firm, requestPath)).text.includes('3.500 TL'));
  res = await post(firm, `/bids/${bidId}/edit`, { amount: '-1', deliveryTime: '4', description: 'x' });
  check('geçersiz düzenleme reddedilir', (await get(firm, res.headers.get('location'))).text.includes('doğru girin'));

  await post(firm2, '/bids', { requestId, amount: '6000', deliveryTime: '2', description: 'Ikinci teklif' });
  // 9 Teklif sıralama
  const orderOf = html => [...html.matchAll(/class="bid-company"[^>]*>([^<]+)</g)].map(m => m[1]);
  const byAmount = orderOf((await get(owner, requestPath + '?bidSort=amount')).text);
  const byDays = orderOf((await get(owner, requestPath + '?bidSort=days')).text);
  check('teklifler fiyat ve süreye göre sıralanır', byAmount[0].startsWith('Test Firma') && byDays[0].startsWith('Ikinci Firma'), `${byAmount[0]} / ${byDays[0]}`);

  await post(firm2, `/bids/${(await get(firm2, requestPath)).text.match(/\/bids\/([a-f0-9]{24})\/withdraw/)[1]}/withdraw`);
  const afterWithdraw = (await get(owner, requestPath)).text;
  check('teklif geri çekilir, sayı düşer', !afterWithdraw.includes('Ikinci Firma') && afterWithdraw.includes('Gelen Teklifler (1)'));

  // 10 Kategori ortalaması (örnek verili kategori)
  const list = (await get(null, '/requests?category=' + encodeURIComponent('İnşaat & Tadilat'))).text;
  const buildPath = list.match(/class="listing-title" href="(\/requests\/[a-f0-9]{24})"/)[1];
  check('kategori ortalama teklifi görünür', (await get(null, buildPath)).text.includes('Kategori Ort. Teklif'));

  // 11 Şikayet
  await post(owner, `/requests/${requestId}/report`, { reason: 'Reklam veya spam' });
  check('kendi talebini şikayet edemez', (await get(owner, requestPath)).text.includes('Kendi talebinizi'));
  res = await post(firm2, `/requests/${requestId}/report`, { reason: 'uydurma' });
  check('geçersiz neden reddedilir', (await get(firm2, res.headers.get('location'))).text.includes('Bir şikayet nedeni seçin'));
  await post(firm2, `/requests/${requestId}/report`, { reason: 'Reklam veya spam', note: '<b>not</b>' });
  check('şikayet alındı', (await get(firm2, requestPath)).text.includes('şikayet ettiniz'));
  res = await post(firm2, `/requests/${requestId}/report`, { reason: 'Diğer' });
  check('aynı talep iki kez şikayet edilemez', (await get(firm2, res.headers.get('location'))).text.includes('daha önce'));

  // 12-14 Yönetim paneli
  check('misafir yönetime giremez', (await get(null, '/admin')).status === 302);
  check('normal kullanıcı yönetime giremez', (await get(firm, '/admin')).status === 403);
  const admin = (await login('yonetici@teklifver.test')).cookie;
  const adminHome = (await get(admin, '/admin')).text;
  check('yönetici şikayeti görür ve HTML çalışmaz', adminHome.includes(`Ozellik testi ${stamp}`) && adminHome.includes('&lt;b&gt;not') && !adminHome.includes('<b>not</b>'));
  check('yönetim istatistikleri', adminHome.includes('Açık şikayet') && adminHome.includes('Toplam talep'));
  check('yönetici kullanıcı arar', (await get(admin, `/admin/users?search=firma${stamp}`)).text.includes(`firma${stamp}@test.local`));
  check('yönetici talep arar', (await get(admin, `/admin/requests?search=Ozellik testi ${stamp}`)).text.includes(requestPath));
  res = await post(firm, `/admin/users/${firmId}/verify`);
  check('normal kullanıcı rozet veremez', res.status === 403);

  await post(admin, `/admin/users/${firmId}/verify`);
  check('onaylı firma rozeti görünür', (await get(null, `/companies/${firmId}`)).text.includes('class="verified"'));
  check('firma onay filtresi', (await get(null, '/companies?verified=on')).text.includes(`Test Firma ${stamp}`) && !(await get(null, '/companies?verified=on')).text.includes(`Ikinci Firma ${stamp}`));

  // Askıya alma
  const firm2Id = ((await get(firm2, '/dashboard')).text.match(/href="\/companies\/([a-f0-9]{24})"/) || [])[1];
  await post(admin, `/admin/users/${firm2Id}/suspend`);
  check('askıya alınan oturum kapanır', (await get(firm2, '/dashboard')).status === 302);
  const blocked = await login(`firma2${stamp}@test.local`, pw);
  check('askıya alınan giriş yapamaz', blocked.status === 401 && blocked.text.includes('askıya'));
  check('askıdaki firma rehberde görünmez', !(await get(null, '/companies')).text.includes(`Ikinci Firma ${stamp}`));
  await post(admin, `/admin/users/${firm2Id}/suspend`);
  check('askı kaldırılır', (await login(`firma2${stamp}@test.local`, pw)).status === 302);

  // Talep kaldırma
  await post(admin, `/admin/requests/${requestId}/remove`);
  check('kaldırılan talep listede yok', !(await get(null, `/requests?search=Ozellik testi ${stamp}`)).text.includes(requestPath));
  check('kaldırılan talebe misafir giremez', (await get(null, requestPath)).status === 404);
  check('sahibi kaldırılan talebi görür', (await get(owner, requestPath)).text.includes('yayından kaldırıldı'));
  await post(admin, `/admin/requests/${requestId}/restore`);
  check('talep geri alınır', (await get(null, requestPath)).status === 200);

  // 15 Talebi kapatma, 16 yeniden yayınlama
  res = await post(firm, `/requests/${requestId}/close`);
  check('firma talebi kapatamaz', (await get(null, requestPath)).status === 200 && !(await get(null, requestPath)).text.includes('sahibi tarafından kapatıldı'));
  await post(owner, `/requests/${requestId}/close`);
  const closed = (await get(owner, requestPath)).text;
  check('talep kapanır, bekleyen teklif reddedilir', closed.includes('sahibi tarafından kapatıldı') && closed.includes('Reddedildi'));
  check('kapanan talep listede yok', !(await get(null, `/requests?search=Ozellik testi ${stamp}`)).text.includes(requestPath));
  res = await post(firm, '/bids', { requestId, amount: '100', deliveryTime: '1', description: 'gec' });
  check('kapalı talebe teklif verilemez', (await get(firm, res.headers.get('location'))).text.includes('teklif almıyor'));
  res = await post(owner, `/requests/${requestId}/republish`);
  const copyEdit = res.headers.get('location');
  check('yeniden yayınlama düzenlemeye götürür', /\/requests\/[a-f0-9]{24}\/edit$/.test(copyEdit) && !copyEdit.includes(requestId));
  check('kopya listede görünür', (await get(null, `/requests?search=Ozellik testi ${stamp}`)).text.includes(copyEdit.replace('/edit', '')));
  res = await post(owner, `${copyEdit.replace('/edit', '')}/republish`);
  check('açık talep yeniden yayınlanamaz', (await get(owner, res.headers.get('location'))).text.includes('Yalnızca kapanmış'));

  // 17 Süresi dolan talep
  const expiredPath = await newRequest(owner, { title: `Suresi dolmus ${stamp}`, description: 'x', category: 'Diğer' });
  await setDeadline(expiredPath.split('/').pop(), new Date('2020-01-01'));
  check('süresi dolan talep listede yok', !(await get(null, `/requests?search=Suresi dolmus ${stamp}`)).text.includes(expiredPath));
  check('süresi dolan talepte uyarı', (await get(null, expiredPath)).text.includes('son tarihi geçti'));
  res = await post(firm, '/bids', { requestId: expiredPath.split('/').pop(), amount: '100', deliveryTime: '1', description: 'gec' });
  check('süresi dolan talebe teklif verilemez', (await get(firm, res.headers.get('location'))).text.includes('teklif almıyor'));

  // 18 Yorumlu değerlendirme
  const reviewPath = await newRequest(owner, { title: `Yorum testi ${stamp}`, description: 'x', category: 'Temizlik' });
  const reviewId = reviewPath.split('/').pop();
  await post(firm, '/bids', { requestId: reviewId, amount: '1000', deliveryTime: '3', description: 'teklif' });
  const acceptId = (await get(owner, reviewPath)).text.match(/\/bids\/([a-f0-9]{24})\/accept/)[1];
  await post(owner, `/bids/${acceptId}/accept`);
  check('kabul firmaya bildirim düşürür', (await get(firm, '/notifications')).text.includes('teklifiniz kabul edildi'));
  await post(owner, `/bids/complete/${reviewId}`, { rating: '4', comment: 'Harika <script>x</script> is' });
  const companyPage = (await get(null, `/companies/${firmId}`)).text;
  check('yorum firma sayfasında görünür ve HTML çalışmaz', companyPage.includes('Harika &lt;script&gt;') && !companyPage.includes('<script>x'));
  check('firma istatistikleri', companyPage.includes('Tamamlanan iş') && companyPage.includes('Ort. teslim süresi'));
  check('firma sayfasında puan işlendi', companyPage.includes('(1 değerlendirme)'));
  await post(owner, `/bids/complete/${reviewId}`, { rating: '1', comment: 'ikinci' });
  check('ikinci yorum yazılamaz', !(await get(null, `/companies/${firmId}`)).text.includes('ikinci'));
  check('tamamlanan talep yeniden yayınlanabilir', (await get(owner, reviewPath)).text.includes('/republish'));

  // 19 Firma logosu
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const logoForm = () => { const f = new FormData(); f.append('logo', new Blob([png], { type: 'image/png' }), 'logo.png'); return f; };
  await fetch(BASE + '/profile/logo', { method: 'POST', redirect: 'manual', headers: { cookie: firm }, body: logoForm() });
  const logoHtml = (await get(null, `/companies/${firmId}`)).text;
  const logoPath = (logoHtml.match(/\/uploads\/[\w.-]+/) || [])[0];
  check('logo yüklenir ve görünür', Boolean(logoPath) && (await get(null, logoPath)).status === 200);
  const badLogo = new FormData(); badLogo.append('logo', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
  res = await fetch(BASE + '/profile/logo', { method: 'POST', redirect: 'manual', headers: { cookie: firm }, body: badLogo });
  check('resim olmayan logo reddedilir', (await get(firm, res.headers.get('location'))).text.includes('Yalnızca JPG'));
  res = await fetch(BASE + '/profile/logo', { method: 'POST', redirect: 'manual', headers: { cookie: owner }, body: logoForm() });
  check('müşteri logo yükleyemez', (await get(owner, res.headers.get('location'))).text.includes('yalnızca firma'));
  await post(firm, '/profile/logo/delete');
  await new Promise(r => setTimeout(r, 200));
  check('logo kaldırılınca dosya silinir', (await get(null, logoPath)).status === 404);

  // 20 Firma rehberi filtreleri
  const ratingFiltered = (await get(null, '/companies?minRating=4.5')).text;
  const ratings = [...ratingFiltered.matchAll(/<strong>([\d,]+)<\/strong> \(\d+\)/g)].map(m => Number(m[1].replace(',', '.')));
  check('puan filtresi', ratings.length > 0 && ratings.every(r => r >= 4.5), ratings.join(','));
  check('kategori filtresi', (await get(null, '/companies?category=' + encodeURIComponent('Nakliye & Lojistik'))).text.includes('Çelik Evden Eve') && !(await get(null, '/companies?category=' + encodeURIComponent('Nakliye & Lojistik'))).text.replace(/<a class="ad [\s\S]*?<\/a>/g, '').includes('Kodhane'));
  const byReviews = [...(await get(null, '/companies?sort=reviews')).text.matchAll(/<strong>[\d,]+<\/strong> \((\d+)\)/g)].map(m => Number(m[1]));
  check('değerlendirme sayısına göre sıralama', byReviews.every((n, i) => i === 0 || byReviews[i - 1] >= n));

  // 21 Kayıtlı arama
  await post(owner, '/dashboard/searches', { query: 'category=' + encodeURIComponent('Temizlik') + '&city=' + encodeURIComponent('Ankara') });
  let searches = (await get(owner, '/dashboard/searches')).text;
  check('arama kaydedilir', searches.includes('Temizlik, Ankara'));
  res = await post(owner, '/dashboard/searches', { query: 'category=' + encodeURIComponent('Temizlik') + '&city=' + encodeURIComponent('Ankara') });
  check('aynı arama iki kez kaydedilmez', (await get(owner, res.headers.get('location'))).text.includes('zaten kaydettiniz'));
  res = await post(owner, '/dashboard/searches', { query: '' });
  check('boş arama kaydedilmez', (await get(owner, res.headers.get('location'))).text.includes('önce bir filtre'));
  await newRequest(firm === owner ? owner : owner, { title: `Yeni kayitli ${stamp}`, description: 'x', category: 'Temizlik', city: 'Ankara' });
  searches = (await get(owner, '/dashboard/searches')).text;
  check('kayıtlı aramada yeni sayısı görünür', /class="unread-count">1</.test(searches));
  const openSearch = searches.match(/\/dashboard\/searches\/[a-f0-9]{24}\/open/)[0];
  res = await get(owner, openSearch);
  check('kayıtlı arama filtreyle açılır', res.status === 302 && res.location.includes('category=') && res.location.includes('city='));
  check('açınca yeni sayacı sıfırlanır', !/class="unread-count">1<\/span><\/td>/.test((await get(owner, '/dashboard/searches')).text));
  check('başkası kayıtlı aramayı açamaz', (await get(firm, openSearch)).location === '/dashboard/searches');
  const delPath = openSearch.replace('/open', '/delete');
  await post(firm, delPath);
  check('başkası silemez', (await get(owner, '/dashboard/searches')).text.includes('Temizlik, Ankara'));
  await post(owner, delPath);
  check('kendisi silebilir', !(await get(owner, '/dashboard/searches')).text.includes('Temizlik, Ankara'));

  // 22 Arama önerileri
  const suggest = async q => (await (await fetch(`${BASE}/requests/suggest?q=${encodeURIComponent(q)}`)).json()).items;
  check('öneri: kısa metin boş döner', (await suggest('a')).length === 0);
  const mutfak = await suggest('mutfak');
  check('öneri: başlıklardan gelir', mutfak.length > 0 && mutfak.every(i => i.url.startsWith('/requests')));
  check('öneri: kategori de gelir', (await suggest('nakliye')).some(i => i.hint === 'Kategori'));
  check('öneri: özel karakter hata vermez', Array.isArray(await suggest('([*')));

  // 23 Paylaşım ve yazdırma
  const detail = (await get(null, buildPath)).text;
  check('paylaşım bağlantıları', detail.includes('wa.me') && detail.includes('twitter.com/intent') && detail.includes('mailto:') && detail.includes('data-print'));

  // 24 SEO
  check('talep sayfası meta açıklama ve OG', /<meta name="description" content="[^"]+/.test(detail) && detail.includes('property="og:title"') && detail.includes('property="og:image"'));
  const robots = await get(null, '/robots.txt');
  check('robots.txt', robots.status === 200 && robots.text.includes('Disallow: /admin') && robots.text.includes('Sitemap:'));
  const sitemap = await get(null, '/sitemap.xml');
  check('sitemap.xml', sitemap.status === 200 && sitemap.text.includes('<urlset') && sitemap.text.includes(buildPath) && !sitemap.text.includes(expiredPath));

  // 25 Güvenlik ve performans
  const headers = (await get(null, '/')).headers;
  check('güvenlik başlıkları', (headers.get('content-security-policy') || '').includes("script-src 'self'") && headers.get('x-content-type-options') === 'nosniff' && !headers.get('x-powered-by'));
  const gz = await fetch(BASE + '/css/style.css', { headers: { 'accept-encoding': 'gzip' } });
  check('gzip sıkıştırma', gz.headers.get('content-encoding') === 'gzip');

  // 26 Şifremi unuttum
  check('giriş sayfasında bağlantı', (await get(null, '/login')).text.includes('/forgot'));
  const email = `sahip${stamp}@test.local`;
  const noEnum = await fetch(BASE + '/forgot', { method: 'POST', redirect: 'manual', headers: formHeaders, body: body({ email: 'yok@test.local' }) });
  check('olmayan e-posta da aynı sonucu verir', noEnum.status === 302);
  await fetch(BASE + '/forgot', { method: 'POST', redirect: 'manual', headers: formHeaders, body: body({ email }) });
  if (LOG) {
    await new Promise(r => setTimeout(r, 400));
    const log = fs.readFileSync(LOG, 'utf8').replace(/\0/g, '');
    const links = [...log.matchAll(/\/reset\/([a-f0-9]{64})/g)];
    const token = links.length ? links[links.length - 1][1] : null;
    check('sıfırlama bağlantısı üretildi', Boolean(token));
    check('olmayan e-postaya bağlantı üretilmez', links.length === 1, `${links.length} bağlantı`);
    check('yanlış belirteç reddedilir', (await get(null, '/reset/' + 'a'.repeat(64))).location === '/forgot');
    check('sıfırlama formu açılır', (await get(null, '/reset/' + token)).status === 200);
    res = await fetch(`${BASE}/reset/${token}`, { method: 'POST', redirect: 'manual', headers: formHeaders, body: body({ password: 'kisa' }) });
    check('kısa şifre reddedilir', res.status === 422);
    res = await fetch(`${BASE}/reset/${token}`, { method: 'POST', redirect: 'manual', headers: formHeaders, body: body({ password: 'yeni-sifre-99' }) });
    check('şifre sıfırlanır', res.status === 302 && res.headers.get('location') === '/login');
    check('eski şifre geçmez', (await login(email, pw)).status === 401);
    check('yeni şifre geçer', (await login(email, 'yeni-sifre-99')).status === 302);
    check('bağlantı ikinci kez kullanılamaz', (await get(null, '/reset/' + token)).location === '/forgot');
  } else {
    console.log('  not: APP_LOG yok, sıfırlama akışı atlandı');
  }

  // 27 Verilerimi indir
  const exported = await fetch(BASE + '/profile/export', { headers: { cookie: firm } });
  const data = await exported.json();
  check('veri indirme', (exported.headers.get('content-disposition') || '').includes('attachment') && data.profile.companyName.startsWith('Test Firma') && Array.isArray(data.bids) && data.bids.length > 0);
  check('indirilen veride şifre yok', !JSON.stringify(data).includes('"password"'));
  check('misafir veri indiremez', (await get(null, '/profile/export')).status === 302);

  // 28 Hazır yanıtlar
  check('hazır yanıtlar', (await get(firm, `/messages/${buildPath.split('/').pop()}/${(await get(firm, buildPath)).text.match(/\/messages\/[a-f0-9]{24}\/([a-f0-9]{24})/)[1]}`)).text.includes('data-quick-reply'));

  // Mesaj bildirimi
  const msgThread = `/messages/${reviewId}/${(await get(firm, reviewPath)).text.match(/\/messages\/[a-f0-9]{24}\/([a-f0-9]{24})/)[1]}`;
  const ownerBefore = notifCount((await get(owner, '/')).text);
  await post(firm, msgThread, { content: 'bir' });
  await post(firm, msgThread, { content: 'iki' });
  check('art arda mesaj tek bildirim düşürür', notifCount((await get(owner, '/')).text) === ownerBefore + 1);

  // 29 Hesap silme
  const victim = await signup({ role: 'customer', name: 'Silinecek', email: `sil${stamp}@test.local` });
  const victimPath = await newRequest(victim, { title: `Silinecek ${stamp}`, description: 'x', category: 'Diğer' });
  await post(firm, '/bids', { requestId: victimPath.split('/').pop(), amount: '100', deliveryTime: '1', description: 'teklif' });
  res = await post(victim, '/profile/delete', { password: 'yanlis' });
  check('yanlış şifreyle hesap silinmez', res.status === 422 && (await get(victim, '/dashboard')).status === 200);
  res = await post(victim, '/profile/delete', { password: pw });
  check('hesap silinir', res.status === 302 && res.headers.get('location') === '/');
  check('silinen hesapla giriş olmaz', (await login(`sil${stamp}@test.local`, pw)).status === 401);
  check('silinen hesabın talebi gider', (await get(null, victimPath)).status === 404);
  check('firma panelinde silinen talep hata vermez', (await get(firm, '/dashboard')).status === 200);

  // Teklif vermiş firma silinince talep sayfası bozulmaz
  const leaving = await signup({ role: 'company', name: 'Gidecek', companyName: `Gidecek ${stamp}`, email: `git${stamp}@test.local` });
  const keepPath = await newRequest(owner, { title: `Kalacak ${stamp}`, description: 'x', category: 'Diğer' });
  await post(leaving, '/bids', { requestId: keepPath.split('/').pop(), amount: '100', deliveryTime: '1', description: 'teklif' });
  await post(leaving, '/profile/delete', { password: pw });
  const kept = await get(owner, keepPath);
  check('firma silinince talep sayfası çalışır', kept.status === 200 && kept.text.includes('Gelen Teklifler (0)'));
  check('firma silinince teklif sayısı düşer', /class="listing-bids"><b>0</.test((await get(null, `/requests?search=Kalacak ${stamp}`)).text));

  console.log(failures ? `\n${failures} test BAŞARISIZ, ${passed} geçti` : `\nTüm testler geçti (${passed})`);
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
