const crypto = require('crypto');
const { baseUrl } = require('./url');

const escapeHtml = text =>
  String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const absolute = url => (url.startsWith('http') ? url : baseUrl() + url);

// Hem düz metin hem HTML üretir; e-posta istemcileri için stiller satır içidir.
function renderMail({ heading, lines, action, footer }) {
  const paragraphs = lines.map(line => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join('');
  const actionUrl = action && absolute(action.url);
  const button = action
    ? `<p style="margin:16px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 16px;background:#ffc61a;color:#1c1e21;font-weight:bold;text-decoration:none;border-radius:4px">${escapeHtml(action.label)}</a></p>`
    : '';
  const footerHtml = footer
    ? `<p style="margin:16px 0 0;color:#666;font-size:12px">${escapeHtml(footer.text)}${footer.link ? ` <a href="${escapeHtml(absolute(footer.link.url))}" style="color:#666">${escapeHtml(footer.link.label)}</a>` : ''}</p>`
    : '';

  return {
    text: [
      heading,
      '',
      ...lines,
      ...(action ? ['', `${action.label}: ${actionUrl}`] : []),
      ...(footer ? ['', footer.text, ...(footer.link ? [`${footer.link.label}: ${absolute(footer.link.url)}`] : [])] : [])
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px;margin:0 auto">
      <div style="padding:12px 16px;background:#1f2226;color:#fff;font-size:18px;font-weight:bold">teklif<span style="margin-left:3px;padding:0 6px;background:#ffc61a;color:#1c1e21">ver</span></div>
      <div style="padding:16px;border:1px solid #d9dde1;border-top:0">
        <h1 style="margin:0 0 12px;font-size:17px">${escapeHtml(heading)}</h1>
        ${paragraphs}${button}${footerHtml}
      </div>
    </div>`
  };
}

function verificationCodeMail(code, name) {
  const formattedCode = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    subject: `TeklifVer Onay Kodunuz: ${code}`,
    text: `Merhaba ${name || 'Kullanıcı'},\n\nTeklifVer hesabınızı onaylamak için doğrulama kodunuz: ${code}\n\nBu kod 15 dakika boyunca geçerlidir.\nGüvenliğiniz için bu kodu kimseyle paylaşmayın.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #1f3b57;">
          <h2 style="margin: 0; color: #1f3b57; font-size: 26px; font-weight: bold;">teklif<span style="color: #f7a35c;">ver</span></h2>
        </div>
        <div style="padding: 24px 8px; text-align: center;">
          <h3 style="margin: 0 0 12px; color: #1a202c; font-size: 19px;">E-posta Doğrulama Kodu</h3>
          <p style="color: #4a5568; font-size: 14.5px; margin: 0 0 20px; line-height: 1.5;">
            Merhaba <strong>${escapeHtml(name || '')}</strong>,<br>
            TeklifVer hesabınıza güvenle giriş yapabilmek için doğrulama kodunuz:
          </p>
          <div style="background: #f0f7ff; border: 2px dashed #0b5cad; padding: 14px 24px; border-radius: 8px; display: inline-block; margin-bottom: 20px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0b5cad; font-family: monospace;">${formattedCode}</span>
          </div>
          <p style="color: #718096; font-size: 13px; margin: 0;">
            ⏳ Bu kod <strong>15 dakika</strong> boyunca geçerlidir.<br>
            Güvenliğiniz için bu kodu kimseyle paylaşmayın.
          </p>
        </div>
        <div style="text-align: center; padding-top: 14px; border-top: 1px solid #edf2f7; color: #a0aec0; font-size: 11.5px;">
          © 2026 TeklifVer. Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın.
        </div>
      </div>
    `
  };
}

function verificationMail(token) {
  return {
    subject: 'TeklifVer e-posta doğrulama',
    ...renderMail({
      heading: 'E-posta adresinizi doğrulayın',
      lines: ['Hesabınızı kullanmaya başlamak için aşağıdaki bağlantıyı açın. Bağlantı 24 saat geçerlidir.', 'Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın.'],
      action: { label: 'E-postamı Doğrula', url: `/email/verify/${token}` }
    })
  };
}

function resetMail(link) {
  return {
    subject: 'TeklifVer şifre sıfırlama',
    ...renderMail({
      heading: 'Şifrenizi sıfırlayın',
      lines: ['Şifrenizi sıfırlamak için aşağıdaki bağlantıyı açın. Bağlantı 1 saat geçerlidir.', 'Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın, şifreniz değişmez.'],
      action: { label: 'Şifremi Sıfırla', url: link }
    })
  };
}

function emailChangeNotice(newEmail) {
  return {
    subject: 'TeklifVer e-posta değişikliği isteği',
    ...renderMail({
      heading: 'E-posta değişikliği istendi',
      lines: [`Hesabınızın e-posta adresini ${newEmail} olarak değiştirme isteği alındı. Yeni adres doğrulanınca değişiklik tamamlanır.`, 'Bu isteği siz yapmadıysanız hemen şifrenizi değiştirin.']
    })
  };
}

function passwordChangedMail() {
  return {
    subject: 'TeklifVer şifreniz değiştirildi',
    ...renderMail({
      heading: 'Şifreniz değiştirildi',
      lines: ['Hesabınızın şifresi değiştirildi ve diğer cihazlardaki oturumlar kapatıldı.', 'Bu işlemi siz yapmadıysanız hemen şifremi unuttum bağlantısını kullanın.'],
      action: { label: 'Şifremi Unuttum', url: '/forgot' }
    })
  };
}

const CATEGORY_LABELS = {
  bids: 'teklif bildirimleri',
  messages: 'mesaj bildirimleri',
  matches: 'uygun talep bildirimleri',
  searches: 'kayıtlı arama bildirimleri'
};

const signature = value =>
  crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`unsub:${value}`).digest('base64url').slice(0, 32);

// Giriş yapmadan bildirim kapatmak için imzalı bağlantı
const unsubscribeToken = (userId, category) => `${userId}.${category}.${signature(`${userId}.${category}`)}`;

function readUnsubscribeToken(token) {
  const [userId, category, given] = String(token).split('.');
  if (!userId || !category || !given || !Object.hasOwn(CATEGORY_LABELS, category)) return null;
  const expected = Buffer.from(signature(`${userId}.${category}`));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return { userId, category };
}

function notificationMail(userId, category, text, url) {
  return {
    subject: `TeklifVer: ${text.length > 70 ? `${text.slice(0, 70)}...` : text}`,
    ...renderMail({
      heading: 'Yeni bildiriminiz var',
      lines: [text],
      action: { label: 'Görüntüle', url },
      footer: {
        text: `Bu e-postayı ${CATEGORY_LABELS[category]} açık olduğu için aldınız.`,
        link: { label: 'Bu bildirimleri kapat', url: `/email/unsub/${unsubscribeToken(userId, category)}` }
      }
    })
  };
}

module.exports = {
  CATEGORY_LABELS,
  verificationCodeMail,
  verificationMail,
  resetMail,
  emailChangeNotice,
  passwordChangedMail,
  notificationMail,
  readUnsubscribeToken
};
