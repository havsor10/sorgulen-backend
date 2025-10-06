const bcrypt = require('bcryptjs');
const Admin = require('../models/admin');

/*
 * Seed an initial owner account
 *
 * This helper is invoked on server startup to guarantee that at
 * least one admin user exists. The owner email and password are
 * supplied via environment variables SEED_OWNER_EMAIL and
 * SEED_OWNER_PASSWORD. If an admin already exists the seeding
 * operation is skipped.
 */
async function ensureOwner() {
  const count = await Admin.countDocuments();
  if (count > 0) return;
  const email = process.env.SEED_OWNER_EMAIL;
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD must be set to seed the initial admin');
  }
  const hash = await bcrypt.hash(password, 10);
  await Admin.create({ email, passwordHash: hash });
  console.log(`Seeded initial admin ${email}`);
}

module.exports = { ensureOwner };