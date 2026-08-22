const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/projects.controller');

router.use(auth);

const statusRule = body('status').optional().isIn(['planned', 'ongoing', 'completed']);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', validate([body('title').notEmpty(), statusRule]), ctrl.create);
router.put('/:id', validate([statusRule]), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
