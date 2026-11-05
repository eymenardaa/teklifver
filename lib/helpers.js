const categories = require('../config/categories');
const cities = require('../config/cities');

const findCategory = name => categories.find(c => c.name === name) || categories[categories.length - 1];
const categoryIcon = name => findCategory(name).icon;

// Sunucu dünyanın neresinde çalışırsa çalışsın tarihler Türkiye saatiyle gösterilir.
const TIME_ZONE = 'Europe/Istanbul';

const moneyFormat = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0
});
const dateFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const monthFormat = new Intl.DateTimeFormat('tr-TR', { timeZone: TIME_ZONE, month: 'long', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const money = amount => moneyFormat.format(amount || 0);
const formatDate = date => dateFormat.format(new Date(date));
const memberSince = date => monthFormat.format(new Date(date));
const formatDateTime = date => dateTimeFormat.format(new Date(date));

// <input type="date"> için YYYY-AA-GG
const inputDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const dateInput = date => inputDateFormat.format(date ? new Date(date) : new Date());

// Seçilen günün sonuna kadar geçerlidir (Türkiye saati). Geçersiz tarihte null döner.
function parseDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59+03:00`);
  return !Number.isNaN(date.getTime()) && dateInput(date) === value ? date : null;
}

// Liste satırlarında bütçe tek satıra sığsın diye kısa yazılır.
function budgetLabel(budget) {
  const min = budget && budget.min > 0 ? budget.min : 0;
  const max = budget && budget.max > 0 ? budget.max : 0;
  if (min && max) return min === max ? money(max) : `${money(min)} - ${money(max)}`;
  if (max) return `En fazla ${money(max)}`;
  if (min) return `En az ${money(min)}`;
  return 'Belirtilmemiş';
}

function placeLabel(request) {
  return [request.city, request.location].filter(Boolean).join(' / ') || 'Belirtilmemiş';
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');
}

// Herkese açık sayfalarda soyadı gizlenir: "Elif Yılmaz" -> "Elif Y."
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Üye';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase('tr-TR')}.`;
}

const truncate = (text, length) =>
  text && text.length > length ? `${text.slice(0, length).trimEnd()}...` : text || '';

const DAY_MS = 24 * 60 * 60 * 1000;

// Son tarihi 7 gün içinde olan açık talepler
function isUrgent(request) {
  if (request.status !== 'open' || !request.deadline) return false;
  const left = new Date(request.deadline).getTime() - Date.now();
  return left > 0 && left <= 7 * DAY_MS;
}
const isExpired = request =>
  request.status === 'open' && Boolean(request.deadline) && new Date(request.deadline).getTime() < Date.now();
const isFresh = request => Date.now() - new Date(request.createdAt).getTime() < DAY_MS / 2;

const requestStatus = {
  open: { label: 'Yayında', tone: 'green' },
  in_progress: { label: 'İşlemde', tone: 'amber' },
  completed: { label: 'Tamamlandı', tone: 'blue' },
  cancelled: { label: 'Kapatıldı', tone: 'gray' },
  removed: { label: 'Kaldırıldı', tone: 'gray' }
};

const bidStatus = {
  pending: { label: 'Beklemede', tone: 'amber' },
  accepted: { label: 'Kabul edildi', tone: 'green' },
  rejected: { label: 'Reddedildi', tone: 'gray' },
  cancelled: { label: 'Anlaşma iptal', tone: 'gray' }
};

// Listelerde küçük sürüm kullanılır; sayfa çok daha hızlı açılır.
function thumb(image) {
  if (!image) return '';
  if (image.startsWith('/uploads/')) return image.replace(/\.webp$/, '_t.webp');
  return image.replace(/^\/img\/ilan\/([^/]+)\.[^.]+$/, '/img/ilan/t/$1.webp');
}

// <script type="application/ld+json"> içine güvenle yazar.
const jsonLd = data => JSON.stringify(data).replace(/</g, '\\u003c');

const requestTips = require('../config/request-tips');

module.exports = {
  requestTips,
  allCategories: categories,
  allCities: cities,
  categoryIcon,
  money,
  formatDate,
  formatDateTime,
  dateInput,
  parseDateInput,
  shortName,
  thumb,
  jsonLd,
  memberSince,
  budgetLabel,
  placeLabel,
  initials,
  truncate,
  isUrgent,
  isExpired,
  isFresh,
  requestStatus,
  bidStatus
};
