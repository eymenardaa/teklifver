const mongoose = require('mongoose');
const { names: categoryNames } = require('../config/categories');

const newRequestNumber = () => 1000000000 + Math.floor(Math.random() * 899999999);

const requestSchema = new mongoose.Schema({
  // Kullanıcıya gösterilen talep numarası
  no: {
    type: Number,
    default: newRequestNumber,
    unique: true,
    sparse: true
  },
  title: {
    type: String,
    required: [true, 'Başlık gereklidir'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: [true, 'Açıklama gereklidir'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Kategori gereklidir'],
    enum: categoryNames
  },
  budget: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 }
  },
  deadline: {
    type: Date
  },
  city: {
    type: String,
    trim: true
  },
  // İlçe veya semt
  location: {
    type: String,
    trim: true
  },
  images: [{
    type: String
  }],
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'completed', 'cancelled', 'removed'],
    default: 'open'
  },
  acceptedBid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid'
  },
  bidCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Arama indexi
requestSchema.index({ title: 'text', description: 'text' });

// Bu alan eklenmeden önce oluşturulmuş taleplere numara verir.
requestSchema.statics.assignMissingNumbers = async function () {
  const missing = await this.find({ no: { $exists: false } }).select('_id');
  for (const request of missing) {
    await this.updateOne({ _id: request._id }, { $set: { no: newRequestNumber() } });
  }
};

module.exports = mongoose.model('Request', requestSchema);
