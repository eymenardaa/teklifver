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
const { sendVerification, sendVerificationCode, checkVerificationCode, canResendCode, CODE_MS } = require('../lib/email-verify');
const { siteUrl } = require('../lib/url');
const { startSession } = require('../lib/session');
const { limits } = require('../lib/limits');
const { recalcCompanyRating, cancelDeal } = require('../lib/deals');
const { notify } = require('../lib/notify');

// Kod adımında adresin tamamı yazılmaz: ah***t@gmail.com
function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  const masked = name.length <= 3 ? name[0] + '***' : name.slice(0, 2) + '***' + name.slice(-1);
  return `${masked}@${domain}`;
}

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

const CODE_ERRORS = {
  wrong: 'Kod hatalı. E-postadaki altı haneli kodu yeniden yazın.',
  expired: 'Kodun süresi doldu. Aşağıdan yeni kod isteyin.',
  locked: 'Çok fazla yanlış deneme oldu. Aşağıdan yeni kod isteyin.'
};

// Kod hangi hesaba gittiyse oturumda tutulur. Formdan gelen kimlik ya da e-posta kullanılmaz;
// böylece şifre adımını geçmeyen biri başka bir hesabın kodunu deneyemez.
function renderCodeStep(req, res, { purpose, email, error, notice, status = 200 }) {
  const pending = req.session.pendingCode;
  res.status(status).render(purpose === 'login' ? 'auth/login' : 'auth/register', {
    title: purpose === 'login' ? 'Giriş Kodu' : 'Hesabını Onayla',
    step: 'verify',
    purpose,
    maskedEmail: maskEmail(email),
    next: pending ? pending.next : '',
    values: {},
    errors: error ? { form: error } : {},
    notice
  });
}

// Kod gönderip kod adımına geçer. E-posta gitmezse false döner.
async function startCodeStep(req, user, purpose, { remember = false, next = '' } = {}) {
  let sent = false;
  try {
    sent = await sendVerificationCode(user);
  } catch (err) {
    console.error('Kod e-postası gönderilemedi:', err.message);
  }
  if (!sent) return false;
  req.session.pendingCode = { userId: user._id.toString(), purpose, remember, next, startedAt: Date.now() };
  return true;
}

// Bekleyen kodu kontrol eder; doğruysa oturumu açar.
async function finishCodeStep(req, res, next, purpose) {
  const pending = req.session.pendingCode;
  if (!pending || pending.purpose !== purpose || Date.now() - pending.startedAt > CODE_MS) {
    delete req.session.pendingCode;
    req.flash('error', purpose === 'login'
      ? 'Kod adımının süresi doldu. Lütfen yeniden giriş yapın.'
      : 'Kod adımının süresi doldu. Giriş yaparak yeni kod isteyebilirsiniz.');
    return res.redirect('/login');
  }
  try {
    const user = await User.findById(pending.userId);
    if (!user || user.suspended) {
      delete req.session.pendingCode;
      return res.redirect('/login');
    }
    const result = await checkVerificationCode(user, req.body.code);
    if (result !== 'ok') return renderCodeStep(req, res, { purpose, email: user.email, error: CODE_ERRORS[result], status: 422 });

    // Yeni oturum açılırken bekleyen kod bilgisi de silinir.
    await startSession(req, user, pending.remember);
    req.flash('success', purpose === 'login' ? `Hoş geldin, ${user.name}!` : `Hoş geldin, ${user.name}! Hesabın açıldı.`);
    res.redirect(pending.next || '/dashboard');
  } catch (err) {
    next(err);
  }
}

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
  if (req.body.verifyStep) return finishCodeStep(req, res, next, 'register');

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

  const fail = (status = 422) =>
    res.status(status).render('auth/register', { title: 'Kayıt Ol', next: redirectTo, values, errors });

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

    // E-posta gönderilebiliyorsa hesap, adrese gelen kod girilince açılır.
    if (verificationRequired()) {
      if (!(await startCodeStep(req, user, 'register', { next: redirectTo }))) {
        await User.deleteOne({ _id: user._id });
        errors.form = 'Onay kodu gönderilemedi. Lütfen biraz sonra tekrar deneyin.';
        return fail(503);
      }
      return renderCodeStep(req, res, { purpose: 'register', email: user.email });
    }

    if (canDeliver()) await sendVerification(user);
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
  if (req.body.verifyStep) return finishCodeStep(req, res, next, 'login');

  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const redirectTo = safeNext(req.body.next);

  const fail = (message, status = 401) =>
    res.status(status).render('auth/login', {
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

    // E-posta gönderilebiliyorsa şifreden sonra adrese gelen kod da istenir.
    if (verificationRequired()) {
      const started = await startCodeStep(req, user, 'login', { remember: req.body.remember === 'on', next: redirectTo });
      if (!started) return fail('Giriş kodu gönderilemedi. Lütfen biraz sonra tekrar deneyin.', 503);
      return renderCodeStep(req, res, { purpose: 'login', email: user.email });
    }

    await startSession(req, user, req.body.remember === 'on');
    res.redirect(redirectTo || '/dashboard');
  } catch (err) {
    next(err);
  }
});

