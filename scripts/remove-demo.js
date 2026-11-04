// Örnek hesapları, talepleri, teklifleri ve mesajları siler. Sunucu kapalıyken çalıştırın.
require('dotenv').config();
const connectDatabase = require('../config/db');
const { removeDemoData } = require('../config/demo');

(async () => {
  await connectDatabase();
  const removed = await removeDemoData();
  console.log(`  ${removed.users} örnek hesap ve ${removed.requests} örnek talep silindi.`);
  console.log('  Tekrar eklenmemesi için .env dosyasına DEMO_DATA=false yazın.');
  await connectDatabase.closeDatabase();
  process.exit(0);
})().catch(err => {
  console.error('Silinemedi:', err.message);
  process.exit(1);
});
