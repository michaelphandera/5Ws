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

  // 2. Sectors
  const sectors = readJson('sectors.json');
  for (const s of sectors) {
    await Sector.updateOne({ code: s.code }, { $setOnInsert: s }, { upsert: true });
  }
  // Optional: `node seed/seed.js --iasc` also seeds the 11 IASC global clusters
  // (hierarchical alongside the civil-society commissions — both stay admin-editable).
  if (process.argv.includes('--iasc')) {
    for (const s of readJson('sectors.iasc.json')) {
      await Sector.updateOne({ code: s.code }, { $setOnInsert: s }, { upsert: true });
    }
    console.log('IASC global clusters seeded');
  }
  console.log(`Sectors: ${await Sector.countDocuments()}`);
  const sectorByCode = new Map((await Sector.find()).map((s) => [s.code, s._id]));

  // 3. Locations
  // Upsert by `path` (stable internal key) — NOT by code, which admins may
  // overwrite with official P-codes; matching on code would recreate duplicates.
  for (const region of geo.regions) {
    const regionPath = slugify(region.name);
    await Location.updateOne(
      { path: regionPath },
      { $setOnInsert: { name: region.name, level: 1, parent: null, path: regionPath, code: region.code, centroid: region.centroid } },
      { upsert: true }
    );
    const regionDoc = await Location.findOne({ path: regionPath });
    for (const d of region.districts) {
      const districtPath = `${regionDoc.path}/${slugify(d.name)}`;
      await Location.updateOne(
        { path: districtPath },
        { $setOnInsert: { name: d.name, level: 2, parent: regionDoc._id, path: districtPath, code: d.code, centroid: d.centroid } },
        { upsert: true }
      );
    }
  }
  console.log(`Locations: ${await Location.countDocuments()}`);

  // 4. Beneficiary groups — demographic bounds are $set (not $setOnInsert) so
  // re-seeding applies them to existing databases; re-running resets admin edits
  // to these seven names.
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
