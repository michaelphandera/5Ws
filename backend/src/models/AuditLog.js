const mongoose = require('mongoose');

// Append-only trail of who did what. Written fire-and-forget via utils/audit.js —
// an audit failure must never fail the request it describes.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'login', 'password-change', 'import'],
      required: true,
    },
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    entityLabel: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
