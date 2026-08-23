/* Migration (safe to re-run): Disaster / Emergency & DRM context becomes ONE
   project-level section. Run from the backend/ directory, AFTER migrate-rev1.

   The REV1 round put drmPhase / informComponent / dataSource on activities;
   this moves them up to the Project, next to `event`:

   1. For each project whose activities carry DRM fields, the project gets the
      MOST COMMON non-empty value of each field (first-seen wins a tie).
      Values already set on the project are never overwritten.
   2. The fields are then $unset from all activities.

   Re-running is a no-op once activities carry no DRM fields. Raw collection
   ops are used for the activity side — the fields are no longer in the
   Activity schema, so mongoose's strict mode would silently drop them. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const Activity = require('../src/models/Activity');

// Most common non-empty value; first-seen wins a tie (stable across re-runs).
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) {
    if (v == null || v === '') continue;
    const key = String(v);
    if (!counts.has(key)) counts.set(key, { value: v, n: 0 });
    counts.get(key).n++;
  }
  let best = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.value;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fivews');
  console.log('Connected to MongoDB');

  const coll = Activity.collection;
  const withDrm = await coll
    .find(
      {
        $or: [
          { drmPhase: { $exists: true } },
          { informComponent: { $exists: true } },
          { dataSource: { $exists: true } },
        ],
      },
      { projection: { project: 1, drmPhase: 1, informComponent: 1, dataSource: 1 } }
    )
    .toArray();

  if (!withDrm.length) {
    console.log('No activities carry DRM context fields — nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const byProject = new Map();
  for (const a of withDrm) {
    const key = a.project?.toString();
    if (!key) continue;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(a);
  }

  let projectsUpdated = 0;
  for (const [projectId, acts] of byProject) {
    const project = await Project.findById(projectId);
    if (!project) continue;
    const set = {};
    if (!project.drmPhase) {
      const v = mostCommon(acts.map((a) => a.drmPhase));
      if (v) set.drmPhase = v;
    }
    if (!project.informComponent) {
      const v = mostCommon(acts.map((a) => a.informComponent));
      if (v) set.informComponent = v;
    }
    if (!project.dataSource) {
      const v = mostCommon(acts.map((a) => a.dataSource));
      if (v) set.dataSource = v;
    }
    if (Object.keys(set).length) {
      Object.assign(project, set);
      await project.save();
      projectsUpdated++;
    }
  }

  const res = await coll.updateMany(
    {
      $or: [
        { drmPhase: { $exists: true } },
        { informComponent: { $exists: true } },
        { dataSource: { $exists: true } },
      ],
    },
    { $unset: { drmPhase: '', informComponent: '', dataSource: '' } }
  );

  console.log(
    `DRM context rolled up from ${withDrm.length} activities: ` +
      `${projectsUpdated} projects updated, fields cleared on ${res.modifiedCount} activities.`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
