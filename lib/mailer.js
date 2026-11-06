const nodemailer = require('nodemailer');

// Gmail uygulama şifresi ya da herhangi bir SMTP sunucusu kullanılabilir.
// Hiçbiri yoksa geliştirmede e-postanın içeriği sunucu günlüğüne yazılır.
let transport = null;

function getTransport() {
  if (transport) return transport;

  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER.trim(),
        pass: process.env.GMAIL_PASS.replace(/\s+/g, '')
      }
    });
  } else if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  return transport;
}

const isEnabled = () => Boolean(getTransport());

// Geliştirmede bağlantılar günlüğe yazıldığı için e-posta akışları SMTP olmadan da denenebilir.
const canDeliver = () => isEnabled() || process.env.NODE_ENV !== 'production';

// E-posta gönderilebiliyorsa kayıt ve girişte kod istenir. E-posta ayarı olmayan bir sunucuda
// kod istemek herkesi dışarıda bırakırdı. REQUIRE_EMAIL_VERIFICATION ile değiştirilebilir.
const verificationRequired = () =>
  process.env.REQUIRE_EMAIL_VERIFICATION ? process.env.REQUIRE_EMAIL_VERIFICATION === 'true' : isEnabled();

async function sendMail({ to, subject, text, html }) {
  const activeTransport = getTransport();
  if (!activeTransport) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP veya Gmail ayarlanmadığı için e-posta gönderilemedi.');
      return false;
    }
    console.log(`  [E-POSTA] ${to} | ${subject}\n  ${(text || '').replace(/\n/g, '\n  ')}`);
    return true;
  }
  const from = process.env.GMAIL_USER
    ? `"TeklifVer" <${process.env.GMAIL_USER.trim()}>`
    : (process.env.SMTP_FROM || process.env.SMTP_USER || 'TeklifVer <noreply@teklifver.com>');
  await activeTransport.sendMail({ from, to, subject, text, html });
  return true;
}

// Yanıt süresinden hesabın var olup olmadığı anlaşılmasın, SMTP hatası işlemi bozmasın diye beklenmez.
function sendInBackground(mail) {
  sendMail(mail).catch(err => console.error('E-posta gönderilemedi:', err.message));
}

async function checkConnection() {
  const activeTransport = getTransport();
  if (!activeTransport) return;
  try {
    await activeTransport.verify();
    console.log('  E-posta bağlantısı doğrulandı.');
  } catch (err) {
    console.warn('  Uyarı: E-posta sunucusuna bağlanılamadı:', err.message);
  }
}

module.exports = { sendMail, sendInBackground, isEnabled, canDeliver, verificationRequired, checkConnection };
