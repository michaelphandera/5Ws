// Unauthenticated read-only endpoints backing the public landing page.
const router = require('express').Router();
const ctrl = require('../controllers/public.controller');

router.get('/summary', ctrl.summary);
router.get('/geojson', ctrl.geojson);

module.exports = router;
