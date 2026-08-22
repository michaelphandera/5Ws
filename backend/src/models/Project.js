const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    // Implementing organization (CSO) — owns the project and its activities.
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    // Partner organizations working alongside the implementing organization.
    implementingPartners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
    description: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    status: {
      type: String,
      enum: ['planned', 'ongoing', 'completed'],
      default: 'planned',
    },
    budget: {
      amount: { type: Number, min: 0 },
      currency: { type: String, enum: ['SCR', 'USD', 'EUR'], default: 'SCR' },
    },
    // Funding organizations from the organization registry (typically type 'donor').
    fundingSources: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }],
    // Disaster / Emergency context (if any) — regular programming when unset.
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'DisasterEvent', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
