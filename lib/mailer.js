const nodemailer = require('nodemailer');

// Gmail uygulama şifresi ya da herhangi bir SMTP sunucusu kullanılabilir.
// Hiçbiri yoksa geliştirmede e-postanın içeriği sunucu günlüğüne yazılır.
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
// Geliştirmede bağlantılar günlüğe yazıldığı için e-posta akışları SMTP olmadan da denenebilir.
const canDeliver = () => isEnabled() || process.env.NODE_ENV !== 'production';

// E-posta gönderilebiliyorsa kayıt ve girişte kod istenir.
const verificationRequired = () =>
  process.env.REQUIRE_EMAIL_VERIFICATION ? process.env.REQUIRE_EMAIL_VERIFICATION === 'true' : isEnabled();


async function sendMail({ to, subject, text, html }) {
  const target = String(to || '').trim().toLowerCase();
  // Sahte / örnek demo alan adlarına gerçek e-posta gönderimi engellenir (test sink hariç)
  if (!process.env.SMTP_HOST && (target.endsWith('.example') || target.endsWith('.test') || target.includes('@example.com'))) {
    console.log(`  [TEST/ÖRNEK ALAN ADI ATLANDI] -> ${to}`);
    return true;
  }

  // 1. Eğer BREVO_API_KEY varsa (Herhangi bir Gmail'e alan adı kısıtlaması olmadan gönderir)
  if (process.env.BREVO_API_KEY) {
    try {
      const senderEmail = process.env.BREVO_SENDER || 'eymenardaa543@gmail.com';
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'TeklifVer', email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html || undefined,
          textContent: text || undefined
        })
      });
      if (res.ok) {
        console.log(`  [BREVO HTTPS GÖNDERİLDİ] -> ${to}`);
        return true;
      }
    } catch (err) {
      console.error('Brevo hatası:', err.message);
    }
  }

  // 2. Eğer RESEND_API_KEY varsa HTTPS üzerinden gönder (Render Free engellerini 1 saniyede aşar)
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

      // Resend test modunda başka maile izin vermiyorsa (403), kodu anında ana geliştirici mailine ulaştır!
      if (res.status === 403 && to !== 'eymenardaa543@gmail.com') {
        const fallbackRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from,
            to: ['eymenardaa543@gmail.com'],
            subject: `[${to}] ${subject}`,
            html: `<div style="background:#fef3c7;padding:12px;border-radius:6px;margin-bottom:12px;font-size:13px;color:#92400e;">⚠️ Bu onay kodu <strong>${to}</strong> hesabı için oluşturuldu.</div>` + (html || `<p>${text}</p>`),
            text: `[${to} için kod]:\n\n${text}`
          })
        });
        if (fallbackRes.ok) {
          console.log(`  [RESEND 403 YÖNLENDİRİLDİ] -> ${to} için eymenardaa543@gmail.com adresine yollandı`);
          return true;
        }
      }
    } catch (err) {
      console.error('Resend hatası:', err.message);
    }
  }

  // 2. Standart Gmail / SMTP
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
