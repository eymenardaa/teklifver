// Yasal sayfalarda ve reklam sayfasında görünen bilgiler. .env dosyasından doldurulur.
module.exports = {
  company: process.env.SITE_COMPANY || 'TeklifVer',
  email: process.env.SITE_EMAIL || ''
};
