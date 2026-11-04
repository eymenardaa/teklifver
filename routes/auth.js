const express = require('express');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const Request = require('../models/Request');
const Bid = require('../models/Bid');
const Message = require('../models/Message');
const Review = require('../models/Review');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const SavedSearch = require('../models/SavedSearch');
const categories = require('../config/categories');
const { isLoggedIn } = require('../middleware/auth');
const { uploadLogo, deleteImages } = require('../middleware/upload');
const { str, isEmail, safeNext } = require('../lib/input');
const { sendMail } = require('../lib/mailer');
const { startSession } = require('../lib/session');

const MIN_PASSWORD = 8;
const RESET_TOKEN_MS = 60 * 60 * 1000; // 1 saat

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Şifre deneme saldırılarına karşı: başarılı istekler sayılmaz.
const authLimiter = view =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).render(view, {
        title: view === 'auth/login' ? 'Giriş Yap' : 'Kayıt Ol',
        next: safeNext(req.body.next),
        values: { ...req.body, password: '' },
        errors: { form: 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' }
      })
  });

// E-posta bombardımanını önlemek için başarılı istekler de sayılır.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('auth/forgot', {
      title: 'Şifremi Unuttum',
      errors: { form: 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.' }
    })
});

const renderProfile = (res, profile, extra = {}) =>
  res.render('auth/profile', { title: 'Hesabım', section: 'profile', categories, profile, ...extra });

// ---- Kayıt ----

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/register', {
    title: 'Kayıt Ol',
    next: safeNext(req.query.next),
    values: { role: req.query.role === 'company' ? 'company' : 'customer' }
  });
});

router.post('/register', authLimiter('auth/register'), async (req, res, next) => {
  const values = {
    role: req.body.role === 'company' ? 'company' : 'customer',
    name: str(req.body.name),
    email: str(req.body.email).toLowerCase(),
    companyName: str(req.body.companyName)
  };
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const redirectTo = safeNext(req.body.next);

  const errors = {};
  if (!values.name) errors.name = 'Adınızı yazın.';
  if (!isEmail(values.email)) errors.email = 'Geçerli bir e-posta adresi yazın.';
  if (password.length < MIN_PASSWORD) errors.password = `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
  if (values.role === 'company' && !values.companyName) errors.companyName = 'Şirket adını yazın.';
  if (req.body.terms !== 'on') errors.terms = 'Devam etmek için koşulları onaylamalısınız.';

  const fail = () =>
    res.status(422).render('auth/register', { title: 'Kayıt Ol', next: redirectTo, values, errors });

  if (Object.keys(errors).length) return fail();

  try {
    const user = await User.create({
      name: values.name,
      email: values.email,
      password,
      role: values.role,
      companyName: values.role === 'company' ? values.companyName : undefined,
      termsAcceptedAt: new Date()
    });

    await startSession(req, user, false);
    req.flash('success', `Hoş geldin, ${user.name}!`);
    res.redirect(redirectTo || '/dashboard');
  } catch (err) {
    if (err.code === 11000) {
      errors.email = 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.';
      return fail();
    }
    next(err);
  }
});

// ---- Giriş ----

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'Giriş Yap', next: safeNext(req.query.next) });
});

router.post('/login', authLimiter('auth/login'), async (req, res, next) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const redirectTo = safeNext(req.body.next);

  const fail = message =>
    res.status(401).render('auth/login', {
      title: 'Giriş Yap',
      next: redirectTo,
      values: { email },
      errors: { form: message }
    });

  try {
    const user = email && password ? await User.findOne({ email }) : null;

    if (!user || !(await user.comparePassword(password))) return fail('E-posta veya şifre hatalı.');
    if (user.suspended) return fail('Hesabınız askıya alınmıştır.');

    await startSession(req, user, req.body.remember === 'on');
    res.redirect(redirectTo || '/dashboard');
  } catch (err) {
    next(err);
  }
});

// Bir bağlantıyla kullanıcının istemeden çıkış yaptırılmaması için yalnızca POST.
router.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// ---- Şifremi unuttum ----

router.get('/forgot', (req, res) => {
  res.render('auth/forgot', { title: 'Şifremi Unuttum' });
});

router.post('/forgot', forgotLimiter, async (req, res, next) => {
  try {
    const email = str(req.body.email).toLowerCase();
    const user = isEmail(email) ? await User.findOne({ email }) : null;

    if (user && !user.suspended) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = hashToken(token);
      user.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_MS);
      await user.save();

      const link = `${req.protocol}://${req.get('host')}/reset/${token}`;
      await sendMail({
        to: user.email,
        subject: 'TeklifVer şifre sıfırlama',
        text: `Şifrenizi sıfırlamak için bağlantıyı açın (1 saat geçerlidir):\n${link}\n\nBu isteği siz yapmadıysanız bu e-postayı dikkate almayın.`
      });
    }

    // Hesabın var olup olmadığı dışarıdan anlaşılmasın diye sonuç hep aynıdır.
    req.flash('success', 'Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderildi.');
    res.redirect('/forgot');
  } catch (err) {
    next(err);
  }
});

