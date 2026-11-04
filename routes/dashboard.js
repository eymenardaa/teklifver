const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const Bid = require('../models/Bid');
const User = require('../models/User');
const SavedSearch = require('../models/SavedSearch');
const { isLoggedIn, isCompany } = require('../middleware/auth');
const { str } = require('../lib/input');
const { liveFilter, readFilters, buildConditions, filtersToQuery, describeFilters } = require('../lib/listing');

const MAX_SAVED_SEARCHES = 20;

router.get('/', isLoggedIn, async (req, res, next) => {
  try {
    const user = req.session.user;

    if (user.role === 'customer') {
      const myRequests = await Request.find({ customer: user.id }).sort({ createdAt: -1 }).lean();

      const bids = await Bid.find({ request: { $in: myRequests.map(r => r._id) } })
        .select('request status amount')
        .sort({ amount: 1 })
        .lean();

      for (const request of myRequests) {
        request.bids = bids.filter(bid => bid.request.equals(request._id));
      }

      return res.render('dashboard/customer', {
        title: 'Taleplerim',
        section: 'requests',
        myRequests,
        stats: {
          openRequests: myRequests.filter(r => r.status === 'open').length,
          inProgressRequests: myRequests.filter(r => r.status === 'in_progress').length,
          completedRequests: myRequests.filter(r => r.status === 'completed').length,
          pendingBids: bids.filter(b => b.status === 'pending').length
        }
      });
    }

    const myBids = await Bid.find({ company: user.id })
      .populate({ path: 'request', populate: { path: 'customer', select: 'name' } })
      .sort({ createdAt: -1 })
      .lean();

    res.render('dashboard/company', {
      title: 'Tekliflerim',
      section: 'bids',
      myBids,
      stats: {
        pendingBids: myBids.filter(b => b.status === 'pending').length,
        acceptedBids: myBids.filter(b => b.status === 'accepted').length,
        rejectedBids: myBids.filter(b => b.status === 'rejected').length,
        totalEarnings: myBids.filter(b => b.status === 'accepted').reduce((sum, b) => sum + b.amount, 0)
      }
    });
  } catch (err) {
    next(err);
  }
});

// Firmanın hizmet kategorilerine uyan, henüz teklif vermediği talepler
router.get('/matches', isCompany, async (req, res, next) => {
  try {
    const me = await User.findById(req.session.user.id).select('categories').lean();
    const categories = (me && me.categories) || [];
    const myBids = await Bid.find({ company: req.session.user.id }).select('request').lean();

    const requests = categories.length
      ? await Request.find({
          ...liveFilter(),
          category: { $in: categories },
          _id: { $nin: myBids.map(bid => bid.request) }
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      : [];

    res.render('dashboard/matches', {
      title: 'Size Uygun Talepler',
      section: 'matches',
      requests,
      hasCategories: categories.length > 0
    });
  } catch (err) {
    next(err);
  }
});

router.get('/favorites', isLoggedIn, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user.id).select('favorites').lean();
    const requests = await Request.find({
      _id: { $in: (user && user.favorites) || [] },
      status: { $ne: 'removed' }
    })
      .sort({ createdAt: -1 })
      .lean();

    res.render('dashboard/favorites', { title: 'Favorilerim', section: 'favorites', requests });
  } catch (err) {
    next(err);
  }
});

// ---- Kayıtlı aramalar ----

router.get('/searches', isLoggedIn, async (req, res, next) => {
  try {
    const searches = await SavedSearch.find({ user: req.session.user.id }).sort({ createdAt: -1 }).lean();

    for (const search of searches) {
      const filters = readFilters(Object.fromEntries(new URLSearchParams(search.query)));
      const filter = buildConditions(filters);
      search.total = await Request.countDocuments(filter);
      search.fresh = await Request.countDocuments({
        $and: [filter, { createdAt: { $gt: search.lastSeenAt } }]
      });
    }

    res.render('dashboard/searches', { title: 'Kayıtlı Aramalarım', section: 'searches', searches });
  } catch (err) {
    next(err);
  }
});

router.post('/searches', isLoggedIn, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const filters = readFilters(Object.fromEntries(new URLSearchParams(str(req.body.query))));
    const query = filtersToQuery(filters);

    if (!query) {
      req.flash('error', 'Kaydetmek için önce bir filtre veya arama seçin.');
      return res.redirect('/requests');
    }
    if ((await SavedSearch.countDocuments({ user: userId })) >= MAX_SAVED_SEARCHES) {
      req.flash('error', `En fazla ${MAX_SAVED_SEARCHES} arama kaydedebilirsiniz.`);
      return res.redirect('/dashboard/searches');
    }
    if (await SavedSearch.exists({ user: userId, query })) {
      req.flash('error', 'Bu aramayı zaten kaydettiniz.');
      return res.redirect('/dashboard/searches');
    }

    await SavedSearch.create({ user: userId, query, name: describeFilters(filters) });
    req.flash('success', 'Arama kaydedildi. Yeni talepleri buradan takip edebilirsiniz.');
    res.redirect('/dashboard/searches');
  } catch (err) {
    next(err);
  }
});

// Aramayı aç: yeni sayacını sıfırlar
router.get('/searches/:id/open', isLoggedIn, async (req, res, next) => {
  try {
    const search = await SavedSearch.findOneAndUpdate(
      { _id: req.params.id, user: req.session.user.id },
      { lastSeenAt: new Date() }
    );
    if (!search) return res.redirect('/dashboard/searches');
    res.redirect('/requests?' + search.query);
  } catch (err) {
    if (err.name === 'CastError') return res.redirect('/dashboard/searches');
    next(err);
  }
});

router.post('/searches/:id/delete', isLoggedIn, async (req, res, next) => {
  try {
    await SavedSearch.deleteOne({ _id: req.params.id, user: req.session.user.id });
    req.flash('success', 'Kayıtlı arama silindi.');
    res.redirect('/dashboard/searches');
  } catch (err) {
    if (err.name === 'CastError') return res.redirect('/dashboard/searches');
    next(err);
  }
});

module.exports = router;
