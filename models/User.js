const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'İsim gereklidir'],
    trim: true
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
    trim: true
  },
  companyDescription: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    default: ''
  },
  specialties: [{
    type: String,
    trim: true
  }],
  // Firmanın hizmet verdiği kategoriler; uygun talep bildirimleri buna göre gider
  categories: [{
    type: String
  }],
  verified: {
    type: Boolean,
    default: false
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

// Aynı sosyal hesap iki kullanıcıya bağlanamaz.
userSchema.index(
  { 'socialAccounts.provider': 1, 'socialAccounts.providerId': 1 },
  { unique: true, partialFilterExpression: { 'socialAccounts.provider': { $exists: true } } }
);

module.exports = mongoose.model('User', userSchema);
