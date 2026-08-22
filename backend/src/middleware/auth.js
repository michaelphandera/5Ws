const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies "Authorization: Bearer <jwt>" and loads req.user = { id, role, organizationId }.
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await User.findById(payload.sub).select('role organization active forcePasswordChange');
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }

    // A user on a temporary password may only hit /api/auth (to change it or
    // load their profile) until they set a new one.
    if (user.forcePasswordChange && req.baseUrl !== '/api/auth') {
      return res
        .status(403)
        .json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      organizationId: user.organization ? user.organization.toString() : null,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = auth;
