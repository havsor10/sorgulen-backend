const mongoose = require('mongoose');

/*
 * Order schema
 *
 * Represents a customer order for one of the available services. Each
 * order contains structured customer information, service-specific
 * details, and metadata such as a price estimate and current
 * processing status. A creation timestamp is automatically added.
 */
const orderSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      enum: ['broeyting', 'trefelling', 'plenklipping', 'diverse'],
      required: true,
    },
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      zip: { type: String, required: true },
      city: { type: String, required: true },
    },
    details: {
      type: String,
      default: '',
    },
    consent: {
      type: Boolean,
      required: true,
    },
    sourcePage: {
      type: String,
      default: '',
    },
    priceEstimate: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'completed', 'cancelled'],
      default: 'new',
    },
    emailStatus: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  },
);

// Create an index on createdAt to allow sorting newest first
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);