const findByResetToken = token =>
  User.findOne({ resetTokenHash: hashToken(str(token)), resetTokenExpires: { $gt: new Date() } });

router.get('/reset/:token', async (req, res, next) => {
  try {
    const user = await findByResetToken(req.params.token);
    if (!user) {
      req.flash('error', 'Bu bağlantı geçersiz veya süresi dolmuş.');
      return res.redirect('/forgot');
    }
    res.render('auth/reset', { title: 'Yeni Şifre', token: req.params.token });
  } catch (err) {
    next(err);
  }
});

router.post('/reset/:token', async (req, res, next) => {
  try {
    const user = await findByResetToken(req.params.token);
    if (!user) {
      req.flash('error', 'Bu bağlantı geçersiz veya süresi dolmuş.');
      return res.redirect('/forgot');
    }

    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < MIN_PASSWORD) {
      return res.status(422).render('auth/reset', {
        title: 'Yeni Şifre',
        token: req.params.token,
        errors: { password: `Şifre en az ${MIN_PASSWORD} karakter olmalı.` }
      });
    }

    user.password = password;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    req.flash('success', 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.');
    res.redirect('/login');
  } catch (err) {
    next(err);
  }
});

// ---- Profil ----

router.get('/profile', isLoggedIn, async (req, res, next) => {
  try {
    const profile = await User.findById(req.session.user.id).lean();
    if (!profile) return req.session.destroy(() => res.redirect('/login'));
    renderProfile(res, profile);
  } catch (err) {
    next(err);
  }
});

