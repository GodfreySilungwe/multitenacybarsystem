const BaseModel = require('./baseModel');

class User extends BaseModel {
  static entityType = 'user';
}

module.exports = User;