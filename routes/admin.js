const express = require('express');
const mongoose = require('mongoose');
const PLANS = require('../config/plans');
const router = express.Router();
const User = require('../models/User');
const Request = require('../models/Request');
const Bid = require('../models/Bid');
const Report = require('../models/Report');
const CompanyReport = require('../models/CompanyReport');
const Message = require('../models/Message');
const Review = require('../models/Review');
const ContactMessage = require('../models/ContactMessage');
const Ad = require('../models/Ad');
const { isAdmin } = require('../middleware/auth');
const { str, searchPattern } = require('../lib/input');
const { notify } = require('../lib/notify');
const { recalcCompanyRating } = require('../lib/deals');
const { uploadLogo, deleteImages } = require('../middleware/upload');
const { invalidate, flushImpressions, isSafeAdUrl } = require('../lib/ad-store');
const { parseDateInput } = require('../lib/helpers');
const { removeDemoData, markDemoRemoved } = require('../config/demo');

router.use(isAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;

// Sayfalı liste: toplamı sayar, istenen sayfanın sınırlarını döndürür.
async function paginate(model, filter, req) {
  const total = await model.countDocuments(filter);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), totalPages);
  return { total, totalPages, page, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE };
}

// Genel görünüm ve şikayetler
router.get('/', async (req, res, next) => {
  try {
    const dayAgo = new Date(Date.now() - DAY_MS);
    const [users, companies, requests, openRequests, newRequests, bids, messages, newContacts, reports, companyReports] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'company' }),
      Request.countDocuments(),
      Request.countDocuments({ status: 'open' }),
      Request.countDocuments({ createdAt: { $gte: dayAgo } }),
      Bid.countDocuments(),
      Message.countDocuments(),
      ContactMessage.countDocuments({ status: 'open' }),
      Report.find({ status: 'open' })
        .populate('request', 'no title status')
        .populate('reporter', 'name email')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      CompanyReport.find({ status: 'open' })
        .populate('company', 'name companyName')
        .populate('reporter', 'name email')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    ]);

    res.render('admin/index', {
      title: 'Yönetim',
      section: 'overview',
      counts: { users, companies, requests, openRequests, newRequests, bids, messages, newContacts },
      reports: reports.filter(report => report.request && report.reporter),
      companyReports: companyReports.filter(report => report.company && report.reporter),
      // İstek sınırlarının kişi başına çalıştığını doğrulamak için: bu adres yöneticinin kendi IP'si olmalı.
      clientIp: req.ip,
      proxyHops: (req.get('x-forwarded-for') || '').split(',').filter(Boolean).length
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

router.post('/company-reports/:id/resolve', async (req, res, next) => {
  try {
    await CompanyReport.updateOne({ _id: req.params.id }, { status: 'resolved' });
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
    const status = ['open', 'in_progress', 'completed', 'cancelled', 'removed'].includes(req.query.status) ? req.query.status : '';
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [{ title: { $regex: searchPattern(search), $options: 'i' } }];
      if (/^\d{6,}$/.test(search)) filter.$or.push({ no: Number(search) });
    }
    const pager = await paginate(Request, filter, req);
    const requests = await Request.find(filter)
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .skip(pager.skip)
      .limit(pager.limit)
      .lean();
    res.render('admin/requests', {
      title: 'Talepler',
      section: 'requests',
      requests,
      search,
      status,
      pager,
      pagerBase: '/admin/requests',
      pageQuery: new URLSearchParams({ ...(search && { search }), ...(status && { status }) }).toString()
    });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:id/remove', async (req, res, next) => {
  try {
    const request = mongoose.isValidObjectId(req.params.id) ? await Request.findById(req.params.id) : null;
    if (!request) return res.redirect('/admin/requests');

    // Geri alındığında önceki duruma dönülür; işlemdeki talep yanlışlıkla açık hale gelmez.
    if (request.status !== 'removed') {
      request.previousStatus = request.status;
      request.status = 'removed';
      await request.save();
    }
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

    request.status = request.previousStatus || 'open';
    request.previousStatus = undefined;
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
    const pager = await paginate(User, filter, req);
    const users = await User.find(filter)
      .select('name email role companyName verified suspended isAdmin emailVerified createdAt plan')
      .sort({ createdAt: -1 })
      .skip(pager.skip)
      .limit(pager.limit)
      .lean();
    res.render('admin/users', {
      title: 'Kullanıcılar',
      section: 'users',
      users,
      search,
      plans: Object.values(PLANS),
      pager,
      pagerBase: '/admin/users',
      pageQuery: search ? new URLSearchParams({ search }).toString() : ''
    });
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

    // Askıdaki kullanıcının açık talepleri listeden kalkar, askı bitince geri döner.
    await (user.suspended
      ? Request.updateMany({ customer: user._id, status: 'open' }, { status: 'removed', previousStatus: 'open' })
      : Request.updateMany({ customer: user._id, status: 'removed', previousStatus: 'open' }, { status: 'open', $unset: { previousStatus: 1 } }));

    req.flash('success', user.suspended ? 'Hesap askıya alındı.' : 'Hesap yeniden açıldı.');
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

// Firma paketi: ödeme sitede alınmadığı için paketi yönetici açar.
router.post('/users/:id/plan', async (req, res, next) => {
  try {
    const user = mongoose.isValidObjectId(req.params.id) ? await User.findById(req.params.id) : null;
    const plan = PLANS[req.body.plan];
    if (!user || user.role !== 'company' || !plan) {
      req.flash('error', 'Paket değiştirilemedi.');
      return res.redirect('/admin/users');
    }
    if (user.plan !== plan.key) {
      user.plan = plan.key;
      await user.save();
      await notify(user._id, `Firmanızın paketi ${plan.name} oldu.`, '/dashboard/plans');
    }
    req.flash('success', `${user.companyName || user.name}: ${plan.name} paketi.`);
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

// Yorumlar: uygunsuz yorum gizlenir, firmanın puanı yeniden hesaplanır.
router.get('/reviews', async (req, res, next) => {
  try {
    const pager = await paginate(Review, {}, req);
    const reviews = await Review.find()
      .populate('customer', 'name')
      .populate('company', 'name companyName')
      .populate('request', 'title')
      .sort({ createdAt: -1 })
      .skip(pager.skip)
      .limit(pager.limit)
      .lean();
    res.render('admin/reviews', { title: 'Yorumlar', section: 'reviews', reviews, pager, pagerBase: '/admin/reviews', pageQuery: '' });
  } catch (err) {
    next(err);
  }
});

router.post('/reviews/:id/toggle', async (req, res, next) => {
  try {
    const review = mongoose.isValidObjectId(req.params.id) ? await Review.findById(req.params.id) : null;
    if (!review) return res.redirect('/admin/reviews');
    review.hidden = !review.hidden;
    await review.save();
    await recalcCompanyRating(review.company);
    req.flash('success', review.hidden ? 'Yorum gizlendi, firma puanı güncellendi.' : 'Yorum yeniden yayında.');
    res.redirect('/admin/reviews');
  } catch (err) {
    next(err);
  }
});

// İletişim formundan gelen mesajlar
router.get('/messages', async (req, res, next) => {
  try {
    const pager = await paginate(ContactMessage, {}, req);
    const contacts = await ContactMessage.find().sort({ status: -1, createdAt: -1 }).skip(pager.skip).limit(pager.limit).lean();
    res.render('admin/messages', { title: 'İletişim Mesajları', section: 'messages', contacts, pager, pagerBase: '/admin/messages', pageQuery: '' });
  } catch (err) {
    next(err);
  }
});

router.post('/messages/:id/toggle', async (req, res, next) => {
  try {
    const contact = mongoose.isValidObjectId(req.params.id) ? await ContactMessage.findById(req.params.id) : null;
    if (!contact) return res.redirect('/admin/messages');
    contact.status = contact.status === 'open' ? 'closed' : 'open';
    await contact.save();
    res.redirect('/admin/messages');
  } catch (err) {
    next(err);
  }
});

// Reklamlar
function readAdForm(req) {
  const values = {
    title: str(req.body.title),
    text: str(req.body.text),
    cta: str(req.body.cta),
    url: str(req.body.url),
    color: str(req.body.color),
    startsAt: str(req.body.startsAt),
    endsAt: str(req.body.endsAt)
  };
  const errors = {};
  if (!values.title || values.title.length > 80) errors.title = 'Başlık 1 ile 80 karakter arasında olmalı.';
  if (values.text.length > 140) errors.text = 'Metin en fazla 140 karakter olabilir.';
  if (values.cta.length > 24) errors.cta = 'Düğme yazısı en fazla 24 karakter olabilir.';
  if (!values.url || values.url.length > 500 || !isSafeAdUrl(values.url)) errors.url = 'Geçerli bir adres yazın (https://... veya /sayfa).';
  if (!['orange', 'navy', 'green', 'yellow', 'red'].includes(values.color)) errors.color = 'Renk seçin.';
  const startsAt = values.startsAt ? parseDateInput(values.startsAt) : null;
  const endsAt = values.endsAt ? parseDateInput(values.endsAt) : null;
  if (values.startsAt && !startsAt) errors.startsAt = 'Geçerli bir tarih seçin.';
  if (values.endsAt && !endsAt) errors.endsAt = 'Geçerli bir tarih seçin.';
  if (startsAt && endsAt && endsAt < startsAt) errors.endsAt = 'Bitiş, başlangıçtan önce olamaz.';
  if (req.uploadError) errors.banner = req.uploadError;

  return {
    values,
    errors,
    data: {
      title: values.title,
      text: values.text,
      cta: values.cta || 'İncele',
      url: values.url,
      color: values.color,
      // parseDateInput günün sonunu verir; başlangıç o günün başı olmalı.
      startsAt: startsAt ? new Date(startsAt.getTime() - DAY_MS + 1000) : null,
      endsAt
    }
  };
}

const renderAds = async (res, extra = {}) => {
  const ads = await Ad.find().sort({ createdAt: -1 }).lean();
  res.render('admin/ads', { title: 'Reklamlar', section: 'ads', ads, adValues: {}, ...extra });
};

router.get('/ads', async (req, res, next) => {
  try {
    await flushImpressions();
    await renderAds(res);
  } catch (err) {
    next(err);
  }
});

router.post('/ads', uploadLogo, async (req, res, next) => {
  try {
    const { values, errors, data } = readAdForm(req);
    const banner = req.file ? `/uploads/${req.file.filename}` : '';

    if (Object.keys(errors).length) {
      if (banner) deleteImages([banner]);
      res.status(422);
      return await renderAds(res, { adValues: values, errors });
    }

    await Ad.create({ ...data, banner });
    invalidate();
    req.flash('success', 'Reklam eklendi.');
    res.redirect('/admin/ads');
  } catch (err) {
    next(err);
  }
});

router.post('/ads/:id/toggle', async (req, res, next) => {
  try {
    const ad = mongoose.isValidObjectId(req.params.id) ? await Ad.findById(req.params.id) : null;
    if (!ad) return res.redirect('/admin/ads');
    ad.active = !ad.active;
    await ad.save();
    invalidate();
    res.redirect('/admin/ads');
  } catch (err) {
    next(err);
  }
});

router.post('/ads/:id/delete', async (req, res, next) => {
  try {
    const ad = mongoose.isValidObjectId(req.params.id) ? await Ad.findByIdAndDelete(req.params.id) : null;
    if (ad && ad.banner) deleteImages([ad.banner]);
    invalidate();
    req.flash('success', 'Reklam silindi.');
    res.redirect('/admin/ads');
  } catch (err) {
    next(err);
  }
});

// Örnek verileri kaldır: canlıda sunucu kabuğu olmadan da yapılabilsin diye panelden yapılır.
router.post('/demo/remove', async (req, res, next) => {
  try {
    const removed = await removeDemoData();
    await markDemoRemoved();
    req.app.locals.demoActive = false;
    req.app.locals.demoAccounts = [];

    // Yönetici örnek hesapla giriş yaptıysa hesabı artık yoktur.
    if (!(await User.exists({ _id: req.session.user.id }))) {
      return req.session.destroy(() => res.redirect('/'));
    }
    req.flash('success', `${removed.users} örnek hesap ve ${removed.requests} örnek talep silindi.`);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
