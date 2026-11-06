const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'İsim gereklidir'],
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: [true, 'E-posta gereklidir'],
    unique: true,
    lowercase: true,
    trim: true
  },
  // Google, Facebook veya Microsoft ile açılan hesaplarda şifre olmayabilir.
  password: {
    type: String,
    required: [function() { return !(this.socialAccounts && this.socialAccounts.length); }, 'Şifre gereklidir']
  },
  // Şifre değişince artar; eski oturumlar geçersiz olur.
  sessionVersion: {
    type: Number,
    default: 0
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  // Giriş ve kayıt kodu: yalnızca özeti saklanır.
  emailCode: String,
  emailCodeHash: String,
  emailCodeExpires: Date,
  emailCodeSentAt: Date,
  emailCodeTries: {
    type: Number,
    default: 0
  },
  emailTokenHash: String,
  emailTokenExpires: Date,
  // Doğrulanana kadar hesabın e-postası değişmez.
  pendingEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  // E-postayla gönderilecek bildirim türleri
  emailPrefs: {
    bids: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    matches: { type: Boolean, default: true },
    searches: { type: Boolean, default: true }
  },
  socialAccounts: [{
    _id: false,
    provider: { type: String, required: true },
    providerId: { type: String, required: true }
  }],
  role: {
    type: String,
    enum: ['customer', 'company'],
    required: true
  },
  // Şirket bilgileri
  companyName: {
    type: String,
    trim: true,
    maxlength: 120
  },
  companyDescription: {
    type: String,
    trim: true,
    maxlength: 3000
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 25
  },
  address: {
    type: String,
    trim: true,
    maxlength: 200
  },
  avatar: {
    type: String,
    default: ''
  },
  // Firma sayfasındaki iş örnekleri
  portfolio: [{
    type: String
  }],
  specialties: [{
    type: String,
    trim: true
  }],
  // Firmanın hizmet verdiği kategoriler; uygun talep bildirimleri buna göre gider
  categories: [{
    type: String
  }],
  // Firmanın hizmet verdiği iller; boşsa tüm Türkiye
  serviceCities: [{
    type: String
  }],
  // Firma sayfasının kaç kez açıldığı
  profileViews: {
    type: Number,
    default: 0
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationDoc: {
    type: String,
    default: ''
  },
  verificationStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },
  verificationNote: {
    type: String,
    default: ''
  },
  balance: {
    type: Number,
    default: 0
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  suspended: {
    type: Boolean,
    default: false
  },
  resetTokenHash: {
    type: String
  },
  resetTokenExpires: {
    type: Date
  },
  // Kullanım koşulları ve aydınlatma metninin onaylandığı an
  termsAcceptedAt: {
    type: Date
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request'
  }],
  rating: {
    type: Number,
    default: 0
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  // Firma paketi; aylık teklif hakkı config/plans.js dosyasındadır.
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  // Bu ay gönderilen teklif sayısı (ay değişince sıfırlanır)
  bidUsage: {
    month: String,
    count: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Şifre hashleme
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Şifre karşılaştırma
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ role: 1, rating: -1, ratingCount: -1 });

// Aynı sosyal hesap iki kullanıcıya bağlanamaz.
userSchema.index(
  { 'socialAccounts.provider': 1, 'socialAccounts.providerId': 1 },
  { unique: true, partialFilterExpression: { 'socialAccounts.provider': { $exists: true } } }
);

module.exports = mongoose.model('User', userSchema);
