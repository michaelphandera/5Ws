const Organization = require('../models/Organization');
const AdminLevelConfig = require('../models/AdminLevelConfig');
const Location = require('../models/Location');
const Project = require('../models/Project');
const Activity = require('../models/Activity');
const { catchAsync } = require('../middleware/errorHandler');
const { buildSummary } = require('./dashboard.controller');

// Unauthenticated read-only endpoints for the public landing page.
// Responses are held in a short in-memory cache (keyed by the whitelisted
// filters) so anonymous traffic rarely re-runs the aggregation pipeline.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { data, ts }

async function cached(key, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  if (cache.size > 100) cache.clear(); // bound memory under filter churn
  const data = await build();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

// Only these filters pass through to the aggregation — everything else is dropped.
const PUBLIC_FILTERS = ['sector', 'status', 'location'];

exports.summary = catchAsync(async (req, res) => {
  const q = {};
  for (const k of PUBLIC_FILTERS) {
    if (req.query[k]) q[k] = String(req.query[k]);
  }
  const data = await cached(`summary:${JSON.stringify(q)}`, async () => {
    const s = await buildSummary(q);

    // Budgets stay internal on the public surface.
    delete s.totals.budgets;

    // The public page has no lookups store — ship level names with the payload.
    const cfg = await AdminLevelConfig.findOne().lean();
    s.levels = (cfg?.levels || []).map((l) => ({ level: l.level, name: l.name }));

    // Stable option lists for the public filter bar (bySector/byLevel shrink
    // under filtering, so they can't feed the dropdowns).
    const SectorModel = require('mongoose').model('Sector');
    const [sectorOpts, locationOpts] = await Promise.all([
      SectorModel.find({ active: { $ne: false } }).select('name').sort('name').lean(),
      Location.find({ active: { $ne: false } }).select('name level').sort({ level: 1, name: 1 }).lean(),
    ]);
    s.sectorOptions = sectorOpts.map((x) => ({ _id: x._id, name: x.name }));
    s.locationOptions = locationOpts.map((x) => ({ _id: x._id, name: x.name, level: x.level }));

    // Org points for the public map. Whitelisted fields only — never
    // chairperson/emails/phones/addresses on an unauthenticated endpoint.
    const orgs = await Organization.find({ active: true, 'location.lat': { $ne: null } })
      .select('name acronym type commission location')
      .populate({ path: 'commission', select: 'name color' })
      .lean();
    s.organizations = orgs.map((o) => ({
      _id: o._id,
      name: o.name,
      acronym: o.acronym || '',
      type: o.type,
      commission: o.commission ? { name: o.commission.name, color: o.commission.color } : null,
      location: { lat: o.location.lat, lng: o.location.lng },
    }));

    // The directory size (totals.organizations only counts orgs with projects).
    s.totals.organizationsRegistered = await Organization.countDocuments({ active: true });

    // Latest projects for the public "recent work" list — titles, org, status
    // and the sectors of their activities only (no budgets, no contacts).
    const recent = await Project.find()
      .sort('-createdAt')
      .limit(6)
      .select('title status startDate endDate organization')
      .populate('organization', 'name acronym')
      .lean();
    const recentIds = recent.map((p) => p._id);
    const sectorRows = await Activity.aggregate([
      { $match: { project: { $in: recentIds } } },
      { $group: { _id: { project: '$project', sector: '$sector' } } },
    ]);
    const Sector = require('mongoose').model('Sector');
    const sectorDocs = await Sector.find().select('name color').lean();
    const sectorById = new Map(sectorDocs.map((x) => [x._id.toString(), x]));
    const sectorsByProject = new Map();
    for (const r of sectorRows) {
      const pid = r._id.project.toString();
      const sec = sectorById.get(r._id.sector?.toString());
      if (!sec) continue;
      if (!sectorsByProject.has(pid)) sectorsByProject.set(pid, []);
      sectorsByProject.get(pid).push({ name: sec.name, color: sec.color });
    }
    s.recentProjects = recent.map((p) => ({
      title: p.title,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      organization: p.organization
        ? { name: p.organization.name, acronym: p.organization.acronym || '' }
        : null,
      sectors: (sectorsByProject.get(p._id.toString()) || []).slice(0, 3),
    }));

    return s;
  });
  res.json(data);
});

exports.geojson = catchAsync(async (req, res) => {
  // Admin boundaries are not sensitive; same shape as locations.controller.geojson.
  const data = await cached('geojson', async () => {
    const withGeom = await Location.find({ geometry: { $ne: null } }).lean();
    return {
      type: 'FeatureCollection',
      features: withGeom.map((l) => ({
        type: 'Feature',
        geometry: l.geometry,
        properties: { locationId: l._id, name: l.name, level: l.level, code: l.code },
      })),
    };
  });
  res.json(data);
});
