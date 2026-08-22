const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { catchAsync, httpError } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

exports.login = catchAsync(async (req, res) => {
  const { username, password } = req.body;
  const id = (username || '').toLowerCase();
  const user = await User.findOne({ $or: [{ username: id }, { email: id }] }).populate(
    'organization',
    'name acronym'
  );
  if (!user || !user.active || !(await user.checkPassword(password || ''))) {
    throw httpError(401, 'Invalid username or password');
  }
  audit({ user: { id: user._id.toString() } }, 'login', 'User', user);
  res.json({ token: signToken(user), user: user.toSafeJSON() });
});

// Sliding session renewal: any valid, active session may trade its token for a
// fresh one. The client calls this opportunistically near expiry.
exports.refresh = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || !user.active) throw httpError(401, 'Account not found or deactivated');
  res.json({ token: signToken(user) });
});

exports.me = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).populate('organization', 'name acronym');
  res.json(user.toSafeJSON());
});

exports.changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);
  if (!(await user.checkPassword(currentPassword || ''))) {
    throw httpError(401, 'Current password is incorrect');
  }
  await user.setPassword(newPassword);
  user.forcePasswordChange = false;
  await user.save();
  audit(req, 'password-change', 'User', user);
  res.json({ message: 'Password updated' });
});
