const crypto = require('crypto');
const { sendInBackground } = require('./mailer');
const { verificationMail } = require('./mail-templates');

const TOKEN_MS = 24 * 60 * 60 * 1000;

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Doğrulama bağlantısı üretip gönderir. Yeni adres doğrulanana kadar hesabın adresi değişmez.
async function sendVerification(user, targetEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailTokenHash = hashToken(token);
  user.emailTokenExpires = new Date(Date.now() + TOKEN_MS);
  await user.save();
  sendInBackground({ to: targetEmail || user.email, ...verificationMail(token) });
}

module.exports = { sendVerification, hashToken };
