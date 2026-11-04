const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const Request = require('../models/Request');
const Bid = require('../models/Bid');
const Report = require('../models/Report');
const Message = require('../models/Message');
const { isAdmin } = require('../middleware/auth');
const { str, searchPattern } = require('../lib/input');
const { notify } = require('../lib/notify');

router.use(isAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

// Genel görünüm ve şikayetler
router.get('/', async (req, res, next) => {
  try {
    const dayAgo = new Date(Date.now() - DAY_MS);
    const [users, companies, requests, openRequests, newRequests, bids, messages, reports] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'company' }),
      Request.countDocuments(),
      Request.countDocuments({ status: 'open' }),
      Request.countDocuments({ createdAt: { $gte: dayAgo } }),
      Bid.countDocuments(),
      Message.countDocuments(),
      Report.find({ status: 'open' })
        .populate('request', 'no title status')
        .populate('reporter', 'name email')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    ]);

    res.render('admin/index', {
      title: 'Yönetim',
      section: 'overview',
      counts: { users, companies, requests, openRequests, newRequests, bids, messages },
      reports: reports.filter(report => report.request && report.reporter)
    });
  } catch (err) {
    next(err);
  }
});

// Şikayeti kapat
router.post('/reports/:id/resolve', async (req, res, next) => {
  try {
    await Report.updateOne({ _id: req.params.id }, { status: 'resolved' });
    req.flash('success', 'Şikayet kapatıldı.');
    res.redirect('/admin');
  } catch (err) {
    if (err.name === 'CastError') return res.redirect('/admin');
    next(err);
  }
});

// Talepler
router.get('/requests', async (req, res, next) => {
  try {
    const search = str(req.query.search);
    const filter = {};
    if (search) {
      filter.$or = [{ title: { $regex: searchPattern(search), $options: 'i' } }];
      if (/^\d{6,}$/.test(search)) filter.$or.push({ no: Number(search) });
    }
    const requests = await Request.find(filter)
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.render('admin/requests', { title: 'Talepler', section: 'requests', requests, search });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/remove', async (req, res, next) => {
  try {
    const request = mongoose.isValidObjectId(req.params.id) ? await Request.findById(req.params.id) : null;
    if (!request) return res.redirect('/admin/requests');

    request.status = 'removed';
    await request.save();
    await Report.updateMany({ request: request._id, status: 'open' }, { status: 'resolved' });
    await notify(request.customer, `"${request.title}" talebiniz yönetici tarafından yayından kaldırıldı.`, '/dashboard');

    req.flash('success', 'Talep yayından kaldırıldı.');
    res.redirect(str(req.body.back) === 'reports' ? '/admin' : '/admin/requests');
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/restore', async (req, res, next) => {
  try {
    const request = mongoose.isValidObjectId(req.params.id) ? await Request.findById(req.params.id) : null;
    if (!request || request.status !== 'removed') return res.redirect('/admin/requests');

    request.status = 'open';
    await request.save();
    await notify(request.customer, `"${request.title}" talebiniz yeniden yayına alındı.`, '/requests/' + request._id);

    req.flash('success', 'Talep yeniden yayına alındı.');
    res.redirect('/admin/requests');
  } catch (err) {
    next(err);
  }
});

// Kullanıcılar
router.get('/users', async (req, res, next) => {
  try {
    const search = str(req.query.search);
    const filter = {};
    if (search) {
      const pattern = { $regex: searchPattern(search), $options: 'i' };
      filter.$or = [{ name: pattern }, { email: pattern }, { companyName: pattern }];
    }
    const users = await User.find(filter)
      .select('name email role companyName verified suspended isAdmin createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.render('admin/users', { title: 'Kullanıcılar', section: 'users', users, search });
  } catch (err) {
    next(err);
  }
});

// Askıya al / kaldır; yöneticilere ve kendine uygulanmaz.
router.post('/users/:id/suspend', async (req, res, next) => {
  try {
    const user = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
    if (!user || user.isAdmin) {
      req.flash('error', 'Bu kullanıcı askıya alınamaz.');
      return res.redirect('/admin/users');
    }
    user.suspended = !user.suspended;
    await user.save();
    req.flash('success', user.suspended ? 'Hesap askıya alındı.' : 'Hesap yeniden açıldı.');
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Onaylı firma rozeti
router.post('/users/:id/verify', async (req, res, next) => {
  try {
    const user = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
    if (!user || user.role !== 'company') return res.redirect('/admin/users');

    user.verified = !user.verified;
    await user.save();
    if (user.verified) await notify(user._id, 'Firmanız onaylandı, rozetiniz sayfanızda görünüyor.', `/companies/${user._id}`);

    req.flash('success', user.verified ? 'Firma onaylandı.' : 'Firma onayı kaldırıldı.');
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
