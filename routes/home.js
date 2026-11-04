const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const User = require('../models/User');
const Bid = require('../models/Bid');
const { openCountsByCategory, uniqueByPhoto } = require('../lib/stats');
const { liveFilter } = require('../lib/listing');

const DAY_MS = 24 * 60 * 60 * 1000;

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const open = liveFilter();

    const [showcase, latest, closing, counts, topCompanies, cityRows, todayCount, companyCount, bidCount, completedCount] =
      await Promise.all([
        // Vitrin: fotoğraflı ve en çok bakılan açık talepler
        Request.find({ ...open, 'images.0': { $exists: true } }).sort({ viewCount: -1 }).limit(60).lean(),
        Request.find(open).sort({ createdAt: -1 }).limit(12).lean(),
        Request.find({ status: 'open', deadline: { $gte: now } }).sort({ deadline: 1 }).limit(24).lean(),
        openCountsByCategory(),
        User.find({ role: 'company', ratingCount: { $gt: 0 }, suspended: { $ne: true } })
          .select('name companyName rating ratingCount verified')
          .sort({ rating: -1, ratingCount: -1 })
          .limit(6)
          .lean(),
        Request.aggregate([
          { $match: { ...open, city: { $exists: true, $ne: null } } },
          { $group: { _id: '$city', total: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 12 }
        ]),
        Request.countDocuments({ ...open, createdAt: { $gte: new Date(now.getTime() - DAY_MS) } }),
        User.countDocuments({ role: 'company' }),
        Bid.countDocuments(),
        Request.countDocuments({ status: 'completed' })
      ]);

    res.render('home', {
      title: '',
      showcase: uniqueByPhoto(showcase, 20),
      latest,
      closing: uniqueByPhoto(closing, 8),
      counts,
      topCompanies,
      cityRows,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      stats: { todayCount, companyCount, bidCount, completedCount }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
