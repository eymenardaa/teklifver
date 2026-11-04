const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const cache = new Map();

function loadSvg(name) {
  if (cache.has(name)) return cache.get(name);

  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Geçersiz ikon adı: ${name}`);
  const inner = fs
    .readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8')
    .replace(/<!--[\s\S]*?-->/, '')
    .replace(/<svg[\s\S]*?>/, '')
    .replace(/<\/svg>/, '')
    .replace(/\s*\n\s*/g, '')
    .trim();

  cache.set(name, inner);
  return inner;
}

// Lucide ikonunu sunucuda satır içi SVG olarak üretir: ek istek yok, sayfa kaymaz.
// Kullanım: <%- icon('search') %> veya <%- icon('search', { size: 20, class: 'x' }) %>
function icon(name, { size = 18, class: className = '' } = {}) {
  const classes = ['icon', className].filter(Boolean).join(' ');
  return `<svg class="${classes}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${loadSvg(name)}</svg>`;
}

module.exports = icon;
