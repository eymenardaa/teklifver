// Örnek hesapları, talepleri, teklifleri ve mesajları siler. Sunucu kapalıyken çalıştırın.
require('dotenv').config();
const connectDatabase = require('../config/db');
const { removeDemoData, markDemoRemoved } = require('../config/demo');

(async () => {
  await connectDatabase();
  const removed = await removeDemoData();
  await markDemoRemoved();
  console.log(`  ${removed.users} örnek hesap ve ${removed.requests} örnek talep silindi.`);
  await connectDatabase.closeDatabase();
  process.exit(0);
})().catch(err => {
  console.error('Silinemedi:', err.message);
  process.exit(1);
});
