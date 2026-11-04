const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Teklif tutarı gereklidir'],
    min: 0
  },
  description: {
    type: String,
    required: [true, 'Teklif açıklaması gereklidir'],
    trim: true
  },
  deliveryTime: {
    type: Number, // gün cinsinden
    required: [true, 'Teslim süresi gereklidir']
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Aynı şirket aynı talebe birden fazla teklif veremesin
bidSchema.index({ request: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Bid', bidSchema);
