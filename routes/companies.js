const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const Bid = require('../models/Bid');
const Review = require('../models/Review');
const categories = require('../config/categories');
const cities = require('../config/cities');
const { str, searchPattern } = require('../lib/input');
const { companyStats } = require('../lib/stats');

// İletişim bilgileri burada gösterilmez; yalnızca kabul edilen tekliflerde paylaşılır.
const PUBLIC_FIELDS =
  'name companyName companyDescription address specialties categories rating ratingCount createdAt avatar verified';

const SORTS = {
  rating: { rating: -1, ratingCount: -1 },
  reviews: { ratingCount: -1, rating: -1 },
  newest: { createdAt: -1 }
};

router.get('/', async (req, res, next) => {
  try {
    const search = str(req.query.search);
    const city = cities.includes(req.query.city) ? req.query.city : '';
    const category = categories.names.includes(req.query.category) ? req.query.category : '';
    const minRating = ['3', '4', '4.5'].includes(req.query.minRating) ? req.query.minRating : '';
    const verified = req.query.verified === 'on';
    const sort = Object.hasOwn(SORTS, req.query.sort) ? req.query.sort : 'rating';

    const filter = { role: 'company', suspended: { $ne: true } };
    if (search) filter.companyName = { $regex: searchPattern(search), $options: 'i' };
    if (city) filter.address = city;
    if (category) filter.categories = category;
    if (minRating) filter.rating = { $gte: Number(minRating) };
    if (verified) filter.verified = true;

    const companies = await User.find(filter).select(PUBLIC_FIELDS).sort(SORTS[sort]).limit(100).lean();

    res.render('companies/index', {
      title: 'Firma Rehberi',
      companies,
      categories,
      search,
      city,
      category,
      minRating,
      verified,
      sort
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const company = mongoose.isValidObjectId(req.params.id)
      ? await User.findOne({ _id: req.params.id, role: 'company', suspended: { $ne: true } }).select(PUBLIC_FIELDS).lean()
      : null;

    if (!company) {
      req.flash('error', 'Firma bulunamadı.');
      return res.redirect('/companies');
    }

    const [wonBids, stats, reviews] = await Promise.all([
      Bid.find({ company: company._id, status: 'accepted' })
        .populate('request', 'no title category status city location images createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      companyStats(company._id),
      Review.find({ company: company._id })
        .populate('customer', 'name')
        .populate('request', 'title')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
    ]);

    res.render('companies/show', {
      title: company.companyName || company.name,
      metaDescription: (company.companyDescription || '').slice(0, 155),
      company,
      stats,
      reviews: reviews.filter(review => review.customer),
      jobs: wonBids.filter(bid => bid.request).map(bid => ({ ...bid.request, wonAmount: bid.amount }))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
