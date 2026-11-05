const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
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
const { uploadLogo, uploadImages, deleteImages } = require('../middleware/upload');
const { str, isEmail, safeNext } = require('../lib/input');
const cities = require('../config/cities');
const { sendInBackground, canDeliver, verificationRequired } = require('../lib/mailer');
const { resetMail, emailChangeNotice, passwordChangedMail, CATEGORY_LABELS } = require('../lib/mail-templates');
const { sendVerification, sendVerificationCode } = require('../lib/email-verify');
const { siteUrl } = require('../lib/url');
const { startSession } = require('../lib/session');
const { limits } = require('../lib/limits');
const { recalcCompanyRating, cancelDeal } = require('../lib/deals');
const { notify } = require('../lib/notify');

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_NAME = 100;
const MAX_COMPANY_NAME = 120;
const MAX_EMAIL = 254;
// Hesap yokken de aynı sürede yanıt dönsün diye karşılaştırılan sabit özet
const DUMMY_HASH = '$2a$12$xVjut1s6W6wj8QVcwCKUyO3XqLKbUpr1fCIu8q/foVFOMwm9twMqy';
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
  res.render('auth/profile', { title: 'Hesabım', section: 'profile', categories, profile, mailLabels: CATEGORY_LABELS, ...extra });

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
  else if (values.name.length > MAX_NAME) errors.name = `Ad en fazla ${MAX_NAME} karakter olabilir.`;
  if (!isEmail(values.email) || values.email.length > MAX_EMAIL) errors.email = 'Geçerli bir e-posta adresi yazın.';
  if (password.length < MIN_PASSWORD) errors.password = `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
  else if (password.length > MAX_PASSWORD) errors.password = `Şifre en fazla ${MAX_PASSWORD} karakter olabilir.`;
  if (values.role === 'company' && !values.companyName) errors.companyName = 'Şirket adını yazın.';
  else if (values.companyName.length > MAX_COMPANY_NAME) errors.companyName = `Şirket adı en fazla ${MAX_COMPANY_NAME} karakter olabilir.`;
  // Formdaki gizli alanı yalnızca otomatik kayıt yazılımları doldurur.
  if (str(req.body.website)) errors.form = 'Kayıt tamamlanamadı.';
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

    if (canDeliver()) await sendVerification(user);
    await startSession(req, user, false);
    req.flash(
      'success',
      verificationRequired()
        ? `Hoş geldin, ${user.name}! E-postana gönderdiğimiz bağlantıyla hesabını doğrula.`
        : `Hoş geldin, ${user.name}!`
    );
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

    // Yanıt süresinden e-postanın kayıtlı olup olmadığı anlaşılmasın.
    if (!user) await bcrypt.compare(password.slice(0, MAX_PASSWORD), DUMMY_HASH);
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
    if (!canDeliver()) {
      req.flash('error', 'E-posta gönderimi şu anda kapalı. Lütfen iletişim formundan bize ulaşın.');
      return res.redirect('/forgot');
    }

    const email = str(req.body.email).toLowerCase();
    const user = isEmail(email) ? await User.findOne({ email }) : null;

    if (user && !user.suspended) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = hashToken(token);
      user.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_MS);
      await user.save();

      sendInBackground({ to: user.email, ...resetMail(`${siteUrl(req)}/reset/${token}`) });
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
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      return res.status(422).render('auth/reset', {
        title: 'Yeni Şifre',
        token: req.params.token,
        errors: { password: `Şifre ${MIN_PASSWORD} ile ${MAX_PASSWORD} karakter arasında olmalı.` }
      });
    }

    user.password = password;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    // Bağlantı e-postaya gittiği için adresin sahibi olduğu kanıtlanmıştır.
    user.emailVerified = true;
    await user.save();
    sendInBackground({ to: user.email, ...passwordChangedMail() });

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
    else if (update.name.length > MAX_NAME) errors.name = `Ad en fazla ${MAX_NAME} karakter olabilir.`;
    if (update.phone && !/^[+0-9 ()-]{7,25}$/.test(update.phone)) errors.phone = 'Geçerli bir telefon numarası yazın.';
    if (update.address.length > 200) errors.address = 'Adres en fazla 200 karakter olabilir.';
    if (isCompany) {
      if (!update.companyName) errors.companyName = 'Şirket adını yazın.';
      else if (update.companyName.length > MAX_COMPANY_NAME) errors.companyName = `Şirket adı en fazla ${MAX_COMPANY_NAME} karakter olabilir.`;
      if (update.companyDescription.length > 3000) errors.companyDescription = 'Tanıtım en fazla 3000 karakter olabilir.';
      // Firma rehberi ile göre filtrelediği için listeden seçilir.
      if (update.address && !cities.includes(update.address)) errors.address = 'Listeden bir il seçin.';
    }

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

// Firma sayfasındaki iş örnekleri
const MAX_PORTFOLIO = 8;

router.post('/profile/portfolio', isLoggedIn, uploadImages, async (req, res, next) => {
  try {
    const added = (req.files || []).map(file => '/uploads/' + file.filename);
    const profile = await User.findById(req.session.user.id);
    if (!profile || profile.role !== 'company') {
      deleteImages(added);
      req.flash('error', 'İş örnekleri yalnızca firma hesaplarına eklenebilir.');
      return res.redirect('/profile');
    }
    if (req.uploadError || !added.length) {
      req.flash('error', req.uploadError || 'Bir görsel seçin.');
      return res.redirect('/profile');
    }
    if ((profile.portfolio || []).length + added.length > MAX_PORTFOLIO) {
      deleteImages(added);
      req.flash('error', `En fazla ${MAX_PORTFOLIO} iş örneği ekleyebilirsiniz.`);
      return res.redirect('/profile');
    }

    profile.portfolio = [...(profile.portfolio || []), ...added];
    await profile.save();
    req.flash('success', 'İş örnekleri eklendi.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

router.post('/profile/portfolio/delete', isLoggedIn, async (req, res, next) => {
  try {
    const image = str(req.body.image);
    const result = await User.updateOne({ _id: req.session.user.id, portfolio: image }, { $pull: { portfolio: image } });
    if (result.modifiedCount) deleteImages([image]);
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
    if (updated.length < MIN_PASSWORD || updated.length > MAX_PASSWORD) {
      errors.newPassword = `Yeni şifre ${MIN_PASSWORD} ile ${MAX_PASSWORD} karakter arasında olmalı.`;
    }

    if (Object.keys(errors).length) {
      res.status(422);
      return renderProfile(res, profile.toObject(), { errors });
    }

    profile.password = updated;
    profile.sessionVersion = (profile.sessionVersion || 0) + 1;
    await profile.save();
    // Bu oturum açık kalır, diğer cihazlardakiler kapanır.
    req.session.user.sv = profile.sessionVersion;
    sendInBackground({ to: profile.email, ...passwordChangedMail() });

    req.flash('success', 'Şifreniz değiştirildi. Diğer cihazlardaki oturumlarınız kapatıldı.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Diğer cihazlardaki oturumları kapat
router.post('/profile/sessions', isLoggedIn, async (req, res, next) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.session.user.id,
      { $inc: { sessionVersion: 1 } },
      { new: true }
    ).select('sessionVersion');
    if (!updated) return req.session.destroy(() => res.redirect('/login'));
    req.session.user.sv = updated.sessionVersion;
    req.flash('success', 'Diğer cihazlardaki oturumlarınız kapatıldı.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// E-posta bildirim tercihleri
router.post('/profile/notifications', isLoggedIn, async (req, res, next) => {
  try {
    const emailPrefs = Object.fromEntries(Object.keys(CATEGORY_LABELS).map(key => [key, req.body[key] === 'on']));
    await User.updateOne({ _id: req.session.user.id }, { emailPrefs });
    req.flash('success', 'Bildirim tercihleriniz kaydedildi.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// E-posta değiştir: yeni adres doğrulanana kadar eski adres geçerli kalır.
router.post('/profile/email', isLoggedIn, limits.emailAction, async (req, res, next) => {
  try {
    const profile = await User.findById(req.session.user.id);
    if (!profile) return req.session.destroy(() => res.redirect('/login'));

    const newEmail = str(req.body.newEmail).toLowerCase();
    const password = typeof req.body.emailPassword === 'string' ? req.body.emailPassword : '';
    const errors = {};

    if (!canDeliver()) errors.newEmail = 'E-posta gönderimi şu anda kapalı olduğu için adres değiştirilemiyor.';
    else if (!isEmail(newEmail) || newEmail.length > MAX_EMAIL) errors.newEmail = 'Geçerli bir e-posta adresi yazın.';
    else if (newEmail === profile.email) errors.newEmail = 'Bu zaten mevcut adresiniz.';
    else if (await User.exists({ email: newEmail })) errors.newEmail = 'Bu e-posta başka bir hesapta kullanılıyor.';
    if (profile.password && !(await profile.comparePassword(password))) errors.emailPassword = 'Şifre hatalı.';

    if (Object.keys(errors).length) {
      res.status(422);
      return renderProfile(res, profile.toObject(), { errors, newEmail });
    }

    profile.pendingEmail = newEmail;
    await sendVerification(profile, newEmail);
    sendInBackground({ to: profile.email, ...emailChangeNotice(newEmail) });

    req.flash('success', `${newEmail} adresine doğrulama bağlantısı gönderildi. Bağlantıyı açınca adresiniz değişir.`);
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
      User.findById(id).select('-password -resetTokenHash -resetTokenExpires -emailTokenHash -emailTokenExpires -sessionVersion').lean(),
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

    // İşi alan firma ayrılıyorsa talep kilitli kalmasın, yeniden yayına girsin.
    const activeDeals = await Bid.find({ company: id, status: 'accepted' });
    for (const bid of activeDeals) {
      const reopened = await cancelDeal(bid);
      if (reopened) {
        await notify(reopened.customer, `İşi alan firma sitemizden ayrıldı. "${reopened.title}" talebiniz yeniden yayında.`, `/requests/${reopened._id}`, { mail: 'bids' });
      }
    }

    // Silinen firmanın bekleyen teklif sayıları düşer, talepler listede doğru görünür.
    const companyBids = await Bid.find({ company: id }).select('request');
    await Request.updateMany({ _id: { $in: companyBids.map(bid => bid.request) } }, { $inc: { bidCount: -1 } });

    // Silinen müşterinin yorumları kalkınca firmaların puanı yeniden hesaplanır.
    const ratedCompanies = await Review.distinct('company', {
      $or: [{ customer: id }, { request: { $in: requestIds } }]
    });

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
    deleteImages([profile.avatar, ...(profile.portfolio || [])]);
    await User.deleteOne({ _id: id });
    await Promise.all(ratedCompanies.filter(company => String(company) !== id).map(recalcCompanyRating));

    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});


// ---- 6 Haneli E-posta Kod Doğrulama ----

router.get('/verify-code', async (req, res) => {
  const userId = req.session.pendingVerifyUserId || (req.session.user && req.session.user.id);
  if (!userId) return res.redirect('/login');

  const user = await User.findById(userId);
  if (!user) {
    delete req.session.pendingVerifyUserId;
    return res.redirect('/login');
  }

  if (user.emailVerified) {
    delete req.session.pendingVerifyUserId;
    return res.redirect('/dashboard');
  }

  const parts = user.email.split('@');
  const namePart = parts[0];
  const maskedName = namePart.length <= 3 
    ? namePart[0] + '***' 
    : namePart.slice(0, 2) + '***' + namePart.slice(-1);
  const maskedEmail = `${maskedName}@${parts[1]}`;

  res.render('auth/verify-code', {
    title: 'E-posta Doğrulama Kodu',
    email: maskedEmail,
    next: safeNext(req.query.next)
  });
});

router.post('/verify-code', authLimiter('auth/verify-code'), async (req, res, next) => {
  const userId = req.session.pendingVerifyUserId || (req.session.user && req.session.user.id);
  const redirectTo = safeNext(req.body.next);
  if (!userId) return res.redirect('/login');

  try {
    const user = await User.findById(userId);
    if (!user) {
      delete req.session.pendingVerifyUserId;
      return res.redirect('/login');
    }

    const inputCode = (req.body.code || '').toString().trim().replace(/\s+/g, '');

    if (!inputCode || inputCode.length !== 6 || inputCode !== user.emailCode) {
      req.flash('error', 'Girdiğiniz 6 haneli kod hatalı. Lütfen e-postanızı kontrol edip tekrar deneyin.');
      return res.redirect('/verify-code' + (redirectTo ? '?next=' + encodeURIComponent(redirectTo) : ''));
    }

    if (!user.emailCodeExpires || new Date() > user.emailCodeExpires) {
      req.flash('error', 'Girdiğiniz kodun süresi dolmuş. Lütfen "Kodu Tekrar Gönder" butonuna basın.');
      return res.redirect('/verify-code' + (redirectTo ? '?next=' + encodeURIComponent(redirectTo) : ''));
    }

    // Kod doğru! Hesabı onayla
    user.emailVerified = true;
    user.emailCode = undefined;
    user.emailCodeExpires = undefined;
    await user.save();

    delete req.session.pendingVerifyUserId;

    await startSession(req, user, true);
    req.flash('success', `Tebrikler ${user.name}! Hesabınız doğrulandı ve oturumunuz açıldı.`);
    res.redirect(redirectTo || '/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/verify-code/resend', authLimiter('auth/verify-code'), async (req, res, next) => {
  const userId = req.session.pendingVerifyUserId || (req.session.user && req.session.user.id);
  const redirectTo = safeNext(req.body.next);
  if (!userId) return res.redirect('/login');

  try {
    const user = await User.findById(userId);
    if (!user) return res.redirect('/login');

    await sendVerificationCode(user);
    req.flash('success', 'Yeni 6 haneli doğrulama kodunuz e-posta adresinize gönderildi.');
    res.redirect('/verify-code' + (redirectTo ? '?next=' + encodeURIComponent(redirectTo) : ''));
  } catch (err) {
    req.flash('error', 'Kod gönderilirken bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.');
    res.redirect('/verify-code' + (redirectTo ? '?next=' + encodeURIComponent(redirectTo) : ''));
  }
});

module.exports = router;

