const crypto = require('crypto');
const { sendMail } = require('./mailer');
const { verificationMail, verificationCodeMail } = require('./mail-templates');

const TOKEN_MS = 24 * 60 * 60 * 1000;
const CODE_EXPIRES_MS = 15 * 60 * 1000; // 15 dakika geçerli

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Doğrulama bağlantısı üretip gönderir.
async function sendVerification(user, targetEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailTokenHash = hashToken(token);
  user.emailTokenExpires = new Date(Date.now() + TOKEN_MS);
  await user.save();
  sendMail({ to: targetEmail || user.email, ...verificationMail(token) }).catch(err => console.error('Doğrulama maili hatası:', err.message));
}

// 6 haneli doğrulama kodu üretip kullanıcının e-postasına gönderir
async function sendVerificationCode(user, targetEmail) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.emailCode = code;
  user.emailCodeExpires = new Date(Date.now() + CODE_EXPIRES_MS);
  await user.save();

  const to = targetEmail || user.email;
  const mail = verificationCodeMail(code, user.name);
  sendMail({ to, ...mail }).catch(err => console.error('E-posta gönderim hatası:', err.message));
  console.log(`  [KOD ÜRETİLDİ] ${to} -> ${code}`);
  return code;
}

module.exports = { sendVerification, sendVerificationCode, hashToken };
