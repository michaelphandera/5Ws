const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/activities.controller');

router.use(auth);

const activityRules = [
  body('project').notEmpty(),
  body('title').notEmpty(),
  body('sector').notEmpty(),
  body('locations').isArray({ min: 1 }),
  body('startDate').notEmpty(),
];

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', validate(activityRules), ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
