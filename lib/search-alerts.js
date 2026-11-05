const SavedSearch = require('../models/SavedSearch');
const { readFilters, matchesFilters } = require('./listing');
const { notifyMany } = require('./notify');

const MAX_SEARCHES = 5000;

// Yeni talep, kayıtlı aramalardan birine uyuyorsa arama sahibine haber verir.
async function alertSavedSearches(request, { except = [] } = {}) {
  const skip = new Set([String(request.customer), ...except.map(String)]);
  const searches = await SavedSearch.find().select('user query').limit(MAX_SEARCHES).lean();

  const users = new Set();
  for (const search of searches) {
    const owner = String(search.user);
    if (skip.has(owner) || users.has(owner)) continue;
    if (matchesFilters(request, readFilters(Object.fromEntries(new URLSearchParams(search.query))))) users.add(owner);
  }

  await notifyMany([...users], `Kayıtlı aramanıza uyan yeni talep: "${request.title}"`, `/requests/${request._id}`, { mail: 'searches' });
}

module.exports = { alertSavedSearches };
