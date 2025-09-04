const express = require('express');
const validator = require('validator');
const Feedback = require('../models/Feedback');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { rating, comment, anonymous, name, email } = req.body;
  if (typeof rating !== 'number' || rating < 1 || rating > 5 || !comment || typeof anonymous !== 'boolean') {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (!anonymous) {
    if (!name || !email || !validator.isEmail(email)) {
      return res.status(400).json({ error: 'Name and valid email required' });
    }
  }
  try {
    const feedback = await Feedback.create({ rating, comment, anonymous, name: anonymous ? undefined : name, email: anonymous ? undefined : email });
    res.status(201).json({ id: feedback._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', auth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Feedback.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Feedback.countDocuments()
  ]);
  res.json({ data: items, total, page, limit });
});

module.exports = router;
