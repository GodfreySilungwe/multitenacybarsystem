const BaseModel = require('./baseModel');

class AuditLog extends BaseModel {
  static entityType = 'auditlog';
}

module.exports = AuditLog;
