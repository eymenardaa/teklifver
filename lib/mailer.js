const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  if (transport) return transport;

  let user = (process.env.GMAIL_USER || '').trim();
  let pass = (process.env.GMAIL_PASS || '').replace(/\s+/g, '');

  // Render'da veya ortamda adres başı kesilmişse (ör. 543@gmail.com) otomatik düzelt
  if (user && user.endsWith('543@gmail.com') && !user.startsWith('eymenardaa')) {
    user = 'eymenardaa543@gmail.com';
  }
  // Eğer canlıda girilmemişse yedek hesap bilgileri
  if (!user && !process.env.SMTP_HOST) {
    user = 'eymenardaa543@gmail.com';
    pass = pass || 'cvitwthcpbesypvm';
  }

  if (user && pass) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  } else if (process.env.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return transport;
}

const isEnabled = () => Boolean(process.env.RESEND_API_KEY || getTransport());

const canDeliver = () => isEnabled() || process.env.NODE_ENV !== 'production';

// Doğrulama her zaman zorunludur
const verificationRequired = () => true;

// Render ücretsiz sunucularında SMTP portları (465/587) engellendiği için Resend HTTPS (Port 443) desteklenir
async function sendViaResend({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM || 'TeklifVer <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Resend API hatası: ${errorBody}`);
  }
  console.log(`  [RESEND HTTPS GÖNDERİLDİ] -> ${to} (${subject})`);
  return true;
}

async function sendMail({ to, subject, text, html }) {
  // 1. Öncelik: HTTPS tabanlı Resend API (Render güvenlik duvarını aşar, asla zaman aşımına uğramaz)
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend({ to, subject, text, html });
    } catch (err) {
      console.error('Resend gönderim hatası:', err.message);
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
