const crypto = require('crypto');
const { sendMail } = require('./mailer');
const { verificationMail, verificationCodeMail } = require('./mail-templates');

const TOKEN_MS = 24 * 60 * 60 * 1000;
const CODE_EXPIRES_MS = 15 * 60 * 1000; // 15 dakika geçerli
const RESEND_COOLDOWN_MS = 60 * 1000;   // 60 saniye boyunca tek kod garantisi

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Bellek içi kilit: Aynı anda gelen hızlı tıklamalarda mükerrer e-posta gönderimini engeller
const activeLocks = new Set();

// Doğrulama bağlantısı üretip gönderir.
async function sendVerification(user, targetEmail) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailTokenHash = hashToken(token);
  user.emailTokenExpires = new Date(Date.now() + TOKEN_MS);
  await user.save();
  sendMail({ to: targetEmail || user.email, ...verificationMail(token) }).catch(err => console.error('Doğrulama maili hatası:', err.message));
}

// 6 haneli doğrulama kodu üretip kullanıcının e-postasına gönderir (KESİNTİSİZ TEK KOD GARANTİSİ)
async function sendVerificationCode(user, targetEmail) {
  const email = (targetEmail || user.email).toLowerCase().trim();
  const now = Date.now();

  // 1. Eğer son 60 saniye içinde kod üretilmişse ve geçerliyse YENİDEN KOD ÜRETME VE YENİ MAİL ATMA!
  if (user.emailCode && user.emailCodeSentAt && (now - user.emailCodeSentAt.getTime() < RESEND_COOLDOWN_MS)) {
    console.log(`  [MÜKERRER KOD ENGELİ] ${email} için son 60 saniye içinde zaten kod gönderildi: ${user.emailCode}`);
    return user.emailCode;
  }

  // 2. Eşzamanlı istek kilidi (aynı anda çift tıklanırsa tek mail atılsın)
  if (activeLocks.has(email)) {
    console.log(`  [KİLİT ENGELİ] ${email} için şu anda zaten gönderim yapılıyor, ikinci mail engellendi.`);
    return user.emailCode || '000000';
  }

  activeLocks.add(email);

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailCode = code;
    user.emailCodeExpires = new Date(now + CODE_EXPIRES_MS);
    user.emailCodeSentAt = new Date(now);
    await user.save();

    const mail = verificationCodeMail(code, user.name);
    console.log(`  [1 ADET KOD ÜRETİLDİ] ${email} -> ${code}`);

    // Tek bir e-posta gönder
    try {
      await sendMail({ to: email, ...mail });
      console.log(`  [GMAIL BAŞARIYLA GİTTİ] -> ${email}`);
    } catch (err) {
      console.error(`  [GMAIL GÖNDERİM UYARISI] ${email}:`, err.message);
    }

    return code;
  } finally {
    setTimeout(() => activeLocks.delete(email), 3000);
  }
}

module.exports = { sendVerification, sendVerificationCode, hashToken };
