const AuditLog = require('../models/AuditLog');
const { getTenantContext } = require('./tenantContext');

const createAuditEntry = async ({ action, entityType, entityId, details = {} }) => {
  const context = getTenantContext() || {};
  const audit = new AuditLog({
    barId: context.barId || null,
    userId: context.userId || null,
    userRole: context.role || null,
    action,
    entityType,
    entityId: String(entityId || ''),
    details,
    createdAt: new Date().toISOString()
  });
  await audit.save();
  return audit;
};

module.exports = {
  createAuditEntry
};
