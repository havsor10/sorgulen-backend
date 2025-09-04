const { Schema, model } = require('mongoose');

const orderSchema = new Schema({
  service: { type: String, enum: ['Brøyting', 'Trefelling', 'Plenklipping', 'Diverse'], required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = model('Order', orderSchema);
