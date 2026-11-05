const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Request = require('../models/Request');
const Review = require('../models/Review');
const User = require('../models/User');
const { notify, notifyMany } = require('./notify');

// Puan her zaman görünür yorumlardan hesaplanır; eşzamanlı puanlamada değer bozulmaz.
async function recalcCompanyRating(companyId) {
  const [row] = await Review.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(String(companyId)), hidden: { $ne: true } } },
    { $group: { _id: null, average: { $avg: '$rating' }, total: { $sum: 1 } } }
  ]);
  await User.updateOne(
    { _id: companyId },
    { rating: row ? Math.round(row.average * 10) / 10 : 0, ratingCount: row ? row.total : 0 }
  );
}

// İşi yapan firmaya yorum ekler; talep başına tek yorum olabilir.
async function saveReview(request, customerId, rating, comment) {
  const bid = request.acceptedBid ? await Bid.findById(request.acceptedBid).select('company') : null;
  const company = bid ? await User.findById(bid.company).select('_id') : null;
  if (!company) return false;

  await Review.create({ company: company._id, customer: customerId, request: request._id, rating, comment });
  await recalcCompanyRating(company._id);
  await notify(company._id, `"${request.title}" işi için ${rating} yıldız aldınız.`, `/companies/${company._id}`, { mail: 'bids' });
  return true;
}

// Anlaşma bozulunca talep yeniden açılır; kabul yüzünden elenen teklifler tekrar değerlendirmeye girer.
async function cancelDeal(bid) {
  const request = await Request.findOneAndUpdate(
    { _id: bid.request._id || bid.request, status: 'in_progress', acceptedBid: bid._id },
    { status: 'open', $unset: { acceptedBid: 1 } }
  );
  if (!request) return null;

  await Bid.updateOne({ _id: bid._id }, { status: 'cancelled' });
  const revived = await Bid.find({ request: request._id, autoRejected: true }).select('company');
  await Bid.updateMany({ request: request._id, autoRejected: true }, { status: 'pending', autoRejected: false });
  await notifyMany(
    revived.map(item => item.company),
    `"${request.title}" talebi yeniden açıldı, teklifiniz tekrar değerlendirmede.`,
    `/requests/${request._id}`,
    { mail: 'bids' }
  );
  return request;
}

module.exports = { recalcCompanyRating, saveReview, cancelDeal };
