const { verifyToken } = require('../lib/jwt');
const Admin = require('../models/admin');

/*
 * Authentication middleware for protecting admin routes. The
 * middleware looks for a bearer token in the Authorization header.
 * If the token is valid the corresponding admin document is
 * attached to req.user and the request is allowed to proceed. If
 * verification fails a 401 Unauthorized response is returned.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authorization required' });
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    const admin = await Admin.findById(payload.id);
    if (!admin) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = admin;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = {
  requireAuth,
};