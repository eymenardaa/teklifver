const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const User = require('../models/User');
const categories = require('../config/categories');
const { liveFilter } = require('../lib/listing');

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
