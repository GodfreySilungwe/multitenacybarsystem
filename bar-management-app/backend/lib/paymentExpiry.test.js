const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAYMENT_REQUEST_TTL_MS,
  getPaymentRequestExpiry,
  isPaymentRequestExpired
} = require('./paymentExpiry');

test('payment request expiry is 30 minutes after creation', () => {
  const createdAt = '2026-09-26T10:00:00.000Z';
  assert.equal(
    getPaymentRequestExpiry(createdAt),
    new Date(Date.parse(createdAt) + PAYMENT_REQUEST_TTL_MS).toISOString()
  );
});

test('pending payment remains valid until its expiry boundary', () => {
  const createdAt = '2026-09-26T10:00:00.000Z';
  const expiresAt = Date.parse(createdAt) + PAYMENT_REQUEST_TTL_MS;
  const request = { status: 'pending', createdAt };

  assert.equal(isPaymentRequestExpired(request, expiresAt - 1), false);
  assert.equal(isPaymentRequestExpired(request, expiresAt), true);
});

test('explicit expiry is honored and completed payments never expire', () => {
  const request = {
    status: 'confirmed',
    createdAt: '2026-09-26T09:00:00.000Z',
    expiresAt: '2026-09-26T09:30:00.000Z'
  };

  assert.equal(isPaymentRequestExpired(request, Date.parse('2026-09-26T10:00:00.000Z')), false);
  assert.equal(isPaymentRequestExpired({ ...request, status: 'pending' }, Date.parse(request.expiresAt)), true);
});

test('invalid creation timestamps do not expire a pending request implicitly', () => {
  assert.equal(isPaymentRequestExpired({ status: 'pending', createdAt: 'invalid' }), false);
  assert.equal(getPaymentRequestExpiry('invalid'), null);
});
