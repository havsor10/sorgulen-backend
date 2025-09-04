const express = require('express');
const validator = require('validator');
const Order = require('../models/Order');
const sendOrder = require('../email/sendOrder');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { service, name, phone, email, message } = req.body;
  const services = ['Brøyting', 'Trefelling', 'Plenklipping', 'Diverse'];
  if (!services.includes(service) || !name || !phone || !email || !message) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const phoneRegex = /^\+?\d[\d\s\-]{7,}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone' });
  }
  try {
    const order = await Order.create({ service, name, phone, email, message });
    await sendOrder({ service, name, phone, email, message });
    res.status(201).json({ id: order._id });
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
    Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments()
  ]);
  res.json({ data: items, total, page, limit });
});

module.exports = router;
