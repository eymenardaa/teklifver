const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const User = require('../models/User');
const Bid = require('../models/Bid');
const Review = require('../models/Review');
const { openCountsByCategory, uniqueByPhoto } = require('../lib/stats');
const { liveFilter } = require('../lib/listing');

const DAY_MS = 24 * 60 * 60 * 1000;

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const open = liveFilter();

    const [showcase, latest, closing, counts, topCompanies, cityRows, todayCount, companyCount, bidCount, completedCount, reviews] =
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
        Request.countDocuments({ status: 'completed' }),
        Review.find({ comment: { $nin: [null, ''] }, hidden: { $ne: true } })
          .populate('customer', 'name')
          .populate('company', 'name companyName')
          .sort({ createdAt: -1 })
          .limit(8)
          .lean()
      ]);

    res.render('home', {
      title: '',
      ownHeading: true,
      metaDescription: 'Tadilat, nakliye, temizlik, web tasarım ve daha fazlası için ücretsiz talep verin, firmalardan teklif alın. Fiyat, süre ve yorumları karşılaştırın.',
      jsonLdData: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'TeklifVer',
          url: `${res.locals.siteBase}/`,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${res.locals.siteBase}/requests?search={search_term_string}`,
            'query-input': 'required name=search_term_string'
          }
        },
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'TeklifVer',
          url: `${res.locals.siteBase}/`,
          logo: `${res.locals.siteBase}/icon-512.png`
        }
      ],
      showcase: uniqueByPhoto(showcase, 20),
      latest,
      closing: uniqueByPhoto(closing, 8),
      counts,
      topCompanies,
      cityRows,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      stats: { todayCount, companyCount, bidCount, completedCount },
      latestReviews: reviews.filter(review => review.customer && review.company).slice(0, 4)
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
