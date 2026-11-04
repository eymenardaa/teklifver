const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const oauth = require('../lib/oauth');
const { startSession } = require('../lib/session');
const { str, safeNext } = require('../lib/input');
const { isLoggedIn } = require('../middleware/auth');

const PENDING_MS = 15 * 60 * 1000;

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

const callbackUrl = (req, key) =>
  `${process.env.SITE_URL || `${req.protocol}://${req.get('host')}`}/auth/${key}/callback`;

const saveSession = req => new Promise((resolve, reject) => {
  req.session.save(err => (err ? reject(err) : resolve()));
});

// Sağlayıcıya yönlendirir. state değeri, dönüşün bu tarayıcıdan başlatılan akışa ait olduğunu kanıtlar.
async function beginFlow(req, res, key, { link, next: nextUrl }) {
  const state = oauth.randomToken();
  const verifier = oauth.randomToken();
  req.session.oauth = { provider: key, state, verifier, link, next: nextUrl, role: req.query.role === 'company' ? 'company' : 'customer' };
  await saveSession(req);
  res.redirect(oauth.buildAuthorizeUrl(key, { redirectUri: callbackUrl(req, key), state, verifier }));
}

function requireProvider(req, res, next) {
  const key = req.params.provider;
  if (!oauth.isKnown(key)) return res.redirect('/login');
  if (!oauth.isConfigured(key)) {
    req.flash('error', `${oauth.labelOf(key)} ile giriş henüz açılmadı. Şimdilik e-posta ve şifrenizle devam edin.`);
    return res.redirect(req.session.user ? '/profile' : '/login');
  }
  next();
}

// Kayıt tamamlama formu sağlayıcı dönüşünden sonra açılır; bu adresler o yüzden önce tanımlanır.
const readPending = req => {
  const pending = req.session.pendingSocial;
  return pending && Date.now() - pending.at < PENDING_MS ? pending : null;
};

router.get('/auth/complete', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const pending = readPending(req);
  if (!pending) return res.redirect('/register');
  res.render('auth/complete', {
    title: 'Kaydı Tamamla',
    pending,
    providerLabel: oauth.labelOf(pending.provider),
    values: { role: pending.role, name: pending.name }
  });
});

