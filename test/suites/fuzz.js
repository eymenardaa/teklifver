// Bozuk adres ve parametrelerin hiçbir sayfada sunucu hatası (5xx) üretmediğini doğrular.
const { client, reporter } = require('../helpers/harness');

const BASE = process.env.BASE;
const { check, finish } = reporter();
const stamp = Date.now();
const fakeId = 'f'.repeat(24);

const ids = ['abc', fakeId, '%00', '..%2F..', 'null', '<script>', '1e5'];
const getRoutes = [
  ...ids.flatMap(id => [`/requests/${id}`, `/requests/${id}/edit`, `/companies/${id}`, `/notifications/${id}/open`, `/messages/${id}/${id}`, `/messages/${id}/${id}/new`, `/dashboard/searches/${id}/open`, `/reset/${id}`, `/email/verify/${id}`, `/email/unsub/${id}`, `/uploads/${id}`, `/uploads/${id}.png`, `/reklam-tik/${id}`, `/auth/${id}`, `/auth/${id}/callback`]),
  '/requests?page=-1', '/requests?page=abc', '/requests?page=99999999', '/requests?sort[]=x', '/requests?sort=constructor', '/requests?category[]=x', '/requests?search[a]=b', '/requests?budgetMin=abc&budgetMax=-1', '/requests?period=x', '/requests/suggest?q[]=a', '/requests/suggest?q=(((((', '/requests/suggest?q=.*.*.*',
  '/companies?page=-1', '/companies?search[]=x', '/companies?sort=__proto__', '/companies?minRating[]=1', '/companies?city[]=x',
  '/login?next[]=x', '/login?next=//evil.com', '/register?role[]=x', '/iletisim?konu[]=x',
  '/admin/requests?page=abc&status[]=x', '/admin/users?search[]=x',
  '/%E0%A4%A', '/requests/%E0%A4%A', '/uploads/%E0%A4%A', '/%ff'
];
const postRoutes = [
  ...ids.flatMap(id => [`/requests/${id}/favorite`, `/requests/${id}/report`, `/requests/${id}/close`, `/requests/${id}/republish`, `/requests/${id}/invite/${id}`, `/bids/${id}/accept`, `/bids/${id}/reject`, `/bids/${id}/cancel`, `/bids/${id}/edit`, `/bids/${id}/withdraw`, `/bids/complete/${id}`, `/bids/review/${id}`, `/companies/${id}/report`, `/companies/reviews/${id}/reply`, `/messages/${id}/${id}`, `/dashboard/searches/${id}/delete`, `/profile/social/${id}/unlink`, `/email/unsub/${id}`, `/auth/${id}/link`, `/admin/requests/${id}/remove`, `/admin/requests/${id}/restore`, `/admin/users/${id}/suspend`, `/admin/users/${id}/verify`, `/admin/reviews/${id}/toggle`, `/admin/messages/${id}/toggle`, `/admin/ads/${id}/toggle`, `/admin/ads/${id}/delete`, `/admin/reports/${id}/resolve`, `/admin/company-reports/${id}/resolve`]),
  '/requests', '/bids', '/login', '/register', '/forgot', '/iletisim', '/profile', '/profile/password', '/profile/email', '/profile/notifications', '/profile/portfolio/delete', '/dashboard/searches', '/admin/ads'
];
const nastyBodies = [
  {},
  { email: 'a', password: 'b', name: 'x', requestId: 'abc', amount: 'abc', deliveryTime: 'abc', description: '', reason: 'x', rating: 'x', query: '%%%', image: '../../etc/passwd', title: '', category: 'x' },
  'email[$ne]=x&password[$ne]=x&name[a]=b&requestId[a]=b&amount[a]=b&reason[]=x&rating[]=1&next[]=x&image[]=x&query[]=x&title[]=x&categories[a]=b&address[]=x&phone[]=x&newEmail[]=x'
];

async function sweep(name, c) {
  const failures = [];
  for (const url of getRoutes) {
    const res = await c.get(url);
    if (res.status >= 500) failures.push(`GET ${url} ${res.status}`);
  }
  for (const url of postRoutes) {
    for (const data of nastyBodies) {
      const res = typeof data === 'string'
        ? await c.post(url, Object.fromEntries(new URLSearchParams()), {}).then(() => fetch(BASE + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: data }))
        : await c.post(url, data);
      if (res.status >= 500) failures.push(`POST ${url} ${res.status}`);
    }
  }
  check(`${name}: bozuk isteklerde sunucu hatası yok`, failures.length === 0, failures.slice(0, 15).join(' | '));
}

(async () => {
  await sweep('misafir', client(BASE));

  const customer = client(BASE);
  await customer.post('/register', { role: 'customer', name: 'Fuzz Müşteri', email: `fm${stamp}@test.local`, password: 'fuzz-sifre-123', terms: 'on' });
  await sweep('müşteri', customer);

  const firm = client(BASE);
  await firm.post('/register', { role: 'company', name: 'Fuzz Firma', companyName: 'Fuzz AŞ', email: `ff${stamp}@test.local`, password: 'fuzz-sifre-123', terms: 'on' });
  await sweep('firma', firm);

  const admin = client(BASE);
  await admin.post('/login', { email: 'yonetici@teklifver.test', password: 'demo1234' });
  await sweep('yönetici', admin);

  const guest = client(BASE);
  check('güvensiz next yok sayılır', !(await guest.get('/login?next=//evil.com')).text.includes('name="next"'));
  check('bozuk adres 400', (await guest.get('/requests/%E0%A4%A')).status === 400);
  check('olmayan sayfa 404', (await guest.get('/yok-boyle-sayfa')).status === 404);
  check('olmayan talep 404', (await guest.get(`/requests/${fakeId}`)).status === 404);
  check('olmayan firma 404', (await guest.get(`/companies/${fakeId}`)).status === 404);
  check('şifre sızmaz', !(await guest.get('/companies')).text.includes('$2a$'));

  finish();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
