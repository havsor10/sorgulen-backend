const jwt = require('jsonwebtoken');

/*
 * JWT helper functions
 *
 * Encapsulates signing and verification of JSON web tokens used to
 * authenticate API requests. The secret and expiration are read from
 * environment variables. If JWT_EXPIRES is not provided a default
 * value of 12 hours is used.
 */

function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  const expiresIn = process.env.JWT_EXPIRES || '12h';
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }
  return jwt.verify(token, secret);
}

module.exports = {
  signToken,
  verifyToken,
};