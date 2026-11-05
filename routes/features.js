const express = require('express');
const router = express.Router();
const { getAiPriceEstimate, generateAiEnhancedDescription } = require('../lib/ai');
const User = require('../models/User');
const { isLoggedIn, isCompany } = require('../middleware/auth');

// Yapay Zekâ Fiyat Tahmini Endpoint
router.post('/ai/price-estimate', (req, res) => {
  const { category, description } = req.body;
  if (!category) return res.status(400).json({ error: 'Kategori gerekli' });
  const estimate = getAiPriceEstimate(category, description);
  res.json(estimate);
});

// Yapay Zekâ İlan Geliştirme Endpoint
router.post('/ai/enhance-description', (req, res) => {
  const { category, text } = req.body;
  if (!category) return res.status(400).json({ error: 'Kategori gerekli' });
  const enhanced = generateAiEnhancedDescription(category, text);
  res.json({ enhanced });
});

// Firma Paket Yükseltme Endpoint
router.post('/plan/upgrade', isCompany, async (req, res) => {
  try {
    const { plan } = req.body;
    const validPlans = {
      pro: { credits: 50, name: 'Pro Paket' },
      enterprise: { credits: 9999, name: 'Sınırsız Kurumsal Paket' }
    };

    if (!validPlans[plan]) {
      req.flash('error', 'Geçersiz paket seçimi.');
      return res.redirect('/dashboard/plans');
    }

    await User.updateOne(
      { _id: req.session.user.id },
      {
        plan,
        bidCredits: validPlans[plan].credits
      }
    );

    req.flash('success', `Tebrikler! ${validPlans[plan].name} üyeliğiniz başarıyla aktif edildi.`);
    res.redirect('/dashboard/plans');
  } catch (err) {
    req.flash('error', 'Paket güncellenirken bir hata oluştu.');
    res.redirect('/dashboard/plans');
  }
});

module.exports = router;
