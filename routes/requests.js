const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Message = require('../models/Message');
const Report = require('../models/Report');
const Review = require('../models/Review');
const categories = require('../config/categories');
const cities = require('../config/cities');
const { isCustomer, isLoggedIn } = require('../middleware/auth');
const { uploadImages, deleteImages, copyImages, MAX_IMAGES } = require('../middleware/upload');
const { str, safeNext, searchPattern } = require('../lib/input');
const { openCountsByCategory, uniqueByPhoto, categoryAverages } = require('../lib/stats');
const { SORT_OPTIONS, liveFilter, readFilters, buildConditions, filtersToQuery } = require('../lib/listing');
const { notifyMany } = require('../lib/notify');
const { REPORT_REASONS } = Report;

const PAGE_SIZE = 20;

const uploadedPaths = req => (req.files || []).map(file => '/uploads/' + file.filename);

// Talep formunu okur ve doğrular.
function parseRequestForm(req) {
  const values = {
    title: str(req.body.title),
    description: str(req.body.description),
    category: str(req.body.category),
    budgetMin: str(req.body.budgetMin),
    budgetMax: str(req.body.budgetMax),
    deadline: str(req.body.deadline),
    city: str(req.body.city),
    location: str(req.body.location)
  };

  const errors = {};
  const min = Number(values.budgetMin || 0);
  const max = Number(values.budgetMax || 0);
  const deadline = values.deadline ? new Date(values.deadline) : null;

  if (!values.title) errors.title = 'Başlık yazın.';
  else if (values.title.length > 200) errors.title = 'Başlık en fazla 200 karakter olabilir.';
  if (!values.description) errors.description = 'Açıklama yazın.';
  if (!categories.names.includes(values.category)) errors.category = 'Kategori seçin.';
  if (values.city && !cities.includes(values.city)) errors.city = 'Listeden bir il seçin.';
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
    errors.budget = 'Bütçe geçerli bir tutar olmalı.';
  } else if (max > 0 && min > max) {
    errors.budget = 'En az bütçe, en fazla bütçeden büyük olamaz.';
  }
  if (deadline && Number.isNaN(deadline.getTime())) errors.deadline = 'Geçerli bir tarih seçin.';
  if (req.uploadError) errors.images = req.uploadError;

  return {
    values,
    errors,
    data: {
      title: values.title,
      description: values.description,
      category: values.category,
      budget: { min, max },
      city: values.city || undefined,
      location: values.location,
      deadline: deadline || undefined
    }
  };
}

// Tüm açık talepler
router.get('/', async (req, res, next) => {
  try {
    const filters = readFilters(req.query);
    const requestedPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const filter = buildConditions(filters);

    const [total, counts] = await Promise.all([Request.countDocuments(filter), openCountsByCategory()]);
    const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    const page = Math.min(requestedPage, totalPages);

    const requests = await Request.find(filter)
      .sort(SORT_OPTIONS[filters.sort])
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    res.render('requests/index', {
      title: filters.category === 'all' ? 'Talepler' : filters.category,
      requests,
      filters,
      savedQuery: filtersToQuery(filters),
      counts,
      total,
      page,
      totalPages
    });
  } catch (err) {
    next(err);
  }
});

// Arama kutusu için öneriler
router.get('/suggest', async (req, res, next) => {
  try {
    const q = str(req.query.q);
    if (q.length < 2) return res.json({ items: [] });

    const pattern = searchPattern(q);
    const matches = await Request.find({ ...liveFilter(), title: { $regex: pattern, $options: 'i' } })
      .select('title no')
      .sort({ viewCount: -1 })
      .limit(6)
      .lean();
    const matcher = new RegExp(pattern, 'i');

    res.json({
      items: [
        ...categories.names.filter(name => matcher.test(name)).slice(0, 3).map(name => ({
          label: name,
          hint: 'Kategori',
          url: `/requests?category=${encodeURIComponent(name)}`
        })),
        ...matches.map(item => ({ label: item.title, hint: `No: ${item.no}`, url: `/requests/${item._id}` }))
      ]
    });
  } catch (err) {
    next(err);
  }
});

