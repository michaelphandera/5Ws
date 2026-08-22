const router = require('express').Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const ctrl = require('../controllers/import.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(auth);

// Activities: any authenticated user; org users are scoped to their own projects.
// Templates are Excel workbooks: Instructions + Data + reference sheets of what
// already exists (organizations/short codes, locations/P-codes, ...).
router.get('/activities/template.xlsx', ctrl.activitiesTemplate);
router.post('/activities', upload.single('file'), ctrl.activitiesImport);

// Organizations: master data — admin only.
router.get('/organizations/template.xlsx', requireRole('admin'), ctrl.organizationsTemplate);
router.post('/organizations', requireRole('admin'), upload.single('file'), ctrl.organizationsImport);

module.exports = router;
