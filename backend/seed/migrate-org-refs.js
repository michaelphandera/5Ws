/* Migration (safe to re-run): org types + funding sources as organization refs.
   1. Organizations without a `type` get 'civil-society'.
   2. Free-text funding sources (projects.fundingSources / activities.fundingSource)
      become Organization refs — a 'donor' org is created per distinct name. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Organization = require('../src/models/Organization');
const Project = require('../src/models/Project');
const Activity = require('../src/models/Activity');

const isObjectId = (v) => /^[0-9a-f]{24}$/i.test(String(v));

async function donorIdFor(name, cache) {
  const key = name.trim();
  if (cache.has(key)) return cache.get(key);
  let org = await Organization.findOne({ name: key });
  if (!org) {
    org = await Organization.create({ name: key, type: 'donor' });
    console.log(`  created donor org: ${key}`);
  }
  cache.set(key, org._id);
  return org._id;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');

  const typed = await Organization.updateMany(
    { type: { $in: [null, undefined] } },
    { $set: { type: 'civil-society' } }
  );
  console.log(`Org types backfilled: ${typed.modifiedCount}`);

  const cache = new Map();

  // Projects: raw collection read to see legacy string values.
  const projects = await Project.collection.find({}).toArray();
  for (const p of projects) {
    const src = p.fundingSources || [];
    const strings = src.filter((s) => typeof s === 'string' && !isObjectId(s));
    if (!strings.length) continue;
    const ids = [];
    for (const s of src) {
      if (typeof s === 'string' && !isObjectId(s)) ids.push(await donorIdFor(s, cache));
      else ids.push(s);
    }
    await Project.collection.updateOne({ _id: p._id }, { $set: { fundingSources: ids } });
    console.log(`  project "${p.title}": ${strings.length} funding string(s) -> refs`);
  }

  const activities = await Activity.collection.find({ fundingSource: { $type: 'string' } }).toArray();
  for (const a of activities) {
    const id = await donorIdFor(a.fundingSource, cache);
    await Activity.collection.updateOne({ _id: a._id }, { $set: { fundingSource: id } });
    console.log(`  activity "${a.title}": funding string -> ref`);
  }

  // (Step 3 — derived project statuses — removed: status is user-set since 2026-08-19.)

  await mongoose.disconnect();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
