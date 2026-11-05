const categories = require('../config/categories');
const cities = require('../config/cities');

const LETTERS = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' };

// "İnşaat & Tadilat" -> "insaat-tadilat"
function slugify(text) {
  return String(text)
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşü]/g, letter => LETTERS[letter])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const categoryBySlug = new Map(categories.map(category => [slugify(category.name), category]));
const cityBySlug = new Map(cities.map(city => [slugify(city), city]));

const categoryUrl = name => `/hizmet/${slugify(name)}`;
const cityUrl = name => `/il/${slugify(name)}`;
const categoryCityUrl = (category, city) => `/hizmet/${slugify(category)}/${slugify(city)}`;

module.exports = { slugify, categoryBySlug, cityBySlug, categoryUrl, cityUrl, categoryCityUrl };
