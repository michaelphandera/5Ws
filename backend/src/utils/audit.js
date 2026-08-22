const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit entry — never awaited on the request path.
// doc may be a mongoose doc or plain object; label falls back through common name fields.
function audit(req, action, entityType, doc, meta) {
  const entry = {
    user: req.user?.id || undefined,
    action,
    entityType,
    entityId: doc?._id || undefined,
    entityLabel: doc?.title || doc?.name || doc?.username || undefined,
    meta,
  };
  AuditLog.create(entry).catch((err) => console.error('audit:', err.message));
}

module.exports = { audit };
