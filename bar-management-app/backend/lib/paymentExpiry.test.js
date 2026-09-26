const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAYMENT_REQUEST_TTL_MS,
  getPaymentCreatedAtQueryWindow,
  getPaymentStatusQueryWindow,
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

test('payment GSI query window includes the maximum confirmation delay', () => {
  const reportStart = '2026-09-26T10:00:00.000Z';
  const reportEnd = '2026-09-26T11:00:00.000Z';
  assert.deepEqual(getPaymentCreatedAtQueryWindow(reportStart, reportEnd), {
    startDate: new Date(Date.parse(reportStart) - PAYMENT_REQUEST_TTL_MS).toISOString(),
    endDate: reportEnd
  });
});

test('all-status history retains expired pending rows inside its selected date range', () => {
  const startDate = '2026-09-26T10:00:00.000Z';
  const endDate = '2026-09-26T11:00:00.000Z';

  assert.deepEqual(
    getPaymentStatusQueryWindow('', 'pending', startDate, endDate, Date.parse('2026-09-26T12:00:00.000Z')),
    { startDate, endDate, isEmpty: false }
  );
});

test('explicit pending-status queries intersect the selected range with the TTL window', () => {
  const now = Date.parse('2026-09-26T12:00:00.000Z');
  const result = getPaymentStatusQueryWindow(
    'pending',
    'pending',
    '2026-09-26T10:00:00.000Z',
    '2026-09-26T11:00:00.000Z',
    now
  );

  assert.equal(result.startDate, new Date(now - PAYMENT_REQUEST_TTL_MS).toISOString());
  assert.equal(result.endDate, '2026-09-26T11:00:00.000Z');
  assert.equal(result.isEmpty, true);
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
