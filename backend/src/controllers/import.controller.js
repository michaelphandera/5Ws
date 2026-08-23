const Papa = require('papaparse');
const ExcelJS = require('exceljs');
const Activity = require('../models/Activity');
const Project = require('../models/Project');
const Organization = require('../models/Organization');
const Sector = require('../models/Sector');
const Location = require('../models/Location');
const BeneficiaryGroup = require('../models/BeneficiaryGroup');
const DisaggregationCategory = require('../models/DisaggregationCategory');
const AdminLevelConfig = require('../models/AdminLevelConfig');
const { catchAsync, httpError } = require('../middleware/errorHandler');
const { audit } = require('../utils/audit');
const { exportFilename } = require('../utils/exportName');

const { ORG_TYPES } = Organization;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').trim();
const lower = (s) => norm(s).toLowerCase();
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseCsvBuffer(buf) {
  if (!buf || !buf.length) throw httpError(422, 'Empty file');
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => norm(h),
  });
  if (parsed.errors.some((e) => e.type === 'Delimiter')) {
    throw httpError(422, 'Could not parse the file as CSV');
  }
  return parsed;
}

// Case-insensitive row field access (headers were trimmed at parse time).
function fieldGetter(row) {
  const byLower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  return (name) => {
    const key = byLower.get(name.toLowerCase());
    return key === undefined ? '' : norm(row[key]);
  };
}

function requireColumns(parsed, required) {
  const have = new Set((parsed.meta.fields || []).map((f) => f.toLowerCase()));
  const missing = required.filter((c) => !have.has(c.toLowerCase()));
  if (missing.length) {
    throw httpError(422, `Missing required columns: ${missing.join(', ')}`);
  }
}

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(value, label, errors) {
  if (!value) return null;
  if (!DATE_RX.test(value) || Number.isNaN(new Date(value).getTime())) {
    errors.push(`${label} must be a valid date in YYYY-MM-DD format (got "${value}")`);
    return null;
  }
  return new Date(value);
}

function parseCount(value, label, errors) {
  if (value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    errors.push(`${label} must be a non-negative whole number (got "${value}")`);
    return null;
  }
  return n;
}

// Uploads accept CSV or an .xlsx workbook (only its "Data" sheet is read), so a
// filled-in template can be uploaded as-is. Both parse to the papaparse shape.
function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((r) => r.text).join('');
    if (value.result !== undefined) return cellText(value.result); // formula
    if (value.text) return String(value.text); // hyperlink
    if (value.error) return '';
  }
  return String(value);
}

async function parseUpload(file) {
  const buf = file.buffer;
  if (!buf || !buf.length) throw httpError(422, 'Empty file');
  const isXlsx = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK" zip magic
  if (!isXlsx) return parseCsvBuffer(buf);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw httpError(422, 'Could not read the file as an Excel workbook');
  }
  const ws = wb.getWorksheet('Data') || wb.worksheets[0];
  if (!ws) throw httpError(422, 'The workbook has no sheets');

  const fields = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => {
    fields[col] = norm(cellText(c.value));
  });
  const data = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    let hasValue = false;
    fields.forEach((f, col) => {
      if (!f) return;
      const t = norm(cellText(row.getCell(col).value));
      obj[f] = t;
      if (t) hasValue = true;
    });
    if (hasValue) data.push(obj);
  });
  return { data, meta: { fields: fields.filter(Boolean) } };
}

// ---- Template workbook helpers ----

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16243A' } };

function addSheet(wb, name, headers, rows, { tab } = {}) {
  const ws = wb.addWorksheet(name, tab ? { properties: { tabColor: { argb: tab } } } : undefined);
  ws.columns = headers.map((h) => ({ width: Math.min(42, Math.max(14, String(h).length + 6)) }));
  const head = ws.addRow(headers);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = HEAD_FILL; });
  for (const r of rows) ws.addRow(r);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

function addInstructions(wb, title, lines) {
  const ws = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: 'FF1D5FAD' } } });
  ws.columns = [{ width: 110 }];
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14 };
  ws.addRow([]);
  for (const line of lines) {
    const row = ws.addRow([line]);
    row.alignment = { wrapText: true, vertical: 'top' };
    if (/^\d+\./.test(line) || line.endsWith(':')) row.font = { bold: true };
  }
  return ws;
}

