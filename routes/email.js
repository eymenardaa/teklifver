const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const { isLoggedIn } = require('../middleware/auth');
const { limits } = require('../lib/limits');
const { str } = require('../lib/input');
const { sendVerification, hashToken } = require('../lib/email-verify');
const { CATEGORY_LABELS, readUnsubscribeToken } = require('../lib/mail-templates');

// E-posta doğrulama ve e-posta değişikliğini onaylama
router.get('/email/verify/:token', async (req, res, next) => {
  try {
    const back = req.session.user ? '/profile' : '/login';
    const user = await User.findOne({
      emailTokenHash: hashToken(str(req.params.token)),
      emailTokenExpires: { $gt: new Date() }
    });
    if (!user) {
      req.flash('error', 'Bu bağlantı geçersiz veya süresi dolmuş. Hesabınızdan yeni bağlantı isteyebilirsiniz.');
      return res.redirect(back);
    }

    if (user.pendingEmail) {
      if (await User.exists({ email: user.pendingEmail, _id: { $ne: user._id } })) {
        req.flash('error', 'Bu e-posta başka bir hesapta kullanılıyor.');
        return res.redirect(back);
      }
      user.email = user.pendingEmail;
      user.pendingEmail = undefined;
    }
    user.emailVerified = true;
    user.emailTokenHash = undefined;
    user.emailTokenExpires = undefined;
    await user.save();

    if (req.session.user && req.session.user.id === String(user._id)) {
      req.session.user.email = user.email;
      req.session.user.emailVerified = true;
    }
    req.flash('success', 'E-posta adresiniz doğrulandı.');
    res.redirect(req.session.user ? '/dashboard' : '/login');
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'Bu e-posta başka bir hesapta kullanılıyor.');
      return res.redirect('/login');
    }
    next(err);
  }
});

// Doğrulama bağlantısını yeniden gönder
router.post('/email/resend', isLoggedIn, limits.emailAction, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) return res.redirect('/login');
    if (user.emailVerified && !user.pendingEmail) {
      req.flash('success', 'E-posta adresiniz zaten doğrulanmış.');
      return res.redirect('/profile');
    }
    await sendVerification(user, user.pendingEmail || user.email);
    req.flash('success', 'Doğrulama bağlantısı gönderildi. Gereksiz klasörünü de kontrol edin.');
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

// Bildirim kapatma: e-posta uygulamaları bağlantıları önceden açtığı için onay düğmesiyle yapılır.
router.get('/email/unsub/:token', (req, res) => {
  const data = readUnsubscribeToken(req.params.token);
  if (!data) {
    return res.status(404).render('error', { title: 'Bağlantı geçersiz', code: 404, message: 'Bu bağlantı geçerli değil.' });
  }
  res.render('auth/unsubscribe', { title: 'Bildirimleri Kapat', token: req.params.token, label: CATEGORY_LABELS[data.category] });
});

router.post('/email/unsub/:token', async (req, res, next) => {
  try {
    const data = readUnsubscribeToken(req.params.token);
    if (!data || !mongoose.isValidObjectId(data.userId)) {
      return res.status(404).render('error', { title: 'Bağlantı geçersiz', code: 404, message: 'Bu bağlantı geçerli değil.' });
    }
    await User.updateOne({ _id: data.userId }, { [`emailPrefs.${data.category}`]: false });
    req.flash('success', `${CATEGORY_LABELS[data.category]} kapatıldı. Hesap Bilgilerim sayfasından yeniden açabilirsiniz.`);
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
