const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/users.controller');

router.use(auth, requireRole('admin'));

router.get('/', ctrl.list);
router.post(
  '/',
  validate([
    body('username').notEmpty(),
    body('role').isIn(['admin', 'org']),
    body('password').isLength({ min: 8 }),
    body('organization').if(body('role').equals('org')).notEmpty().withMessage('organization required for org users'),
  ]),
  ctrl.create
);
router.get('/:id', ctrl.get);
router.put('/:id', ctrl.update);
router.patch('/:id/active', validate([body('active').isBoolean()]), ctrl.setActive);

module.exports = router;
