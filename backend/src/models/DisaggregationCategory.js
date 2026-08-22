const mongoose = require('mongoose');

// Admin-defined disaggregation categories (gender x age bands, disability, etc.).
// Age ranges and labels are set when the category is created — nothing is hardcoded.
// `key` becomes the field name inside Activity.beneficiaries[].disaggregation.
// `crossCutting: true` (e.g. persons with disabilities) excludes the category from
// the gender/age sum used to derive beneficiary totals.
const disaggregationCategorySchema = new mongoose.Schema(
  {
    // Machine identifier used as a field name in Activity disaggregation maps.
    // Case is preserved (existing data may use camelCase keys).
    key: { type: String, unique: true, trim: true },
    label: { type: String, required: true, unique: true, trim: true },
    gender: { type: String, enum: ['female', 'male', 'other', null], default: null },
    ageMin: { type: Number, min: 0, default: null },
    ageMax: { type: Number, min: 0, default: null },
    crossCutting: { type: Boolean, default: false },
    // HXL attribute suffix appended to #beneficiary+targeted / +reached in exports,
    // e.g. "+f+children" or "+disabled" (hxlstandard.org).
    hxlAttribute: { type: String, trim: true, default: '' },
    order: { type: Number, default: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

disaggregationCategorySchema.pre('validate', function () {
  if (!this.key && this.label) {
    this.key = this.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
  }
  // 'female'/'male' are reserved for the generic sex split that demographic
  // beneficiary groups (Youth, Elderly, ...) store alongside category keys.
  if (['female', 'male'].includes(this.key)) {
    throw new Error(`Category key "${this.key}" is reserved for the group sex split — pick another key`);
  }
  if (!this.hxlAttribute) {
    const parts = [];
    if (this.gender === 'female') parts.push('+f');
    if (this.gender === 'male') parts.push('+m');
    if (this.ageMax != null && this.ageMax <= 17) parts.push('+children');
    else if (this.ageMin != null && this.ageMin >= 60) parts.push('+elderly');
    else if (this.ageMin != null || this.ageMax != null) parts.push('+adult');
    this.hxlAttribute = parts.join('');
  }
});

module.exports = mongoose.model('DisaggregationCategory', disaggregationCategorySchema);
