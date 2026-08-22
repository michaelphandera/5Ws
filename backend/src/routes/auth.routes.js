const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/auth.controller');

router.post(
  '/login',
  validate([body('username').notEmpty(), body('password').notEmpty()]),
  ctrl.login
);
router.get('/me', auth, ctrl.me);
router.post('/refresh', auth, ctrl.refresh);
router.post(
  '/change-password',
  auth,
  validate([body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8 })]),
  ctrl.changePassword
);

module.exports = router;
