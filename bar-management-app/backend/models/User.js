const BaseModel = require('./baseModel');
const { listAllEntities } = require('../lib/dynamodb');

class User extends BaseModel {
  static entityType = 'user';

  static async findGlobalOne(query = {}) {
    const records = await listAllEntities(this.entityType);
    const matches = (record, condition) => Object.entries(condition).every(([key, value]) => record[key] === value);
    const record = records.find((candidate) => {
      if (query.$or) {
        return query.$or.some((condition) => matches(candidate, condition));
      }
      return matches(candidate, query);
    });
    return record ? new this(record) : null;
  }

  static async findGlobalByUsername(username) {
    const normalizedUsername = String(username || '').trim().toLowerCase().replace(/\s+/g, '');
    const records = await listAllEntities(this.entityType);
    const record = records.find((candidate) => String(candidate.username || '').trim().toLowerCase().replace(/\s+/g, '') === normalizedUsername);
    return record ? new this(record) : null;
  }
}

module.exports = User;