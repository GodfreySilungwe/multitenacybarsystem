const BaseModel = require('./baseModel');

class Customer extends BaseModel {
  static entityType = 'customer';
}

module.exports = Customer;