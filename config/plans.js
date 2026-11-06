// Firma paketleri. Sitede ödeme altyapısı yok; paket değişikliğini yönetici panelden yapar.
// monthlyBids: null sınırsız demektir.
const PLANS = {
  free: { key: 'free', name: 'Başlangıç', price: 0, monthlyBids: 10 },
  pro: { key: 'pro', name: 'Pro', price: 490, monthlyBids: 50 },
  enterprise: { key: 'enterprise', name: 'Kurumsal', price: 1250, monthlyBids: null }
};

module.exports = PLANS;
