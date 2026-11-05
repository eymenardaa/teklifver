const { verificationRequired } = require('../lib/mailer');

// Giriş yapmamış kullanıcıyı, işi bitince geri dönecek şekilde giriş sayfasına yollar.
function redirectToLogin(req, res) {
  req.flash('error', 'Devam etmek için giriş yapın.');
  const next = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  res.redirect(`/login${next}`);
}

module.exports.isLoggedIn = (req, res, next) => {
  if (!req.session.user) return redirectToLogin(req, res);
  next();
};

module.exports.isCustomer = (req, res, next) => {
  if (!req.session.user) return redirectToLogin(req, res);
  if (req.session.user.role !== 'customer') {
    req.flash('error', 'Bu işlem yalnızca müşteri hesapları içindir.');
    return res.redirect('/requests');
  }
  next();
};

module.exports.isCompany = (req, res, next) => {
  if (!req.session.user) return redirectToLogin(req, res);
  if (req.session.user.role !== 'company') {
    req.flash('error', 'Bu işlem yalnızca şirket hesapları içindir.');
    return res.redirect('/requests');
  }
  next();
};

// E-postası doğrulanmamış hesap talep, teklif ve mesaj gönderemez (zorunluluk açıksa).
module.exports.requireVerifiedEmail = (req, res, next) => {
  if (!verificationRequired() || req.session.user.emailVerified) return next();
  req.flash('error', 'Bu işlem için önce e-posta adresinizi doğrulayın. Bağlantıyı e-postanızda bulabilirsiniz.');
  res.redirect('/dashboard');
};

module.exports.isAdmin = (req, res, next) => {
  if (!req.session.user) return redirectToLogin(req, res);
  if (!req.session.user.isAdmin) {
    return res.status(403).render('error', {
      title: 'Yetkiniz yok',
      code: 403,
      message: 'Bu sayfayı yalnızca yöneticiler görebilir.'
    });
  }
  next();
};
