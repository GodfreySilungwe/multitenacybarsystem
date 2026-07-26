const dynamodb = require('../lib/dynamodb');

class QueryBuilder {
  constructor(model, query = {}) {
    this.model = model;
    this.query = query;
    this.populatePaths = [];
    this.sortConfig = null;
  }

  populate(path) {
    this.populatePaths.push(path);
    return this;
  }

  sort(sortConfig) {
    this.sortConfig = sortConfig;
    return this;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  async exec() {
    const records = await this.model._find(this.query);
    let results = [...records];

    if (this.sortConfig) {
      const entries = Object.entries(this.sortConfig);
      results = results.sort((a, b) => {
        for (const [key, direction] of entries) {
          const left = a[key] ?? '';
          const right = b[key] ?? '';
          if (left < right) return direction === -1 ? 1 : -1;
          if (left > right) return direction === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    if (this.populatePaths.length) {
      results = results.map((record) => this.model._populateRecord(record, this.populatePaths));
    }

    return results.map((record) => new this.model(record));
  }
}

class BaseModel {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this.id && this._id) {
      this.id = this._id;
    }
    if (!this._id && this.id) {
      this._id = this.id;
    }
  }

  static entityType = 'item';

  static _find(query = {}) {
    const entityType = this.entityType;
    return dynamodb.listEntities(entityType).then((records) => {
      if (!query || Object.keys(query).length === 0) {
        return records;
      }

      return records.filter((record) => {
        return Object.entries(query).every(([key, value]) => {
          if (key === '$or') {
            return value.some((condition) => Object.entries(condition).every(([subKey, subValue]) => record[subKey] === subValue));
          }

          if (key === '$expr') {
            const expr = value;
            if (expr.$lte && Array.isArray(expr.$lte) && expr.$lte.length === 2) {
              const [leftKey, rightKey] = expr.$lte;
              return (record[leftKey.replace(/\$/g, '')] ?? 0) <= (record[rightKey.replace(/\$/g, '')] ?? 0);
            }
            return false;
          }

          if (Array.isArray(value)) {
            return value.includes(record[key]);
          }

          if (value instanceof Date) {
            const recordValue = record[key];
            if (recordValue instanceof Date) {
              return recordValue.getTime() === value.getTime();
            }
            const parsed = Date.parse(recordValue);
            return !Number.isNaN(parsed) && parsed === value.getTime();
          }

          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const recordValue = record[key];
            const parseDateValue = (val) => {
              if (val instanceof Date) return val.getTime();
              if (typeof val === 'string') {
                const parsed = Date.parse(val);
                if (!Number.isNaN(parsed)) return parsed;
              }
              return val;
            };

            const recordComparable = parseDateValue(recordValue);

            if (value.$gte !== undefined) {
              return recordComparable >= parseDateValue(value.$gte);
            }
            if (value.$lte !== undefined) {
              return recordComparable <= parseDateValue(value.$lte);
            }
            if (value.$gt !== undefined) {
              return recordComparable > parseDateValue(value.$gt);
            }
            if (value.$lt !== undefined) {
              return recordComparable < parseDateValue(value.$lt);
            }
            if (value.$ne !== undefined) {
              return record[key] !== value.$ne;
            }
            if (value.$in !== undefined && Array.isArray(value.$in)) {
              return value.$in.includes(record[key]);
            }
            if (value.$nin !== undefined && Array.isArray(value.$nin)) {
              return !value.$nin.includes(record[key]);
            }
          }

          return record[key] === value;
        });
      });
    });
  }

  static find(query = {}) {
    return new QueryBuilder(this, query);
  }

  static async findById(id) {
    const item = await dynamodb.getEntity(this.entityType, id);
    return item ? new this(item) : null;
  }

  static async findOne(query = {}) {
    const records = await this._find(query);
    return records[0] ? new this(records[0]) : null;
  }

  static async findByIdAndDelete(id) {
    const existing = await this.findById(id);
    if (!existing) return null;
    await existing.delete();
    return existing;
  }

  static async findByIdAndUpdate(id, updates, options = {}) {
    const existing = await this.findById(id);
    if (!existing) return null;
    Object.assign(existing, updates);
    await existing.save();
    return existing;
  }

  static async aggregate(pipeline = []) {
    const records = await dynamodb.listEntities(this.entityType);
    const groupStage = pipeline.find((stage) => stage.$group);
    if (!groupStage) return [];

    const grouped = {};
    for (const record of records) {
      const key = record[groupStage.$group._id?.replace(/\$/g, '')] ?? 'default';
      if (!grouped[key]) {
        grouped[key] = { _id: key, totalQuantity: 0, count: 0 };
      }
      grouped[key].totalQuantity += Number(record.quantity || 0);
      grouped[key].count += 1;
    }

    return Object.values(grouped);
  }

  static _populateRecord(record, populatePaths) {
    const populated = { ...record };
    for (const path of populatePaths) {
      if (path === 'category' && populated.category) {
        populated.category = { _id: populated.category, name: 'Category' };
      }
      if (path === 'customer' && populated.customer) {
        populated.customer = { _id: populated.customer, name: 'Customer' };
      }
      if (path === 'supplier' && populated.supplier) {
        populated.supplier = { _id: populated.supplier, name: 'Supplier' };
      }
      if (path === 'items.product' && Array.isArray(populated.items)) {
        populated.items = populated.items.map((item) => ({ ...item, product: item.product ? { _id: item.product, name: 'Product' } : null }));
      }
    }
    return populated;
  }

  async save() {
    const data = this.toJSON();
    const existingId = this._id || this.id;

    if (existingId) {
      const existing = await dynamodb.getEntity(this.constructor.entityType, existingId);
      if (existing) {
        const updated = await dynamodb.updateEntity(this.constructor.entityType, existingId, data);
        Object.assign(this, updated);
        return this;
      }
    }

    const created = await dynamodb.createEntity(this.constructor.entityType, data);
    Object.assign(this, created);
    return this;
  }

  async delete() {
    const id = this._id || this.id;
    if (!id) return null;
    return dynamodb.deleteEntity(this.constructor.entityType, id);
  }

  populate(path) {
    if (path === 'category' && this.category) {
      this.category = { _id: this.category, name: 'Category' };
    }
    if (path === 'customer' && this.customer) {
      this.customer = { _id: this.customer, name: 'Customer' };
    }
    if (path === 'supplier' && this.supplier) {
      this.supplier = { _id: this.supplier, name: 'Supplier' };
    }
    if (path === 'items.product' && Array.isArray(this.items)) {
      this.items = this.items.map((item) => ({
        ...item,
        product: item.product ? { _id: item.product, name: 'Product' } : null
      }));
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = BaseModel;
