const Project = require('../models/Project');
const Activity = require('../models/Activity');
const { catchAsync, httpError } = require('../middleware/errorHandler');
const { assertOwnership } = require('../utils/ownership');
const { audit } = require('../utils/audit');

const POPULATE = [
  { path: 'organization', select: 'name acronym type' },
  { path: 'implementingPartners', select: 'name acronym type' },
  { path: 'fundingSources', select: 'name acronym type' },
  { path: 'event', select: 'name type glideNumber status' },
];

exports.list = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.organization) filter.organization = req.query.organization;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.event) filter.event = req.query.event;
  if (req.query.q) {
    filter.title = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  const projects = await Project.find(filter).populate(POPULATE).sort('-createdAt');
  res.json(projects);
});

exports.get = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id).populate(POPULATE);
  if (!project) throw httpError(404, 'Project not found');
  res.json(project);
});

exports.create = catchAsync(async (req, res) => {
  const body = { ...req.body, createdBy: req.user.id };
  // Org users always create under their own organization.
  if (req.user.role === 'org') body.organization = req.user.organizationId;
  if (!body.organization) throw httpError(422, 'organization is required');
  const project = await Project.create(body);
  audit(req, 'create', 'Project', project);
  res.status(201).json(await project.populate(POPULATE));
});

exports.update = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw httpError(404, 'Project not found');
  assertOwnership(req.user, project.organization);
  const {
    title,
    description,
    startDate,
    endDate,
    status,
    budget,
    fundingSources,
    implementingPartners,
    event,
  } = req.body;
  // organization is immutable after creation (activities denormalize it).
  Object.assign(project, {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(startDate !== undefined && { startDate }),
    ...(endDate !== undefined && { endDate }),
    ...(status !== undefined && { status }),
    ...(budget !== undefined && { budget }),
    ...(fundingSources !== undefined && { fundingSources }),
    ...(implementingPartners !== undefined && { implementingPartners }),
    ...(event !== undefined && { event: event || null }),
  });
  await project.save();
  audit(req, 'update', 'Project', project);
  res.json(await project.populate(POPULATE));
});

exports.remove = catchAsync(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw httpError(404, 'Project not found');
  assertOwnership(req.user, project.organization);
  const activityCount = await Activity.countDocuments({ project: project._id });
  if (activityCount > 0) {
    throw httpError(409, `Project has ${activityCount} activities; delete them first`);
  }
  await project.deleteOne();
  audit(req, 'delete', 'Project', project);
  res.json({ message: 'Project deleted' });
});
