const BaseModel = require('./baseModel');

class Product extends BaseModel {
  static entityType = 'product';
}

module.exports = Product;