const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const Project = require('../models/Project');
const Organization = require('../models/Organization');
const Location = require('../models/Location');
const DisasterEvent = require('../models/DisasterEvent');
const DisaggregationCategory = require('../models/DisaggregationCategory');
const { catchAsync, httpError } = require('../middleware/errorHandler');
const { resolveSubtreeIds } = require('./locations.controller');

const oid = (v) => {
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    throw httpError(400, `Invalid id: ${v}`);
  }
};

// Project-centric summary: every chart counts PROJECTS. Project-level filters
// (organization, status, event, dates) match the Project collection directly;
// activity-level filters (sector, location) narrow the project set to projects
// with at least one matching activity. Sector/location/beneficiary facts still
// come from activities but are rolled up to distinct projects.
exports.summary = catchAsync(async (req, res) => {
  res.json(await buildSummary(req.query));
});

// Shared with the public (unauthenticated) summary endpoint.
async function buildSummary(q) {
  const mapLevel = Math.min(3, Math.max(1, parseInt(q.mapLevel, 10) || 2));

  // 1) Project-level filter.
  const pFilter = {};
  if (q.organization) pFilter.organization = oid(q.organization);
  if (q.status) pFilter.status = q.status;
  if (q.event) pFilter.event = oid(q.event);
  if (q.dateFrom || q.dateTo) {
    // Overlap semantics: project period intersects [dateFrom, dateTo].
    if (q.dateTo) pFilter.startDate = { $lte: new Date(q.dateTo) };
    if (q.dateFrom) {
      pFilter.$or = [
        { endDate: { $gte: new Date(q.dateFrom) } },
        { endDate: null },
        { endDate: { $exists: false } },
      ];
    }
  }
  let projects = await Project.find(pFilter)
    .select('title status event organization budget startDate endDate updatedAt')
    .lean();

  // 2) Activity aggregation, scoped to the filtered projects (+ activity-level filters).
  const aFilter = { project: { $in: projects.map((p) => p._id) } };
  if (q.sector) aFilter.sector = oid(q.sector);
  if (q.location) {
    const ids = await resolveSubtreeIds(q.location);
    aFilter.locations = { $in: ids };
  }

  // Demographic sums built from the admin-defined disaggregation categories.
  const demoCats = await DisaggregationCategory.find().sort('order').lean();
  const demoKeys = demoCats.map((c) => c.key);
  const demoSums = {};
  for (const k of demoKeys) {
    demoSums[`t_${k}`] = { $sum: { $ifNull: [`$beneficiaries.disaggregation.targeted.${k}`, 0] } };
  }

  const [facets] = await Activity.aggregate([
    { $match: aFilter },
    {
      $facet: {
        totals: [{ $group: { _id: null, activities: { $sum: 1 }, projects: { $addToSet: '$project' } } }],
        beneficiaries: [
          { $unwind: { path: '$beneficiaries', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: null,
              targeted: { $sum: { $ifNull: ['$beneficiaries.targetedTotal', 0] } },
              ...demoSums,
            },
          },
        ],
        bySector: [
          {
            $group: {
              _id: '$sector',
              projects: { $addToSet: '$project' },
              activities: { $sum: 1 },
            },
          },
        ],
        byLocation: [
          { $unwind: '$locations' },
          {
            $group: {
              _id: '$locations',
              projects: { $addToSet: '$project' },
              activities: { $sum: 1 },
              orgs: { $addToSet: '$organization' },
              sectors: { $addToSet: '$sector' },
            },
          },
        ],
      },
    },
  ]);

  const t = facets.totals[0] || { activities: 0, projects: [] };

  // Activity-level filters narrow the project set for the project charts too.
  if (q.sector || q.location) {
    const matched = new Set(t.projects.map((id) => id.toString()));
    projects = projects.filter((p) => matched.has(p._id.toString()));
  }

  // Lookups resolved in Node (all tiny collections).
  const Sector = mongoose.model('Sector');
  const [sectors, orgs, allLocations, geomIds] = await Promise.all([
    Sector.find().select('name code color').lean(),
    Organization.find().select('name acronym').lean(),
    Location.find().select('name level parent active centroid').lean(),
    Location.find({ geometry: { $ne: null } }).select('_id').lean(),
  ]);
  const sectorById = new Map(sectors.map((s) => [s._id.toString(), s]));
  const orgById = new Map(orgs.map((o) => [o._id.toString(), o]));
  const locById = new Map(allLocations.map((l) => [l._id.toString(), l]));
  const hasGeom = new Set(geomIds.map((l) => l._id.toString()));
  const projectById = new Map(projects.map((p) => [p._id.toString(), p]));

  const ben = facets.beneficiaries[0] || { targeted: 0 };

  // Demographics keyed by category key (targeted only), plus the category
  // definitions so the client renders labels/genders/age bands as configured.
  const demographics = {
    categories: demoCats.map((c) => ({
      key: c.key,
      label: c.label,
      gender: c.gender,
      ageMin: c.ageMin,
      ageMax: c.ageMax,
      crossCutting: c.crossCutting,
    })),
    targeted: {},
  };
  for (const k of demoKeys) demographics.targeted[k] = ben[`t_${k}`] || 0;

  // Projects per sector (via their activities).
  const bySector = facets.bySector
    .map((r) => {
      const s = sectorById.get(r._id?.toString()) || {};
      return {
        sectorId: r._id,
        name: s.name || 'Unknown',
        code: s.code,
        color: s.color,
        projects: r.projects.length,
        activities: r.activities,
      };
    })
    .sort((a, b) => b.projects - a.projects);

  // Projects by status / by disaster event — straight from the project docs.
  const statusCounts = new Map();
  const eventCounts = new Map();
  const orgSet = new Set();
  const budgetByCurrency = new Map();
  for (const p of projects) {
    statusCounts.set(p.status, (statusCounts.get(p.status) || 0) + 1);
    if (p.event) {
      const k = p.event.toString();
      eventCounts.set(k, (eventCounts.get(k) || 0) + 1);
    }
    orgSet.add(p.organization.toString());
    if (p.budget?.amount) {
      const cur = p.budget.currency || 'SCR';
      budgetByCurrency.set(cur, (budgetByCurrency.get(cur) || 0) + p.budget.amount);
    }
  }
  const byStatus = [...statusCounts.entries()].map(([status, count]) => ({ status, count }));

  const eventIds = [...eventCounts.keys()];
  const eventDocs = eventIds.length
    ? await DisasterEvent.find({ _id: { $in: eventIds } }).select('name type glideNumber status').lean()
    : [];
  const byEvent = eventDocs
    .map((e) => ({
      eventId: e._id,
      name: e.name,
      type: e.type,
      glideNumber: e.glideNumber,
      status: e.status,
      projects: eventCounts.get(e._id.toString()) || 0,
    }))
    .sort((a, b) => b.projects - a.projects);

  // Drillable map: leaf-location facts rolled up to EVERY admin level, with the
  // detail names each popup shows. `count` is distinct projects per unit —
  // a multi-location project counts toward each area it covers; never sum across areas.
  const maxLocLevel = Math.max(1, ...allLocations.map((l) => l.level));
  const ancestorAt = (leafId, level) => {
    let cur = locById.get(leafId?.toString());
    while (cur && cur.level > level && cur.parent) cur = locById.get(cur.parent.toString());
    return cur && cur.level <= level ? cur : null;
  };

  const byLevel = {};
  for (let level = 1; level <= maxLocLevel; level++) {
    const rolled = new Map();
    for (const r of facets.byLocation) {
      const anc = ancestorAt(r._id, level);
      if (!anc) continue;
      const key = anc._id.toString();
      const cur =
        rolled.get(key) ||
        {
          loc: anc,
          projectSet: new Set(),
          activities: 0,
          orgSet: new Set(),
          sectorSet: new Set(),
        };
      for (const p of r.projects || []) cur.projectSet.add(p.toString());
      cur.activities += r.activities;
      for (const o of r.orgs || []) cur.orgSet.add(o.toString());
      for (const s of r.sectors || []) cur.sectorSet.add(s.toString());
      rolled.set(key, cur);
    }
    byLevel[level] = [...rolled.values()]
      .map((r) => {
        const projTitles = [...r.projectSet]
          .map((id) => projectById.get(id)?.title)
          .filter(Boolean)
          .sort();
        return {
          locationId: r.loc._id,
          name: r.loc.name,
          level: r.loc.level,
          parentId: r.loc.parent || null,
          count: r.projectSet.size,
          activities: r.activities,
          orgCount: r.orgSet.size,
          sectorCount: r.sectorSet.size,
          sectors: [...r.sectorSet].map((id) => sectorById.get(id)?.name).filter(Boolean).sort(),
          orgs: [...r.orgSet]
            .map((id) => {
              const o = orgById.get(id);
              return o ? o.acronym || o.name : null;
            })
            .filter(Boolean)
            .sort(),
          projects: projTitles.slice(0, 8),
          projectTotal: projTitles.length,
          centroid: r.loc.centroid || null,
          hasGeometry: hasGeom.has(r.loc._id.toString()),
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  const unitsAtLevel = allLocations.filter((l) => l.level === mapLevel && l.active !== false);

  // Most recently touched projects in the FILTERED set (the public controller
  // replaces this with its own unfiltered, sector-annotated variant).
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 6)
    .map((p) => {
      const o = orgById.get(p.organization.toString());
      return {
        _id: p._id,
        title: p.title,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        updatedAt: p.updatedAt,
        organization: o ? { name: o.name, acronym: o.acronym || '' } : null,
      };
    });

  return {
    totals: {
      organizations: orgSet.size,
      projects: projects.length,
      activities: t.activities,
      beneficiariesTargeted: ben.targeted,
      budgets: [...budgetByCurrency.entries()]
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount),
      unitsCovered: (byLevel[mapLevel] || []).length,
      unitsTotal: unitsAtLevel.length,
    },
    demographics,
    bySector,
    byStatus,
    byEvent,
    recentProjects,
    byLevel,
    maxLocLevel,
    mapLevel,
  };
}
exports.buildSummary = buildSummary;
