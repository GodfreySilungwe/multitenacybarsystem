const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderSummary, calculateOutstandingCreditInPeriod } = require('./orderSummary');
const Product = require('../models/Product');
const { validateCustomerOrderItems } = require('../routes/customer-order-requests');

test('buildOrderSummary excludes reversed orders and calculates totals from the filtered dataset', () => {
  const orders = [
    {
      reversed: false,
      totalAmount: 100,
      profit: 30,
      createdAt: '2024-01-01T10:00:00.000Z',
      items: [{ productName: 'Beer', quantity: 2, subtotal: 100, costPrice: 20 }]
    },
    {
      reversed: true,
      totalAmount: 500,
      profit: 100,
      createdAt: '2024-01-02T10:00:00.000Z',
      items: [{ productName: 'Beer', quantity: 5, subtotal: 500, costPrice: 200 }]
    },
    {
      reversed: false,
      totalAmount: 200,
      profit: 60,
      createdAt: '2024-01-03T10:00:00.000Z',
      items: [
        { productName: 'Beer', quantity: 1, subtotal: 100, costPrice: 40 },
        { productName: 'Beer', quantity: 2, subtotal: 100, costPrice: 20 }
      ]
    }
  ];

  const summary = buildOrderSummary(orders);

  assert.equal(summary.totalSales, 300);
  assert.equal(summary.totalProfit, 90);
  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.totalQuantitySold, 5);
  assert.equal(summary.averageOrderValue, 150);
  assert.equal(summary.averageItemsPerOrder, 2.5);
  assert.equal(summary.grossMarginRatio, 30);
  assert.equal(summary.topProducts[0].profit, 180);
});

test('calculateOutstandingCreditInPeriod only counts credit sales with remaining balance due', () => {
  const orders = [
    {
      reversed: false,
      paymentMethod: 'credit',
      paymentStatus: 'paid',
      balanceDue: 0,
      totalAmount: 300,
      amount: 300
    },
    {
      reversed: false,
      paymentMethod: 'credit',
      paymentStatus: 'partial',
      balanceDue: 50,
      totalAmount: 250,
      amount: 250
    },
    {
      reversed: false,
      paymentMethod: 'credit',
      paymentStatus: 'credit',
      balanceDue: 200,
      totalAmount: 200,
      amount: 200
    },
    {
      reversed: false,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      totalAmount: 180,
      amount: 180
    }
  ];

  // Only orders with balanceDue > 0: 50 + 200 = 250
  assert.equal(calculateOutstandingCreditInPeriod(orders), 250);
});

test('validateCustomerOrderItems rejects customer orders when stock is insufficient', async () => {
  const originalFindOne = Product.findOne;
  Product.findOne = async ({ _id }) => ({
    _id,
    name: 'Beer',
    currentStock: 1
  });

  try {
    const result = await validateCustomerOrderItems([
      { productId: 'product-1', quantity: 2 }
    ], 'bar-1');

    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /Insufficient stock for Beer/i);
  } finally {
    Product.findOne = originalFindOne;
  }
});

test('buildOrderSummary ignores placeholder product names and keeps the real product label', () => {
  const summary = buildOrderSummary([
    {
      reversed: false,
      totalAmount: 200,
      profit: 60,
      createdAt: '2024-01-02T10:00:00.000Z',
      items: [
        {
          product: { _id: 'p1', name: 'Product' },
          productName: 'Beer',
          quantity: 2,
          subtotal: 200,
          costPrice: 70
        }
      ]
    }
  ]);

  assert.equal(summary.topProducts[0].name, 'Beer');
});