// Yeni talep formu
router.get('/new', isCustomer, (req, res) => {
  res.render('requests/new', { title: 'Talep Ver', categories, maxImages: MAX_IMAGES });
});

// Yeni talep oluştur
router.post('/', isCustomer, uploadImages, async (req, res, next) => {
  try {
    const { values, errors, data } = parseRequestForm(req);

    if (Object.keys(errors).length) {
      deleteImages(uploadedPaths(req));
      return res.status(422).render('requests/new', {
        title: 'Talep Ver',
        categories,
        maxImages: MAX_IMAGES,
        values,
        errors
      });
    }

    const created = await Request.create({
      ...data,
      customer: req.session.user.id,
      images: uploadedPaths(req)
    });

    // Bu kategoride hizmet veren firmalara haber ver.
    const firms = await User.find({ role: 'company', suspended: false, categories: created.category })
      .select('_id')
      .limit(200)
      .lean();
    await notifyMany(
      firms.map(firm => firm._id),
      `${created.category} kategorisinde yeni talep: "${created.title}"`,
      '/requests/' + created._id
    );

    req.flash('success', `Talebiniz yayınlandı. Talep No: ${created.no}`);
    res.redirect('/requests/' + created._id);
  } catch (err) {
    next(err);
  }
});

// Favorilere ekle / çıkar
router.post('/:id/favorite', isLoggedIn, async (req, res, next) => {
  try {
    const exists = await Request.exists({ _id: req.params.id });
    if (!exists) {
      req.flash('error', 'Talep bulunamadı.');
      return res.redirect('/requests');
    }

    const favorites = req.session.user.favorites || [];
    const isFavorite = favorites.includes(req.params.id);

    await User.updateOne(
      { _id: req.session.user.id },
      isFavorite ? { $pull: { favorites: req.params.id } } : { $addToSet: { favorites: req.params.id } }
    );
    req.session.user.favorites = isFavorite
      ? favorites.filter(id => id !== req.params.id)
      : [...favorites, req.params.id];

    if ((req.get('accept') || '').includes('application/json')) {
      return res.json({ favorite: !isFavorite });
    }
    res.redirect(safeNext(req.body.next) || '/requests/' + req.params.id);
  } catch (err) {
    if (err.name === 'CastError') return res.redirect('/requests');
    next(err);
  }
});

// Talebi şikayet et
router.post('/:id/report', isLoggedIn, async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id).select('customer');
    if (!request) {
      req.flash('error', 'Talep bulunamadı.');
      return res.redirect('/requests');
    }
    const backToRequest = '/requests/' + request._id;

    if (request.customer.toString() === req.session.user.id) {
      req.flash('error', 'Kendi talebinizi şikayet edemezsiniz.');
      return res.redirect(backToRequest);
    }
    if (!REPORT_REASONS.includes(req.body.reason)) {
      req.flash('error', 'Bir şikayet nedeni seçin.');
      return res.redirect(backToRequest);
    }

    await Report.create({
      request: request._id,
      reporter: req.session.user.id,
      reason: req.body.reason,
      note: str(req.body.note).slice(0, 500)
    });

    req.flash('success', 'Şikayetiniz alındı, teşekkürler.');
    res.redirect(backToRequest);
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'Bu talebi daha önce şikayet ettiniz.');
      return res.redirect('/requests/' + req.params.id);
    }
    if (err.name === 'CastError') return res.redirect('/requests');
    next(err);
  }
});

