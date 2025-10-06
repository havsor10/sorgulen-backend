const express = require('express');
const bcrypt = require('bcryptjs');
const Admin = require('../models/admin');
const { loginSchema } = require('../lib/validate');
const { signToken } = require('../lib/jwt');

/*
 * Authentication routes
 *
 * Provides a single login endpoint for administrators. When
 * supplied with a valid email and password the endpoint returns a
 * signed JWT token and basic user data. No refresh token is
 * implemented; clients should store the token and include it in
 * subsequent Authorization headers.
 */
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    // Validate input using Zod
    const { email, password } = loginSchema.parse(req.body);
    // Find the admin by email
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Sign a JWT containing the admin's ID
    const token = signToken({ id: admin._id });
    return res.json({ token, user: { id: admin._id, email: admin.email } });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ message: err.errors.map((e) => e.message).join(', ') });
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;