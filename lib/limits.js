const { rateLimit } = require('express-rate-limit');

// Giriş yapmış kullanıcının art arda yaptığı işlemleri sınırlar (spam ve kötüye kullanım).
function userLimiter({ windowMs, limit, message, back }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: req => req.session.user.id,
    handler: (req, res) => {
      req.flash('error', message);
      res.redirect(typeof back === 'function' ? back(req) : back);
    }
  });
}

const HOUR = 60 * 60 * 1000;

const limits = {
  newRequest: userLimiter({ windowMs: HOUR, limit: 30, message: 'Bir saatte en fazla 30 talep verebilirsiniz.', back: '/dashboard' }),
  newBid: userLimiter({ windowMs: HOUR, limit: 100, message: 'Çok hızlı teklif veriyorsunuz. Lütfen biraz bekleyin.', back: '/requests' }),
  question: userLimiter({ windowMs: HOUR, limit: 20, message: 'Çok fazla soru gönderdiniz. Lütfen biraz bekleyin.', back: '/requests' }),
  report: userLimiter({ windowMs: HOUR, limit: 30, message: 'Çok fazla şikayet gönderdiniz. Lütfen daha sonra tekrar deneyin.', back: '/requests' }),
  invite: userLimiter({ windowMs: HOUR, limit: 50, message: 'Çok fazla davet gönderdiniz. Lütfen daha sonra tekrar deneyin.', back: '/companies' }),
  emailAction: userLimiter({ windowMs: 15 * 60 * 1000, limit: 5, message: 'Çok fazla e-posta istediniz. Lütfen 15 dakika sonra tekrar deneyin.', back: '/profile' })
};

module.exports = { userLimiter, limits };
