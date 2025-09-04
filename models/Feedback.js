const { Schema, model } = require('mongoose');

const feedbackSchema = new Schema({
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, required: true },
  anonymous: { type: Boolean, required: true },
  name: { type: String },
  email: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = model('Feedback', feedbackSchema);
