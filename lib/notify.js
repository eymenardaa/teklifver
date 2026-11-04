const Notification = require('../models/Notification');

// Bildirim hatası asıl işlemi bozmasın diye yalnızca günlüğe yazılır.
async function notify(user, text, url) {
  try {
    await Notification.create({ user, text, url });
  } catch (err) {
    console.error('Bildirim oluşturulamadı:', err.message);
  }
}

async function notifyMany(users, text, url) {
  if (!users.length) return;
  try {
    await Notification.insertMany(users.map(user => ({ user, text, url })));
  } catch (err) {
    console.error('Bildirimler oluşturulamadı:', err.message);
  }
}

module.exports = { notify, notifyMany };
