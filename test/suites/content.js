// Reklamlar, bilgi sayfaları, koşul onayı ve her kategori/arama bağlantısının sonuç verdiğini doğrular.
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3000';
const categories = require(path.join(__dirname, '..', '..', 'config', 'categories.js'));
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures += 1; };
const get = async p => {
  const res = await fetch(BASE + p, { redirect: 'manual' });
  return { status: res.status, text: await res.text() };
};
const resultCount = html => Number((html.match(/<strong>(\d+)<\/strong> talep bulundu/) || [])[1]);
const adTitles = html => [...html.matchAll(/class="ad-title">([^<]+)</g)].map(m => m[1]);

(async () => {
  for (const page of ['/yardim', '/reklam', '/kullanim-kosullari', '/gizlilik', '/cerez-politikasi']) {
    check(`sayfa ${page}`, (await get(page)).status === 200);
  }
  check('yasal metinlerde taslak uyarısı', (await get('/gizlilik')).text.includes('taslaktır'));

  const home = await get('/');
  const homeAds = adTitles(home.text);
  check('ana sayfada reklamlar', homeAds.length >= 3, String(homeAds.length));
  check('aynı sayfada reklam tekrar etmez', new Set(homeAds).size === homeAds.length, homeAds.join(' | '));
  check('her reklamda "Reklam" etiketi', (home.text.match(/class="ad-label">Reklam</g) || []).length === homeAds.length);
  check('çerez penceresi sayfada', home.text.includes('id="cookieBanner"') && home.text.includes('Reddet'));

  const list = await get('/requests');
  check('liste içi reklam satırları', (list.text.match(/class="ad-row"/g) || []).length >= 2);
  check('liste sayfası 20 ilan gösterir', (list.text.match(/class="listing-title"/g) || []).length === 20);
  check('toplam ilan arttı', resultCount(list.text) >= 70, String(resultCount(list.text)));
  check('ACİL ve YENİ etiketleri', list.text.includes('label-new') || home.text.includes('label-urgent'));

  // Reklam bağlantıları gerçek sonuç veriyor mu?
  for (const term of ['Usta', 'Mavi', 'Kodhane', 'Kadraj']) {
    check(`reklam firması bulunur: ${term}`, (await get('/companies?search=' + term)).text.match(/<strong>1<\/strong> firma bulundu/) !== null);
  }

  // Kategorilerin hiçbiri boş kalmamalı, alt bağlantılar sonuç vermeli
  const zero = [];
  for (const category of categories) {
    const base = '/requests?category=' + encodeURIComponent(category.name);
    const count = resultCount((await get(base)).text);
    if (!count) zero.push(category.name);
    if (count < 3) console.log(`  not: ${category.name} kategorisinde ${count} ilan`);
    for (const [label, term] of category.subs) {
      const n = resultCount((await get(base + '&search=' + encodeURIComponent(term.trim()))).text);
      if (!n) zero.push(`${category.name} > ${label} (${term})`);
    }
  }
  check('tüm kategori ve alt bağlantılar sonuç verir', zero.length === 0, zero.join(', '));

  const popular = [];
  for (const term of ['mutfak', 'boya', 'banyo', 'nakliyat', 'web sitesi', 'logo', 'temizlik', 'elektrik', 'mobil uygulama', 'düğün']) {
    if (!resultCount((await get('/requests?search=' + encodeURIComponent(term))).text)) popular.push(term);
  }
  check('popüler aramalar sonuç verir', popular.length === 0, popular.join(', '));

  const lower = resultCount((await get('/requests?search=ingilizce')).text);
  const upper = resultCount((await get('/requests?search=' + encodeURIComponent('İNGİLİZCE'))).text);
  check('Türkçe i/İ aramada eşleşir', lower > 0 && lower === upper, `${lower}/${upper}`);

  // Koşul onayı olmadan kayıt olunmaz
  const signup = terms => fetch(BASE + '/register', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ role: 'customer', name: 'Onay Test', email: `onay${Date.now()}@test.local`, password: 'test-sifre-1', ...(terms ? { terms: 'on' } : {}) }).toString()
  });
  const noTerms = await signup(false);
  check('onaysız kayıt reddedilir', noTerms.status === 422 && (await noTerms.text()).includes('koşulları onaylamalısınız'));
  check('onaylı kayıt geçer', (await signup(true)).status === 302);

  console.log(failures ? `\n${failures} test BAŞARISIZ` : '\nTüm testler geçti');
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
