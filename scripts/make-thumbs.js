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

  // Paylaşım görseli (public/img/paylasim.png) sitenin yazı tipleriyle scripts/paylasim.html dosyasından
  // tarayıcıda çizilir: msedge --headless=new --window-size=1200,630 --screenshot=public/img/paylasim.png scripts/paylasim.html
  console.log('  Site simgeleri üretildi.');
}

thumbs().then(icons).catch(err => {
  console.error(err);
  process.exit(1);
});
