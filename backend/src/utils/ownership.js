const { httpError } = require('../middleware/errorHandler');

// Org users may only mutate records of their own organization; admins bypass.
// `orgId` is the organization ObjectId (or string) on the record being written.
function assertOwnership(reqUser, orgId) {
  if (reqUser.role === 'admin') return;
  if (!orgId || orgId.toString() !== reqUser.organizationId) {
    throw httpError(403, 'You may only modify records belonging to your organization');
  }
}

module.exports = { assertOwnership };
