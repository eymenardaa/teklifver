// Sitenin dış adresi. Bağlantılar istekteki Host başlığından üretilirse saldırgan,
// şifre sıfırlama e-postasına kendi alan adını yazdırabilir; bu yüzden ayar önceliklidir.
const clean = url => url.replace(/\/+$/, '');
const configuredUrl = () => process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || '';

const siteUrl = req => clean(configuredUrl() || `${req.protocol}://${req.get('host')}`);

// İstek dışında (arka planda giden e-postalarda) kullanılır.
const baseUrl = () => clean(configuredUrl() || `http://localhost:${process.env.PORT || 3000}`);

module.exports = { siteUrl, baseUrl, configuredUrl };
