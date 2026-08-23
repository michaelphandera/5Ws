/* Demo dataset for showcasing the platform (public page, dashboard, maps).
 *
 *   node seed/seed-demo.js            # add demo projects/activities/events/org points
 *   node seed/seed-demo.js --remove   # delete everything this script created
 *
 * Idempotent: projects are matched by title — existing ones are skipped.
 * All demo projects are listed in DEMO_PROJECTS below, so --remove is exact.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const Organization = require('../src/models/Organization');
const Sector = require('../src/models/Sector');
const Location = require('../src/models/Location');
const BeneficiaryGroup = require('../src/models/BeneficiaryGroup');
const DisasterEvent = require('../src/models/DisasterEvent');
const Project = require('../src/models/Project');
const Activity = require('../src/models/Activity');
const InformComponent = require('../src/models/InformComponent');
const User = require('../src/models/User');
const { DRM_PHASES } = require('../src/utils/drm');
require('../src/models/DisaggregationCategory'); // needed by Activity's pre-validate hook

// Deterministic RNG so re-runs produce identical numbers.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260822);
const between = (min, max) => Math.round(min + rand() * (max - min));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
};

const DEMO_EVENTS = [
  {
    name: 'Tropical Cyclone Fantala — Response 2026',
    type: 'cyclone',
    glideNumber: 'TC-2026-000045-SYC',
    status: 'active',
    startDate: new Date('2026-04-18'),
    description: 'Category 3 cyclone brushing the inner islands; wind and storm-surge damage on north Mahé and Praslin.',
  },
  {
    name: 'North-East Monsoon Floods 2025',
    type: 'flood',
    glideNumber: 'FL-2025-000201-SYC',
    status: 'closed',
    startDate: new Date('2025-12-05'),
    endDate: new Date('2026-02-15'),
    description: 'Flash flooding and landslides after sustained monsoon rain on eastern Mahé.',
  },
];

// Office points spread across Mahé, Praslin and La Digue (approx. plausible spots).
const ORG_POINTS = [
  { lat: -4.6191, lng: 55.4513 }, // Victoria
  { lat: -4.621, lng: 55.4278 }, // Beau Vallon
  { lat: -4.6180, lng: 55.4570 }, // English River
  { lat: -4.6320, lng: 55.4550 }, // Mont Fleuri
  { lat: -4.7407, lng: 55.5081 }, // Anse Royale
  { lat: -4.7146, lng: 55.4838 }, // Anse Boileau
  { lat: -4.5772, lng: 55.4457 }, // Glacis
  { lat: -4.6614, lng: 55.4926 }, // Cascade
  { lat: -4.6489, lng: 55.4197 }, // Port Glaud
  { lat: -4.69, lng: 55.515 }, // Anse aux Pins
  { lat: -4.7906, lng: 55.5027 }, // Takamaka
  { lat: -4.3311, lng: 55.7519 }, // Baie Sainte Anne, Praslin
  { lat: -4.3273, lng: 55.701 }, // Grand'Anse Praslin
  { lat: -4.3592, lng: 55.8412 }, // La Digue
];

// [title, sector code(s) for its activities, status, start, end, budget, currency, event index|null]
const DEMO_PROJECTS = [
  ['Coastal Resilience & Mangrove Restoration', ['ENV'], 'ongoing', '2025-09-01', '2027-03-31', 1850000, 'SCR', null],
  ['Community Early Warning Champions', ['ENV', 'PRO'], 'ongoing', '2026-01-15', '2026-12-20', 92000, 'USD', 0],
  ['Cyclone Fantala Emergency Shelter Support', ['SHL'], 'ongoing', '2026-04-20', '2026-10-31', 145000, 'USD', 0],
  ['Post-Flood WASH Rehabilitation — East Mahé', ['WASH'], 'completed', '2025-12-10', '2026-05-30', 640000, 'SCR', 1],
  ['Youth Climate Action Network', ['YSC', 'ENV'], 'ongoing', '2025-06-01', '2026-12-31', 38000, 'EUR', null],
  ['Safe Homes — GBV Prevention Programme', ['PRO', 'SOC'], 'ongoing', '2026-02-01', '2027-01-31', 71000, 'USD', null],
  ['Inclusive Education for Children with Disabilities', ['EDU'], 'ongoing', '2025-08-15', '2027-06-30', 1220000, 'SCR', null],
  ['Healthy Ageing & Home Care Outreach', ['HLT', 'SOC'], 'ongoing', '2026-03-01', '2026-11-30', 415000, 'SCR', null],
  ['School Nutrition & Gardens Initiative', ['NUT', 'EDU'], 'ongoing', '2026-01-10', '2026-12-15', 265000, 'SCR', null],
  ['Digital Skills for Out-of-School Youth', ['YSC', 'EDU'], 'planned', '2026-10-01', '2027-09-30', 54000, 'USD', null],
  ['Community Mental Health First Aid', ['HLT'], 'planned', '2026-11-01', '2027-05-31', 180000, 'SCR', null],
  ['Civic Voice — Governance & Rights Awareness', ['RGT'], 'ongoing', '2025-10-01', '2026-09-30', 29000, 'EUR', null],
  ['Fishers’ Livelihoods & Food Security', ['FSC'], 'ongoing', '2026-02-15', '2027-02-14', 720000, 'SCR', null],
  ['Interfaith Community Support Network', ['FBO', 'SOC'], 'completed', '2025-05-01', '2026-04-30', 96000, 'SCR', null],
  ['Emergency Logistics Readiness — Inner Islands', ['LOG'], 'planned', '2026-09-15', '2027-03-15', 88000, 'USD', 0],
  ['Clean Shores — Marine Litter Programme', ['ENV'], 'completed', '2025-04-01', '2026-03-31', 310000, 'SCR', null],
  ['Community Flood Preparedness — Anse Kerlan & Grand\'Anse', ['DRR'], 'ongoing', '2026-03-01', '2027-02-28', 210000, 'SCR', null],
  ['Climate-Resilient Fisheries Adaptation', ['CCA', 'LIV'], 'ongoing', '2026-05-01', '2027-04-30', 480000, 'SCR', null],
  ['Island Livelihoods Recovery — Inner Islands', ['LIV'], 'planned', '2026-11-01', '2027-10-31', 150000, 'USD', null],
];

const ACTIVITY_VERBS = {
  ENV: ['Mangrove replanting', 'Beach profiling & dune restoration', 'Community clean-up drives', 'Wetland monitoring training'],
  PRO: ['Community protection focal point training', 'Awareness sessions on referral pathways', 'Safe spaces facilitation'],
  SHL: ['Emergency roof repair kits distribution', 'Shelter assessment sweeps', 'Host family support grants'],
  WASH: ['Household water tank disinfection', 'Drainage clearing brigades', 'Hygiene promotion door-to-door'],
  YSC: ['Youth eco-camps', 'Inter-district sports for change', 'Young leaders bootcamp'],
  SOC: ['Family counselling clinics', 'Community care volunteer training', 'Social support case visits'],
  EDU: ['Inclusive classroom teacher training', 'Assistive learning materials distribution', 'After-school catch-up clubs'],
  HLT: ['Mobile screening clinics', 'Home-based care visits', 'Peer health educator training'],
  NUT: ['School garden starter kits', 'Cooking demonstrations for parents', 'Micronutrient awareness days'],
  RGT: ['Know-your-rights village meetings', 'Local governance dialogue forums', 'Civic education radio spots'],
  FSC: ['Fish processing & storage training', 'Community seed bank setup', 'Backyard farming starter packs'],
  FBO: ['Neighbourhood support circles', 'Volunteer chaplaincy visits', 'Community solidarity kitchens'],
  LOG: ['Prepositioned stock audits', 'Volunteer drivers roster training', 'Warehouse readiness drills'],
  DRR: ['Community evacuation drills', 'Flood early-warning siren tests', 'District contingency planning workshops'],
  CCA: ['Rainwater harvesting installations', 'Coastal setback awareness sessions', 'Climate-smart farming demonstrations'],
  LIV: ['Fisher gear replacement grants', 'Home-business starter kits', 'Savings group facilitation'],
};

// Provenance strings for the demo activities' Data Source field (REV1).
const DATA_SOURCES = [
  'Organisation self-report',
  'DRDM sitrep',
  'Partner field report',
  'Community committee minutes',
  'DRDM verified',
];

// Deterministic (index-derived, no RNG) org register values so --remove can
// recompute the exact registration numbers it planted and clear only those.
const CONTACT_FIRST = ['Marie', 'Jean', 'Anne', 'David', 'Sandra', 'Paul', 'Lucy', 'Marc', 'Nadia', 'Terry', 'Brigitte', 'Ronny', 'Sheila', 'Kevin', 'Doris', 'Alain'];
const CONTACT_LAST = ['Payet', 'Hoareau', 'Adam', 'Laurence', 'Cedras', 'Dogley', 'Camille', 'Morel', 'Servina', 'Jumeau', 'Pool', 'Souyave', 'Ernesta', 'Labiche', 'Vidot', 'Rose'];
const demoRegistrationNo = (i) => `CSO/RA/${2000 + (i % 22)}/${String(101 + i * 7).padStart(3, '0')}`;
const demoContactPerson = (i) =>
  `${CONTACT_FIRST[i % CONTACT_FIRST.length]} ${CONTACT_LAST[(i * 3 + 1) % CONTACT_LAST.length]}`;

// Beneficiary mixes keyed by group name; per the form's rules, age/gender-bounded
// groups carry a female/male split, General Population the full category grid.
function beneficiariesFor(groupsByName) {
  const mixes = [];
  const roll = rand();
  if (roll < 0.3) {
    const female = between(40, 220);
    const male = between(40, 200);
    mixes.push({
      group: groupsByName.get('youth'),
      targeted: { female, male },
      targetedTotal: female + male,
    });
  } else if (roll < 0.55) {
    const girls = between(30, 150);
    const boys = between(30, 150);
    mixes.push({
      group: groupsByName.get('children'),
      targeted: { female: girls, male: boys },
      targetedTotal: girls + boys,
    });
  } else if (roll < 0.75) {
    const girls = between(20, 90);
    const boys = between(20, 90);
    const women = between(60, 260);
    const men = between(50, 220);
    const ef = between(10, 60);
    const em = between(8, 50);
    mixes.push({
      group: groupsByName.get('general population'),
      targeted: { girls, boys, women, men, elderlyFemale: ef, elderlyMale: em, pwd: between(5, 30) },
      targetedTotal: girls + boys + women + men + ef + em,
    });
  } else if (roll < 0.9) {
    const female = between(20, 90);
    const male = between(15, 80);
    mixes.push({
      group: groupsByName.get('elderly'),
      targeted: { female, male },
      targetedTotal: female + male,
    });
  } else {
    mixes.push({
      group: groupsByName.get('women'),
      targeted: { pwd: between(3, 15) },
      targetedTotal: between(50, 180),
    });
  }
  if (rand() < 0.35) {
    mixes.push({
      group: groupsByName.get('special needs'),
      targeted: {},
      targetedTotal: between(10, 45),
    });
  }
  // Hazard-exposure groups from the REV1 round (Fishers, Farmers, ...).
  if (rand() < 0.3) {
    const extra = pick([
      'fishers',
      'farmers & smallholders',
      'low-income households',
      'households in high-risk / flood-prone zones',
      'migrant workers',
    ]);
    mixes.push({ group: groupsByName.get(extra), targeted: {}, targetedTotal: between(15, 120) });
  }
  return mixes
    .filter((m) => m.group)
    .map((m) => ({
      group: m.group._id,
      targetedTotal: m.targetedTotal,
      disaggregation: Object.keys(m.targeted).length ? { targeted: m.targeted } : undefined,
    }));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');
  console.log('Connected to MongoDB');
  const remove = process.argv.includes('--remove');

  const titles = DEMO_PROJECTS.map((p) => p[0]);

  if (remove) {
    const projects = await Project.find({ title: { $in: titles } }).select('_id');
    const ids = projects.map((p) => p._id);
    const a = await Activity.deleteMany({ project: { $in: ids } });
    const p = await Project.deleteMany({ _id: { $in: ids } });
    const e = await DisasterEvent.deleteMany({ name: { $in: DEMO_EVENTS.map((x) => x.name) } });
    const o = await Organization.updateMany(
      { 'location.lat': { $in: ORG_POINTS.map((pt) => pt.lat) } },
      { $unset: { location: 1 } }
    );
    // Register enrichment: registration numbers are index-derived, so the exact
    // demo set can be recomputed here — only orgs still carrying one of those
    // numbers get their demo register fields cleared.
    const regNos = DEMO_PROJECTS.map((_, i) => demoRegistrationNo(i));
    const r = await Organization.updateMany(
      { registrationNo: { $in: regNos } },
      { $unset: { registrationNo: 1, hqDistrict: 1, contactPerson: 1, otherSectors: 1 } }
    );
    console.log(`Removed: ${p.deletedCount} projects, ${a.deletedCount} activities, ${e.deletedCount} events; cleared ${o.modifiedCount} org points, ${r.modifiedCount} org register records`);
    await mongoose.disconnect();
    return;
  }

  const [admin, sectors, districts, groups, informComponents, orgs] = await Promise.all([
    User.findOne({ role: 'admin' }),
    Sector.find().lean(),
    Location.find({ level: 2 }).lean(),
    BeneficiaryGroup.find().lean(),
    InformComponent.find().lean(),
    Organization.find({ active: true }).sort('name').lean(),
  ]);
  const sectorByCode = new Map(sectors.map((s) => [s.code, s]));
  const groupsByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
  // Natural hazards only — human hazards (Hazardous Material, Conflict ...) read
  // oddly on community-programme demo activities.
  const hazardComponents = informComponents.filter(
    (c) => c.dimension === 'Hazards & Exposure' && c.category === 'Natural'
  );
  const drmComponents = hazardComponents.length ? hazardComponents : informComponents;
  const sortedDistricts = [...districts].sort((a, b) => a.name.localeCompare(b.name));
  const sortedSectors = [...sectors].sort((a, b) => (a.code || '').localeCompare(b.code || ''));

  // Events
  const eventIds = [];
  for (const ev of DEMO_EVENTS) {
    const doc = await DisasterEvent.findOneAndUpdate(
      { name: ev.name },
      { $setOnInsert: ev },
      { upsert: true, new: true }
    );
    eventIds.push(doc._id);
  }
  console.log(`Events ready: ${DEMO_EVENTS.map((e) => e.name).join(' | ')}`);

  // Spread projects across a deterministic sample of organizations, and give
  // those organizations office points so the map overlay has something to show.
  const projectOrgs = pickN(orgs, DEMO_PROJECTS.length);
  for (let i = 0; i < projectOrgs.length && i < ORG_POINTS.length; i++) {
    await Organization.updateOne(
      { _id: projectOrgs[i]._id, $or: [{ 'location.lat': null }, { location: null }] },
      { $set: { location: ORG_POINTS[i] } }
    );
  }
  console.log(`Org office points set for up to ${Math.min(projectOrgs.length, ORG_POINTS.length)} organizations`);

  // Register enrichment (REV1 fields), only where still unset so admin-entered
  // values are never clobbered. Values are index-derived (see demoRegistrationNo)
  // so --remove can identify and clear exactly this set.
  let enriched = 0;
  for (let i = 0; i < projectOrgs.length; i++) {
    const org = projectOrgs[i];
    const hq = sortedDistricts.length ? sortedDistricts[(i * 5) % sortedDistricts.length] : null;
    const others = sortedSectors
      .filter((s) => String(s._id) !== String(org.commission))
      .filter((_, idx) => idx % Math.max(2, Math.ceil(sortedSectors.length / 2)) === i % 2)
      .slice(0, 1 + (i % 2))
      .map((s) => s._id);
    const res = await Organization.updateOne(
      {
        _id: org._id,
        $or: [{ registrationNo: null }, { registrationNo: '' }, { registrationNo: { $exists: false } }],
      },
      {
        $set: {
          registrationNo: demoRegistrationNo(i),
          contactPerson: demoContactPerson(i),
          ...(hq ? { hqDistrict: hq._id } : {}),
          otherSectors: others,
        },
      }
    );
    if (res.modifiedCount) enriched++;
  }
  console.log(`Org register fields (reg. no / HQ district / contact / sectors) set on ${enriched} organizations`);

  let createdProjects = 0;
  let createdActivities = 0;

  for (let i = 0; i < DEMO_PROJECTS.length; i++) {
    const [title, sectorCodes, status, start, end, amount, currency, evIdx] = DEMO_PROJECTS[i];
    if (await Project.exists({ title })) {
      console.log(`= skipped (exists): ${title}`);
      continue;
    }
    const org = projectOrgs[i % projectOrgs.length];
    const partners = rand() < 0.4 ? pickN(orgs.filter((o) => o._id !== org._id), between(1, 2)).map((o) => o._id) : [];

    // ~70% of demo projects carry the optional Disaster / Emergency & DRM
    // context section (project-level; activities inherit it).
    const withDrm = drmComponents.length && rand() < 0.7;
    const project = await Project.create({
      title,
      organization: org._id,
      implementingPartners: partners,
      description: `${title} — implemented by ${org.name}. Demo record for showcasing the coordination platform.`,
      startDate: new Date(start),
      endDate: new Date(end),
      status,
      event: evIdx != null ? eventIds[evIdx] : undefined,
      ...(withDrm
        ? {
            drmPhase: pick(DRM_PHASES),
            informComponent: pick(drmComponents)._id,
            dataSource: pick(DATA_SOURCES),
          }
        : {}),
      budget: { amount, currency },
      createdBy: admin?._id,
    });
    createdProjects++;

    const nActivities = between(1, 3);
    for (let k = 0; k < nActivities; k++) {
      const code = sectorCodes[k % sectorCodes.length];
      const sector = sectorByCode.get(code);
      if (!sector) continue;
      const verb = pick(ACTIVITY_VERBS[code] || ['Community outreach sessions']);
      const locs = pickN(districts, between(1, 4));
      await Activity.create({
        project: project._id,
        organization: org._id,
        title: `${verb} — ${locs[0].name}${locs.length > 1 ? ' +' + (locs.length - 1) : ''}`,
        sector: sector._id,
        locations: locs.map((l) => l._id),
        startDate: new Date(start),
        endDate: status === 'planned' ? undefined : new Date(end),
        beneficiaries: beneficiariesFor(groupsByName),
        notes: 'Demo record.',
        createdBy: admin?._id,
      });
      createdActivities++;
    }
    console.log(`+ ${title} (${org.acronym || org.name}, ${status}, ${nActivities} activities)`);
  }

  console.log(`\nDone: ${createdProjects} projects, ${createdActivities} activities created.`);
  console.log('Remove again with: node seed/seed-demo.js --remove');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
