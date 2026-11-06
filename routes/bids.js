const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Bid = require('../models/Bid');
const Request = require('../models/Request');
const Review = require('../models/Review');
const User = require('../models/User');
const { isLoggedIn, isCompany, isCustomer, requireVerifiedEmail } = require('../middleware/auth');
const { str } = require('../lib/input');
const { notify, notifyMany } = require('../lib/notify');
const { isExpired } = require('../lib/helpers');
const { limits } = require('../lib/limits');
const { saveReview, cancelDeal } = require('../lib/deals');

const companyLabel = user => user.companyName || user.name;

const MAX_AMOUNT = 10000000000;
const MAX_DAYS = 3650;
const MAX_DESCRIPTION = 3000;

function readBidForm(body) {
  const amount = Number(body.amount);
  const deliveryTime = Number(body.deliveryTime);
  const description = str(body.description);
  const valid =
    amount > 0 && amount <= MAX_AMOUNT &&
    Number.isInteger(deliveryTime) && deliveryTime >= 1 && deliveryTime <= MAX_DAYS &&
    Boolean(description) && description.length <= MAX_DESCRIPTION;
  return { valid, amount, deliveryTime, description };
}

// Teklif ver
router.post('/', isCompany, requireVerifiedEmail, limits.newBid, async (req, res, next) => {
  const requestId = str(req.body.requestId);
  if (!mongoose.isValidObjectId(requestId)) {
    req.flash('error', 'Talep bulunamadı.');
    return res.redirect('/requests');
  }
  const backToRequest = '/requests/' + requestId;

  try {
    const request = await Request.findById(requestId);
    if (!request) {
      req.flash('error', 'Talep bulunamadı.');
      return res.redirect('/requests');
    }
    if (request.status !== 'open' || isExpired(request)) {
      req.flash('error', 'Bu talep artık teklif almıyor.');
      return res.redirect(backToRequest);
    }

    const companyUser = await User.findById(req.session.user.id).select('bidCredits plan');
    if (companyUser && companyUser.bidCredits !== undefined && companyUser.bidCredits <= 0) {
      req.flash('error', 'Aylık teklif verme hakkınız doldu. Lütfen paketinizi yükseltin.');
      return res.redirect('/dashboard/plans');
    }

    const form = readBidForm(req.body);
    if (!form.valid) {
      req.flash('error', 'Lütfen tutar, teslim süresi ve açıklamayı doğru girin.');
      return res.redirect(backToRequest);
    }

    await Bid.create({
      request: requestId,
      company: req.session.user.id,
      amount: form.amount,
      description: form.description,
      deliveryTime: form.deliveryTime
    });
    await Request.updateOne({ _id: requestId }, { $inc: { bidCount: 1 } });
    await User.updateOne({ _id: req.session.user.id, bidCredits: { $gt: 0 } }, { $inc: { bidCredits: -1 } });
    await notify(request.customer, `${companyLabel(req.session.user)}, "${request.title}" talebinize teklif verdi.`, backToRequest, { mail: 'bids' });

    req.flash('success', 'Teklifiniz gönderildi.');
    res.redirect(backToRequest);
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'Bu talebe zaten teklif verdiniz.');
      return res.redirect(backToRequest);
    }
    next(err);
  }
});

// Firmanın kendi bekleyen teklifini getirir.
async function loadOwnPendingBid(req, res) {
  const bid = mongoose.isValidObjectId(req.params.id)
    ? await Bid.findOne({ _id: req.params.id, company: req.session.user.id }).populate('request')
    : null;

  if (!bid || !bid.request) {
    req.flash('error', 'Teklif bulunamadı.');
    res.redirect('/dashboard');
    return null;
  }
  if (bid.status !== 'pending' || bid.request.status !== 'open') {
    req.flash('error', 'Bu teklif artık değiştirilemez.');
    res.redirect('/requests/' + bid.request._id);
    return null;
  }
  return bid;
}

