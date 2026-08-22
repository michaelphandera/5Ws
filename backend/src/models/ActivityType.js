const mongoose = require('mongoose');

const activityTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    sector: { type: mongoose.Schema.Types.ObjectId, ref: 'Sector' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityType', activityTypeSchema);
