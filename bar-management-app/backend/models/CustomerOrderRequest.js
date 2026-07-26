const BaseModel = require('./baseModel');

class CustomerOrderRequest extends BaseModel {
  static entityType = 'customerorderrequest';
}

module.exports = CustomerOrderRequest;
