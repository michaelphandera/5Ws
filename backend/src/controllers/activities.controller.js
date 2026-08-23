const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const Project = require('../models/Project');
const { catchAsync, httpError } = require('../middleware/errorHandler');
const { assertOwnership } = require('../utils/ownership');
const { resolveSubtreeIds } = require('./locations.controller');
const { audit } = require('../utils/audit');

const POPULATE = [
  { path: 'project', select: 'title status event', populate: { path: 'event', select: 'name type glideNumber' } },
  { path: 'organization', select: 'name acronym' },
  { path: 'sector', select: 'name code color' },
  { path: 'locations', select: 'name level path centroid' },
  { path: 'beneficiaries.group', select: 'name' },
];

// Shared by list, dashboard, and export. Ids are cast to ObjectId explicitly because
// aggregate() $match (dashboard) does not auto-cast strings the way find() does.
const oid = (v) => {
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    throw httpError(400, `Invalid id: ${v}`);
  }
};

async function buildActivityFilter(query) {
  const filter = {};
  if (query.organization) filter.organization = oid(query.organization);
  if (query.project) filter.project = oid(query.project);
  if (query.sector) filter.sector = oid(query.sector);
  if (query.beneficiaryGroup) filter['beneficiaries.group'] = oid(query.beneficiaryGroup);
  // Status and Disaster / Emergency context live on the project — resolve to project ids.
  if ((query.status || query.event) && !filter.project) {
    const pf = {};
    if (query.status) pf.status = query.status;
    if (query.event) pf.event = oid(query.event);
    const ids = await Project.find(pf).select('_id').lean();
    filter.project = { $in: ids.map((p) => p._id) };
  }
  // For Whom — activities that target a disaggregation category (or the
  // generic female/male group split). Key is sanitized before use as a path.
  if (query.demographic) {
    const key = String(query.demographic).replace(/[^a-zA-Z0-9_-]/g, '');
    if (key) filter[`beneficiaries.disaggregation.targeted.${key}`] = { $gt: 0 };
  }
  if (query.location) {
    const ids = await resolveSubtreeIds(query.location);
    filter.locations = { $in: ids };
  }
  if (query.q) {
    const rx = new RegExp(String(query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    // $and keeps this clause independent of the dateFrom $or below.
    filter.$and = [{ $or: [{ title: rx }, { description: rx }, { notes: rx }] }];
  }
  if (query.dateFrom || query.dateTo) {
    // Overlap semantics: activity period intersects [dateFrom, dateTo].
    if (query.dateTo) filter.startDate = { $lte: new Date(query.dateTo) };
    if (query.dateFrom) {
      filter.$or = [
        { endDate: { $gte: new Date(query.dateFrom) } },
        { endDate: null },
        { endDate: { $exists: false } },
      ];
    }
  }
  return filter;
}
exports.buildActivityFilter = buildActivityFilter;

exports.list = catchAsync(async (req, res) => {
  const filter = await buildActivityFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const sort = req.query.sort || '-createdAt';

  const [items, total] = await Promise.all([
    Activity.find(filter).populate(POPULATE).sort(sort).skip((page - 1) * limit).limit(limit),
    Activity.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

exports.get = catchAsync(async (req, res) => {
  const activity = await Activity.findById(req.params.id).populate(POPULATE);
  if (!activity) throw httpError(404, 'Activity not found');
  res.json(activity);
});

exports.create = catchAsync(async (req, res) => {
  const project = await Project.findById(req.body.project);
  if (!project) throw httpError(422, 'Parent project not found');
  assertOwnership(req.user, project.organization);

  const activity = await Activity.create({
    ...req.body,
    organization: project.organization, // server-set, never trusted from client
    createdBy: req.user.id,
  });
  audit(req, 'create', 'Activity', activity);
  res.status(201).json(await activity.populate(POPULATE));
});

exports.update = catchAsync(async (req, res) => {
  const activity = await Activity.findById(req.params.id);
  if (!activity) throw httpError(404, 'Activity not found');
  assertOwnership(req.user, activity.organization);

  const body = { ...req.body };
  delete body.organization;
  delete body.createdBy;
  if (body.project && body.project !== activity.project.toString()) {
    // Moving to another project is allowed only within the same organization.
    const newProject = await Project.findById(body.project);
    if (!newProject) throw httpError(422, 'Parent project not found');
    if (newProject.organization.toString() !== activity.organization.toString()) {
      throw httpError(422, 'Cannot move activity to a project of another organization');
    }
  }
  Object.assign(activity, body);
  await activity.save();
  audit(req, 'update', 'Activity', activity);
  res.json(await activity.populate(POPULATE));
});

exports.remove = catchAsync(async (req, res) => {
  const activity = await Activity.findById(req.params.id);
  if (!activity) throw httpError(404, 'Activity not found');
  assertOwnership(req.user, activity.organization);
  await activity.deleteOne();
  audit(req, 'delete', 'Activity', activity);
  res.json({ message: 'Activity deleted' });
});
