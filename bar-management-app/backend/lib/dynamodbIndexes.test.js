const test = require('node:test');
const assert = require('node:assert/strict');
const { toDynamoItem } = require('./dynamodb');
const dynamodb = require('./dynamodb');
const Product = require('../models/Product');

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

test('products receive bar-scoped GSI5 keys with a normalized name sort key', () => {
  const product = toDynamoItem('product', {
    id: 'product-1',
    barId: 'bar-1',
    name: '  Castle Lager  '
  });

  assert.equal(product.GSI5PK, 'BAR#bar-1#PRODUCT');
  assert.equal(product.GSI5SK, 'castle lager#product-1');
});

test('non-product entities do not receive GSI5 keys', () => {
  const category = toDynamoItem('category', {
    id: 'category-1',
    barId: 'bar-1',
    name: 'Beer'
  });

  assert.equal(category.GSI5PK, undefined);
  assert.equal(category.GSI5SK, undefined);
});

test('bar-scoped product model queries use the GSI query path', async () => {
  const originalQueryEntities = dynamodb.queryEntities;
  const originalListEntities = dynamodb.listEntities;
  let queriedBarId;

  dynamodb.queryEntities = async (entityType, options) => {
    assert.equal(entityType, 'product');
    queriedBarId = options.barId;
    return { items: [{ id: 'product-1', barId: options.barId }], lastEvaluatedKey: null };
  };
  dynamodb.listEntities = async () => {
    throw new Error('Bar-scoped product reads should not use the shared entity partition.');
  };

  try {
    const products = await Product.find({ barId: 'bar-1' });
    assert.equal(queriedBarId, 'bar-1');
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'product-1');
  } finally {
    dynamodb.queryEntities = originalQueryEntities;
    dynamodb.listEntities = originalListEntities;
  }
});