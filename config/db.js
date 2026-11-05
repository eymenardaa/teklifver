const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

let embedded = null;

// Geliştirmede MongoDB kurulu değilse, veriyi .data/mongo içinde saklayan gömülü
// bir MongoDB başlatılır. Böylece proje ek kurulum olmadan çalışır.
async function startEmbedded() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const dbPath = path.join(__dirname, '..', '.data', 'mongo');
  fs.mkdirSync(dbPath, { recursive: true });

  console.log('  Yerel MongoDB bulunamadı, gömülü veritabanı başlatılıyor...');
  console.log('  (İlk çalıştırmada MongoDB bir kez indirilir, birkaç dakika sürebilir.)');

  let server;
  try {
    server = await MongoMemoryServer.create({
      instance: { dbPath, dbName: 'teklifver', storageEngine: 'wiredTiger' }
    });
  } catch (err) {
    // 3221225781 = 0xC0000135: Windows'ta MongoDB'nin ihtiyaç duyduğu DLL bulunamadı.
    if (String(err.message).includes('3221225781')) {
      throw new Error(
        'Microsoft Visual C++ Runtime eksik olduğu için MongoDB açılamadı.\n' +
          '  Kurmak için: winget install --id Microsoft.VCRedist.2015+.x64\n' +
          '  Alternatif: .env içindeki MONGODB_URI değerine bir MongoDB Atlas adresi yazın.'
      );
    }
    throw err;
  }

  const stop = () => server.stop({ doCleanup: false }).finally(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  embedded = server;

  // Windows'ta süreç doğrudan sonlandırılır; yazılar diske geçmeden onaylanırsa kaybolabilir.
  const uri = new URL(server.getUri('teklifver'));
  uri.searchParams.set('journal', 'true');
  return uri.toString();
}

// Bağlantıyı kapatır; gömülü veritabanı açıksa yazılanların diske geçmesi için düzgünce durdurur.
async function closeDatabase() {
  await mongoose.disconnect();
  if (embedded) await embedded.stop({ doCleanup: false });
}

// Bağlanılan adresi döndürür; oturum deposu da aynı adresi kullanır.
async function connectDatabase() {
  const configuredUri = process.env.MONGODB_URI;

  if (configuredUri) {
    try {
      // Canlıda bulut veritabanının ilk bağlantısı birkaç saniye sürebilir.
      const timeout = process.env.NODE_ENV === 'production' ? 20000 : 2500;
      await mongoose.connect(configuredUri, { serverSelectionTimeoutMS: timeout });
      console.log('  MongoDB bağlantısı kuruldu.');
      return configuredUri;
    } catch (err) {
      await mongoose.disconnect().catch(() => {});
      if (process.env.NODE_ENV === 'production') throw err;
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI tanımlı değil.');
  }

  const embeddedUri = await startEmbedded();
  await mongoose.connect(embeddedUri);
  console.log('  Gömülü veritabanı hazır (.data/mongo).');
  return embeddedUri;
}

module.exports = connectDatabase;
module.exports.closeDatabase = closeDatabase;
