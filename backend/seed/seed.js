/* Idempotent seed: safe to re-run (upserts by natural key). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const AdminLevelConfig = require('../src/models/AdminLevelConfig');
const Sector = require('../src/models/Sector');
const ActivityType = require('../src/models/ActivityType');
const Location = require('../src/models/Location');
const BeneficiaryGroup = require('../src/models/BeneficiaryGroup');
const DisaggregationCategory = require('../src/models/DisaggregationCategory');
const InformComponent = require('../src/models/InformComponent');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf-8'));

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Map free-text CEPS commission strings to sector codes by keyword.
function commissionToSectorCode(text) {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  if (t.includes('environment') || t.includes('natural resource')) return 'ENV';
  if (t.includes('social') || t.includes('health')) return 'SOC';
  if (t.includes('right') || t.includes('governance')) return 'RGT';
  if (t.includes('youth') || t.includes('sport') || t.includes('culture')) return 'YSC';
  if (t.includes('faith')) return 'FBO';
  return null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');
  console.log('Connected to MongoDB');

  // 1. Admin level config
  const geo = readJson('locations.seychelles.json');
  let cfg = await AdminLevelConfig.findOne();
  if (!cfg) {
    cfg = await AdminLevelConfig.create({ levels: geo.levels });
    console.log('AdminLevelConfig created:', geo.levels.map((l) => l.name).join(' > '));
  } else {
    console.log('AdminLevelConfig exists — left unchanged');
  }

  // 2. Sectors — CEPS commissions + IASC global clusters + DRR/CCA/LIV (REV1).
  // All 19 seed by default (the old --iasc flag is accepted but no longer needed);
  // everything stays admin-editable.
  for (const file of ['sectors.json', 'sectors.iasc.json', 'sectors.drr.json']) {
    for (const s of readJson(file)) {
      await Sector.updateOne({ code: s.code }, { $setOnInsert: s }, { upsert: true });
    }
  }
  console.log(`Sectors: ${await Sector.countDocuments()}`);
  const sectorByCode = new Map((await Sector.find()).map((s) => [s.code, s._id]));

  // 3. Locations — flat node list resolved parent-first by code.
  // Match by path OR code so official renames (which change the name-derived
  // slug) never duplicate rows or crash on the unique code index. Reference
  // data (name, ISO/INFORM codes, provisional, notes) is $set so re-seeding
  // applies official REV1 corrections — like beneficiary-group bounds below,
  // this reverts admin renames of seeded units. Structure (level/parent/path)
  // and centroid stay $setOnInsert: structural moves are done by migrations
  // (see seed/migrate-rev1.js), and admin-set coordinates are never clobbered.
  const byCode = new Map();
  for (const n of [...geo.nodes].sort((a, b) => a.level - b.level)) {
    const parentDoc = n.parentCode ? byCode.get(n.parentCode) : null;
    if (n.parentCode && !parentDoc) throw new Error(`Unknown parentCode ${n.parentCode} for ${n.code}`);
    // Derive the child path from the parent's ACTUAL stored path (renamed
    // parents keep their original slug — path is a stable internal key).
    const nodePath = parentDoc ? `${parentDoc.path}/${slugify(n.name)}` : slugify(n.name);
    const match = { $or: [{ path: nodePath }, { code: n.code }] };
    await Location.updateOne(
      match,
      {
        $set: {
          name: n.name,
          isoCode: n.isoCode || null,
          informAdm1: n.informAdm1 || null,
          informAdm2: n.informAdm2 || null,
          plusCode: n.plusCode || null,
          provisional: !!n.provisional,
          ...(n.notes ? { notes: n.notes } : {}),
        },
        $setOnInsert: {
          level: n.level,
          parent: parentDoc ? parentDoc._id : null,
          path: nodePath,
          code: n.code,
          centroid: n.centroid,
        },
      },
      { upsert: true }
    );
    byCode.set(n.code, await Location.findOne(match).lean());
  }
  console.log(`Locations: ${await Location.countDocuments()}`);

  // 4. Beneficiary groups — demographic bounds are $set (not $setOnInsert) so
  // re-seeding applies them to existing databases; re-running resets admin edits
  // to these twelve names.
  for (const g of readJson('beneficiaryGroups.json')) {
    await BeneficiaryGroup.updateOne(
      { name: g.name },
      {
        $setOnInsert: { name: g.name },
        $set: { gender: g.gender ?? null, ageMin: g.ageMin ?? null, ageMax: g.ageMax ?? null },
      },
      { upsert: true }
    );
  }
  console.log(`Beneficiary groups: ${await BeneficiaryGroup.countDocuments()}`);

  // 4b. Disaggregation categories (gender x age bands + cross-cutting; admin-editable)
  for (const c of readJson('disaggregationCategories.json')) {
    await DisaggregationCategory.updateOne({ key: c.key }, { $setOnInsert: c }, { upsert: true });
  }
  console.log(`Disaggregation categories: ${await DisaggregationCategory.countDocuments()}`);

  // 4c. INFORM components (REV1 DRR taxonomy) — category/order are $set so
  // taxonomy corrections propagate on re-seed; name+dimension is the natural key.
  for (const c of readJson('informComponents.json')) {
    await InformComponent.updateOne(
      { dimension: c.dimension, name: c.name },
      { $setOnInsert: { dimension: c.dimension, name: c.name }, $set: { category: c.category, order: c.order } },
      { upsert: true }
    );
  }
  console.log(`INFORM components: ${await InformComponent.countDocuments()}`);

  // 5. Activity types
  for (const t of readJson('activityTypes.json')) {
    await ActivityType.updateOne({ name: t.name }, { $setOnInsert: t }, { upsert: true });
  }
  console.log(`Activity types: ${await ActivityType.countDocuments()}`);

  // 6. Organizations (from the CEPS directory extraction)
  const orgs = readJson('organizations.json');
  let unmatched = 0;
  for (const o of orgs) {
    const code = commissionToSectorCode(o.commission);
    if (o.commission && !code) {
      unmatched++;
      console.warn(`  ! Unmatched commission "${o.commission}" for ${o.name}`);
    }
    await Organization.updateOne(
      { name: o.name },
      {
        $setOnInsert: {
          name: o.name,
          acronym: o.acronym || undefined,
          aim: o.aim || undefined,
          dateFounded: o.dateFounded || undefined,
          chairperson: o.chairperson || undefined,
          emails: o.emails || [],
          phones: o.phones || [],
          postalAddress: o.postalAddress || undefined,
          webpage: o.webpage || undefined,
          commission: code ? sectorByCode.get(code) : undefined,
        },
      },
      { upsert: true }
    );
    // REV1 acronym backfill: 21 directory orgs had no acronym, which made them
    // unreferenceable in the activities import. Fill only where still blank so
    // admin-entered acronyms are never clobbered.
    if (o.acronym) {
      await Organization.updateOne(
        {
          name: o.name,
          $or: [{ acronym: null }, { acronym: '' }, { acronym: { $exists: false } }],
        },
        { $set: { acronym: o.acronym } }
      );
    }
  }
  console.log(`Organizations: ${await Organization.countDocuments()} (${unmatched} unmatched commissions)`);

  // 7. Admin user
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  let admin = await User.findOne({ username: 'admin' });
  if (!admin) {
    admin = new User({ username: 'admin', name: 'System Administrator', role: 'admin' });
    await admin.setPassword(adminPassword);
    await admin.save();
    console.log(`Admin user created: admin / ${adminPassword}  <-- CHANGE THIS PASSWORD`);
  } else {
    console.log('Admin user exists — left unchanged');
  }

  await mongoose.disconnect();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
