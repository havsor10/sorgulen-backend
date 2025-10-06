const express = require('express');
const Order = require('../models/order');
const { orderSchema } = require('../lib/validate');
const { sendCustomerConfirmation, sendInternalAlert } = require('../lib/mailer');
const { requireAuth } = require('../middlewares/auth');

/*
 * Order routes
 *
 * Public routes allow anyone to create a new order. Admin routes
 * require authentication and permit listing, retrieving and
 * updating existing orders. All input is validated using Zod
 * schemas and sensitive responses avoid leaking information.
 */
const router = express.Router();

// Create a new order
router.post('/', async (req, res) => {
  try {
    const parsed = orderSchema.parse(req.body);
    const order = await Order.create(parsed);
    // Attempt to send emails asynchronously. Do not block the response
    // to the client based on email outcome; update emailStatus on
    // failure. Note: we deliberately do not await these calls here.
    sendCustomerConfirmation(order)
      .then(() => {
        order.emailStatus = 'sent';
        return order.save();
      })
      .catch((err) => {
        console.error('Failed to send customer email', err);
        order.emailStatus = 'failed';
        order.save().catch((e) => console.error('Failed to update emailStatus', e));
      });
    sendInternalAlert(order).catch((err) => {
      console.error('Failed to send internal email', err);
    });
    return res.status(201).json({ id: order._id, status: order.status });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ message: err.errors.map((e) => e.message).join(', ') });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// List all orders (admin only)
router.get('/', requireAuth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json({ orders });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Get a single order by ID (admin only)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    return res.json({ order });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Update an order (admin only)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    // Accept updates to status and priceEstimate only
    const updates = {};
    if (typeof req.body.status === 'string') {
      updates.status = req.body.status;
    }
    if (typeof req.body.priceEstimate === 'number') {
      updates.priceEstimate = req.body.priceEstimate;
    }
    const order = await Order.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    return res.json({ order });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;