const mongoose = require('mongoose');

// Singleton document defining the names of the location hierarchy levels,
// e.g. [{level:1, name:'Region'}, {level:2, name:'District'}].
const adminLevelConfigSchema = new mongoose.Schema(
  {
    levels: [
      {
        _id: false,
        level: { type: Number, required: true, min: 1, max: 3 },
        name: { type: String, required: true, trim: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminLevelConfig', adminLevelConfigSchema);
