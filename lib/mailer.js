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

async function sendMail({ to, subject, text }) {
  if (!transport) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP ayarlanmadığı için e-posta gönderilemedi.');
      return false;
    }
    console.log(`  [E-POSTA] ${to} | ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return true;
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  return true;
}

module.exports = { sendMail };
