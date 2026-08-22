const router = require('express').Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/export.controller');

router.get('/activities.csv', auth, ctrl.activitiesCsv);
router.get('/activities.xlsx', auth, ctrl.activitiesXlsx);
router.get('/organizations.xlsx', auth, ctrl.organizationsXlsx);
router.get('/organizations.kml', auth, ctrl.organizationsKml);

module.exports = router;
