const ExcelJS = require('exceljs');
const Activity = require('../models/Activity');
const Location = require('../models/Location');
const Organization = require('../models/Organization');
const AdminLevelConfig = require('../models/AdminLevelConfig');
const DisaggregationCategory = require('../models/DisaggregationCategory');
const { catchAsync } = require('../middleware/errorHandler');
const { buildActivityFilter } = require('./activities.controller');
const { toCsv } = require('../utils/csv');
const { DRM_PHASE_LABELS } = require('../utils/drm');
const { exportFilename } = require('../utils/exportName');

// Mirrors frontend/src/utils/orgTypes.js.
const ORG_TYPE_LABELS = {
  donor: 'Donor',
  government: 'Government',
  'un-agency': 'UN Agency',
  'international-ngo': 'International NGO',
  'national-ngo': 'National NGO',
  'civil-society': 'Civil Society Organization',
  'community-based': 'Community-Based Organization',
  'faith-based': 'Faith-Based Organization',
  'private-sector': 'Private Sector',
  academia: 'Academia / Research',
  'red-cross-red-crescent': 'Red Cross / Red Crescent',
  'umbrella-network': 'Umbrella body / Network',
  'professional-association': 'Professional Association',
  'sports-cultural-club': 'Sports / Cultural Club',
  'foundation-trust': 'Foundation / Trust',
  cooperative: 'Cooperative',
  'volunteer-youth-movement': 'Volunteer / Youth Movement',
  other: 'Other',
};
const orgTypeLabel = (v) => ORG_TYPE_LABELS[v] || v || '';

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// OCHA long-format 5W matrix: one row per activity x location x beneficiary group.
// Row 1: human-readable headers. Row 2: HXL hashtags (hxlstandard.org) so the file
// can be ingested directly by HXL-aware tools (HDX, Quick Charts, hxl-proxy).
// NOTE: beneficiary totals are per-activity overall; they repeat on each location row
// (locations indicate coverage) — do not SUM across rows of the same activity.
async function buildActivityMatrix(query) {
  const filter = await buildActivityFilter(query);

  const [activities, allLocations, cfg, demoCats] = await Promise.all([
    Activity.find(filter)
      .populate([
        {
          path: 'project',
          select: 'title status event drmPhase informComponent dataSource',
          populate: [
            { path: 'event', select: 'name type glideNumber' },
            { path: 'informComponent', select: 'name dimension category' },
          ],
        },
        { path: 'organization', select: 'name acronym' },
        { path: 'sector', select: 'name' },
        { path: 'locations', select: 'name code level parent' },
        { path: 'beneficiaries.group', select: 'name' },
      ])
      .sort('organization startDate')
      .lean(),
    Location.find().select('name code level parent').lean(),
    AdminLevelConfig.findOne().lean(),
    DisaggregationCategory.find().sort('order').lean(),
  ]);

  const locById = new Map(allLocations.map((l) => [l._id.toString(), l]));
  const levelName = (lvl) =>
    (cfg?.levels || []).find((l) => l.level === lvl)?.name || `Admin Level ${lvl}`;

  // For a leaf location, resolve the full ancestor chain by level.
  function chainOf(loc) {
    const chain = {};
    let cur = loc;
    while (cur) {
      chain[cur.level] = { name: cur.name, code: cur.code || '' };
      cur = cur.parent ? locById.get(cur.parent.toString()) : null;
    }
    return chain;
  }

  const maxLevel = Math.max(1, ...(cfg?.levels || []).map((l) => l.level));
  const levelHeaders = [];
  const levelHxl = [];
  for (let l = 1; l <= maxLevel; l++) {
    levelHeaders.push(levelName(l), `${levelName(l)} P-code`);
    levelHxl.push(`#adm${l}+name`, `#adm${l}+code`);
  }

  // Disaggregation columns come from the admin-defined categories, plus the
  // generic female/male split reported for demographic groups (Youth, Elderly, ...).
  const DEMO_KEYS = [...demoCats.map((c) => c.key), 'female', 'male'];
  const DEMO_LABELS = [...demoCats.map((c) => c.label), 'Female (group split)', 'Male (group split)'];
  const DEMO_HXL = [...demoCats.map((c) => c.hxlAttribute || `+${c.key}`), '+f', '+m'];

  const headers = [
    'Organization', 'Acronym', 'Project', 'Project Status', 'Activity', 'Sector',
    'DRM Phase', 'INFORM Component', 'INFORM Dimension',
    ...levelHeaders,
    'Start Date', 'End Date',
    'Disaster Event', 'GLIDE Number',
    'Data Source',
    'Beneficiary Group',
    'Targeted Total',
    ...DEMO_LABELS.map((l) => `Targeted ${l}`),
  ];

  const hxlRow = [
    '#org+name', '#org+acronym', '#activity+project', '#status+project',
    '#activity+name', '#sector+name',
    '#activity+phase', '#hazard+name', '#hazard+dimension',
    ...levelHxl,
    '#date+start', '#date+end',
    '#crisis+name', '#crisis+code+glide',
    '#meta+source',
    '#beneficiary+type',
    '#beneficiary+targeted',
    ...DEMO_HXL.map((a) => `#beneficiary+targeted${a}`),
  ];

  const rows = [];
  for (const a of activities) {
    const locations = a.locations?.length ? a.locations : [null];
    const beneficiaries = a.beneficiaries?.length ? a.beneficiaries : [null];
    for (const loc of locations) {
      const chain = loc ? chainOf(loc) : {};
      const levelCells = [];
      for (let l = 1; l <= maxLevel; l++) {
        levelCells.push(chain[l]?.name || '', chain[l]?.code || '');
      }
      for (const b of beneficiaries) {
        rows.push([
          a.organization?.name || '', a.organization?.acronym || '',
          a.project?.title || '', a.project?.status || '',
          a.title, a.sector?.name || '',
          DRM_PHASE_LABELS[a.project?.drmPhase] || '',
          a.project?.informComponent?.name || '', a.project?.informComponent?.dimension || '',
          ...levelCells,
          fmtDate(a.startDate), fmtDate(a.endDate),
          a.project?.event?.name || '', a.project?.event?.glideNumber || '',
          a.project?.dataSource || '',
          b?.group?.name || '',
          b?.targetedTotal ?? '',
          ...DEMO_KEYS.map((k) => b?.disaggregation?.targeted?.[k] ?? ''),
        ]);
      }
    }
  }

  return { headers, hxlRow, rows };
}
exports.buildActivityMatrix = buildActivityMatrix;

