const Bid = require('../models/Bid');
const { matchesText } = require('../public/js/search-terms');

// Ana sayfadaki fiyat panosu: sık yaptırılan işler için sitede verilen tekliflerin orta aralığı.
// Uç teklifler yanıltmasın diye en ucuz ve en pahalı dörtte birlik dilimler atılır.
const JOBS = [
  { label: 'Boya badana', search: 'boya', category: 'İnşaat & Tadilat' },
  { label: 'Evden eve nakliyat', search: 'nakliyat', category: 'Nakliye & Lojistik' },
  { label: 'Banyo yenileme', search: 'banyo', category: 'İnşaat & Tadilat' },
  { label: 'Mutfak dolabı', search: 'mutfak', category: 'İnşaat & Tadilat' },
  { label: 'Ev temizliği', search: 'temizlik', category: 'Temizlik' },
  { label: 'Koltuk yıkama', search: 'koltuk', category: 'Temizlik' },
  { label: 'Web sitesi', search: 'site', category: 'Web Tasarım' },
  { label: 'Logo tasarımı', search: 'logo', category: 'Grafik Tasarım' },
  { label: 'Özel ders', search: 'ders', category: 'Eğitim' },
  { label: 'Düğün fotoğrafı', search: 'düğün', category: 'Video & Animasyon' }
];

const MIN_BIDS = 4;
const WINDOW_DAYS = 180;
const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, rows: [] };

// Sıralı dizide yüzdelik değer (doğrusal ara değer)
function percentile(sorted, share) {
  const index = (sorted.length - 1) * share;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

// Tutarlar okunur olsun: 9.437 -> 9.500
const round = value => (value >= 10000 ? Math.round(value / 500) * 500 : Math.round(value / 100) * 100);

async function buildBoard() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const bids = await Bid.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $in: ['pending', 'accepted', 'rejected'] } } },
    { $lookup: { from: 'requests', localField: 'request', foreignField: '_id', as: 'target' } },
    { $unwind: '$target' },
    { $match: { 'target.status': { $ne: 'removed' } } },
    { $project: { amount: 1, title: '$target.title', category: '$target.category' } }
  ]);

  return JOBS.map(job => {
    const amounts = bids
      .filter(bid => bid.category === job.category && matchesText(job.search, [bid.title]))
      .map(bid => bid.amount)
      .sort((a, b) => a - b);
    if (amounts.length < MIN_BIDS) return null;
    return {
      ...job,
      low: round(percentile(amounts, 0.25)),
      high: round(percentile(amounts, 0.75)),
      count: amounts.length
    };
  }).filter(row => row && row.high > 0);
}

// Sonuç on dakika saklanır; her ana sayfa açılışında hesaplanmaz.
async function priceBoard() {
  if (Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = await buildBoard();
  cache = { at: Date.now(), rows };
  return rows;
}

const resetPriceBoard = () => { cache = { at: 0, rows: [] }; };

module.exports = { priceBoard, resetPriceBoard, JOBS };
