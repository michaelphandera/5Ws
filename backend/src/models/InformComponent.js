const mongoose = require('mongoose');

// INFORM risk-model taxonomy (SADC INFORM model): dimension > category >
// component. Activities tag the component whose risk they reduce, so CSO work
// can be read against the national INFORM risk profile.
const INFORM_DIMENSIONS = ['Hazards & Exposure', 'Vulnerability', 'Lack of Coping Capacity'];

const informComponentSchema = new mongoose.Schema(
  {
    dimension: { type: String, enum: INFORM_DIMENSIONS, required: true },
    category: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

informComponentSchema.index({ dimension: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('InformComponent', informComponentSchema);
module.exports.INFORM_DIMENSIONS = INFORM_DIMENSIONS;
