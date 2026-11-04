const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const User = require('../models/User');
const categories = require('../config/categories');
const { rateLimit } = require('express-rate-limit');
const { liveFilter } = require('../lib/listing');
const { openCountsByCategory, priceGuide } = require('../lib/stats');
const { str, isEmail } = require('../lib/input');
const { sendMail } = require('../lib/mailer');

const pages = {
  '/yardim': { view: 'help', title: 'Yardım' },
  '/reklam': { view: 'ads', title: 'Reklam Ver' },
  '/kullanim-kosullari': { view: 'terms', title: 'Kullanım Koşulları' },
  '/gizlilik': { view: 'privacy', title: 'Gizlilik ve KVKK Aydınlatma Metni' },
  '/cerez-politikasi': { view: 'cookies', title: 'Çerez Politikası' }
};

Object.entries(pages).forEach(([path, page]) => {
  router.get(path, (req, res) => {
    res.render(`pages/${page.view}`, { title: page.title, pagePath: path });
  });
});

// Tüm kategoriler, alt başlıkları ve talep sayılarıyla
router.get('/kategoriler', async (req, res, next) => {
  try {
    res.render('pages/categories', {
      title: 'Tüm Kategoriler',
      metaDescription: 'Tadilat, nakliye, temizlik, yazılım ve daha fazlası: tüm hizmet kategorileri.',
      counts: await openCountsByCategory()
    });
  } catch (err) {
    next(err);
  }
});

router.get('/fiyat-rehberi', async (req, res, next) => {
  try {
    res.render('pages/price-guide', {
      title: 'Fiyat Rehberi',
      metaDescription: 'Kategorilere göre verilen tekliflerin ortalaması, en düşük ve en yüksek tutarları.',
      guide: await priceGuide()
    });
  } catch (err) {
    next(err);
  }
});

router.get('/iller', async (req, res, next) => {
  try {
    const rows = await Request.aggregate([
      { $match: liveFilter() },
      { $group: { _id: '$city', total: { $sum: 1 } } }
    ]);
    res.render('pages/cities', {
      title: 'İllere Göre Talepler',
      metaDescription: '81 ilde açık hizmet talepleri.',
      cityCounts: Object.fromEntries(rows.map(row => [row._id, row.total]))
    });
  } catch (err) {
    next(err);
  }
});

const CONTACT_SUBJECTS = ['Genel soru', 'Hesabımla ilgili sorun', 'Şikayet', 'Reklam', 'Öneri'];
const MAX_CONTACT_MESSAGE = 2000;

const renderContact = (res, extra = {}) =>
  res.render('pages/contact', { title: 'İletişim', pagePath: '/iletisim', subjects: CONTACT_SUBJECTS, ...extra });

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429);
    renderContact(res, { values: req.body, errors: { form: 'Çok fazla mesaj gönderildi. Lütfen 15 dakika sonra tekrar deneyin.' } });
  }
});

router.get('/iletisim', (req, res) => {
  const user = req.session.user;
  renderContact(res, { values: user ? { name: user.name, email: user.email } : {} });
});

router.post('/iletisim', contactLimiter, async (req, res, next) => {
  const values = {
    name: str(req.body.name),
    email: str(req.body.email).toLowerCase(),
    subject: str(req.body.subject),
    message: str(req.body.message)
  };

  // Formdaki gizli alanı yalnızca otomatik doldurucular doldurur.
  if (str(req.body.website)) {
    req.flash('success', 'Mesajınız alındı. Teşekkür ederiz.');
    return res.redirect('/iletisim');
  }

  const errors = {};
  if (!values.name) errors.name = 'Adınızı yazın.';
  if (!isEmail(values.email)) errors.email = 'Geçerli bir e-posta adresi yazın.';
  if (!CONTACT_SUBJECTS.includes(values.subject)) errors.subject = 'Konu seçin.';
  if (!values.message) errors.message = 'Mesajınızı yazın.';
  else if (values.message.length > MAX_CONTACT_MESSAGE) errors.message = `Mesaj en fazla ${MAX_CONTACT_MESSAGE} karakter olabilir.`;

  if (Object.keys(errors).length) {
    res.status(422);
    return renderContact(res, { values, errors });
  }

  try {
    const to = process.env.SITE_EMAIL;
    const sent = (to || process.env.NODE_ENV !== 'production') && await sendMail({
      to: to || 'iletisim@localhost',
      subject: `TeklifVer iletişim: ${values.subject}`,
      text: `Gönderen: ${values.name}\nE-posta: ${values.email}\nKonu: ${values.subject}\n\n${values.message}`
    });
    if (!sent) {
      res.status(503);
      return renderContact(res, { values, errors: { form: 'İletişim formu şu anda kullanılamıyor.' } });
    }
    req.flash('success', 'Mesajınız alındı. Teşekkür ederiz.');
    res.redirect('/iletisim');
  } catch (err) {
    next(err);
  }
});

const baseUrl = req => process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Disallow: /dashboard',
      'Disallow: /messages',
      'Disallow: /notifications',
      'Disallow: /profile',
      'Disallow: /admin',
      'Disallow: /reset',
      `Sitemap: ${baseUrl(req)}/sitemap.xml`
    ].join('\n')
  );
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = baseUrl(req);
    const [requests, firms] = await Promise.all([
      Request.find(liveFilter()).select('updatedAt').sort({ createdAt: -1 }).limit(5000).lean(),
      User.find({ role: 'company', suspended: { $ne: true } }).select('updatedAt').limit(5000).lean()
    ]);

    const entry = (path, date) =>
      `<url><loc>${base}${path}</loc>${date ? `<lastmod>${new Date(date).toISOString()}</lastmod>` : ''}</url>`;

    const urls = [
      entry('/'),
      entry('/requests'),
      entry('/companies'),
      entry('/yardim'),
      entry('/kategoriler'),
      entry('/fiyat-rehberi'),
      entry('/iller'),
      entry('/iletisim'),
      ...categories.names.map(name => entry(`/requests?category=${encodeURIComponent(name)}`)),
      ...requests.map(item => entry(`/requests/${item._id}`, item.updatedAt)),
      ...firms.map(item => entry(`/companies/${item._id}`, item.updatedAt))
    ];

    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
