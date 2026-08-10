const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCreditSettlements } = require('./creditSettlement');

test('summarizeCreditSettlements totals only active settlements', () => {
  const summary = summarizeCreditSettlements([
    { amount: 120, paymentMethod: 'cash', status: 'recorded' },
    { amount: 80, paymentMethod: 'bank_account', status: 'recorded' },
    { amount: 40, paymentMethod: 'cash', status: 'cancelled' },
    { amount: 0, paymentMethod: 'cash', status: 'recorded' },
    { amount: 10, paymentMethod: 'cash', status: 'applied' }
  ]);

  assert.equal(summary.totalAmount, 210);
  assert.equal(summary.byMethod.cash, 130);
  assert.equal(summary.byMethod.bank_account, 80);
});
