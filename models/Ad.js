const mongoose = require('mongoose');

// Yönetim panelinden eklenen reklamlar
const adSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 80 },
  text: { type: String, trim: true, maxlength: 140 },
  cta: { type: String, trim: true, maxlength: 24, default: 'İncele' },
  url: { type: String, required: true, trim: true, maxlength: 500 },
  color: { type: String, enum: ['orange', 'navy', 'green', 'yellow', 'red'], default: 'navy' },
  // Hazır banner görseli; varsa yazılar yerine gösterilir
  banner: { type: String, default: '' },
  active: { type: Boolean, default: true },
  startsAt: Date,
  endsAt: Date,
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('Ad', adSchema);
