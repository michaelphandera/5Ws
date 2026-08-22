const mongoose = require('mongoose');

// Disaster/emergency event registry. Activities can be linked to an event so the
// system doubles as a DRM response-coordination tool. `glideNumber` is the
// international GLIDE identifier (glidenumber.net), e.g. FL-2024-000123-SYC.
const disasterEventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      enum: [
        'flood', 'cyclone', 'storm-surge', 'tsunami', 'earthquake', 'landslide',
        'drought', 'fire', 'epidemic', 'oil-spill', 'technological', 'other',
      ],
      required: true,
    },
    glideNumber: { type: String, trim: true },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DisasterEvent', disasterEventSchema);
