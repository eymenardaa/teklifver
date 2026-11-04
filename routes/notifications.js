const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { isLoggedIn } = require('../middleware/auth');

router.get('/', isLoggedIn, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.session.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.render('notifications/index', { title: 'Bildirimler', section: 'notifications', notifications });
  } catch (err) {
    next(err);
  }
});

// Bildirimi okundu yapıp ilgili sayfaya götürür
router.get('/:id/open', isLoggedIn, async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.session.user.id },
      { read: true }
    );
    res.redirect(notification ? notification.url : '/notifications');
  } catch (err) {
    if (err.name === 'CastError') return res.redirect('/notifications');
    next(err);
  }
});

router.post('/read-all', isLoggedIn, async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.session.user.id, read: false }, { read: true });
    res.redirect('/notifications');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
