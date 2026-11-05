const mongoose = require('mongoose');

const REPORT_REASONS = [
  'Yanıltıcı veya sahte talep',
  'Reklam veya spam',
  'Hakaret veya uygunsuz içerik',
  'Yanlış kategori',
  'Diğer'
];

const reportSchema = new mongoose.Schema({
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    enum: REPORT_REASONS,
    required: true
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open'
  }
}, {
  timestamps: true
});

// Aynı kişi aynı talebi bir kez şikayet edebilir.
reportSchema.index({ request: 1, reporter: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);
module.exports.REPORT_REASONS = REPORT_REASONS;
