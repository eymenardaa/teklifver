const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (transport) return transport;

  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER.trim(),
        pass: process.env.GMAIL_PASS.replace(/\s+/g, '')
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    });
  } else if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    });
  }
  return transport;
}

const isEnabled = () => Boolean(getTransport());

const canDeliver = () => isEnabled() || process.env.NODE_ENV !== 'production';

// Doğrulama her zaman zorunludur
const verificationRequired = () => true;

async function sendMail({ to, subject, text, html }) {
  const activeTransport = getTransport();
  if (!activeTransport) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP/Gmail ayarlanmadığı için e-posta gönderilemedi.');
      return false;
    }
    console.log(`  [E-POSTA] ${to} | ${subject}\n  ${(text || '').replace(/\n/g, '\n  ')}`);
    return true;
  }
  const from = process.env.GMAIL_USER
    ? `"TeklifVer" <${process.env.GMAIL_USER}>`
    : (process.env.SMTP_FROM || process.env.SMTP_USER || 'TeklifVer <noreply@teklifver.com>');
  await activeTransport.sendMail({ from, to, subject, text, html });
  console.log(`  [E-POSTA GÖNDERİLDİ] -> ${to} (${subject})`);
  return true;
}

function sendInBackground(mail) {
  sendMail(mail).catch(err => console.error('E-posta gönderilemedi:', err.message));
}

async function checkConnection() {
  const activeTransport = getTransport();
  if (!activeTransport) return;
  try {
    await activeTransport.verify();
    console.log('  Gmail / SMTP bağlantısı başarıyla doğrulandı.');
  } catch (err) {
    console.warn('  Uyarı: SMTP bağlantısı kurulamadı:', err.message);
  }
}

module.exports = { sendMail, sendInBackground, isEnabled, canDeliver, verificationRequired, checkConnection };
