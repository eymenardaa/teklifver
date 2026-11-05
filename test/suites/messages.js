// Mesajlaşma yetkilerini ve akışını doğrular.
const BASE = process.env.BASE || 'http://localhost:3000';
const stamp = Date.now();
const pw = 'test-' + stamp;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures += 1; };

const form = data => new URLSearchParams(data).toString();
const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };

async function signup(fields) {
  const res = await fetch(BASE + '/register', { method: 'POST', redirect: 'manual', headers: formHeaders, body: form({ ...fields, password: pw, terms: 'on' }) });
  if (res.status !== 302) throw new Error('kayıt ' + fields.email + ' ' + res.status);
  return res.headers.get('set-cookie').split(';')[0];
}
const get = async (cookie, path) => {
  const res = await fetch(BASE + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
};
const post = (cookie, path, data) => fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { ...formHeaders, cookie }, body: form(data) });
const idOf = async cookie => {
  // Kullanıcı kimliği firma panelinden okunur; müşteri için talep sayfasından alınır.
  const html = (await get(cookie, '/dashboard')).text;
  return (html.match(/href="\/companies\/([a-f0-9]{24})"/) || [])[1];
};

(async () => {
  const owner = await signup({ role: 'customer', name: 'Sahip Kisi', email: `sahip${stamp}@test.local` });
  const stranger = await signup({ role: 'customer', name: 'Yabanci Kisi', email: `yabanci${stamp}@test.local` });
  const firmA = await signup({ role: 'company', name: 'A', companyName: 'Firma A Ltd', email: `a${stamp}@test.local` });
  const firmB = await signup({ role: 'company', name: 'B', companyName: 'Firma B Ltd', email: `b${stamp}@test.local` });
  const firmC = await signup({ role: 'company', name: 'C', companyName: 'Firma C Ltd', email: `c${stamp}@test.local` });

  const body = new FormData();
  Object.entries({ title: `Mesaj testi ${stamp}`, description: 'Aciklama', category: 'Diğer' }).forEach(([k, v]) => body.append(k, v));
  const created = await fetch(BASE + '/requests', { method: 'POST', redirect: 'manual', headers: { cookie: owner }, body });
  const requestPath = created.headers.get('location');
  const requestId = requestPath.split('/').pop();

  const firmAId = await idOf(firmA);
  const firmBId = await idOf(firmB);
  const firmCId = await idOf(firmC);

  // Kimlikler: firma A talep sayfasından sahibin bağlantısını görür
  const detailForA = (await get(firmA, requestPath)).text;
  const ownerId = (detailForA.match(new RegExp(`/messages/${requestId}/([a-f0-9]{24})"`)) || [])[1];
  check('firma talep sayfasında mesaj bağlantısı görür', Boolean(ownerId));
  check('misafir bağlantıyı görmez', !(await get(null, requestPath)).text.includes(`/messages/${requestId}/`));

  const threadA = `/messages/${requestId}/${ownerId}`;

  // Erişim
  check('misafir gelen kutusuna giremez', (await get(null, '/messages')).status === 302);
  check('misafir konuşmaya giremez', (await get(null, threadA)).location.startsWith('/login'));
  check('firma açık talebin sahibine yazabilir (sayfa)', (await get(firmA, threadA)).status === 200);

  const denied = async (cookie, path) => (await get(cookie, path)).location === '/messages';
  check('kendine mesaj sayfası engellenir', await denied(owner, `/messages/${requestId}/${ownerId}`));
  check('başka müşteri sahibine yazamaz', await denied(stranger, threadA));
  check('sahip teklif vermemiş firmaya yazamaz', await denied(owner, `/messages/${requestId}/${firmAId}`));
  check('geçersiz kimlik engellenir', await denied(firmA, '/messages/abc/def'));

  let res = await post(stranger, threadA, { content: 'izinsiz' });
  check('başka müşteri mesaj gönderemez', res.headers.get('location') === '/messages');
  res = await post(firmC, `/messages/${requestId}/${firmAId}`, { content: 'firmadan firmaya' });
  check('firma firmaya yazamaz', res.headers.get('location') === '/messages');

  // Gönderim
  res = await post(firmA, threadA, { content: '   ' });
  check('boş mesaj reddedilir', (await get(firmA, res.headers.get('location'))).text.includes('Boş mesaj'));
  res = await post(firmA, threadA, { content: 'x'.repeat(2001) });
  check('çok uzun mesaj reddedilir', (await get(firmA, res.headers.get('location'))).text.includes('en fazla 2000'));

  const xss = '<img src=x onerror=alert(1)>';
  res = await post(firmA, threadA, { content: `Merhaba ${xss}\nİkinci satır` });
  check('mesaj gönderildi', res.status === 302 && res.headers.get('location') === threadA);
  const sentHtml = (await get(firmA, threadA)).text;
  check('mesaj HTML olarak çalışmaz', !sentHtml.includes(xss) && sentHtml.includes('&lt;img src=x'));

  // Okunmamış sayısı
  const unreadBadge = html => (html.match(/Mesajlarım <span class="unread-count" data-count="messages" >(\d+)</) || [])[1];
  check('alıcıda okunmamış sayısı görünür', unreadBadge((await get(owner, '/')).text) === '1');
  check('gönderende okunmamış yok', !unreadBadge((await get(firmA, '/')).text));

  const inbox = (await get(owner, '/messages')).text;
  check('gelen kutusunda firma ve talep var', inbox.includes('Firma A Ltd') && inbox.includes(`Mesaj testi ${stamp}`) && inbox.includes('is-unread'));
  check('gelen kutusunda da HTML çalışmaz', !inbox.includes(xss));

  // Sahip konuşmayı açınca okunur; açtığı sayfada sayı anında düşer
  const ownerThread = `/messages/${requestId}/${firmAId}`;
  const opened = await get(owner, ownerThread);
  check('sahip firmaya cevap sayfasını açar', opened.status === 200 && opened.text.includes('Merhaba'));
  check('okuyunca sayı aynı sayfada düşer', !unreadBadge(opened.text));
  check('sonraki sayfada da okunmuş', !unreadBadge((await get(owner, '/')).text));

  res = await post(owner, ownerThread, { content: 'Sahipten cevap' });
  check('sahip cevap verir', res.status === 302 && res.headers.get('location') === ownerThread);
  check('firmaya okunmamış düşer', unreadBadge((await get(firmA, '/')).text) === '1');

  // Konuşmalar birbirinden ayrı
  const threadB = (await get(firmB, threadA));
  check('başka firma bu konuşmayı görmez', threadB.status === 200 && !threadB.text.includes('Sahipten cevap') && !threadB.text.includes('Merhaba &lt;img'));
  const inboxB = (await get(firmB, '/messages')).text;
  check('başka firmanın gelen kutusu boş', inboxB.includes('Henüz mesajınız yok'));

  // Yeni mesaj alma
  const lastId = async cookie => {
    const r = await fetch(BASE + threadA + '/new', { headers: { cookie } });
    const { messages } = await r.json();
    return messages;
  };
  const pollAll = await lastId(firmA);
  check('yeni mesaj isteği tüm mesajları döner', pollAll.length === 2 && pollAll[0].mine === true && pollAll[1].mine === false);
  const after = pollAll[1].id;
  const none = await (await fetch(`${BASE}${threadA}/new?after=${after}`, { headers: { cookie: firmA } })).json();
  check('after sonrası yeni mesaj yok', none.messages.length === 0);
  await post(owner, ownerThread, { content: 'Bir mesaj daha' });
  const fresh = await (await fetch(`${BASE}${threadA}/new?after=${after}`, { headers: { cookie: firmA } })).json();
  check('yalnızca yeni mesaj gelir', fresh.messages.length === 1 && fresh.messages[0].content === 'Bir mesaj daha');
  const pollDenied = await fetch(`${BASE}${threadA}/new`, { headers: { cookie: stranger } });
  check('yetkisiz kişi mesaj çekemez', pollDenied.status === 403 && (await pollDenied.json()).messages.length === 0);
  const pollGuest = await fetch(`${BASE}${threadA}/new`, { redirect: 'manual' });
  check('misafir mesaj çekemez', pollGuest.status === 302);

  // Teklif veren firmaya sahip yazabilir; talep sayfasında bağlantı görünür
  await post(firmB, '/bids', { requestId, amount: '1000', deliveryTime: '3', description: 'teklif' });
  const ownerDetail = (await get(owner, requestPath)).text;
  check('sahip teklif satırında mesaj bağlantısı görür', ownerDetail.includes(`/messages/${requestId}/${firmBId}"`));
  check('sahip teklif veren firmaya yazabilir', (await get(owner, `/messages/${requestId}/${firmBId}`)).status === 200);
  check('teklif vermemiş firmaya hâlâ yazamaz', await denied(owner, `/messages/${requestId}/${firmCId}`));

  // Talep kapanınca: geçmişi olan devam eder, yeni firma başlatamaz
  const bidId = (ownerDetail.match(/\/bids\/([a-f0-9]{24})\/accept/) || [])[1];
  await post(owner, `/bids/${bidId}/accept`, {});
  check('kapalı talepte geçmişi olan firma devam eder', (await get(firmA, threadA)).status === 200);
  check('kapalı talepte teklifi kabul edilen firma yazabilir', (await get(firmB, threadA)).status === 200);
  check('kapalı talepte yeni firma başlatamaz', await denied(firmC, threadA));

  // Hız sınırı
  let limited = false;
  for (let i = 0; i < 25 && !limited; i += 1) {
    const r = await post(firmB, threadA, { content: `spam ${i}` });
    const html = (await get(firmB, r.headers.get('location'))).text;
    limited = html.includes('Çok hızlı mesaj');
  }
  check('art arda mesaj sınırlanır', limited);

  // Kimliği olmayan sahte alan
  res = await post(firmA, threadA, { 'content[$ne]': 'x' });
  check('nesne içerik reddedilir', (await get(firmA, res.headers.get('location'))).text.includes('Boş mesaj'));

  console.log(failures ? `\n${failures} test BAŞARISIZ` : '\nTüm testler geçti');
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
