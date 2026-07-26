const dynamodb = require('../lib/dynamodb');

function buildModel(entityType) {
  return {
    async find(query = {}) {
      const records = await dynamodb.listEntities(entityType);
      if (!query || Object.keys(query).length === 0) return records;
      return records.filter((record) => {
        return Object.entries(query).every(([key, value]) => {
          if (key === '$or') return value.some((condition) => Object.entries(condition).every(([subKey, subValue]) => record[subKey] === subValue));
          if (key === '$expr') return false;
          return record[key] === value;
        });
      });
    },
    async findById(id) {
      return dynamodb.getEntity(entityType, id);
    },
    async findOne(query = {}) {
      const records = await this.find(query);
      return records[0] || null;
    },
    async save() {
      if (this._id || this.id) {
        return dynamodb.updateEntity(entityType, this._id || this.id, this.toJSON ? this.toJSON() : this);
      }
      return dynamodb.createEntity(entityType, this.toJSON ? this.toJSON() : this);
    },
    async delete() {
      return dynamodb.deleteEntity(entityType, this._id || this.id);
    },
    toJSON() {
      return { ...this };
    }
  };
}

module.exports = buildModel;
