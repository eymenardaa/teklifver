const mongoose = require('mongoose');

const COMPANY_REPORT_REASONS = [
  'Sahte veya yanıltıcı firma',
  'Dolandırıcılık şüphesi',
  'Hakaret veya uygunsuz davranış',
  'İşi yapmadı veya yarım bıraktı',
  'Diğer'
];

const companyReportSchema = new mongoose.Schema({
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: COMPANY_REPORT_REASONS, required: true },
  note: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' }
}, {
  timestamps: true
});

// Aynı kişi aynı firmayı bir kez şikayet edebilir.
companyReportSchema.index({ company: 1, reporter: 1 }, { unique: true });
companyReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CompanyReport', companyReportSchema);
module.exports.COMPANY_REPORT_REASONS = COMPANY_REPORT_REASONS;