router.post('/auth/complete', limiter, async (req, res, next) => {
  const pending = readPending(req);
  if (!pending) {
    req.flash('error', 'Kaydın süresi doldu, lütfen tekrar deneyin.');
    return res.redirect('/register');
  }

  const values = {
    role: req.body.role === 'company' ? 'company' : 'customer',
    name: str(req.body.name),
    companyName: str(req.body.companyName)
  };
  const errors = {};
  if (!values.name) errors.name = 'Adınızı yazın.';
  if (values.role === 'company' && !values.companyName) errors.companyName = 'Şirket adını yazın.';
  if (req.body.terms !== 'on') errors.terms = 'Devam etmek için koşulları onaylamalısınız.';

  const fail = extra =>
    res.status(422).render('auth/complete', {
      title: 'Kaydı Tamamla',
      pending,
      providerLabel: oauth.labelOf(pending.provider),
      values,
      errors: { ...errors, ...extra }
    });
  if (Object.keys(errors).length) return fail();

  try {
    const user = await User.create({
      name: values.name,
      email: pending.email,
      role: values.role,
      companyName: values.role === 'company' ? values.companyName : undefined,
      termsAcceptedAt: new Date(),
      socialAccounts: [{ provider: pending.provider, providerId: pending.providerId }]
    });
    const redirectTo = pending.next;
    await startSession(req, user, true);
    req.flash('success', `Hoş geldin, ${user.name}!`);
    res.redirect(redirectTo || '/dashboard');
  } catch (err) {
    if (err.code === 11000) return fail({ form: 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.' });
    next(err);
  }
});

router.get('/auth/:provider', limiter, requireProvider, async (req, res, next) => {
  try {
    if (req.session.user) return res.redirect('/dashboard');
    await beginFlow(req, res, req.params.provider, { link: false, next: safeNext(req.query.next) });
  } catch (err) {
    next(err);
  }
});

// Hesabım sayfasından mevcut hesaba bağlama
router.post('/auth/:provider/link', limiter, isLoggedIn, requireProvider, async (req, res, next) => {
  try {
    await beginFlow(req, res, req.params.provider, { link: true, next: '/profile' });
  } catch (err) {
    next(err);
  }
});

const findBySocial = (provider, providerId) =>
  User.findOne({ socialAccounts: { $elemMatch: { provider, providerId } } });

router.get('/auth/:provider/callback', limiter, async (req, res, next) => {
  const key = req.params.provider;
  const flow = req.session.oauth;
  delete req.session.oauth; // aynı dönüş ikinci kez kullanılamaz

  const backTo = flow && flow.link ? '/profile' : '/login';
  const fail = message => {
    req.flash('error', message);
    return res.redirect(backTo);
  };

  if (!oauth.isKnown(key) || !flow || flow.provider !== key || !req.query.state || req.query.state !== flow.state) {
    return fail('Giriş doğrulanamadı, lütfen tekrar deneyin.');
  }
  const label = oauth.labelOf(key);
  if (req.query.error || typeof req.query.code !== 'string') return fail(`${label} ile giriş iptal edildi.`);

  try {
    let profile;
    try {
      profile = await oauth.fetchProfile(key, {
        code: req.query.code,
        redirectUri: callbackUrl(req, key),
        verifier: flow.verifier
      });
    } catch (err) {
      console.error(err.message);
      return fail(`${label} ile bağlantı kurulamadı, lütfen tekrar deneyin.`);
    }

    const owner = await findBySocial(key, profile.id);

    // Oturum açıkken: mevcut hesaba bağla
    if (flow.link) {
      if (!req.session.user) return res.redirect('/login');
      if (owner && String(owner._id) !== req.session.user.id) {
        return fail(`Bu ${label} hesabı başka bir kullanıcıya bağlı.`);
      }
      if (!owner) {
        await User.updateOne(
          { _id: req.session.user.id, 'socialAccounts.provider': { $ne: key } },
          { $push: { socialAccounts: { provider: key, providerId: profile.id } } }
        );
      }
      req.flash('success', `${label} hesabınız bağlandı.`);
      return res.redirect('/profile');
    }

    if (owner) {
      if (owner.suspended) return fail('Hesabınız askıya alınmıştır.');
      await startSession(req, owner, true);
      return res.redirect(flow.next || '/dashboard');
    }

    if (!profile.email) {
      return fail(`${label} hesabınızdan doğrulanmış bir e-posta alınamadı. E-posta ile kayıt olabilirsiniz.`);
    }

    // E-postası eşleşen hesaba otomatik bağlanmaz: bu sitede e-posta doğrulaması olmadığı için
    // başkası o adresle önceden kayıt açmış olabilir. Hesabın sahibi şifresiyle girip kendisi bağlar.
    if (await User.exists({ email: profile.email })) {
      return fail(`Bu e-postayla zaten bir hesabınız var. E-posta ve şifrenizle girip Hesap Bilgilerim sayfasından ${label} hesabınızı bağlayabilirsiniz.`);
    }

    req.session.pendingSocial = {
      provider: key,
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      role: flow.role,
      next: flow.next,
      at: Date.now()
    };
    res.redirect('/auth/complete');
  } catch (err) {
    next(err);
  }
});

// Bağlantıyı kaldırma: hesaba girecek başka bir yol kalmalı.
router.post('/profile/social/:provider/unlink', isLoggedIn, async (req, res, next) => {
  try {
    const key = req.params.provider;
    const profile = await User.findById(req.session.user.id);
    if (!profile || !oauth.isKnown(key)) return res.redirect('/profile');

    const remaining = profile.socialAccounts.filter(account => account.provider !== key);
    if (!profile.password && remaining.length === 0) {
      req.flash('error', 'Önce bir şifre belirleyin, yoksa hesabınıza giremezsiniz.');
      return res.redirect('/profile');
    }
    profile.socialAccounts = remaining;
    await profile.save();
    req.flash('success', `${oauth.labelOf(key)} bağlantısı kaldırıldı.`);
    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