// Kod adımında yeni kod ister.
router.post('/verify-code/resend', authLimiter('auth/login'), async (req, res, next) => {
  const pending = req.session.pendingCode;
  if (!pending) return res.redirect('/login');
  try {
    const user = await User.findById(pending.userId);
    if (!user || user.suspended) {
      delete req.session.pendingCode;
      return res.redirect('/login');
    }
    const step = { purpose: pending.purpose, email: user.email };
    if (!canResendCode(user)) return renderCodeStep(req, res, { ...step, error: 'Yeni kod istemek için bir dakika bekleyin.', status: 429 });
    if (!(await startCodeStep(req, user, pending.purpose, { remember: pending.remember, next: pending.next }))) {
      return renderCodeStep(req, res, { ...step, error: 'Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.', status: 503 });
    }
    renderCodeStep(req, res, { ...step, notice: 'Yeni kod gönderildi. Önceki kod artık geçmez.' });
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
      update.serviceCities = [...new Set([].concat(req.body.serviceCities || []))].filter(city => cities.includes(city));
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

// Öncesi & Sonrası Karşılaştırmaları (Before / After)
router.post('/profile/before-after', isLoggedIn, uploadImages, async (req, res, next) => {
  try {
    const files = (req.files || []).map(file => '/uploads/' + file.filename);
    const profile = await User.findById(req.session.user.id);
    if (!profile || profile.role !== 'company') {
      deleteImages(files);
      req.flash('error', 'Öncesi / sonrası örnekleri yalnızca firma hesaplarına eklenebilir.');
      return res.redirect('/profile');
    }
    if (files.length < 2) {
      deleteImages(files);
      req.flash('error', 'Lütfen biri işten önce, diğeri işten sonra olmak üzere 2 görsel seçin.');
      return res.redirect('/profile');
    }
    const title = str(req.body.title) || 'İş Karşılaştırması';
    profile.beforeAfter = profile.beforeAfter || [];
    if (profile.beforeAfter.length >= 6) {
      deleteImages(files);
      req.flash('error', 'En fazla 6 adet öncesi / sonrası karşılaştırması ekleyebilirsiniz.');
      return res.redirect('/profile');
    }
    profile.beforeAfter.push({
      before: files[0],
      after: files[1],
      title
    });
    await profile.save();
    req.flash('success', 'İşten önce / sonra örneği eklendi.');
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

router.post('/profile/before-after/:index/delete', isLoggedIn, async (req, res, next) => {
  try {
    const profile = await User.findById(req.session.user.id);
    if (!profile || profile.role !== 'company') return res.redirect('/profile');
    const index = parseInt(req.params.index, 10);
    if (!isNaN(index) && profile.beforeAfter && profile.beforeAfter[index]) {
      const item = profile.beforeAfter[index];
      deleteImages([item.before, item.after]);
      profile.beforeAfter.splice(index, 1);
      await profile.save();
      req.flash('success', 'Karşılaştırma kaldırıldı.');
    }
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

// Usta / Firma Doğrulama Belgesi Yükleme
router.post('/profile/verification', isLoggedIn, uploadImages, async (req, res, next) => {
  try {
    const uploaded = (req.files || []).map(file => '/uploads/' + file.filename);
    if (!uploaded.length) {
      req.flash('error', 'Lütfen geçerli bir belge (JPG, PNG veya PDF) seçin.');
      return res.redirect('/profile');
    }
    const profile = await User.findById(req.session.user.id);
    if (profile.verificationDoc) deleteImages([profile.verificationDoc]);
    profile.verificationDoc = uploaded[0];
    profile.verificationStatus = 'pending';
    await profile.save();
    req.flash('success', 'Belgeniz yüklendi ve onaya gönderildi. İnceleme sonrası rozetiniz açılacaktır.');
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

    const messageFilter = { $or: [{ sender: id }, { receiver: id }, { request: { $in: requestIds } }] };
    deleteImages(await Message.distinct('image', { ...messageFilter, image: { $nin: ['', null] } }));

    await Promise.all([
      Bid.deleteMany({ $or: [{ company: id }, { request: { $in: requestIds } }] }),
      Message.deleteMany(messageFilter),
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

module.exports = router;

