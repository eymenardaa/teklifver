const crypto = require('crypto');
const { sendMail, sendInBackground } = require('./mailer');
const { verificationMail, verificationCodeMail } = require('./mail-templates');

const TOKEN_MS = 24 * 60 * 60 * 1000;
const CODE_MS = 15 * 60 * 1000; // 15 dakika
const RESEND_GAP_MS = 60 * 1000; // Yeni kod için en az bir dakika
const MAX_CODE_TRIES = 5;

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Doğrulama bağlantısı üretip gönderir.
async function sendVerification(user, targetEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailTokenHash = hashToken(token);
  user.emailTokenExpires = new Date(Date.now() + TOKEN_MS);
  await user.save();
  sendInBackground({ to: targetEmail || user.email, ...verificationMail(token) });
}

// Giriş ve kayıt için altı haneli kod gönderir. Kod hem açık hem hash olarak saklanır.
async function sendVerificationCode(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  user.emailCode = code;
  user.emailCodeHash = hashToken(code);
  user.emailCodeExpires = new Date(Date.now() + CODE_MS);
  user.emailCodeSentAt = new Date();
  user.emailCodeTries = 0;
  await user.save();
  return sendMail({ to: user.email, ...verificationCodeMail(code, user.name) });
}

const canResendCode = user => !user.emailCodeSentAt || Date.now() - user.emailCodeSentAt.getTime() >= RESEND_GAP_MS;

// Sonuç: 'ok', 'wrong', 'expired' veya 'locked'. Doğru kod e-postayı da doğrulanmış sayar.
async function checkVerificationCode(user, input) {
  const code = String(input || '').replace(/\D/g, '');
  if (!user.emailCodeExpires || user.emailCodeExpires.getTime() < Date.now()) return 'expired';
  if ((user.emailCodeTries || 0) >= MAX_CODE_TRIES) return 'locked';

  let matches = false;
  if (user.emailCodeHash) {
    const expected = Buffer.from(user.emailCodeHash);
    const given = Buffer.from(hashToken(code));
    matches = code.length === 6 && expected.length === given.length && crypto.timingSafeEqual(given, expected);
  } else if (user.emailCode) {
    matches = code === user.emailCode;
  }

  if (!matches) {
    user.emailCodeTries = (user.emailCodeTries || 0) + 1;
    await user.save();
    return user.emailCodeTries >= MAX_CODE_TRIES ? 'locked' : 'wrong';
  }

  user.emailVerified = true;
  user.emailCode = undefined;
  user.emailCodeHash = undefined;
  user.emailCodeExpires = undefined;
  user.emailCodeTries = 0;
  await user.save();
  return 'ok';
}

module.exports = { sendVerification, sendVerificationCode, checkVerificationCode, canResendCode, hashToken, CODE_MS };
