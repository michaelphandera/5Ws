const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/locations.controller');

router.get('/', auth, ctrl.getConfig);
router.put(
  '/',
  auth,
  requireRole('admin'),
  validate([body('levels').isArray({ min: 1 })]),
  ctrl.updateConfig
);

module.exports = router;
