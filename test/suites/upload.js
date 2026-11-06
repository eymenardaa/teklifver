// Görsel yükleme, kaldırma ve hata durumlarını doğrular.
const BASE = process.env.BASE || 'http://localhost:3000';
const pw = 'yukleme-test-sifre-1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures += 1; };

(async () => {
  const login = await fetch(BASE + '/register', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ role: 'customer', name: 'Ayşe', email: 'ayse@test.local', password: pw, terms: 'on' }).toString()
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const base = { title: 'Görselli talep', description: 'Ayrıntıları keşifte konuşalım, hafta içi uygunum.', category: 'Diğer' };
  const send = (path, fields, files) => {
    const body = new FormData();
    Object.entries(fields).forEach(([k, v]) => [].concat(v).forEach(x => body.append(k, x)));
    files.forEach(([name, type, data]) => body.append('images', new Blob([data], { type }), name));
    return fetch(BASE + path, { method: 'POST', redirect: 'manual', headers: { cookie }, body });
  };
  const get = async path => (await fetch(BASE + path, { headers: { cookie } })).text();

  let res = await send('/requests', base, [['not.txt', 'text/plain', Buffer.from('x')]]);
  let html = await res.text();
  check('resim olmayan dosya anlaşılır hata verir', res.status === 422 && html.includes('Yalnızca JPG'));

  res = await send('/requests', base, [['big.png', 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1)]]);
  html = await res.text();
  check('5 MB üstü reddedilir', res.status === 422 && html.includes('en fazla 5 MB'));

  res = await send('/requests', base, Array.from({ length: 6 }, (_, i) => [`a${i}.png`, 'image/png', png]));
  html = await res.text();
  check('6 görsel reddedilir', res.status === 422 && html.includes('En fazla 5 görsel'));

  res = await send('/requests', base, [['a.png', 'image/png', png], ['b.PNG', 'image/png', png]]);
  check('geçerli görsellerle talep oluşur', res.status === 302, String(res.status));
  const path = res.headers.get('location');
  html = await get(path);
  const images = [...new Set([...html.matchAll(/\/uploads\/[\w.-]+/g)].map(m => m[0]))].filter(name => !name.endsWith('_t.webp'));
  check('iki görsel görünür', images.length === 2, String(images.length));
  check('görsel dosyası servis edilir', (await fetch(BASE + images[0])).status === 200);

  html = await get(path + '/edit');
  check('düzenleme formu mevcut değerleri gösterir', html.includes('value="Görselli talep"') && html.includes('removeImages'));

  res = await send(path + '?_method=PUT', { ...base, title: 'Güncellendi', removeImages: images[0] }, []);
  check('düzenleme kaydedildi', res.status === 302, String(res.status));
  html = await get(path);
  check('başlık güncellendi, görsel kaldırıldı', html.includes('Güncellendi') && !html.includes(images[0]) && html.includes(images[1]));
  await new Promise(r => setTimeout(r, 200));
  check('kaldırılan dosya diskten silindi', (await fetch(BASE + images[0])).status === 404);

  res = await fetch(BASE + path + '?_method=DELETE', { method: 'POST', redirect: 'manual', headers: { cookie } });
  check('talep silindi', res.status === 302 && res.headers.get('location') === '/dashboard');
  await new Promise(r => setTimeout(r, 200));
  check('silinen talebin görseli de silindi', (await fetch(BASE + images[1])).status === 404);

  console.log(failures ? `\n${failures} test BAŞARISIZ` : '\nTüm testler geçti');
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