router.post('/profile', isLoggedIn, async (req, res, next) => {
  try {
    const isCompany = req.session.user.role === 'company';
    const update = {
      name: str(req.body.name),
      phone: str(req.body.phone),
      address: str(req.body.address)
    };
    if (isCompany) {
      update.companyName = str(req.body.companyName);
      update.companyDescription = str(req.body.companyDescription);
      update.specialties = str(req.body.specialties)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 12);
      update.categories = [].concat(req.body.categories || []).filter(name => categories.names.includes(name));
    }

    const errors = {};
    if (!update.name) errors.name = 'Adınızı yazın.';
    if (isCompany && !update.companyName) errors.companyName = 'Şirket adını yazın.';

    const profile = await User.findById(req.session.user.id);
    if (!profile) return req.session.destroy(() => res.redirect('/login'));

    Object.assign(profile, update);
    if (Object.keys(errors).length) {
      res.status(422);
      return renderProfile(res, profile.toObject(), { errors });
    }

    await profile.save();

    req.session.user.name = profile.name;
    req.session.user.companyName = profile.companyName;
    req.flash('success', 'Bilgileriniz güncellendi.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Firma logosu
router.post('/profile/logo', isLoggedIn, uploadLogo, async (req, res, next) => {
  try {
    if (req.session.user.role !== 'company') {
      if (req.file) deleteImages(['/uploads/' + req.file.filename]);
      req.flash('error', 'Logo yalnızca firma hesaplarına eklenebilir.');
      return res.redirect('/profile');
    }
    if (req.uploadError || !req.file) {
      req.flash('error', req.uploadError || 'Bir görsel seçin.');
      return res.redirect('/profile');
    }

    const profile = await User.findById(req.session.user.id);
    deleteImages([profile.avatar]);
    profile.avatar = '/uploads/' + req.file.filename;
    await profile.save();

    req.flash('success', 'Logonuz güncellendi.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

router.post('/profile/logo/delete', isLoggedIn, async (req, res, next) => {
  try {
    const profile = await User.findById(req.session.user.id);
    deleteImages([profile.avatar]);
    profile.avatar = '';
    await profile.save();
    req.flash('success', 'Logonuz kaldırıldı.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

router.post('/profile/password', isLoggedIn, async (req, res, next) => {
  try {
    const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const updated = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    const profile = await User.findById(req.session.user.id);
    if (!profile) return req.session.destroy(() => res.redirect('/login'));

    const errors = {};
    // Sosyal girişle açılan hesapta mevcut şifre yoktur; ilk şifre doğrudan belirlenir.
    if (profile.password && !(await profile.comparePassword(current))) errors.currentPassword = 'Mevcut şifre hatalı.';
    if (updated.length < MIN_PASSWORD) errors.newPassword = `Yeni şifre en az ${MIN_PASSWORD} karakter olmalı.`;

    if (Object.keys(errors).length) {
      res.status(422);
      return renderProfile(res, profile.toObject(), { errors });
    }

    profile.password = updated;
    await profile.save();

    req.flash('success', 'Şifreniz değiştirildi.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Verilerimi indir (KVKK kapsamında)
router.get('/profile/export', isLoggedIn, async (req, res, next) => {
  try {
    const id = req.session.user.id;
    const [profile, requests, bids, messages, reviews, searches] = await Promise.all([
      User.findById(id).select('-password -resetTokenHash -resetTokenExpires').lean(),
      Request.find({ customer: id }).lean(),
      Bid.find({ company: id }).lean(),
      Message.find({ $or: [{ sender: id }, { receiver: id }] }).lean(),
      Review.find({ $or: [{ customer: id }, { company: id }] }).lean(),
      SavedSearch.find({ user: id }).lean()
    ]);

    res.set('Content-Disposition', 'attachment; filename="teklifver-verilerim.json"');
    res.json({ exportedAt: new Date(), profile, requests, bids, messages, reviews, savedSearches: searches });
  } catch (err) {
    next(err);
  }
});

// Hesabı kalıcı olarak sil
router.post('/profile/delete', isLoggedIn, async (req, res, next) => {
  try {
    const id = req.session.user.id;
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const profile = await User.findById(id);
    if (!profile) return req.session.destroy(() => res.redirect('/'));

    // Şifresi olmayan hesapta onay için e-posta adresi yazılır.
    const confirmed = profile.password
      ? await profile.comparePassword(password)
      : str(req.body.confirmEmail).toLowerCase() === profile.email;
    if (!confirmed) {
      res.status(422);
      return renderProfile(res, profile.toObject(), {
        errors: { deletePassword: profile.password ? 'Şifre hatalı, hesap silinmedi.' : 'E-posta eşleşmedi, hesap silinmedi.' }
      });
    }

    const requests = await Request.find({ customer: id }).select('images');
    const requestIds = requests.map(request => request._id);

    // Silinen firmanın bekleyen teklif sayıları düşer, talepler listede doğru görünür.
    const companyBids = await Bid.find({ company: id }).select('request');
    await Request.updateMany({ _id: { $in: companyBids.map(bid => bid.request) } }, { $inc: { bidCount: -1 } });

    await Promise.all([
      Bid.deleteMany({ $or: [{ company: id }, { request: { $in: requestIds } }] }),
      Message.deleteMany({ $or: [{ sender: id }, { receiver: id }, { request: { $in: requestIds } }] }),
      Review.deleteMany({ $or: [{ customer: id }, { company: id }, { request: { $in: requestIds } }] }),
      Report.deleteMany({ $or: [{ reporter: id }, { request: { $in: requestIds } }] }),
      Notification.deleteMany({ user: id }),
      SavedSearch.deleteMany({ user: id }),
      User.updateMany({ favorites: { $in: requestIds } }, { $pull: { favorites: { $in: requestIds } } }),
      Request.deleteMany({ _id: { $in: requestIds } })
    ]);

    deleteImages(requests.flatMap(request => request.images));
    deleteImages([profile.avatar]);
    await User.deleteOne({ _id: id });

    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
