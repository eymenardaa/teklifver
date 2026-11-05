// Sunucuya -r ile yüklenir: oturum yazmayı yavaşlatır, uzak veritabanındaki gecikmeyi taklit eder.
const path = require('path');
const MongoStore = require(path.join(__dirname, '..', '..', 'node_modules', 'connect-mongo'));

const Store = MongoStore.default || MongoStore;
const originalSet = Store.prototype.set;
Store.prototype.set = function slowSet(sid, session, callback) {
  setTimeout(() => originalSet.call(this, sid, session, callback), 200);
};
