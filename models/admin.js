const mongoose = require('mongoose');

/*
 * Admin schema
 *
 * This model represents administrators who can log into the
 * AdminJS interface and authenticate against the public API. The
 * password is stored as a bcrypt hash. Do not store plain-text
 * passwords. An index on the email field ensures uniqueness.
 */
const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

adminSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('Admin', adminSchema);