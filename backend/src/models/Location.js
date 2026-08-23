const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: Number, required: true, min: 1, max: 3, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null, index: true },
    // Materialized path of slugs, e.g. "mahe/anse-aux-pins" — subtree = path prefix match.
    path: { type: String, required: true },
    code: { type: String, required: true, unique: true, trim: true },
    centroid: {
      lat: { type: Number },
      lng: { type: Number },
    },
    geometry: { type: mongoose.Schema.Types.Mixed, default: null },
    // National reference codes (REV1 gazetteer): ISO 3166-2:SC and the INFORM
    // SADC model's admin tiers. "TO CONFIRM" is stored verbatim where the
    // allocation awaits NBS/DRDM confirmation — deliberately not guessed.
    isoCode: { type: String, trim: true },
    informAdm1: { type: String, trim: true },
    informAdm2: { type: String, trim: true },
    plusCode: { type: String, trim: true },
    // Provisional = unit recorded but placement/allocation pending DRDM confirmation.
    provisional: { type: Boolean, default: false },
    notes: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

locationSchema.index({ path: 1 });

module.exports = mongoose.model('Location', locationSchema);
