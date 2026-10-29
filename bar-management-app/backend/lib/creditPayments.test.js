const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getInitialCreditPayment,
  normalizeCreditPaymentMethod,
  summarizeInitialCreditPayments,
  summarizeCreditPaymentEvents,
  classifyRepaymentAllocations
} = require('./creditPayments');

test('customer repayment methods are normalized to credit settlement methods', () => {
  assert.equal(normalizeCreditPaymentMethod({ paymentMethod: 'cash' }), 'credit_cash');
  assert.equal(normalizeCreditPaymentMethod({ paymentMethod: 'airtel_money' }), 'credit_airtel_money');
  assert.equal(normalizeCreditPaymentMethod({ paymentMethod: 'mpamba' }), 'credit_mpamba');
  assert.equal(normalizeCreditPaymentMethod({ paymentMethod: 'bank_account' }), 'credit_bank_account');
  assert.equal(normalizeCreditPaymentMethod({ creditPaymentMethod: 'credit_cash' }), 'credit_cash');
  assert.equal(normalizeCreditPaymentMethod({ paymentMethod: 'custom_mobile_wallet' }), 'credit_custom_mobile_wallet');
});

test('custom payment methods are retained in credit settlement summaries', () => {
  const summary = summarizeCreditPaymentEvents({
    paymentMethod: 'credit',
    initialAmountPaid: 400,
    initialPaymentMethod: 'custom_mobile_wallet'
  }, [{
    amountApplied: 200,
    paymentMethod: 'custom_mobile_wallet',
    status: 'confirmed'
  }]);

  assert.equal(summary.credit_custom_mobile_wallet, 600);
});

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

test('initial payments on in-period credit orders are included by tender method', () => {
  assert.deepEqual(summarizeInitialCreditPayments([
    {
      paymentMethod: 'credit',
      initialAmountPaid: 3000,
      initialPaymentMethod: 'cash'
    },
    {
      paymentMethod: 'credit',
      initialAmountPaid: 1500,
      initialPaymentMethod: 'airtel_money'
    },
    {
      paymentMethod: 'credit',
      initialAmountPaid: 500,
      initialPaymentMethod: 'mpamba',
      reversed: true
    },
    {
      paymentMethod: 'cash',
      initialAmountPaid: 400,
      initialPaymentMethod: 'cash'
    },
    {
      paymentMethod: 'credit',
      amountPaid: 250
    }
  ]), {
    credit_cash: 3000,
    credit_airtel_money: 1500,
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