// Talep detayı
router.get('/:id', async (req, res, next) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('customer', 'name email phone createdAt')
      .lean();

    if (!request) {
      req.flash('error', 'Talep bulunamadı.');
      return res.redirect('/requests');
    }

    const viewer = req.session.user;
    const isOwner = Boolean(viewer && viewer.id === request.customer._id.toString());

    // Yönetici tarafından kaldırılan talebi yalnızca sahibi ve yöneticiler görür.
    if (request.status === 'removed' && !isOwner && !(viewer && viewer.isAdmin)) {
      req.flash('error', 'Bu talep yayından kaldırılmış.');
      return res.redirect('/requests');
    }

    if (!isOwner) {
      await Request.updateOne({ _id: request._id }, { $inc: { viewCount: 1 } });
      request.viewCount += 1;
    }

    const bidSort = ['amount', 'days', 'rating'].includes(req.query.bidSort) ? req.query.bidSort : 'amount';
    const bids = (
      await Bid.find({ request: request._id })
        .populate('company', 'name companyName rating ratingCount email phone verified')
        .sort({ amount: 1, createdAt: 1 })
        .lean()
    ).filter(bid => bid.company);

    if (bidSort === 'days') bids.sort((a, b) => a.deliveryTime - b.deliveryTime);
    if (bidSort === 'rating') bids.sort((a, b) => b.company.rating - a.company.rating);

    const userBid =
      viewer && viewer.role === 'company'
        ? bids.find(bid => bid.company._id.toString() === viewer.id)
        : null;

    // İletişim bilgileri yalnızca teklif kabul edildikten sonra iki tarafa da gösterilir.
    const acceptedBid = bids.find(bid => bid.status === 'accepted');
    let contact = null;
    if (acceptedBid && isOwner) {
      contact = {
        name: acceptedBid.company.companyName || acceptedBid.company.name,
        email: acceptedBid.company.email,
        phone: acceptedBid.company.phone
      };
    } else if (userBid && userBid.status === 'accepted') {
      contact = {
        name: request.customer.name,
        email: request.customer.email,
        phone: request.customer.phone
      };
    }

    const pendingAmounts = bids.filter(bid => bid.status === 'pending').map(bid => bid.amount);

    const [similarAll, ownerOpenCount, averages, review, alreadyReported] = await Promise.all([
      Request.find({ ...liveFilter(), category: request.category, _id: { $ne: request._id } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Request.countDocuments({ ...liveFilter(), customer: request.customer._id }),
      categoryAverages(request.category),
      Review.findOne({ request: request._id }).lean(),
      viewer ? Report.exists({ request: request._id, reporter: viewer.id }) : null
    ]);

    res.render('requests/show', {
      title: request.title,
      metaDescription: request.description.slice(0, 155),
      ogImage: request.images && request.images[0],
      request,
      bids,
      bidSort,
      userBid,
      isOwner,
      contact,
      averages,
      review,
      alreadyReported: Boolean(alreadyReported),
      reportReasons: REPORT_REASONS,
      similar: uniqueByPhoto(
        similarAll.filter(item => !item.images[0] || item.images[0] !== request.images[0]),
        5
      ),
      ownerOpenCount,
      lowestAmount: pendingAmounts.length > 1 ? Math.min(...pendingAmounts) : null
    });
  } catch (err) {
    if (err.name === 'CastError') {
      req.flash('error', 'Talep bulunamadı.');
      return res.redirect('/requests');
    }
    next(err);
  }
});

// Sahibinin talebini getirir; değilse uyarıp yönlendirir.
async function loadOwnRequest(req, res) {
  let request = null;
  try {
    request = await Request.findById(req.params.id);
  } catch (err) {
    if (err.name !== 'CastError') throw err;
  }

  if (!request) {
    req.flash('error', 'Talep bulunamadı.');
    res.redirect('/requests');
    return null;
  }
  if (request.customer.toString() !== req.session.user.id) {
    req.flash('error', 'Bu talep üzerinde işlem yapma yetkiniz yok.');
    res.redirect('/requests/' + request._id);
    return null;
  }
  return request;
}

async function loadOwnOpenRequest(req, res) {
  const request = await loadOwnRequest(req, res);
  if (request && request.status !== 'open') {
    req.flash('error', 'Yalnızca açık talepler değiştirilebilir.');
    res.redirect('/requests/' + request._id);
    return null;
  }
  return request;
}

