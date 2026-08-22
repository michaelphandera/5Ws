const mongoose = require('mongoose');

const beneficiaryGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // Optional demographic bounds (admin-configurable). The activity form uses
    // them to disable disaggregation categories with no overlap; unset = any.
    gender: { type: String, enum: ['female', 'male'], default: undefined },
    ageMin: { type: Number, min: 0 },
    ageMax: { type: Number, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BeneficiaryGroup', beneficiaryGroupSchema);
