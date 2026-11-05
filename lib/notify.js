const Notification = require('../models/Notification');
const User = require('../models/User');
const { isEnabled, sendInBackground } = require('./mailer');
const { notificationMail } = require('./mail-templates');

// Bildirimi e-postayla da gönderir; kullanıcı bu türü kapattıysa göndermez. Asıl işlemi bekletmez.
async function deliverMail(userIds, category, text, url) {
  if (!category || !isEnabled() || !userIds.length) return;
  const people = await User.find({ _id: { $in: userIds }, suspended: { $ne: true } }).select('email emailPrefs').lean();
  for (const person of people) {
    if (person.emailPrefs && person.emailPrefs[category] === false) continue;
    sendInBackground({ to: person.email, ...notificationMail(String(person._id), category, text, url) });
  }
}

// Bildirim hatası asıl işlemi bozmasın diye yalnızca günlüğe yazılır.
async function notify(user, text, url, { mail } = {}) {
  try {
    await Notification.create({ user, text, url });
    await deliverMail([user], mail, text, url);
  } catch (err) {
    console.error('Bildirim oluşturulamadı:', err.message);
  }
}

async function notifyMany(users, text, url, { mail } = {}) {
  if (!users.length) return;
  try {
    await Notification.insertMany(users.map(user => ({ user, text, url })));
    await deliverMail(users, mail, text, url);
  } catch (err) {
    console.error('Bildirimler oluşturulamadı:', err.message);
  }
}

module.exports = { notify, notifyMany };
