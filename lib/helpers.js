const categories = require('../config/categories');
const cities = require('../config/cities');

const findCategory = name => categories.find(c => c.name === name) || categories[categories.length - 1];
const categoryIcon = name => findCategory(name).icon;

const moneyFormat = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0
});
const dateFormat = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
const monthFormat = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', {
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
  rejected: { label: 'Reddedildi', tone: 'gray' }
};

const requestTips = require('../config/request-tips');

module.exports = {
  requestTips,
  allCategories: categories,
  allCities: cities,
  categoryIcon,
  money,
  formatDate,
  formatDateTime,
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
