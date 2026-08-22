const mongoose = require('mongoose');

// The 5W reporting unit: Who (organization) does What (sector) Where (locations)
// When (dates — status lives on the project) for Whom (targeted beneficiaries).
// Demographic breakdown keyed by admin-defined DisaggregationCategory keys
// (gender x age bands, disability, ...). Categories — including their age
// ranges — are configured in Admin > Disaggregations, not hardcoded here.
const beneficiarySchema = new mongoose.Schema(
  {
    _id: false,
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'BeneficiaryGroup', required: true },
    targetedTotal: { type: Number, min: 0 },
    disaggregation: {
      targeted: { type: Map, of: Number, default: undefined },
    },
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    // Denormalized from project — dashboard aggregations and ownership checks stay single-collection.
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    sector: { type: mongoose.Schema.Types.ObjectId, ref: 'Sector', required: true, index: true },
    // Hidden from the UI (kept optional for legacy records).
    activityType: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivityType' },
    description: { type: String, trim: true },
    locations: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }],
      required: true,
      index: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'at least one location is required',
      },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    beneficiaries: [beneficiarySchema],
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  // flattenMaps so disaggregation Maps serialize as plain objects in API responses
  { timestamps: true, toJSON: { flattenMaps: true } }
);

// Disaggregation is authoritative when present: if the targeted total is missing
// or lower, derive it from the breakdown. Two groupings of the same people can
// coexist — non-cross-cutting age-band categories, and the generic female/male
// split used for demographic groups (Youth, Elderly, ...) — so the floor is the
// max of the two, never their sum. Cross-cutting categories (PWD) are excluded.
activitySchema.pre('validate', async function () {
  if (!this.beneficiaries?.length) return;
  const cats = await mongoose.model('DisaggregationCategory').find().select('key crossCutting').lean();
  const sumKeys = cats.filter((c) => !c.crossCutting).map((c) => c.key);
  const read = (demo, k) => (typeof demo.get === 'function' ? demo.get(k) : demo[k]);
  const sumOf = (demo, keys) => {
    let sum = 0;
    let hasAny = false;
    for (const k of keys) {
      const v = read(demo, k);
      if (v != null) {
        hasAny = true;
        sum += v;
      }
    }
    return hasAny ? sum : null;
  };
  for (const b of this.beneficiaries) {
    const demo = b.disaggregation?.targeted;
    if (!demo) continue;
    const catSum = sumOf(demo, sumKeys);
    const sexSum = sumOf(demo, ['female', 'male']);
    if (catSum == null && sexSum == null) continue;
    const floor = Math.max(catSum ?? 0, sexSum ?? 0);
    if (b.targetedTotal == null || b.targetedTotal < floor) b.targetedTotal = floor;
  }
});

module.exports = mongoose.model('Activity', activitySchema);
