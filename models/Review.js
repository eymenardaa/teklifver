const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true,
    unique: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  // Firmanın yoruma cevabı
  reply: {
    text: { type: String, trim: true, maxlength: 1000 },
    at: Date
  },
  // Yönetici gizlerse görünmez ve puana katılmaz
  hidden: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

reviewSchema.index({ company: 1, createdAt: -1 });
reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