// Düzenleme formu
router.get('/:id/edit', isCustomer, async (req, res, next) => {
  try {
    const request = await loadOwnOpenRequest(req, res);
    if (!request) return;

    res.render('requests/edit', {
      title: 'Talebi Düzenle',
      request: request.toObject(),
      categories,
      maxImages: MAX_IMAGES
    });
  } catch (err) {
    next(err);
  }
});

// Talep güncelle
router.put('/:id', isCustomer, uploadImages, async (req, res, next) => {
  try {
    const request = await loadOwnOpenRequest(req, res);
    if (!request) {
      deleteImages(uploadedPaths(req));
      return;
    }

    const { values, errors, data } = parseRequestForm(req);

    const removeList = [].concat(req.body.removeImages || []);
    const removed = request.images.filter(image => removeList.includes(image));
    const kept = request.images.filter(image => !removeList.includes(image));
    const added = uploadedPaths(req);

    if (!errors.images && kept.length + added.length > MAX_IMAGES) {
      errors.images = `Bir talepte en fazla ${MAX_IMAGES} görsel olabilir.`;
    }

    if (Object.keys(errors).length) {
      deleteImages(added);
      return res.status(422).render('requests/edit', {
        title: 'Talebi Düzenle',
        request: request.toObject(),
        categories,
        maxImages: MAX_IMAGES,
        values,
        errors
      });
    }

    Object.assign(request, data, { images: [...kept, ...added] });
    await request.save();
    deleteImages(removed);

    req.flash('success', 'Talebiniz güncellendi.');
    res.redirect('/requests/' + request._id);
  } catch (err) {
    next(err);
  }
});

// Talebi kapat: yayından çıkar, bekleyen teklifleri reddeder.
router.post('/:id/close', isCustomer, async (req, res, next) => {
  try {
    const request = await loadOwnOpenRequest(req, res);
    if (!request) return;

    const pending = await Bid.find({ request: request._id, status: 'pending' }).select('company');
    await Bid.updateMany({ request: request._id, status: 'pending' }, { status: 'rejected' });
    request.status = 'cancelled';
    await request.save();

    await notifyMany(
      pending.map(bid => bid.company),
      `"${request.title}" talebi sahibi tarafından kapatıldı.`,
      '/requests/' + request._id
    );

    req.flash('success', 'Talebiniz kapatıldı.');
    res.redirect('/requests/' + request._id);
  } catch (err) {
    next(err);
  }
});

// Kapanmış veya biten talebi yeni bir talep olarak yeniden yayınla
router.post('/:id/republish', isCustomer, async (req, res, next) => {
  try {
    const request = await loadOwnRequest(req, res);
    if (!request) return;

    if (!['completed', 'cancelled'].includes(request.status)) {
      req.flash('error', 'Yalnızca kapanmış veya tamamlanmış talepler yeniden yayınlanabilir.');
      return res.redirect('/requests/' + request._id);
    }

    const copy = await Request.create({
      title: request.title,
      description: request.description,
      category: request.category,
      budget: request.budget,
      city: request.city,
      location: request.location,
      images: await copyImages(request.images),
      customer: request.customer
    });

    req.flash('success', 'Talebiniz yeniden yayınlandı. Son tarih ve bilgileri güncelleyebilirsiniz.');
    res.redirect(`/requests/${copy._id}/edit`);
  } catch (err) {
    next(err);
  }
});

// Talep sil
router.delete('/:id', isCustomer, async (req, res, next) => {
  try {
    const request = await loadOwnOpenRequest(req, res);
    if (!request) return;

    const pending = await Bid.find({ request: request._id }).select('company');
    await Bid.deleteMany({ request: request._id });
    await Message.deleteMany({ request: request._id });
    await Report.deleteMany({ request: request._id });
    await User.updateMany({ favorites: request._id }, { $pull: { favorites: request._id } });
    await request.deleteOne();
    deleteImages(request.images);

    await notifyMany(pending.map(bid => bid.company), `Teklif verdiğiniz "${request.title}" talebi silindi.`, '/dashboard');

    req.flash('success', 'Talep silindi.');
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
