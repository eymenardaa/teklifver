const nodemailer = require('nodemailer');

// SMTP ayarı varsa e-posta gönderir; yoksa içeriği sunucu günlüğüne yazar (geliştirme için).
let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

const isEnabled = () => Boolean(transport);

// Geliştirmede bağlantılar günlüğe yazıldığı için e-posta akışları SMTP olmadan da denenebilir.
const canDeliver = () => isEnabled() || process.env.NODE_ENV !== 'production';

// SMTP varsa doğrulama zorunludur; REQUIRE_EMAIL_VERIFICATION ile değiştirilebilir.
const verificationRequired = () =>
  process.env.REQUIRE_EMAIL_VERIFICATION ? process.env.REQUIRE_EMAIL_VERIFICATION === 'true' : isEnabled();

async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP ayarlanmadığı için e-posta gönderilemedi.');
      return false;
    }
    console.log(`  [E-POSTA] ${to} | ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return true;
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html });
  return true;
}

// Yanıt süresinden hesabın var olup olmadığı anlaşılmasın, SMTP hatası işlemi bozmasın diye beklenmez.
function sendInBackground(mail) {
  sendMail(mail).catch(err => console.error('E-posta gönderilemedi:', err.message));
}

async function checkConnection() {
  if (!transport) return;
  try {
    await transport.verify();
    console.log('  SMTP bağlantısı doğrulandı.');
  } catch (err) {
    console.warn('  Uyarı: SMTP bağlantısı kurulamadı:', err.message);
  }
}

module.exports = { sendMail, sendInBackground, isEnabled, canDeliver, verificationRequired, checkConnection };
