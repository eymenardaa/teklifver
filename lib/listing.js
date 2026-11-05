const categories = require('../config/categories');
const cities = require('../config/cities');
const { str, searchPattern } = require('./input');

const DAY_MS = 24 * 60 * 60 * 1000;

const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  budget_high: { 'budget.max': -1, createdAt: -1 },
  budget_low: { 'budget.min': 1, createdAt: -1 },
  deadline: { deadline: 1, createdAt: -1 },
  bids: { bidCount: -1, createdAt: -1 },
  views: { viewCount: -1, createdAt: -1 }
};

const positiveNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

// Yayında olan ve son tarihi geçmemiş talepler
const liveFilter = () => ({
  status: 'open',
  $or: [{ deadline: null }, { deadline: { $gte: new Date() } }]
});

// Adres satırındaki filtreleri güvenli değerlere çevirir.
function readFilters(query) {
  return {
    search: str(query.search),
    category: categories.names.includes(query.category) ? query.category : 'all',
    city: cities.includes(query.city) ? query.city : '',
    budgetMin: positiveNumber(query.budgetMin),
    budgetMax: positiveNumber(query.budgetMax),
    period: ['1', '7', '30'].includes(query.period) ? query.period : '',
    photos: query.photos === 'on',
    noBids: query.noBids === 'on',
    sort: Object.hasOwn(SORT_OPTIONS, query.sort) ? query.sort : 'newest',
    view: query.view === 'gallery' ? 'gallery' : 'list'
  };
}

function buildConditions(filters) {
  const conditions = [liveFilter()];
  if (filters.category !== 'all') conditions.push({ category: filters.category });
  if (filters.city) conditions.push({ city: filters.city });
  if (filters.budgetMin) {
    conditions.push({
      $or: [{ 'budget.max': { $gte: filters.budgetMin } }, { 'budget.min': { $gte: filters.budgetMin } }]
    });
  }
  if (filters.budgetMax) conditions.push({ 'budget.min': { $lte: filters.budgetMax } });
  if (filters.period) {
    conditions.push({ createdAt: { $gte: new Date(Date.now() - Number(filters.period) * DAY_MS) } });
  }
  if (filters.photos) conditions.push({ 'images.0': { $exists: true } });
  if (filters.noBids) conditions.push({ bidCount: 0 });
  if (filters.search) {
    const pattern = searchPattern(filters.search);
    const searchConditions = [
      { title: { $regex: pattern, $options: 'i' } },
      { description: { $regex: pattern, $options: 'i' } }
    ];
    if (/^\d{6,}$/.test(filters.search)) searchConditions.push({ no: Number(filters.search) });
    conditions.push({ $or: searchConditions });
  }
  return { $and: conditions };
}

// Yeni talebin kayıtlı aramaya uyup uymadığına bakar (buildConditions ile aynı kurallar).
function matchesFilters(request, filters) {
  const min = (request.budget && request.budget.min) || 0;
  const max = (request.budget && request.budget.max) || 0;
  if (filters.category !== 'all' && request.category !== filters.category) return false;
  if (filters.city && request.city !== filters.city) return false;
  if (filters.budgetMin && max < filters.budgetMin && min < filters.budgetMin) return false;
  if (filters.budgetMax && min > filters.budgetMax) return false;
  if (filters.photos && !(request.images && request.images.length)) return false;
  if (filters.search) {
    const pattern = new RegExp(searchPattern(filters.search), 'i');
    if (!pattern.test(request.title) && !pattern.test(request.description)) return false;
  }
  return true;
}

// Filtreleri adres metnine çevirir; sayfa ve görünüm kayıtlı aramaya dahil edilmez.
function filtersToQuery(filters) {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.city) params.set('city', filters.city);
  if (filters.budgetMin) params.set('budgetMin', filters.budgetMin);
  if (filters.budgetMax) params.set('budgetMax', filters.budgetMax);
  if (filters.period) params.set('period', filters.period);
  if (filters.photos) params.set('photos', 'on');
  if (filters.noBids) params.set('noBids', 'on');
  return params.toString();
}

// Kayıtlı arama için okunabilir ad
function describeFilters(filters) {
  const parts = [];
  if (filters.search) parts.push(`"${filters.search}"`);
  if (filters.category !== 'all') parts.push(filters.category);
  if (filters.city) parts.push(filters.city);
  if (filters.budgetMin) parts.push(`en az ${filters.budgetMin} TL`);
  if (filters.budgetMax) parts.push(`en çok ${filters.budgetMax} TL`);
  if (filters.photos) parts.push('fotoğraflı');
  if (filters.noBids) parts.push('teklif almamış');
  return parts.join(', ').slice(0, 100) || 'Tüm talepler';
}

module.exports = { SORT_OPTIONS, liveFilter, readFilters, buildConditions, matchesFilters, filtersToQuery, describeFilters };
