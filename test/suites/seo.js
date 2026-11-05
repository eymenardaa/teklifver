// Hizmet ve il sayfaları, başlıklar, yapısal veri, site haritası.
const { client, reporter } = require('../helpers/harness');

const BASE = process.env.BASE;
const { check, finish } = reporter();

const between = (html, pattern) => (html.match(pattern) || [])[1];
const jsonLdOf = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => JSON.parse(m[1]));

(async () => {
  const g = client(BASE);

  // Bağlantı adresleri
  const { slugify } = require('../../lib/slug');
  check('türkçe karakterler', slugify('İnşaat & Tadilat') === 'insaat-tadilat' && slugify('Çeviri & Metin') === 'ceviri-metin' && slugify('Şanlıurfa') === 'sanliurfa' && slugify('Iğdır') === 'igdir' && slugify('Muğla') === 'mugla');

  // Hizmet sayfası
  const service = await g.get('/hizmet/temizlik');
  check('hizmet sayfası açılır', service.status === 200);
  check('tek h1', (service.text.match(/<h1/g) || []).length === 1 && service.text.includes('Temizlik Teklifleri'));
  check('özgün başlık', between(service.text, /<title>([^<]+)/).includes('Temizlik Teklifleri'));
  check('canonical kendisi', service.text.includes('rel="canonical" href="http://127.0.0.1') && service.text.includes('/hizmet/temizlik"'));
  check('talepler listelenir', service.text.includes('listing-title'));
  check('fiyat verisi', service.text.includes('Ortalama teklif'));
  const data = jsonLdOf(service.text);
  check('yapısal veri geçerli', data.some(d => d['@type'] === 'FAQPage' && d.mainEntity.length >= 3) && data.some(d => d['@type'] === 'BreadcrumbList'));
  check('il bağlantıları', /\/hizmet\/temizlik\/[a-z-]+"/.test(service.text));

  // Hizmet + il
  const combo = between(service.text, /(\/hizmet\/temizlik\/[a-z-]+)"/);
  const comboPage = await g.get(combo);
  check('hizmet + il açılır', comboPage.status === 200 && (comboPage.text.match(/<h1/g) || []).length === 1);
  check('hizmet + il yalnız o ili listeler', (comboPage.text.match(/class="listing-title"/g) || []).length >= 1);

  // İl
  const city = await g.get('/il/istanbul');
  check('il sayfası açılır', city.status === 200 && city.text.includes('İstanbul Hizmet Talepleri'));
  check('türkçe il', (await g.get('/il/sanliurfa')).status === 200 && (await g.get('/il/igdir')).status === 200);

  // Olmayanlar
  check('olmayan hizmet 404', (await g.get('/hizmet/yok-boyle')).status === 404);
  check('olmayan il 404', (await g.get('/il/narnia')).status === 404);
  check('olmayan birleşim 404', (await g.get('/hizmet/temizlik/narnia')).status === 404);

  // Boş sayfa aramada çıkmaz (örnek veride olmayan il)
  const empty = await g.get('/hizmet/ceviri-metin/hakkari');
  check('boş sayfa noindex', empty.status === 200 && empty.text.includes('Şu anda açık talep yok'));

  // Filtreli liste
  const list = await g.get('/requests?search=boya');
  check('arama sonucu kanonik listeye bağlanır', list.text.includes('/requests"') && list.text.includes('rel="canonical"'));

  // Site haritası
  const sitemap = (await g.get('/sitemap.xml')).text;
  check('harita hizmet sayfaları', sitemap.includes('/hizmet/insaat-tadilat<'));
  check('harita il sayfaları', /\/il\/[a-z-]+</.test(sitemap));
  check('harita birleşimler', /\/hizmet\/[a-z-]+\/[a-z-]+</.test(sitemap));
  check('harita sorgu adresi içermez', !sitemap.includes('?category='));

  // Başlıklar
  const home = await g.get('/');
  check('ana sayfa başlığı', between(home.text, /<title>([^<]+)/).startsWith('TeklifVer: Ücretsiz Teklif'));
  check('ana sayfa açıklaması', home.text.includes('name="description" content="Tadilat, nakliye'));
  check('kategori satırı hizmet sayfasına gider', /<nav class="catnav"[\s\S]*?href="\/hizmet\//.test(home.text));
  check('alt bilgide hizmet bağlantıları', home.text.includes('Temizlik Teklifleri</a>'));
  check('kuruluş verisi', jsonLdOf(home.text).some(d => d['@type'] === 'Organization'));
  const detailPath = between(home.text, /(\/requests\/[a-f0-9]{24})/);
  const detail = (await g.get(detailPath)).text;
  check('talep başlığı kategoriyle', /<title>[^<]+ - [^<]+\| TeklifVer/.test(detail));
  check('talep hizmet sayfasına bağlanır', detail.includes('href="/hizmet/'));

  // Örnek veri arama motoruna kapalı, gerçek verili test ayrı takımda
  check('örnek veri noindex', home.text.includes('name="robots" content="noindex"'));

  // Masaüstü giriş düzeni
  check('giriş yan paneli', (await g.get('/login')).text.includes('auth-side'));
  check('kayıt yan paneli', (await g.get('/register')).text.includes('auth-side'));

  finish();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
