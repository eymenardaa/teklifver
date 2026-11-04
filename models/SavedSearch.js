const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  // /requests adresine eklenen sorgu metni
  query: {
    type: String,
    default: '',
    maxlength: 500
  },
  // Bu tarihten sonra eklenen talepler "yeni" sayılır
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

savedSearchSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
