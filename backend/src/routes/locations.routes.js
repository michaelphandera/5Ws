const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/locations.controller');

router.use(auth);

router.get('/', ctrl.list);
router.get('/tree', ctrl.tree);
router.get('/geojson', ctrl.geojson);
router.get('/:id', ctrl.get);
router.post('/', requireRole('admin'), validate([body('name').notEmpty()]), ctrl.create);
router.put('/:id', requireRole('admin'), ctrl.update);
router.delete('/:id', requireRole('admin'), ctrl.remove);

module.exports = router;
