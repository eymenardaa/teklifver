const Ad = require('../models/Ad');

const CACHE_MS = 60 * 1000;
const FLUSH_MS = 60 * 1000;

let cache = [];
let cachedAt = 0;
let refreshing = null;
const pendingImpressions = new Map();

async function refresh() {
  const now = new Date();
  cache = await Ad.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }
    ]
  }).lean();
  cachedAt = Date.now();
}

// Reklamlar her istekte veritabanından okunmasın diye bir dakika bellekte tutulur.
async function loadActiveAds() {
  if (Date.now() - cachedAt > CACHE_MS) {
    refreshing = refreshing || refresh().catch(err => console.error('Reklamlar okunamadı:', err.message)).finally(() => { refreshing = null; });
    await refreshing;
  }
  return cache;
}

function invalidate() {
  cachedAt = 0;
}

function countImpression(ad) {
  if (!ad._id) return;
  const id = String(ad._id);
  pendingImpressions.set(id, (pendingImpressions.get(id) || 0) + 1);
}

// Gösterim sayıları toplu yazılır; her sayfa açılışı veritabanına yazma yapmaz.
async function flushImpressions() {
  if (!pendingImpressions.size) return;
  const items = [...pendingImpressions];
  pendingImpressions.clear();
  await Ad.bulkWrite(items.map(([id, count]) => ({ updateOne: { filter: { _id: id }, update: { $inc: { impressions: count } } } })));
}

setInterval(() => flushImpressions().catch(() => {}), FLUSH_MS).unref();

// Yalnızca site içi yollar ve https/http adresleri kabul edilir (javascript: vb. engellenir).
function isSafeAdUrl(url) {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

module.exports = { loadActiveAds, invalidate, countImpression, flushImpressions, isSafeAdUrl };
