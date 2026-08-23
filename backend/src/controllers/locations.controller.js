const Location = require('../models/Location');
const AdminLevelConfig = require('../models/AdminLevelConfig');
const Activity = require('../models/Activity');
const { catchAsync, httpError } = require('../middleware/errorHandler');

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

exports.list = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.level) filter.level = Number(req.query.level);
  if (req.query.parent) filter.parent = req.query.parent;
  if (req.query.active === 'true') filter.active = true;
  res.json(await Location.find(filter).sort({ level: 1, name: 1 }));
});

exports.tree = catchAsync(async (req, res) => {
  const all = await Location.find().sort({ level: 1, name: 1 }).lean();
  const byId = new Map(all.map((l) => [l._id.toString(), { ...l, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parent && byId.has(node.parent.toString())) {
      byId.get(node.parent.toString()).children.push(node);
    } else {
      roots.push(node);
    }
  }
  res.json(roots);
});

exports.geojson = catchAsync(async (req, res) => {
  const withGeom = await Location.find({ geometry: { $ne: null } }).lean();
  res.json({
    type: 'FeatureCollection',
    features: withGeom.map((l) => ({
      type: 'Feature',
      geometry: l.geometry,
      properties: { locationId: l._id, name: l.name, level: l.level, code: l.code },
    })),
  });
});

exports.get = catchAsync(async (req, res) => {
  const doc = await Location.findById(req.params.id);
  if (!doc) throw httpError(404, 'Location not found');
  res.json(doc);
});

async function buildPathAndLevel(parentId, name) {
  if (!parentId) return { level: 1, path: slugify(name), parent: null };
  const parent = await Location.findById(parentId);
  if (!parent) throw httpError(422, 'Parent location not found');
  if (parent.level >= 3) throw httpError(422, 'Maximum hierarchy depth (3) exceeded');
  return { level: parent.level + 1, path: `${parent.path}/${slugify(name)}`, parent: parent._id };
}

exports.create = catchAsync(async (req, res) => {
  const { name, parent, code, centroid, geometry } = req.body;
  const derived = await buildPathAndLevel(parent || null, name);
  const doc = await Location.create({
    name,
    ...derived,
    code: code || derived.path.replace(/\//g, '.'),
    centroid,
    geometry: geometry || null,
  });
  res.status(201).json(doc);
});

exports.update = catchAsync(async (req, res) => {
  const doc = await Location.findById(req.params.id);
  if (!doc) throw httpError(404, 'Location not found');
  const { name, code, centroid, geometry, active, isoCode, informAdm1, informAdm2, plusCode, provisional, notes } = req.body;
  if (name !== undefined && name !== doc.name) {
    // Renaming keeps the slug/path stable — path is an internal key, name is display.
    doc.name = name;
  }
  // Code is editable so admins can apply official P-codes (COD-AB / ISO 3166-2).
  if (code !== undefined && code !== '') doc.code = code;
  if (centroid !== undefined) doc.centroid = centroid;
  if (geometry !== undefined) doc.geometry = geometry;
  if (active !== undefined) doc.active = active;
  if (isoCode !== undefined) doc.isoCode = isoCode;
  if (informAdm1 !== undefined) doc.informAdm1 = informAdm1;
  if (informAdm2 !== undefined) doc.informAdm2 = informAdm2;
  if (plusCode !== undefined) doc.plusCode = plusCode;
  if (provisional !== undefined) doc.provisional = provisional;
  if (notes !== undefined) doc.notes = notes;
  await doc.save();
  res.json(doc);
});

exports.remove = catchAsync(async (req, res) => {
  const doc = await Location.findById(req.params.id);
  if (!doc) throw httpError(404, 'Location not found');
  const childCount = await Location.countDocuments({ parent: doc._id });
  if (childCount > 0) throw httpError(409, 'Location has child locations; delete or move them first');
  const used = await Activity.exists({ locations: doc._id });
  if (used) {
    doc.active = false;
    await doc.save();
    return res.json({ message: 'Location is in use; deactivated instead of deleted', softDeleted: true });
  }
  await doc.deleteOne();
  res.json({ message: 'Location deleted', softDeleted: false });
});

exports.getConfig = catchAsync(async (req, res) => {
  let cfg = await AdminLevelConfig.findOne();
  if (!cfg) cfg = await AdminLevelConfig.create({ levels: [{ level: 1, name: 'Admin Level 1' }] });
  res.json(cfg);
});

exports.updateConfig = catchAsync(async (req, res) => {
  let cfg = await AdminLevelConfig.findOne();
  if (!cfg) cfg = new AdminLevelConfig();
  cfg.levels = req.body.levels;
  await cfg.save();
  res.json(cfg);
});

// Resolve a location id to itself + all descendants (for subtree filtering).
exports.resolveSubtreeIds = async function (locationId) {
  const loc = await Location.findById(locationId);
  if (!loc) return [];
  const rx = new RegExp('^' + loc.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/|$)');
  const subtree = await Location.find({ path: rx }).select('_id');
  return subtree.map((l) => l._id);
};
