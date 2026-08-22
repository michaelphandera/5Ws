const User = require('../models/User');
const { catchAsync, httpError } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');

exports.list = catchAsync(async (req, res) => {
  const users = await User.find().populate('organization', 'name acronym').sort('username');
  res.json(users.map((u) => ({ ...u.toSafeJSON(), organization: u.organization })));
});

exports.get = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).populate('organization', 'name acronym');
  if (!user) throw httpError(404, 'User not found');
  res.json({ ...user.toSafeJSON(), organization: user.organization });
});

exports.create = catchAsync(async (req, res) => {
  const { username, email, name, role, organization, password, forcePasswordChange } = req.body;
  if (!password || password.length < 8) throw httpError(422, 'Password must be at least 8 characters');
  const user = new User({
    username,
    email: email || undefined,
    name,
    role,
    organization: organization || undefined,
    forcePasswordChange: !!forcePasswordChange,
  });
  await user.setPassword(password);
  await user.save();
  audit(req, 'create', 'User', user);
  res.status(201).json(user.toSafeJSON());
});

exports.update = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  const { email, name, role, organization, password, forcePasswordChange } = req.body;
  if (email !== undefined) user.email = email || undefined;
  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (organization !== undefined) user.organization = organization || undefined;
  if (forcePasswordChange !== undefined) user.forcePasswordChange = !!forcePasswordChange;
  if (password) {
    if (password.length < 8) throw httpError(422, 'Password must be at least 8 characters');
    await user.setPassword(password);
  }
  await user.save();
  audit(req, 'update', 'User', user);
  res.json(user.toSafeJSON());
});

exports.setActive = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  if (user._id.toString() === req.user.id) throw httpError(409, 'You cannot deactivate your own account');
  user.active = !!req.body.active;
  await user.save();
  audit(req, 'update', 'User', user, { active: user.active });
  res.json(user.toSafeJSON());
});
