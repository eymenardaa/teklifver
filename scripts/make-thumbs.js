// public/img/ilan klasöründeki örnek fotoğrafların küçük sürümlerini ve site simgelerini üretir.
// Yeni fotoğraf veya simge değişikliğinden sonra çalıştırılır: npm run gorseller
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC = path.join(__dirname, '..', 'public');
const SOURCE = path.join(PUBLIC, 'img', 'ilan');
const TARGET = path.join(SOURCE, 't');

async function thumbs() {
  fs.mkdirSync(TARGET, { recursive: true });
  const files = fs.readdirSync(SOURCE).filter(name => /\.(jpe?g|png|webp)$/i.test(name));
  for (const name of files) {
    await sharp(path.join(SOURCE, name))
      .resize({ width: 480, height: 360, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(path.join(TARGET, name.replace(/\.[^.]+$/, '.webp')));
  }
  console.log(`  ${files.length} küçük fotoğraf üretildi.`);
}

async function icons() {
  const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'));
  for (const [size, file] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
    await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(PUBLIC, file));
  }

  // Paylaşımlarda görünen varsayılan görsel
  const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#1f2226"/>
    <text x="90" y="300" font-family="Arial Narrow, Arial, sans-serif" font-size="130" font-weight="bold" fill="#ffffff">teklif</text>
    <path d="M470 192h230v136H470l-50-68z" fill="#ffc61a"/><circle cx="462" cy="260" r="10" fill="#1f2226"/>
    <text x="490" y="300" font-family="Arial Narrow, Arial, sans-serif" font-size="130" font-weight="bold" fill="#1c1e21">ver</text>
    <text x="94" y="400" font-family="Arial, sans-serif" font-size="42" fill="#c6c9ce">Yaptıracağınız işi yazın, firmalardan fiyat alın.</text>
  </svg>`;
  await sharp(Buffer.from(social)).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC, 'img', 'paylasim.png'));
  console.log('  Site simgeleri ve paylaşım görseli üretildi.');
}

thumbs().then(icons).catch(err => {
  console.error(err);
  process.exit(1);
});
