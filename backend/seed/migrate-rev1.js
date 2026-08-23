/* Migration (safe to re-run): 2026-08 REV1 boss markup of the 5W template.
   Run BEFORE `node seed/seed.js`, from the backend/ directory.
   Never run migrate-simplify.js after this — its step 4 unsets drmPhase,
   which REV1 reintroduces on activities.

   1. AdminLevelConfig gains level 3 "Locality / Island".
   2. Existing locations matched by code get the REV1 reference data
      (official renames, ISO 3166-2, INFORM ADM1/ADM2, provisional, notes).
      `path` is deliberately untouched — renames keep the path stable
      (same convention as the locations update endpoint).
   3. Anse Kerlan (SC-PRAS-AKE) is structurally moved: District under the
      Praslin region -> Locality (level 3) under Grand'Anse Praslin. This is
      the one case where path MUST be rewritten, or subtree filtering by
      Grand'Anse Praslin would silently miss it. Descendant paths/levels are
      rebuilt defensively (Anse Kerlan has no children today).
   4. "GEF Small Grants" (donor org created by migrate-org-refs, not in the
      CEPS seed JSON) gets its proposed acronym GEF-SGP if still blank.
   New rows (Ile Perseverance II, Outer Islands district, island rows) are
   NOT created here — the hardened seed inserts them, resolving parents by
   code, so migrated DBs whose paths kept old slugs work unchanged. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const AdminLevelConfig = require('../src/models/AdminLevelConfig');
const Location = require('../src/models/Location');
const Organization = require('../src/models/Organization');

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');
  console.log('Connected to MongoDB');

  // 1. Admin level 3
  const cfg = await AdminLevelConfig.findOne();
  if (cfg && !cfg.levels.some((l) => l.level === 3)) {
    cfg.levels.push({ level: 3, name: 'Locality / Island' });
    await cfg.save();
    console.log('AdminLevelConfig: added level 3 "Locality / Island"');
  } else {
    console.log('AdminLevelConfig: level 3 already present (or no config yet)');
  }

  // 2. Reference-data updates on existing locations, keyed by code.
  const geo = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'locations.seychelles.json'), 'utf-8')
  );
  let updated = 0;
  for (const n of geo.nodes) {
    const doc = await Location.findOne({ code: n.code }).lean();
    if (!doc) continue; // new units are inserted by the seed, not here
    const wanted = {
      name: n.name,
      isoCode: n.isoCode || null,
      informAdm1: n.informAdm1 || null,
      informAdm2: n.informAdm2 || null,
      plusCode: n.plusCode || null,
      provisional: !!n.provisional,
      ...(n.notes ? { notes: n.notes } : {}),
    };
    // Write only real differences — keeps re-runs honest no-ops (a blind $set
    // would bump updatedAt via the timestamps plugin on every run).
    const diff = Object.fromEntries(
      Object.entries(wanted).filter(([k, v]) => (doc[k] ?? null) !== v)
    );
    if (Object.keys(diff).length) {
      await Location.updateOne({ code: n.code }, { $set: diff });
      updated++;
    }
  }
  console.log(`Locations updated with REV1 reference data: ${updated}`);

  // 3. Anse Kerlan structural move.
  const ake = await Location.findOne({ code: 'SC-PRAS-AKE' });
  const gap = await Location.findOne({ code: 'SC-PRAS-GAP' });
  if (ake && gap && String(ake.parent) !== String(gap._id)) {
    const oldPath = ake.path;
    const newPath = `${gap.path}/${oldPath.split('/').pop()}`; // keep the existing slug tail
    await Location.updateOne(
      { _id: ake._id },
      { $set: { parent: gap._id, level: 3, path: newPath } }
    );
    const descendants = await Location.find({
      path: new RegExp('^' + escapeRx(oldPath) + '/'),
    });
    for (const d of descendants) {
      await Location.updateOne(
        { _id: d._id },
        { $set: { path: newPath + d.path.slice(oldPath.length), level: Math.min(3, d.level + 1) } }
      );
    }
    console.log(
      `Anse Kerlan moved under Grand'Anse Praslin (level 3, path ${newPath}); descendants rebuilt: ${descendants.length}`
    );
  } else {
    console.log('Anse Kerlan: already migrated or not present');
  }

  // 4. GEF Small Grants acronym (org exists only in DBs that ran migrate-org-refs).
  const gef = await Organization.updateOne(
    {
      name: 'GEF Small Grants',
      $or: [{ acronym: null }, { acronym: '' }, { acronym: { $exists: false } }],
    },
    { $set: { acronym: 'GEF-SGP' } }
  );
  console.log(`GEF Small Grants acronym backfilled: ${gef.modifiedCount}`);

  await mongoose.disconnect();
  console.log('REV1 migration complete. Now run: node seed/seed.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
