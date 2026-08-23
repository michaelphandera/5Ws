const ExcelJS = require('exceljs');
const Organization = require('../models/Organization');
const AdminLevelConfig = require('../models/AdminLevelConfig');
const Location = require('../models/Location');
const Activity = require('../models/Activity');
const { catchAsync } = require('../middleware/errorHandler');
const { buildSummary } = require('./dashboard.controller');
const { exportFilename } = require('../utils/exportName');

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
// `location` may be one id or a comma-separated list (union of subtrees).
const PUBLIC_FILTERS = ['sector', 'status', 'location', 'organization', 'event', 'dateFrom', 'dateTo'];

function publicQuery(query) {
  const q = {};
  for (const k of PUBLIC_FILTERS) {
    if (!query[k]) continue;
    const v = String(query[k]);
    // Garbage dates would silently skew the overlap filter — drop them here.
    if ((k === 'dateFrom' || k === 'dateTo') && Number.isNaN(Date.parse(v))) continue;
    q[k] = v;
  }
  return q;
}

exports.summary = catchAsync(async (req, res) => {
  const q = publicQuery(req.query);
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

    // Option lists for the organization/event filters (s.organizations below is
    // map-marker data — only orgs with coordinates — so it can't feed a dropdown).
    const DisasterEvent = require('mongoose').model('DisasterEvent');
    const [orgOpts, eventOpts] = await Promise.all([
      Organization.find({ active: true }).select('name acronym').sort('name').lean(),
      DisasterEvent.find().select('name status').sort('name').lean(),
    ]);
    s.organizationOptions = orgOpts.map((o) => ({ _id: o._id, name: o.name, acronym: o.acronym || '' }));
    s.eventOptions = eventOpts.map((e) => ({ _id: e._id, name: e.name, status: e.status }));

    // Org points for the public map. Marker fields only — directory contact
    // details live on the dedicated /public/organizations endpoint.
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

    // Latest projects for the public "latest updates" list — buildSummary's
    // filter-aware list (titles, org, status, dates only — no budgets, no
    // contacts), annotated with the sectors of each project's activities.
    const recentIds = s.recentProjects.map((p) => p._id);
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
    s.recentProjects = s.recentProjects.map((p) => ({
      title: p.title,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      updatedAt: p.updatedAt,
      organization: p.organization,
      sectors: (sectorsByProject.get(p._id.toString()) || []).slice(0, 3),
    }));

    return s;
  });
  res.json(data);
});

// Public contacts directory. The CSO register is public information, so the
// directory contact fields (emails, phones, webpage) are exposed deliberately;
// internal fields (chairperson, addresses, notes, registration no.) are not.
exports.organizations = catchAsync(async (req, res) => {
  const data = await cached('organizations', async () => {
    const orgs = await Organization.find({ active: true })
      .select('name acronym type commission emails phones webpage location')
      .populate({ path: 'commission', select: 'name' })
      .sort('name')
      .lean();
    return orgs.map((o) => ({
      _id: o._id,
      name: o.name,
      acronym: o.acronym || '',
      type: o.type,
      commission: o.commission ? { _id: o.commission._id, name: o.commission.name } : null,
      emails: o.emails || [],
      phones: o.phones || [],
      webpage: o.webpage || '',
      hasMapPoint: o.location?.lat != null,
    }));
  });
  res.json(data);
});

// Public organization profile — the directory fields plus the public-facing
// blurb (description/aim) and its project list (titles, status, dates — the
// same fields the public summary already shows; budgets stay internal).
exports.organizationProfile = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!require('mongoose').isValidObjectId(id)) {
    return res.status(404).json({ message: 'Organization not found' });
  }
  const data = await cached(`org:${id}`, async () => {
    const o = await Organization.findOne({ _id: id, active: true })
      .select('name acronym type commission otherSectors aim description dateFounded emails phones webpage location hqDistrict')
      .populate({ path: 'commission', select: 'name' })
      .populate({ path: 'otherSectors', select: 'name' })
      .populate({ path: 'hqDistrict', select: 'name code' })
      .lean();
    if (!o) return null;
    const Project = require('mongoose').model('Project');
    const projects = await Project.find({ organization: o._id })
      .select('title status startDate endDate')
      .sort({ startDate: -1 })
      .lean();
    return { ...o, projects };
  });
  if (!data) return res.status(404).json({ message: 'Organization not found' });
  res.json(data);
});

// Excel of the public overview — the same aggregates the landing page shows
// (and nothing more: budgets stay off the public surface).
exports.summaryXlsx = catchAsync(async (req, res) => {
  const q = publicQuery(req.query);
  const s = await cached(`summary-xlsx:${JSON.stringify(q)}`, async () => {
    const data = await buildSummary(q);
    delete data.totals.budgets;
    const cfg = await AdminLevelConfig.findOne().lean();
    data.levels = (cfg?.levels || []).map((l) => ({ level: l.level, name: l.name }));
    return data;
  });

  const levelName = (lvl) => s.levels.find((l) => l.level === lvl)?.name || `Admin Level ${lvl}`;
  const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : '');

  const wb = new ExcelJS.Workbook();
  const addSheet = (name, headers, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = headers.map((h) => ({ width: Math.min(40, Math.max(14, h.length + 8)) }));
    ws.addRow(headers).font = { bold: true };
    for (const r of rows) ws.addRow(r);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  addSheet('Overview', ['Indicator', 'Value'], [
    ['Projects', s.totals.projects],
    ['Activities', s.totals.activities],
    ['Organizations with projects', s.totals.organizations],
    ['Beneficiaries targeted', s.totals.beneficiariesTargeted],
    [`${levelName(s.mapLevel)}s covered`, `${s.totals.unitsCovered} of ${s.totals.unitsTotal}`],
  ]);
  addSheet('By Status', ['Status', 'Projects'],
    s.byStatus.map((r) => [cap(r.status), r.count]));
  addSheet('By Sector', ['Sector', 'Code', 'Projects', 'Activities'],
    s.bySector.map((r) => [r.name, r.code || '', r.projects, r.activities]));
  addSheet(`By ${levelName(s.mapLevel)}`,
    [levelName(s.mapLevel), 'Projects', 'Activities', 'Organizations', 'Sectors'],
    (s.byLevel[s.mapLevel] || []).map((r) => [r.name, r.count, r.activities, r.orgCount, r.sectorCount]));
  addSheet('Demographics', ['Category', 'Targeted'],
    s.demographics.categories.map((c) => [c.label, s.demographics.targeted[c.key] || 0]));
  if (s.byEvent.length) {
    addSheet('Disaster Events', ['Event', 'GLIDE Number', 'Status', 'Projects'],
      s.byEvent.map((e) => [e.name, e.glideNumber || '', e.status, e.projects]));
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('Overview', 'xlsx')}"`);
  await wb.xlsx.write(res);
  res.end();
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
