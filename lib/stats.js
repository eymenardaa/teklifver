const Request = require('../models/Request');
const Bid = require('../models/Bid');
const { liveFilter } = require('./listing');

// Kategori menüsündeki sayılar için: { kategoriAdı: açıkTalepSayısı }
async function openCountsByCategory() {
  const rows = await Request.aggregate([
    { $match: liveFilter() },
    { $group: { _id: '$category', total: { $sum: 1 } } }
  ]);
  return Object.fromEntries(rows.map(row => [row._id, row.total]));
}

// Vitrinde aynı fotoğraf iki kez görünmesin; fotoğrafsız talepler bundan etkilenmez.
function uniqueByPhoto(requests, limit) {
  const seen = new Set();
  const result = [];
  for (const request of requests) {
    const photo = request.images && request.images[0];
    if (photo && seen.has(photo)) continue;
    if (photo) seen.add(photo);
    result.push(request);
    if (result.length === limit) break;
  }
  return result;
}

// Kategoride verilen tekliflerin ortalaması; az veri varsa gösterilmez.
async function categoryAverages(category) {
  const requests = await Request.find({ category }).select('_id').lean();
  const [row] = await Bid.aggregate([
    { $match: { request: { $in: requests.map(r => r._id) } } },
    { $group: { _id: null, amount: { $avg: '$amount' }, days: { $avg: '$deliveryTime' }, total: { $sum: 1 } } }
  ]);
  if (!row || row.total < 3) return null;
  return { amount: Math.round(row.amount / 100) * 100, days: Math.round(row.days), total: row.total };
}

// Firma sayfası istatistikleri
async function companyStats(companyId) {
  const bids = await Bid.find({ company: companyId }).select('status deliveryTime request').lean();
  const accepted = bids.filter(bid => bid.status === 'accepted');
  const decided = bids.filter(bid => bid.status !== 'pending').length;
  const completed = await Request.countDocuments({
    _id: { $in: accepted.map(bid => bid.request) },
    status: 'completed'
  });
  return {
    bidTotal: bids.length,
    accepted: accepted.length,
    completed,
    acceptRate: decided ? Math.round((accepted.length / decided) * 100) : null,
    avgDays: bids.length ? Math.round(bids.reduce((sum, bid) => sum + bid.deliveryTime, 0) / bids.length) : null
  };
}

module.exports = { openCountsByCategory, uniqueByPhoto, categoryAverages, companyStats };