// Teklifi düzenle
router.post('/:id/edit', isCompany, async (req, res, next) => {
  try {
    const bid = await loadOwnPendingBid(req, res);
    if (!bid) return;

    const companyUser = await User.findById(req.session.user.id).select('bidCredits plan');
    if (companyUser && companyUser.bidCredits !== undefined && companyUser.bidCredits <= 0) {
      req.flash('error', 'Aylık teklif verme hakkınız doldu. Lütfen paketinizi yükseltin.');
      return res.redirect('/dashboard/plans');
    }

    const form = readBidForm(req.body);
    if (!form.valid) {
      req.flash('error', 'Lütfen tutar, teslim süresi ve açıklamayı doğru girin.');
      return res.redirect('/requests/' + bid.request._id);
    }

    Object.assign(bid, { amount: form.amount, deliveryTime: form.deliveryTime, description: form.description });
    await bid.save();
    await notify(
      bid.request.customer,
      `${companyLabel(req.session.user)}, "${bid.request.title}" talebindeki teklifini güncelledi.`,
      '/requests/' + bid.request._id,
      { mail: 'bids' }
    );

    req.flash('success', 'Teklifiniz güncellendi.');
    res.redirect('/requests/' + bid.request._id);
  } catch (err) {
    next(err);
  }
});

// Teklifi geri çek
router.post('/:id/withdraw', isCompany, async (req, res, next) => {
  try {
    const bid = await loadOwnPendingBid(req, res);
    if (!bid) return;

    const requestId = bid.request._id;
    await bid.deleteOne();
    await Request.updateOne({ _id: requestId }, { $inc: { bidCount: -1 } });

    req.flash('success', 'Teklifiniz geri çekildi.');
    res.redirect('/requests/' + requestId);
  } catch (err) {
    next(err);
  }
});

// Teklifi ve sahibi olduğu talebi getirir; yetki yoksa yönlendirir.
async function loadOwnBid(req, res) {
  const bid = mongoose.isValidObjectId(req.params.id)
    ? await Bid.findById(req.params.id).populate('request')
    : null;

  if (!bid || !bid.request) {
    req.flash('error', 'Teklif bulunamadı.');
    res.redirect('/dashboard');
    return null;
  }
  if (bid.request.customer.toString() !== req.session.user.id) {
    req.flash('error', 'Bu işlem için yetkiniz yok.');
    res.redirect('/requests/' + bid.request._id);
    return null;
  }
  return bid;
}

// Teklif kabul et
router.post('/:id/accept', isCustomer, async (req, res, next) => {
  try {
    const bid = await loadOwnBid(req, res);
    if (!bid) return;
    const requestId = bid.request._id;
    const requestUrl = '/requests/' + requestId;

    // Koşullu güncelleme: bir talepte yalnızca tek teklif kabul edilebilir.
    const claimed =
      bid.status === 'pending' &&
      (await Request.findOneAndUpdate(
        { _id: requestId, status: 'open' },
        { status: 'in_progress', acceptedBid: bid._id }
      ));
    if (!claimed) {
      req.flash('error', 'Bu teklif artık kabul edilemez.');
      return res.redirect(requestUrl);
    }

    bid.status = 'accepted';
    await bid.save();

    const others = await Bid.find({ request: requestId, _id: { $ne: bid._id }, status: 'pending' }).select('company');
    await Bid.updateMany(
      { request: requestId, _id: { $ne: bid._id }, status: 'pending' },
      { status: 'rejected', autoRejected: true }
    );

    await notify(bid.company, `"${bid.request.title}" talebindeki teklifiniz kabul edildi.`, requestUrl, { mail: 'bids' });
    await notifyMany(others.map(item => item.company), `"${bid.request.title}" talebi için başka bir teklif kabul edildi.`, requestUrl, { mail: 'bids' });

    req.flash('success', 'Teklifi kabul ettiniz. İletişim bilgileri artık görünür.');
    res.redirect(requestUrl);
  } catch (err) {
    next(err);
  }
});

// Teklif reddet
router.post('/:id/reject', isCustomer, async (req, res, next) => {
  try {
    const bid = await loadOwnBid(req, res);
    if (!bid) return;
    const requestUrl = '/requests/' + bid.request._id;

    if (bid.request.status !== 'open' || bid.status !== 'pending') {
      req.flash('error', 'Bu teklif artık reddedilemez.');
      return res.redirect(requestUrl);
    }

    bid.status = 'rejected';
    await bid.save();
    await notify(bid.company, `"${bid.request.title}" talebindeki teklifiniz reddedildi.`, requestUrl, { mail: 'bids' });

    req.flash('success', 'Teklif reddedildi.');
    res.redirect(requestUrl);
  } catch (err) {
    next(err);
  }
});

