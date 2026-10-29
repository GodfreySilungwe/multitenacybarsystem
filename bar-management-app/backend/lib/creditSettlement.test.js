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

test('summarizeCreditSettlements preserves configured custom methods', () => {
  const summary = summarizeCreditSettlements([
    { amount: 75, paymentMethod: 'custom_mobile_wallet', status: 'recorded' }
  ]);
  assert.equal(summary.byMethod.custom_mobile_wallet, 75);
});
