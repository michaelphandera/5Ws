/* HISTORICAL migration — do NOT run after migrate-rev1.js: step 4 below
   unsets drmPhase, which the REV1 round reintroduced on activities.

   Migration (safe to re-run): 2026-08-19 simplification.
   1. Beneficiaries: plannedTotal -> targetedTotal, drop reachedTotal;
      disaggregation.planned -> disaggregation.targeted, drop .reached.
   2. Status 'suspended' -> 'planned' on projects and activities (option removed).
   3. Activity DRM context moves to the project: the first activity event found
      per project becomes project.event (existing project.event wins).
   4. Removed activity fields unset: event, drmPhase, budget, fundingSource,
      modality, implementingPartner, activityType, status (status lives on the
      project only). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const Activity = require('../src/models/Activity');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');

  // 1. Beneficiary planned/reached -> targeted (raw collection: schema no longer has the old keys).
  const acts = await Activity.collection.find({}).toArray();
  let benMigrated = 0;
  for (const a of acts) {
    if (!a.beneficiaries?.length) continue;
    let changed = false;
    const beneficiaries = a.beneficiaries.map((b) => {
      const out = { group: b.group };
      const targeted = b.targetedTotal ?? b.plannedTotal;
      if (targeted != null) out.targetedTotal = targeted;
      const demo = b.disaggregation?.targeted || b.disaggregation?.planned;
      if (demo && Object.keys(demo).length) out.disaggregation = { targeted: demo };
      if (b.plannedTotal != null || b.reachedTotal != null || b.disaggregation?.planned || b.disaggregation?.reached) {
        changed = true;
      }
      return out;
    });
    if (changed) {
      await Activity.collection.updateOne({ _id: a._id }, { $set: { beneficiaries } });
      benMigrated++;
    }
  }
  console.log(`Activities with beneficiaries migrated to targeted-only: ${benMigrated}`);

  // 2. Suspended status removed.
  const ps = await Project.collection.updateMany({ status: 'suspended' }, { $set: { status: 'planned' } });
  const as = await Activity.collection.updateMany({ status: 'suspended' }, { $set: { status: 'planned' } });
  console.log(`Suspended -> planned: ${ps.modifiedCount} project(s), ${as.modifiedCount} activit(ies)`);

  // 3. Activity events move up to their project.
  const withEvent = await Activity.collection.find({ event: { $ne: null } }).toArray();
  let eventsMoved = 0;
  for (const a of withEvent) {
    const r = await Project.collection.updateOne(
      { _id: a.project, $or: [{ event: null }, { event: { $exists: false } }] },
      { $set: { event: a.event } }
    );
    eventsMoved += r.modifiedCount;
  }
  console.log(`Project events set from activities: ${eventsMoved}`);

  // 4. Unset removed activity fields.
  const unset = await Activity.collection.updateMany(
    {},
    { $unset: { event: '', drmPhase: '', budget: '', fundingSource: '', modality: '', implementingPartner: '', activityType: '', status: '' } }
  );
  console.log(`Activities cleaned of removed fields: ${unset.modifiedCount}`);

  // Budget currencies outside SCR/USD/EUR fall back to SCR (enum added).
  const cur = await Project.collection.updateMany(
    { 'budget.currency': { $exists: true, $nin: ['SCR', 'USD', 'EUR'] } },
    { $set: { 'budget.currency': 'SCR' } }
  );
  console.log(`Project currencies normalized: ${cur.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
