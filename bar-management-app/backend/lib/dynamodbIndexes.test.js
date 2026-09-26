const test = require('node:test');
const assert = require('node:assert/strict');
const { toDynamoItem } = require('./dynamodb');

test('inventory adjustments receive the shared bar/date GSI1 keys', () => {
  const adjustment = toDynamoItem('inventoryadjustment', {
    id: 'adjustment-1',
    barId: 'bar-1',
    createdAt: '2026-09-26T10:00:00.000Z'
  });

  assert.equal(adjustment.GSI1PK, 'BAR#bar-1#INVENTORY-ADJUSTMENT');
  assert.equal(adjustment.GSI1SK, '2026-09-26T10:00:00.000Z#adjustment-1');
});

test('order and payment GSI keys retain their existing partitions', () => {
  const order = toDynamoItem('order', { id: 'order-1', barId: 'bar-1', createdAt: '2026-09-26T10:00:00.000Z' });
  const payment = toDynamoItem('customerpaymentrequest', {
    id: 'payment-1',
    barId: 'bar-1',
    createdAt: '2026-09-26T10:00:00.000Z',
    status: 'confirmed'
  });

  assert.equal(order.GSI1PK, 'BAR#bar-1#ORDER');
  assert.equal(payment.GSI4PK, 'BAR#bar-1#PAYMENT#confirmed');
});