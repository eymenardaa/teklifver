const User = require('../models/User');
const PLANS = require('../config/plans');

// Ay Türkiye saatine göre döner (UTC+3, yaz saati yok).
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

function monthKey(now = Date.now()) {
  const local = new Date(now + TR_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

const planOf = company => PLANS[company && company.plan] || PLANS.free;

const usedThisMonth = company =>
  (company && company.bidUsage && company.bidUsage.month === monthKey() ? company.bidUsage.count || 0 : 0);

function bidAllowance(company) {
  const plan = planOf(company);
  const used = usedThisMonth(company);
  if (plan.monthlyBids === null) return { plan, used, left: null, limited: false };
  return { plan, used, left: Math.max(0, plan.monthlyBids - used), limited: true };
}

// Teklif hakkından bir tane ayırır. Sayaç ayrı tutulur: teklifi geri çekmek hakkı geri vermez,
// yoksa teklif verip çekerek sınır aşılabilirdi. Koşullu güncelleme aynı anda gelen iki isteği de durdurur.
async function useBidSlot(companyId) {
  const month = monthKey();
  await User.updateOne({ _id: companyId, 'bidUsage.month': { $ne: month } }, { $set: { bidUsage: { month, count: 0 } } });
  const company = await User.findById(companyId).select('plan').lean();
  const plan = planOf(company);
  const filter = { _id: companyId, 'bidUsage.month': month };
  if (plan.monthlyBids !== null) filter['bidUsage.count'] = { $lt: plan.monthlyBids };
  const result = await User.updateOne(filter, { $inc: { 'bidUsage.count': 1 } });
  return result.modifiedCount === 1;
}

// Teklif kaydedilemezse ayrılan hak geri verilir.
const refundBidSlot = companyId =>
  User.updateOne({ _id: companyId, 'bidUsage.month': monthKey(), 'bidUsage.count': { $gt: 0 } }, { $inc: { 'bidUsage.count': -1 } });

module.exports = { PLANS, planOf, bidAllowance, useBidSlot, refundBidSlot, monthKey };
