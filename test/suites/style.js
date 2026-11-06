// Görünüm kuralları: dosyaları tarayarak sitenin elle yapılmış hissini ve çalışmasını bozan hataları yakalar.
// Emoji, "yapay zekâ" etiketi, satır içi betik (CSP engeller), tanımsız renk değişkeni ve olmayan simge.
const fs = require('fs');
const path = require('path');
const { reporter } = require('../helpers/harness');
const icon = require('../../lib/icons');

const { check, finish } = reporter();
const ROOT = path.join(__dirname, '..', '..');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/u;

function files(dir, pattern) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(rel, pattern);
    return pattern.test(entry.name) ? [rel] : [];
  });
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const views = files('views', /\.ejs$/);
const texts = [...views, ...files('config', /\.js$/), 'lib/mail-templates.js', 'public/js/main.js', 'routes/requests.js', 'routes/auth.js'];

const withEmoji = texts.filter(rel => EMOJI.test(read(rel)));
check('görünen metinlerde emoji yok', !withEmoji.length, withEmoji.join(', '));

const aiLabel = texts.filter(rel => /Yapay Zek|yapay zek/.test(read(rel)));
check('"yapay zekâ" etiketi yok', !aiLabel.length, aiLabel.join(', '));

const inlineScripts = views.filter(rel => /<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(read(rel)));
check('görünümlerde satır içi betik yok', !inlineScripts.length, inlineScripts.join(', '));

const outside = views.filter(rel => /<script[^>]+src="https?:/.test(read(rel)));
check('dışarıdan betik yüklenmez', !outside.length, outside.join(', '));

// Kullanılan her renk değişkeni temada tanımlı olmalı; yoksa yazı görünmez kalabilir.
const theme = read('public/css/theme.css') + read('public/css/style.css');
const defined = new Set([...theme.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
const used = new Map();
for (const rel of [...views, 'public/css/style.css']) {
  for (const match of read(rel).matchAll(/var\((--[\w-]+)/g)) if (!defined.has(match[1])) used.set(match[1], rel);
}
check('tanımsız renk değişkeni yok', !used.size, [...used].map(([name, rel]) => `${name} (${rel})`).join(', '));

// Simge setinde olmayan bir ad sayfayı çökertir.
const missing = new Set();
for (const rel of views) {
  for (const match of read(rel).matchAll(/icon\('([a-z0-9-]+)'/g)) {
    try { icon(match[1]); } catch { missing.add(`${match[1]} (${rel})`); }
  }
}
check('kullanılan simgelerin hepsi var', !missing.size, [...missing].join(', '));

finish();
