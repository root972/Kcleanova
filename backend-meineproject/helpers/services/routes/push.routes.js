const express = require('express');
const router = express.Router();
const { addSubscription } = require('../push.service');

router.post('/subscribe', (req, res) => {
  addSubscription(req.body);
  res.status(201).json({ message: 'Subscribed successfully' });
});

module.exports = router;