exports.activitiesCsv = catchAsync(async (req, res) => {
  const { headers, hxlRow, rows } = await buildActivityMatrix(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('Activities', 'csv')}"`);
  // BOM so Excel detects UTF-8.
  res.send(String.fromCharCode(0xfeff) + toCsv(headers, [hxlRow, ...rows]));
});

exports.activitiesXlsx = catchAsync(async (req, res) => {
  const { headers, hxlRow, rows } = await buildActivityMatrix(req.query);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('5W Activities');
  ws.columns = headers.map((h) => ({ width: Math.min(40, Math.max(12, h.length + 6)) }));

  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  const hxl = ws.addRow(hxlRow);
  hxl.font = { italic: true, color: { argb: 'FF888888' } };
  for (const row of rows) ws.addRow(row);
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('Activities', 'xlsx')}"`);
  await wb.xlsx.write(res);
  res.end();
});

// ---- Organization directory exports (Excel + Google Earth KML) ----

exports.organizationsXlsx = catchAsync(async (req, res) => {
  const orgs = await Organization.find({ active: { $ne: false } })
    .populate([
      { path: 'commission', select: 'name' },
      { path: 'otherSectors', select: 'name' },
      { path: 'hqDistrict', select: 'name code' },
    ])
    .sort('name')
    .lean();

  const headers = [
    'Name', 'Acronym', 'Type', 'Registration No.',
    'HQ District', 'HQ District P-code',
    'Primary Sector', 'Also Works In', 'Aim', 'Description',
    'Date Founded', 'Chairperson', 'Contact Person', 'Emails', 'Phones',
    'Postal Address', 'Physical Address', 'Website / Social',
    'Latitude', 'Longitude', 'Notes',
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Organizations');
  ws.columns = headers.map((h) => ({ width: Math.min(45, Math.max(14, h.length + 8)) }));
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  for (const o of orgs) {
    ws.addRow([
      o.name, o.acronym || '', orgTypeLabel(o.type), o.registrationNo || '',
      o.hqDistrict?.name || '', o.hqDistrict?.code || '',
      o.commission?.name || '', (o.otherSectors || []).map((s) => s.name).join('; '),
      o.aim || '', o.description || '',
      o.dateFounded || '', o.chairperson || '', o.contactPerson || '',
      (o.emails || []).join('; '), (o.phones || []).join('; '),
      o.postalAddress || '', o.physicalAddress || '', o.webpage || '',
      o.location?.lat ?? '', o.location?.lng ?? '', o.notes || '',
    ]);
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('Organizations', 'xlsx')}"`);
  await wb.xlsx.write(res);
  res.end();
});

// KML of organization office points, grouped in folders by org type so Google
// Earth's sidebar works as an organization picker (double-click a name to fly
// to it). Balloon carries the directory profile.
const xmlEsc = (s) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

exports.organizationsKml = catchAsync(async (req, res) => {
  const orgs = await Organization.find({ active: { $ne: false }, 'location.lat': { $ne: null } })
    .populate('commission', 'name')
    .sort('name')
    .lean();

  const byType = new Map();
  for (const o of orgs) {
    const label = orgTypeLabel(o.type) || 'Other';
    if (!byType.has(label)) byType.set(label, []);
    byType.get(label).push(o);
  }

  const balloonRow = (label, value) =>
    value ? `<tr><td style="color:#666;padding-right:8px;vertical-align:top">${xmlEsc(label)}</td><td>${xmlEsc(value)}</td></tr>` : '';

  const placemark = (o) => `
      <Placemark>
        <name>${xmlEsc(o.acronym ? `${o.name} (${o.acronym})` : o.name)}</name>
        <styleUrl>#org</styleUrl>
        <description><![CDATA[<table style="font:13px sans-serif;max-width:360px">
          ${balloonRow('Type', orgTypeLabel(o.type))}
          ${balloonRow('Commission / Sector', o.commission?.name)}
          ${balloonRow('About', o.description || o.aim)}
          ${balloonRow('Chairperson', o.chairperson)}
          ${balloonRow('Contact person', o.contactPerson)}
          ${balloonRow('Email', (o.emails || []).join('; '))}
          ${balloonRow('Phone', (o.phones || []).join('; '))}
          ${balloonRow('Physical address', o.physicalAddress)}
          ${balloonRow('Webpage', o.webpage)}
        </table>]]></description>
        <Point><coordinates>${o.location.lng},${o.location.lat},0</coordinates></Point>
      </Placemark>`;

  const folders = [...byType.entries()]
    .map(
      ([label, list]) => `
    <Folder>
      <name>${xmlEsc(label)} (${list.length})</name>
      ${list.map(placemark).join('')}
    </Folder>`
    )
    .join('');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>5Ws Seychelles — Organizations (${orgs.length})</name>
    <Style id="org">
      <IconStyle>
        <color>ffad5f1d</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon>
      </IconStyle>
      <LabelStyle><scale>0.9</scale></LabelStyle>
    </Style>
    ${folders}
  </Document>
</kml>`;

  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename('Organizations', 'kml')}"`);
  res.send(kml);
});
