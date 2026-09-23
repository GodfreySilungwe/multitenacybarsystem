const test = require('node:test');
const assert = require('node:assert/strict');
const { addCalendarMonths, getOrderExpiryEpochSeconds } = require('./orderExpiry');

test('adds six calendar months without using milliseconds as the TTL value', () => {
  const createdAt = '2026-01-31T12:00:00.000Z';
  const expiry = addCalendarMonths(createdAt);

  assert.equal(expiry.toISOString(), '2026-07-31T12:00:00.000Z');
  assert.equal(getOrderExpiryEpochSeconds(createdAt, 0), Math.floor(expiry.getTime() / 1000));
});

test('clamps calendar overflow to the last day of the target month', () => {
  const expiry = addCalendarMonths('2026-08-31T12:00:00.000Z');

  assert.equal(expiry.toISOString(), '2027-02-28T12:00:00.000Z');
});

test('does not assign TTL while an order has an outstanding balance', () => {
  assert.equal(getOrderExpiryEpochSeconds('2026-01-01T00:00:00.000Z', 10), undefined);
});

test('assigns TTL for a fully paid non-credit order', () => {
  assert.equal(
    getOrderExpiryEpochSeconds('2026-01-01T00:00:00.000Z', 0),
    Math.floor(new Date('2026-07-01T00:00:00.000Z').getTime() / 1000)
  );
});
