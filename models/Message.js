const mongoose = require('mongoose');

const MAX_MESSAGE_LENGTH = 2000;

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: MAX_MESSAGE_LENGTH
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Üst menüdeki okunmamış sayısı ve konuşma sayfası için
messageSchema.index({ receiver: 1, read: 1 });
messageSchema.index({ request: 1, sender: 1, receiver: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
module.exports.MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH;
