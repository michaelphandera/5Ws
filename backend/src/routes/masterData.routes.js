// Shared CRUD router for organizations, sectors, activity-types, beneficiary-groups.
const express = require('express');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { httpError } = require('../middleware/errorHandler');
const makeCrudController = require('../controllers/masterData.factory');

const Organization = require('../models/Organization');
const Sector = require('../models/Sector');
const ActivityType = require('../models/ActivityType');
const BeneficiaryGroup = require('../models/BeneficiaryGroup');
const DisasterEvent = require('../models/DisasterEvent');
const DisaggregationCategory = require('../models/DisaggregationCategory');
const InformComponent = require('../models/InformComponent');
const Activity = require('../models/Activity');
const Project = require('../models/Project');
const User = require('../models/User');

function crudRouter(ctrl, { allowOwnOrgUpdate = false } = {}) {
  const router = express.Router();
  router.use(auth);
  router.get('/', ctrl.list);
  router.get('/:id', ctrl.get);
  router.post('/', requireRole('admin'), ctrl.create);
  if (allowOwnOrgUpdate) {
    // Org focal points may update their own organization's profile.
    router.put('/:id', (req, res, next) => {
      if (req.user.role === 'admin') return next();
      if (req.user.role === 'org' && req.user.organizationId === req.params.id) return next();
      return next(httpError(403, 'Insufficient permissions'));
    }, ctrl.update);
  } else {
    router.put('/:id', requireRole('admin'), ctrl.update);
  }
  router.delete('/:id', requireRole('admin'), ctrl.remove);
  return router;
}

const organizations = crudRouter(
  makeCrudController(Organization, {
    searchFields: ['name', 'acronym'],
    populate: [
      { path: 'commission', select: 'name code color' },
      { path: 'otherSectors', select: 'name code color' },
      { path: 'hqDistrict', select: 'name code level' },
    ],
    isReferenced: async (id) =>
      !!(await Activity.exists({ organization: id })) ||
      !!(await Project.exists({ organization: id })) ||
      !!(await User.exists({ organization: id })),
  }),
  { allowOwnOrgUpdate: true }
);

const sectors = crudRouter(
  makeCrudController(Sector, {
    isReferenced: async (id) =>
      !!(await Activity.exists({ sector: id })) ||
      !!(await Organization.exists({ commission: id })),
  })
);

const activityTypes = crudRouter(
  makeCrudController(ActivityType, {
    populate: { path: 'sector', select: 'name code' },
    isReferenced: async (id) => !!(await Activity.exists({ activityType: id })),
  })
);

const beneficiaryGroups = crudRouter(
  makeCrudController(BeneficiaryGroup, {
    isReferenced: async (id) => !!(await Activity.exists({ 'beneficiaries.group': id })),
  })
);

const events = crudRouter(
  makeCrudController(DisasterEvent, {
    searchFields: ['name', 'glideNumber'],
    sort: '-startDate',
    isReferenced: async (id) =>
      !!(await Project.exists({ event: id })) || !!(await Activity.exists({ event: id })),
  })
);

const informComponents = crudRouter(
  makeCrudController(InformComponent, {
    sort: 'dimension order name',
    searchFields: ['name', 'category'],
    isReferenced: async (id) => !!(await Project.exists({ informComponent: id })),
  })
);

const disaggregations = crudRouter(
  makeCrudController(DisaggregationCategory, {
    sort: 'order',
    isReferenced: async (id) => {
      const cat = await DisaggregationCategory.findById(id).lean();
      if (!cat) return false;
      return !!(await Activity.exists({
        $or: [
          { [`beneficiaries.disaggregation.planned.${cat.key}`]: { $exists: true } },
          { [`beneficiaries.disaggregation.reached.${cat.key}`]: { $exists: true } },
        ],
      }));
    },
  })
);

module.exports = {
  organizations,
  sectors,
  activityTypes,
  beneficiaryGroups,
  events,
  disaggregations,
  informComponents,
};
