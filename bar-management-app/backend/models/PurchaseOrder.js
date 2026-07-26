const BaseModel = require('./baseModel');

function generateOrderNumber() {
  const date = new Date();
  const prefix = 'PO';
  const timestamp = date.getFullYear().toString().slice(2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
}

class PurchaseOrder extends BaseModel {
  static entityType = 'purchaseorder';

  constructor(data = {}) {
    super({ orderNumber: generateOrderNumber(), status: 'pending', ...data });
  }
}

module.exports = PurchaseOrder;