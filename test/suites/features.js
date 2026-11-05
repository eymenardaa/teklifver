// Yeni ilan sitesi özelliklerini doğrular: filtreler, talep no, favoriler, firma rehberi.
const BASE = process.env.BASE || 'http://localhost:3000';
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures += 1; };
const get = async (path, cookie) => {
  const res = await fetch(BASE + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
};
const resultCount = html => Number((html.match(/<strong>(\d+)<\/strong> talep bulundu/) || [])[1]);
const rows = html => (html.match(/class="listing-title"/g) || []).length;
const firstLink = html => (html.match(/class="listing-title" href="(\/requests\/[a-f0-9]{24})"/) || [])[1];

(async () => {
  const all = await get('/requests');
  const total = resultCount(all.text);
  check('liste 20 satırla sayfalanır', rows(all.text) === 20 && total > 20, `${rows(all.text)}/${total}`);

  const page2 = await get('/requests?page=2');
  check('2. sayfa çalışır', rows(page2.text) > 0 && firstLink(page2.text) !== firstLink(all.text));

  const ankara = await get('/requests?city=' + encodeURIComponent('Ankara'));
  const ankaraPlaces = [...ankara.text.matchAll(/<td class="col-place">([^<]+)</g)].map(m => m[1]);
  check('il filtresi', ankaraPlaces.length > 0 && ankaraPlaces.every(p => p.startsWith('Ankara')), `${ankaraPlaces.length} satır`);

  const photos = await get('/requests?photos=on');
  check('fotoğraflı filtresi', resultCount(photos.text) > 0 && !photos.text.includes('Fotoğraf yok'));

  const allPhotos = await get('/requests?view=list');
  const noPhotoTotal = total - resultCount(photos.text);
  check('fotoğrafsız ilan da var', noPhotoTotal > 0, `${noPhotoTotal} adet`);
  void allPhotos;

  const noBids = await get('/requests?noBids=on');
  const bidCells = [...noBids.text.matchAll(/class="col-bids">(\d+)</g)].map(m => Number(m[1]));
  check('teklif almamış filtresi', bidCells.length > 0 && bidCells.every(n => n === 0), `${bidCells.length} satır`);

  const budget = await get('/requests?budgetMin=100000');
  check('bütçe filtresi daraltır', resultCount(budget.text) > 0 && resultCount(budget.text) < total, String(resultCount(budget.text)));

  const day = await get('/requests?period=1');
  check('tarih filtresi daraltır', resultCount(day.text) > 0 && resultCount(day.text) < total, String(resultCount(day.text)));

  const category = await get('/requests?category=' + encodeURIComponent('Temizlik'));
  const combined = await get('/requests?category=' + encodeURIComponent('Temizlik') + '&city=' + encodeURIComponent('Muğla'));
  check('kategori ve il birlikte', resultCount(combined.text) > 0 && resultCount(combined.text) < resultCount(category.text));
  check('filtre ve sıralama sayfa geçişinde korunur', all.text.includes('page=2') && (await get('/requests?sort=views')).text.includes('sort=views&amp;page=2'));

  const gallery = await get('/requests?view=gallery');
  check('galeri görünümü', gallery.text.includes('showcase-grid') && !gallery.text.includes('listing-table'));

  const xss = await get('/requests?search=' + encodeURIComponent('"><script>alert(1)</script>'));
  check('arama metni kaçırılır', !xss.text.includes('<script>alert(1)') && xss.text.includes('&lt;script&gt;'));

  const detailPath = firstLink(all.text);
  const detail = await get(detailPath);
  const no = (detail.text.match(/<strong style="color:var\(--price\)">(\d+)</) || [])[1];
  check('detayda talep no var', Boolean(no), no);
  const byNo = await get('/requests?search=' + no);
  check('talep no ile arama', resultCount(byNo.text) === 1 && byNo.text.includes(detailPath));

  const home = await get('/');
  check('ana sayfada vitrin ve tablo', home.text.includes('Vitrin') && home.text.includes('Son Eklenen Talepler'));

  // Giriş yapan kullanıcı ana sayfayı görebilir, favori ekleyip çıkarabilir
  const login = await fetch(BASE + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'sirket@teklifver.test', password: 'demo1234' }).toString()
  });
  check('demo firma girişi', login.status === 302, String(login.status));
  const cookie = login.headers.get('set-cookie').split(';')[0];
  check('giriş yapınca ana sayfa açılır', (await get('/', cookie)).status === 200);

  const guestFav = await fetch(BASE + detailPath + '/favorite', { method: 'POST', redirect: 'manual' });
  check('misafir favori ekleyemez', guestFav.status === 302 && guestFav.headers.get('location').startsWith('/login'));

  const toggle = () => fetch(BASE + detailPath + '/favorite', { method: 'POST', redirect: 'manual', headers: { cookie, accept: 'application/json' } });
  let res = await toggle();
  check('favoriye eklendi', (await res.json()).favorite === true);
  let favorites = await get('/dashboard/favorites', cookie);
  check('favorilerde görünür', favorites.text.includes(detailPath) && favorites.text.includes('id="favCount">1<'));
  res = await toggle();
  check('favoriden çıkarıldı', (await res.json()).favorite === false);
  favorites = await get('/dashboard/favorites', cookie);
  check('favorilerden gider', !favorites.text.includes('class="listing-title" href="' + detailPath) && favorites.text.includes('id="favCount">0<'));

  const badFav = await fetch(BASE + '/requests/abc/favorite', { method: 'POST', redirect: 'manual', headers: { cookie } });
  check('geçersiz favori hata vermez', badFav.status === 302);

  const dash = await get('/dashboard', cookie);
  check('firma paneli dolu', dash.text.includes('Tekliflerim') && dash.text.includes('Usta Eller Tadilat'));

  const companies = await get('/companies');
  check('firma rehberi', companies.text.includes('Usta Eller Tadilat') && companies.text.includes('firma bulundu'));
  const izmir = await get('/companies?city=' + encodeURIComponent('İzmir'));
  check('firma il filtresi', izmir.text.includes('Ege Dekorasyon') && !izmir.text.replace(/<a class="ad [\s\S]*?<\/a>/g, '').includes('Kodhane'));
  const companyPath = (companies.text.match(/href="(\/companies\/[a-f0-9]{24})"/) || [])[1];
  const company = await get(companyPath);
  check('firma sayfası', company.status === 200 && company.text.includes('Firma Hakkında'));
  check('firma sayfasında iletişim gizli', !company.text.includes('@teklifver.test'));
  check('geçersiz firma 404', (await get('/companies/abc')).status === 404);

  console.log(failures ? `\n${failures} test BAŞARISIZ` : '\nTüm testler geçti');
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
