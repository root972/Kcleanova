const express = require('express');
const router = express.Router();
const { addSubscription } = require('../services/push.service');

router.post('/subscribe', async (req, res) => {
  try {
    await addSubscription(req.body);
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) {
    console.error('Subscribe route error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

module.exports = router;