// Columns present in the file but not consumed by the import — the upload
// preview lists them so nothing is EVER silently dropped. `refused` columns
// are recognized but deliberately not imported (project-level or
// system-managed); the rest are simply unknown headers.
function computeIgnoredColumns(parsed, knownColumns, refusedColumns) {
  const known = new Set(knownColumns.map(lower));
  const refusedSet = new Set(refusedColumns.map(lower));
  const ignored = [];
  for (const f of parsed.meta.fields || []) {
    if (refusedSet.has(lower(f))) {
      ignored.push({
        column: f,
        reason: 'project-level / system-managed — ignored (set it on the Project in the app)',
      });
    } else if (!known.has(lower(f))) {
      ignored.push({ column: f, reason: 'not a recognized column — ignored' });
    }
  }
  return ignored;
}

// Excel A1 column letter for a 1-based index.
function colLetter(i) {
  let s = '';
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Dropdown (list) validation on a Data-sheet column, fed by a reference-sheet
// range. errorStyle 'warning' keeps Excel from blocking legitimate values the
// dropdown cannot know — the import itself is the real validator.
function addListValidation(ws, headers, headerName, formula) {
  const idx = headers.indexOf(headerName) + 1;
  if (!idx) return;
  const L = colLetter(idx);
  ws.dataValidations.add(`${L}2:${L}1000`, {
    type: 'list',
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Value not in the reference list',
    error: 'Pick a value from the reference sheets (warning only — the import validates on upload).',
    formulae: [formula],
  });
}

async function sendWorkbook(res, wb, filename) {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ---------------------------------------------------------------------------
// Activities import
// ---------------------------------------------------------------------------
// Simplified long format: one row per activity per beneficiary group; locations
// as one semicolon-separated column (P-codes or unique names). CONSECUTIVE rows
// with the same (Project Title, Activity Title, Start Date) merge into ONE
// activity with multiple beneficiary-group entries.

const ACT_FIXED_COLUMNS = [
  'Organization Acronym',
  'Project Title',
  'Activity Title',
  'Sector',
  'Locations',
  'Start Date',
  'End Date',
  'Description',
  'Notes',
  'Beneficiary Group',
  'Targeted Total',
];
const ACT_REQUIRED = ['Project Title', 'Activity Title', 'Sector', 'Locations', 'Start Date'];
// Recognized but deliberately NOT imported: these live on the Project (or are
// system-managed timestamps). The preview reports them so data is never
// silently dropped (REV1 instructions explicitly worried about this).
// DRM context (phase / INFORM component / data source) moved to the Project's
// "Disaster / Emergency & DRM context" section alongside the event.
const ACT_PROJECT_LEVEL_COLUMNS = [
  'Activity Status',
  'Funding Source / Donor',
  'Budget (SCR)',
  'Partner Organization(s)',
  'Last Updated',
  'DRM Phase',
  'Hazard / INFORM Component Addressed',
  'INFORM Dimension',
  'Data Source / Verified By',
];

async function activityTemplateHeaders() {
  const demoCats = await DisaggregationCategory.find().sort('order').lean();
  return {
    demoCats,
    headers: [
      ...ACT_FIXED_COLUMNS,
      ...demoCats.map((c) => c.label),
      'Female (group split)',
      'Male (group split)',
    ],
  };
}

// Excel template: Instructions + Data entry sheet + reference sheets holding
// what is already in the system (organizations/short codes, locations/P-codes,
// sectors, beneficiary groups, existing projects) so imported values match.
exports.activitiesTemplate = catchAsync(async (req, res) => {
  const { headers, demoCats } = await activityTemplateHeaders();
  const [orgs, locations, sectors, groups, cfg, projects] = await Promise.all([
    Organization.find({ active: { $ne: false } }).select('name acronym').sort('name').lean(),
    Location.find({ active: { $ne: false } })
      .select('name code level parent isoCode informAdm1 informAdm2 provisional notes')
      .sort({ level: 1, name: 1 })
      .lean(),
    Sector.find({ active: { $ne: false } }).select('name code').sort('name').lean(),
    BeneficiaryGroup.find().select('name').sort('name').lean(),
    AdminLevelConfig.findOne().lean(),
    Project.find(req.user.role === 'org' ? { organization: req.user.organizationId } : {})
      .select('title status organization')
      .populate('organization', 'acronym name')
      .sort('title')
      .lean(),
  ]);
  const levelName = (lvl) =>
    (cfg?.levels || []).find((l) => l.level === lvl)?.name || `Level ${lvl}`;
  const locById = new Map(locations.map((l) => [l._id.toString(), l]));

  const wb = new ExcelJS.Workbook();
  addInstructions(wb, '5Ws — Activities import template', [
    '1. How to use this workbook:',
    'Fill in the Data sheet — one row per activity per beneficiary group.',
    'Upload this workbook directly (only the Data sheet is read), or save the Data sheet as CSV first.',
    'Delete the two example rows before importing.',
    'Dates must be in YYYY-MM-DD format. Beneficiary numbers must be whole numbers.',
    'Dropdowns on the Data sheet are fed by the reference sheets; they warn (not block) so the server-side validation preview stays authoritative.',
    '',
    '2. Values must match what is already in the system:',
    'Organization Acronym — a short code from the Organizations sheet.',
    'Project Title — must match an existing project exactly (see the Projects sheet). Projects must be created in the app before importing their activities.',
    'Sector — a name or code from the Sectors sheet.',
    'Locations — semicolon-separated P-codes (preferred) or unique names from the Locations sheet, e.g. "SC-MAHE-BVA; SC-MAHE-AET".',
    'Beneficiary Group — a name from the Beneficiary Groups sheet.',
    '',
    '3. Project-level columns:',
    'Disaster / Emergency & DRM context (event, DRM Phase, Hazard / INFORM Component, Data Source / Verified By) is set once on the Project in the app — one section on the project form.',
    'Activity Status, Funding Source / Donor, Budget, Partner Organization(s), Last Updated and the DRM context columns are PROJECT-level or system-managed — such columns are reported and ignored on import; set them on the Project in the app.',
    '',
    '4. Several beneficiary groups on one activity:',
    'Repeat the row on CONSECUTIVE lines with the same Project Title, Activity Title and Start Date — only the beneficiary columns need to change. The rows merge into one activity.',
    '',
    `5. Required columns: ${ACT_REQUIRED.join(', ')}.`,
    '',
    'The import runs a validation preview first — nothing is saved until every row passes.',
  ]);

  const blanks = demoCats.map(() => '');
  const dataWs = addSheet(wb, 'Data', headers, [
    ['NATSEY', 'Coastal Resilience & Mangrove Restoration', 'Mangrove replanting - Phase 1', 'ENV',
      'SC-MAHE-BVA; SC-MAHE-AET', '2026-01-15', '2026-06-30', 'Replanting along the north coast', '',
      'Youth', '120', ...blanks, '70', '50'],
    ['NATSEY', 'Coastal Resilience & Mangrove Restoration', 'Mangrove replanting - Phase 1', 'ENV',
      'SC-MAHE-BVA; SC-MAHE-AET', '2026-01-15', '2026-06-30', '', '',
      'Elderly', '30', ...blanks, '20', '10'],
  ], { tab: 'FF19703A' });

  addSheet(wb, 'Organizations', ['Acronym (short code)', 'Name'],
    orgs.map((o) => [o.acronym || '', o.name]));
  addSheet(wb, 'Locations',
    ['P-code', 'Name', 'Level', 'Parent', 'ISO 3166-2', 'INFORM ADM1', 'INFORM ADM2', 'Status', 'Notes'],
    locations.map((l) => [
      l.code || '', l.name, levelName(l.level),
      l.parent ? locById.get(l.parent.toString())?.name || '' : '',
      l.isoCode || '', l.informAdm1 || '', l.informAdm2 || '',
      l.provisional ? 'Provisional' : 'Active', l.notes || '',
    ]));
  addSheet(wb, 'Sectors', ['Name', 'Code'], sectors.map((s) => [s.name, s.code || '']));
  addSheet(wb, 'Beneficiary Groups', ['Name'], groups.map((g) => [g.name]));
  addSheet(wb, 'Projects', ['Project Title', 'Organization Acronym', 'Status'],
    projects.map((p) => [p.title, p.organization?.acronym || p.organization?.name || '', p.status]));

  // Dropdowns (warning-style) fed by the reference sheets.
  addListValidation(dataWs, headers, 'Organization Acronym',
    `Organizations!$A$2:$A$${orgs.length + 1}`);
  addListValidation(dataWs, headers, 'Sector', `Sectors!$B$2:$B$${sectors.length + 1}`);
  addListValidation(dataWs, headers, 'Beneficiary Group',
    `'Beneficiary Groups'!$A$2:$A$${groups.length + 1}`);

  await sendWorkbook(res, wb, exportFilename('Activities_Template', 'xlsx'));
});

async function loadActivityLookups(reqUser) {
  const [sectors, locations, groups, demoCats, projects] = await Promise.all([
    Sector.find().select('name code').lean(),
    Location.find().select('name code level').lean(),
    BeneficiaryGroup.find().select('name').lean(),
    DisaggregationCategory.find().sort('order').lean(),
    Project.find(reqUser.role === 'org' ? { organization: reqUser.organizationId } : {})
      .select('title organization')
      .populate('organization', 'acronym name')
      .lean(),
  ]);

  const sectorByKey = new Map();
  for (const s of sectors) {
    sectorByKey.set(lower(s.name), s);
    if (s.code) sectorByKey.set(lower(s.code), s);
  }

  const locByCode = new Map();
  const locsByName = new Map();
  for (const l of locations) {
    if (l.code) locByCode.set(lower(l.code), l);
    const key = lower(l.name);
    if (!locsByName.has(key)) locsByName.set(key, []);
    locsByName.get(key).push(l);
  }

  const groupByName = new Map(groups.map((g) => [lower(g.name), g]));

  const projectsByTitle = new Map();
  for (const p of projects) {
    const key = lower(p.title);
    if (!projectsByTitle.has(key)) projectsByTitle.set(key, []);
    projectsByTitle.get(key).push(p);
  }

  return {
    sectorByKey, locByCode, locsByName, groupByName, demoCats, projectsByTitle,
  };
}

function resolveLocations(value, lookups, errors) {
  const tokens = value.split(';').map(norm).filter(Boolean);
  if (!tokens.length) {
    errors.push('Locations is required (semicolon-separated P-codes or names)');
    return [];
  }
  const ids = [];
  for (const token of tokens) {
    const byCode = lookups.locByCode.get(lower(token));
    if (byCode) {
      ids.push(byCode._id);
      continue;
    }
    const byName = lookups.locsByName.get(lower(token)) || [];
    if (byName.length === 1) {
      ids.push(byName[0]._id);
    } else if (byName.length > 1) {
      const codes = byName.map((l) => l.code || `level ${l.level}`).join(', ');
      errors.push(`Location "${token}" is ambiguous — use a P-code (candidates: ${codes})`);
    } else {
      errors.push(`Unknown location "${token}" (no P-code or name match)`);
    }
  }
  return ids;
}

function resolveProject(get, lookups, errors) {
  const title = get('Project Title');
  if (!title) {
    errors.push('Project Title is required');
    return null;
  }
  let candidates = lookups.projectsByTitle.get(lower(title)) || [];
  const acronym = get('Organization Acronym');
  if (candidates.length > 1 && acronym) {
    candidates = candidates.filter((p) => lower(p.organization?.acronym) === lower(acronym));
  }
  if (!candidates.length) {
    errors.push(`Project "${title}" not found${acronym ? ` for organization "${acronym}"` : ''} (projects must exist before importing activities)`);
    return null;
  }
  if (candidates.length > 1) {
    const orgs = candidates.map((p) => p.organization?.acronym || p.organization?.name).join(', ');
    errors.push(`Project title "${title}" matches projects in multiple organizations (${orgs}) — fill in Organization Acronym`);
    return null;
  }
  return candidates[0];
}

function parseBeneficiary(get, lookups, errors) {
  const groupName = get('Beneficiary Group');
  const targetedTotal = parseCount(get('Targeted Total'), 'Targeted Total', errors);

  const targeted = {};
  let hasDemo = false;
  for (const c of lookups.demoCats) {
    const v = parseCount(get(c.label), `Targeted ${c.label}`, errors);
    if (v != null) {
      targeted[c.key] = v;
      hasDemo = true;
    }
  }
  for (const [label, key] of [['Female (group split)', 'female'], ['Male (group split)', 'male']]) {
    const v = parseCount(get(label), label, errors);
    if (v != null) {
      targeted[key] = v;
      hasDemo = true;
    }
  }

  if (!groupName) {
    if (targetedTotal != null || hasDemo) {
      errors.push('Beneficiary Group is required when beneficiary numbers are given');
    }
    return null;
  }
  const group = lookups.groupByName.get(lower(groupName));
  if (!group) {
    errors.push(`Unknown beneficiary group "${groupName}"`);
    return null;
  }
  const entry = { group: group._id };
  if (targetedTotal != null) entry.targetedTotal = targetedTotal;
  if (hasDemo) entry.disaggregation = { targeted };
  return entry;
}

// Validate all rows and assemble merged activities. Returns { rows, activities, summary }.
async function validateActivityRows(parsed, reqUser) {
  requireColumns(parsed, ACT_REQUIRED);
  const lookups = await loadActivityLookups(reqUser);

  const ignoredColumns = computeIgnoredColumns(
    parsed,
    [
      ...ACT_FIXED_COLUMNS,
      ...lookups.demoCats.map((c) => c.label),
      'Female (group split)',
      'Male (group split)',
    ],
    ACT_PROJECT_LEVEL_COLUMNS
  );

  const rowReports = [];
  const activities = [];
  let prevKey = null;

  parsed.data.forEach((raw, i) => {
    const line = i + 2; // 1-based, after the header row
    const get = fieldGetter(raw);
    const errors = [];
    const warnings = [];

    const projectTitle = get('Project Title');
    const activityTitle = get('Activity Title');
    const startDateStr = get('Start Date');
    const mergeKey = [lower(projectTitle), lower(activityTitle), startDateStr].join(' ');

    if (prevKey !== null && mergeKey === prevKey && activities.length) {
      // Continuation row: only the beneficiary columns matter.
      const beneficiary = parseBeneficiary(get, lookups, errors);
      if (!beneficiary && !errors.length) {
        warnings.push('Row repeats the previous activity but adds no beneficiary group — ignored');
      }
      const parent = activities[activities.length - 1];
      if (beneficiary && !errors.length) parent.doc.beneficiaries.push(beneficiary);
      if (errors.length) parent.hasErrors = true;
      rowReports.push({ line, data: raw, errors, warnings, mergedInto: parent.firstLine });
      prevKey = mergeKey;
      return;
    }

    if (!activityTitle) errors.push('Activity Title is required');
    const project = resolveProject(get, lookups, errors);

    const sectorName = get('Sector');
    const sector = sectorName ? lookups.sectorByKey.get(lower(sectorName)) : null;
    if (!sectorName) errors.push('Sector is required');
    else if (!sector) errors.push(`Unknown sector "${sectorName}"`);

    const locationIds = resolveLocations(get('Locations'), lookups, errors);

    if (!startDateStr) errors.push('Start Date is required');
    const startDate = startDateStr ? parseDate(startDateStr, 'Start Date', errors) : null;
    const endDate = parseDate(get('End Date'), 'End Date', errors);
    if (startDate && endDate && endDate < startDate) {
      errors.push('End Date is before Start Date');
    }

    const beneficiary = parseBeneficiary(get, lookups, errors);

    const doc = {
      project: project?._id,
      title: activityTitle,
      sector: sector?._id,
      locations: locationIds,
      startDate,
      endDate: endDate || undefined,
      description: get('Description') || undefined,
      notes: get('Notes') || undefined,
      beneficiaries: beneficiary ? [beneficiary] : [],
    };

    activities.push({
      firstLine: line,
      doc,
      project,
      hasErrors: errors.length > 0,
    });
    rowReports.push({ line, data: raw, errors, warnings });
    prevKey = mergeKey;
  });

  // Duplicate warnings — non-blocking, checked per merged activity.
  for (const a of activities) {
    if (a.hasErrors || !a.project) continue;
    const dup = await Activity.exists({
      project: a.project._id,
      title: new RegExp(`^${escapeRx(a.doc.title)}$`, 'i'),
      startDate: a.doc.startDate,
    });
    if (dup) {
      const report = rowReports.find((r) => r.line === a.firstLine);
      report.warnings.push('An activity with this project, title and start date already exists — importing will create a duplicate');
    }
  }

  // Refused columns also surface as a warning on the first data row so they
  // are visible in the row-by-row preview, not only in the summary.
  if (rowReports.length && ignoredColumns.length) {
    for (const ic of ignoredColumns) {
      rowReports[0].warnings.push(`Column "${ic.column}" is ${ic.reason}`);
    }
  }

  const errorRows = rowReports.filter((r) => r.errors.length).length;
  const summary = {
    totalRows: rowReports.length,
    validRows: rowReports.length - errorRows,
    errorRows,
    warningRows: rowReports.filter((r) => r.warnings.length).length,
    activitiesToCreate: activities.filter((a) => !a.hasErrors).length,
    ignoredColumns,
  };
  return { rows: rowReports, activities, summary };
}

exports.activitiesImport = catchAsync(async (req, res) => {
  if (!req.file) throw httpError(422, 'No file uploaded (field name: file)');
  const parsed = await parseUpload(req.file);
  if (!parsed.data.length) throw httpError(422, 'The file has no data rows');

  const { rows, activities, summary } = await validateActivityRows(parsed, req.user);

  if (String(req.query.dryRun) === 'true') {
    return res.json({ summary, rows });
  }
  if (summary.errorRows > 0) {
    return res.status(422).json({ summary, rows });
  }

  // Sequential create so the pre('validate') hook derives targeted totals.
  const created = [];
  for (const a of activities) {
    const activity = await Activity.create({
      ...a.doc,
      organization: a.project.organization._id || a.project.organization,
      createdBy: req.user.id,
    });
    created.push(activity._id);
  }
  audit(req, 'import', 'Activity', null, { count: created.length });
  res.status(201).json({ created: created.length, activityIds: created });
});

// ---------------------------------------------------------------------------
// Organizations import (admin only)
// ---------------------------------------------------------------------------

const ORG_COLUMNS = [
  'Name', 'Acronym', 'Organization Type', 'Registration No.', 'HQ District P-code',
  'Primary Sector Code', 'Also Works In', 'Aim', 'Date Founded', 'Chairperson',
  'Contact Person', 'Emails', 'Phones', 'Postal Address', 'Website / Social', 'Notes',
];
// Old header names still accepted (files made from earlier templates).
const ORG_COLUMN_ALIASES = { Type: 'Organization Type', Commission: 'Primary Sector Code', Webpage: 'Website / Social' };

// Human labels for org types as written in the REV1 register (mirrors
// export.controller ORG_TYPE_LABELS / frontend orgTypes.js).
const ORG_TYPE_IMPORT_LABELS = {
  donor: 'Donor',
  government: 'Government',
  'un-agency': 'UN Agency',
  'international-ngo': 'International NGO / INGO',
  'national-ngo': 'National NGO',
  'civil-society': 'Civil Society Organization',
  'community-based': 'Community-based Organisation (CBO)',
  'faith-based': 'Faith-based Organisation (FBO)',
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

// Accepts a raw enum value or any reasonable spelling of the label
// ("Community-based Organisation (CBO)", "faith-based organization", ...).
// Returns the enum value, or null when unrecognized.
function normalizeOrgType(raw) {
  const clean = lower(raw)
    .replace(/\(.*?\)/g, '') // strip "(CBO)"-style suffixes
    .replace(/organisation/g, 'organization')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!clean) return null;
  if (ORG_TYPES.includes(clean.replace(/ /g, '-'))) return clean.replace(/ /g, '-');
  for (const [value, label] of Object.entries(ORG_TYPE_IMPORT_LABELS)) {
    const cleanLabel = lower(label)
      .replace(/\(.*?\)/g, '')
      .replace(/organisation/g, 'organization')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (clean === cleanLabel) return value;
    // Accept the label with slashes/word-order intact minus filler ("Umbrella body / Network" -> "umbrella network")
    if (cleanLabel.split(' ').every((w) => clean.includes(w)) && clean.split(' ').every((w) => cleanLabel.includes(w))) {
      return value;
    }
  }
  // Common short forms.
  if (clean === 'cbo') return 'community-based';
  if (clean === 'fbo') return 'faith-based';
  if (clean === 'ingo') return 'international-ngo';
  return null;
}

exports.organizationsTemplate = catchAsync(async (req, res) => {
  const [existing, sectors, districts] = await Promise.all([
    Organization.find({ active: { $ne: false } }).select('name acronym').sort('name').lean(),
    Sector.find({ active: { $ne: false } }).select('name code').sort('name').lean(),
    Location.find({ active: { $ne: false }, level: 2 }).select('name code').sort('name').lean(),
  ]);

  const wb = new ExcelJS.Workbook();
  addInstructions(wb, '5Ws — Organizations import template', [
    '1. How to use this workbook:',
    'Fill in the Data sheet — one row per organization. Only Name is required.',
    'Upload this workbook directly (only the Data sheet is read), or save the Data sheet as CSV first.',
    'Delete the example row before importing.',
    'Emails, Phones and Also Works In take several values separated by semicolons.',
    '',
    '2. Values must match what is already in the system:',
    'Organization Type — a label from the Types sheet (e.g. Community-based Organisation (CBO)).',
    'HQ District P-code — a P-code from the Districts sheet (use the code, not the district name).',
    'Primary Sector Code / Also Works In — sector codes from the Sectors sheet.',
    'Organizations already in the system (see the Existing Organizations sheet) are skipped — the import never updates or duplicates them.',
    '',
    'The import runs a validation preview first — nothing is saved until every row passes.',
  ]);

  const dataWs = addSheet(wb, 'Data', ORG_COLUMNS, [[
    'Example Youth Council', 'EYC', 'Community-based Organisation (CBO)', 'CSO/RA/2015/123',
    'SC-MAHE-AET', 'YSC', 'DRR; CCA',
    'Empowering young people through skills and civic participation', '2015', 'A. Person',
    'B. Person', 'info@example.org; chair@example.org', '+248 2 000 000', 'P.O. Box 123, Victoria',
    'https://example.org', '',
  ]], { tab: 'FF19703A' });

  addSheet(wb, 'Types', ['Organization Type (write this label)', 'Machine value'],
    ORG_TYPES.map((t) => [ORG_TYPE_IMPORT_LABELS[t] || t, t]));
  addSheet(wb, 'Sectors', ['Name', 'Code'], sectors.map((s) => [s.name, s.code || '']));
  addSheet(wb, 'Districts', ['P-code', 'Name'], districts.map((d) => [d.code || '', d.name]));
  addSheet(wb, 'Existing Organizations', ['Name', 'Acronym (short code)'],
    existing.map((o) => [o.name, o.acronym || '']));

  addListValidation(dataWs, ORG_COLUMNS, 'Organization Type', `Types!$A$2:$A$${ORG_TYPES.length + 1}`);
  addListValidation(dataWs, ORG_COLUMNS, 'HQ District P-code', `Districts!$A$2:$A$${districts.length + 1}`);
  addListValidation(dataWs, ORG_COLUMNS, 'Primary Sector Code', `Sectors!$B$2:$B$${sectors.length + 1}`);

  await sendWorkbook(res, wb, exportFilename('Organizations_Template', 'xlsx'));
});

async function validateOrganizationRows(parsed) {
  requireColumns(parsed, ['Name']);
  const [existing, sectors, districts] = await Promise.all([
    Organization.find().select('name').lean(),
    Sector.find().select('name code').lean(),
    Location.find().select('name code').lean(),
  ]);
  const existingNames = new Set(existing.map((o) => lower(o.name)));
  const sectorByKey = new Map();
  for (const s of sectors) {
    sectorByKey.set(lower(s.name), s);
    if (s.code) sectorByKey.set(lower(s.code), s);
  }
  const locByCode = new Map(districts.filter((l) => l.code).map((l) => [lower(l.code), l]));

  const ignoredColumns = computeIgnoredColumns(
    parsed,
    [...ORG_COLUMNS, ...Object.keys(ORG_COLUMN_ALIASES)],
    []
  );

  const splitList = (v) => v.split(';').map(norm).filter(Boolean);
  const rowReports = [];
  const docs = [];
  const seenInFile = new Set();

  parsed.data.forEach((raw, i) => {
    const line = i + 2;
    const get = fieldGetter(raw);
    // New header name first, old template header as fallback.
    const getAliased = (name) => {
      const direct = get(name);
      if (direct) return direct;
      const oldName = Object.keys(ORG_COLUMN_ALIASES).find((k) => ORG_COLUMN_ALIASES[k] === name);
      return oldName ? get(oldName) : '';
    };
    const errors = [];
    const warnings = [];

    const name = get('Name');
    if (!name) errors.push('Name is required');

    let skip = false;
    if (name && existingNames.has(lower(name))) {
      warnings.push(`Organization "${name}" already exists — row skipped (updates are not supported by import)`);
      skip = true;
    }
    if (name && seenInFile.has(lower(name))) {
      warnings.push(`Duplicate of an earlier row in this file — skipped`);
      skip = true;
    }
    if (name) seenInFile.add(lower(name));

    const typeRaw = getAliased('Organization Type');
    let type = 'civil-society';
    if (typeRaw) {
      const normalized = normalizeOrgType(typeRaw);
      if (!normalized) {
        errors.push(
          `Invalid Organization Type "${typeRaw}" — expected one of: ${Object.values(ORG_TYPE_IMPORT_LABELS).join(', ')}`
        );
      } else {
        type = normalized;
      }
    }

    const commissionName = getAliased('Primary Sector Code');
    const commission = commissionName ? sectorByKey.get(lower(commissionName)) : null;
    if (commissionName && !commission) errors.push(`Unknown primary sector "${commissionName}"`);

    const otherSectors = [];
    for (const codeRaw of splitList(get('Also Works In'))) {
      const s = sectorByKey.get(lower(codeRaw));
      if (!s) errors.push(`Unknown sector "${codeRaw}" in Also Works In`);
      else if (!commission || String(s._id) !== String(commission._id)) otherSectors.push(s._id);
    }

    const hqRaw = get('HQ District P-code');
    const hqDistrict = hqRaw ? locByCode.get(lower(hqRaw)) : null;
    if (hqRaw && !hqDistrict) {
      errors.push(`Unknown HQ District P-code "${hqRaw}" — see the Districts sheet (use the code, not the name)`);
    }

    if (!errors.length && !skip && name) {
      docs.push({
        name,
        acronym: get('Acronym') || undefined,
        type,
        registrationNo: get('Registration No.') || undefined,
        hqDistrict: hqDistrict?._id,
        aim: get('Aim') || undefined,
        dateFounded: get('Date Founded') || undefined,
        chairperson: get('Chairperson') || undefined,
        contactPerson: get('Contact Person') || undefined,
        emails: splitList(get('Emails')),
        phones: splitList(get('Phones')),
        postalAddress: get('Postal Address') || undefined,
        webpage: getAliased('Website / Social') || undefined,
        notes: get('Notes') || undefined,
        commission: commission?._id,
        otherSectors,
      });
    }
    rowReports.push({ line, data: raw, errors, warnings, skipped: skip });
  });

  if (rowReports.length && ignoredColumns.length) {
    for (const ic of ignoredColumns) {
      rowReports[0].warnings.push(`Column "${ic.column}" is ${ic.reason}`);
    }
  }

  const errorRows = rowReports.filter((r) => r.errors.length).length;
  const skippedRows = rowReports.filter((r) => r.skipped).length;
  const summary = {
    totalRows: rowReports.length,
    validRows: rowReports.length - errorRows,
    errorRows,
    warningRows: rowReports.filter((r) => r.warnings.length).length,
    skippedRows,
    organizationsToCreate: docs.length,
    ignoredColumns,
  };
  return { rows: rowReports, docs, summary };
}

exports.organizationsImport = catchAsync(async (req, res) => {
  if (!req.file) throw httpError(422, 'No file uploaded (field name: file)');
  const parsed = await parseUpload(req.file);
  if (!parsed.data.length) throw httpError(422, 'The file has no data rows');

  const { rows, docs, summary } = await validateOrganizationRows(parsed);

  if (String(req.query.dryRun) === 'true') {
    return res.json({ summary, rows });
  }
  if (summary.errorRows > 0) {
    return res.status(422).json({ summary, rows });
  }

  const created = [];
  for (const doc of docs) {
    const org = await Organization.create(doc);
    created.push(org._id);
  }
  audit(req, 'import', 'Organization', null, { count: created.length });
  res.status(201).json({ created: created.length, skipped: summary.skippedRows });
});
