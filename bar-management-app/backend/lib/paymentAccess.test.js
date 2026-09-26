const test = require('node:test');
const assert = require('node:assert/strict');
const { getPaymentCustomerId } = require('./paymentAccess');

test('customer payment reads cannot override the authenticated customer id', () => {
  assert.equal(
    getPaymentCustomerId({ role: 'customer', customerId: 'customer-1' }, 'customer-2'),
    'customer-1'
  );
});

test('staff payment reads may retain the requested customer filter', () => {
  assert.equal(getPaymentCustomerId({ role: 'sales' }, 'customer-2'), 'customer-2');
  assert.equal(getPaymentCustomerId({ role: 'sales' }), null);
});