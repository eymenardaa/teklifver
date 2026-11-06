const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (transport) return transport;

  if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    return transport;
  }

  let user = (process.env.GMAIL_USER || '').trim();
  let pass = (process.env.GMAIL_PASS || '').replace(/\s+/g, '');

  // Render'da veya ortamda adres başı kesilmişse düzelt
  if (user && user.endsWith('543@gmail.com') && !user.startsWith('eymenardaa')) {
    user = 'eymenardaa543@gmail.com';
  }
  if (!user && !process.env.CI && process.env.NODE_ENV !== 'test' && !process.env.DISABLE_2FA) {
    user = (process.env.GMAIL_USER || 'eymenardaa543@gmail.com').trim();
    pass = (process.env.GMAIL_PASS || 'cvitwthcpbesypvm').replace(/\s+/g, '');
  }

  if (user && pass) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: { user, pass }
    });
  }
  return transport;
}

const isEnabled = () => Boolean(getTransport());
const canDeliver = () => isEnabled() || process.env.NODE_ENV !== 'production';
const verificationRequired = () =>
  process.env.REQUIRE_EMAIL_VERIFICATION ? process.env.REQUIRE_EMAIL_VERIFICATION === 'true' : isEnabled();

async function sendMail({ to, subject, text, html }) {
  const target = String(to || '').trim().toLowerCase();
  // Sahte / örnek demo alan adlarına gerçek e-posta gönderimi engellenir (test sink hariç)
  if (!process.env.SMTP_HOST && (target.endsWith('.example') || target.endsWith('.test') || target.includes('@example.com'))) {
    console.log(`  [TEST/ÖRNEK ALAN ADI ATLANDI] -> ${to}`);
    return true;
  }

  // 1. Eğer RESEND_API_KEY varsa HTTPS üzerinden gönder (Render Free engellerini 1 saniyede aşar)
  if (process.env.RESEND_API_KEY) {
    try {
      const from = process.env.RESEND_FROM || 'TeklifVer <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html: html || undefined,
          text: text || undefined
        })
      });
      if (res.ok) {
        console.log(`  [RESEND HTTPS GÖNDERİLDİ] -> ${to}`);
        return true;
      }
    } catch (err) {
      console.error('Resend hatası:', err.message);
    }
  }

  // 2. Standart Gmail / SMTP
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
  await activeTransport.sendMail({
    from,
    to,
    subject,
    text,
    html,
    priority: 'high',
    headers: {
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      'Importance': 'High'
    }
  });
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