// Anlaşmayı iptal et: talep sahibi veya işi alan firma yapabilir, talep yeniden açılır.
router.post('/:id/cancel', isLoggedIn, async (req, res, next) => {
  try {
    const viewer = req.session.user;
    const bid = mongoose.isValidObjectId(req.params.id) ? await Bid.findById(req.params.id).populate('request') : null;
    if (!bid || !bid.request) {
      req.flash('error', 'Teklif bulunamadı.');
      return res.redirect('/dashboard');
    }
    const requestUrl = '/requests/' + bid.request._id;
    const isOwner = bid.request.customer.toString() === viewer.id;
    const isFirm = bid.company.toString() === viewer.id;

    if (!isOwner && !isFirm) {
      req.flash('error', 'Bu işlem için yetkiniz yok.');
      return res.redirect(requestUrl);
    }

    const request = bid.status === 'accepted' ? await cancelDeal(bid) : null;
    if (!request) {
      req.flash('error', 'Bu anlaşma iptal edilemez.');
      return res.redirect(requestUrl);
    }

    await notify(
      isOwner ? bid.company : request.customer,
      isOwner
        ? `"${request.title}" talebindeki anlaşma, talep sahibi tarafından iptal edildi.`
        : `${companyLabel(viewer)}, "${request.title}" işini bıraktı. Talebiniz yeniden yayında.`,
      requestUrl,
      { mail: 'bids' }
    );

    req.flash('success', 'Anlaşma iptal edildi, talep yeniden yayında.');
    res.redirect(requestUrl);
  } catch (err) {
    next(err);
  }
});

const readRating = value => {
  const rating = parseInt(value, 10);
  return rating >= 1 && rating <= 5 ? rating : 0;
};

// İşi tamamla, firmayı puanla ve yorum yaz
router.post('/complete/:requestId', isCustomer, async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!mongoose.isValidObjectId(requestId)) {
      req.flash('error', 'Talep bulunamadı.');
      return res.redirect('/dashboard');
    }

    // Koşullu güncelleme: aynı iş iki kez tamamlanıp iki kez puanlanamaz.
    const request = await Request.findOneAndUpdate(
      { _id: requestId, customer: req.session.user.id, status: 'in_progress' },
      { status: 'completed' }
    );
    if (!request) {
      req.flash('error', 'Bu talep tamamlanamaz.');
      return res.redirect('/requests/' + requestId);
    }

    const rating = readRating(req.body.rating);
    if (rating) await saveReview(request, req.session.user.id, rating, str(req.body.comment).slice(0, 1000));

    req.flash('success', 'İş tamamlandı. Teşekkürler!');
    res.redirect('/requests/' + requestId);
  } catch (err) {
    next(err);
  }
});

// Tamamlarken puan vermeyen müşteri sonradan yorum yazabilir.
router.post('/review/:requestId', isCustomer, async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!mongoose.isValidObjectId(requestId)) return res.redirect('/dashboard');

    const request = await Request.findOne({ _id: requestId, customer: req.session.user.id, status: 'completed' });
    const rating = readRating(req.body.rating);
    if (!request || !rating) {
      req.flash('error', request ? 'Bir puan seçin.' : 'Bu talep için yorum yazılamaz.');
      return res.redirect('/requests/' + requestId);
    }
    if (await Review.exists({ request: requestId })) {
      req.flash('error', 'Bu işi zaten değerlendirdiniz.');
      return res.redirect('/requests/' + requestId);
    }

    const saved = await saveReview(request, req.session.user.id, rating, str(req.body.comment).slice(0, 1000));
    req.flash(saved ? 'success' : 'error', saved ? 'Yorumunuz yayınlandı. Teşekkürler!' : 'Firma artık sitede olmadığı için yorum yazılamıyor.');
    res.redirect('/requests/' + requestId);
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'Bu işi zaten değerlendirdiniz.');
      return res.redirect('/requests/' + req.params.requestId);
    }
    next(err);
  }
});

module.exports = router;
