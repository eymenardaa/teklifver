const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

// Oturum sabitleme saldırısını önlemek için girişte yeni oturum kimliği üretilir.
function startSession(req, user, remember) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: user.companyName,
        isAdmin: Boolean(user.isAdmin),
        emailVerified: Boolean(user.emailVerified),
        sv: user.sessionVersion || 0,
        favorites: (user.favorites || []).map(String)
      };
      if (remember) req.session.cookie.maxAge = REMEMBER_MS;
      resolve();
    });
  });
}

module.exports = { startSession };
