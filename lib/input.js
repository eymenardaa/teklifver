// Formdan gelen değerleri güvenle okur. Nesne/dizi gönderilerek yapılan
// sorgu enjeksiyonlarını engellemek için yalnızca metin kabul edilir.
const str = value => (typeof value === 'string' ? value.trim() : '');

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Türkçede büyük/küçük i ayrı harfler olduğu için aramada dördü de eşleştirilir.
const searchPattern = text => escapeRegex(text).replace(/[iıİI]/g, '[iıİI]');

const isEmail = text => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);

// Yalnızca site içi yönlendirmelere izin verir (açık yönlendirmeyi önler).
function safeNext(value) {
  const next = str(value);
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '';
}

module.exports = { str, escapeRegex, searchPattern, isEmail, safeNext };
