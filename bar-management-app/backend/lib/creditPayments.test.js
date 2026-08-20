const test = require('node:test');
const assert = require('node:assert/strict');
const { getInitialCreditPayment, summarizeCreditPaymentEvents, classifyRepaymentAllocations } = require('./creditPayments');

test('credit order with initial cash and later Airtel repayment is counted once per method', () => {
  const order = {
    paymentMethod: 'credit',
    initialAmountPaid: 200,
    initialPaymentMethod: 'cash',
    amountPaid: 1000,
    balanceDue: 0
  };
  const settlements = [{
    amountApplied: 800,
    paymentMethod: 'airtel_money',
    creditPaymentMethod: 'credit_airtel_money',
    status: 'confirmed'
  }];

  assert.deepEqual(getInitialCreditPayment(order), {
    amount: 200,
    paymentMethod: 'credit_cash'
  });
  assert.deepEqual(summarizeCreditPaymentEvents(order, settlements), {
    credit_cash: 200,
    credit_airtel_money: 800,
    credit_mpamba: 0,
    credit_bank_account: 0
  });
});

test('legacy credit order does not fabricate a cash payment from cumulative amountPaid', () => {
  assert.deepEqual(getInitialCreditPayment({ paymentMethod: 'credit', amountPaid: 150 }), {
    amount: 0,
    paymentMethod: 'credit_cash'
  });
});

test('repayment allocation stays current when an older bill is also outstanding', () => {
  const summary = classifyRepaymentAllocations({
    allocations: [{
      amount: 800,
      orderCreatedAt: '2026-08-20T10:00:00.000Z'
    }]
  }, new Date('2026-08-20T00:00:00.000Z').getTime());

  assert.equal(summary.hasAllocations, true);
  assert.equal(summary.previousAmount, 0);
  assert.equal(summary.currentAmount, 800);
});
