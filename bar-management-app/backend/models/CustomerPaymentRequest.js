const BaseModel = require('./baseModel');

class CustomerPaymentRequest extends BaseModel {
  static entityType = 'customerpaymentrequest';
}

module.exports = CustomerPaymentRequest;
