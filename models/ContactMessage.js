const mongoose = require('mongoose');

// İletişim formundan gelen mesajlar; SMTP olmasa da yönetim panelinde okunabilir.
const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  subject: { type: String, required: true, trim: true, maxlength: 60 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' }
}, {
  timestamps: true
});

contactMessageSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
