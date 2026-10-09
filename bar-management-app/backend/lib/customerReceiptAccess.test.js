const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RECEIPT_ACCESS_TTL_SECONDS,
  createCustomerReceiptAccessToken,
  hashCustomerReceiptAccessToken
} = require('./customerReceiptAccess');

test('receipt access tokens are high entropy, hashed for storage, and expire after 24 hours', () => {
  const now = Date.UTC(2026, 9, 9);
  const access = createCustomerReceiptAccessToken(now);

  assert.match(access.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(access.token, access.tokenHash);
  assert.equal(access.tokenHash, hashCustomerReceiptAccessToken(access.token));
  assert.equal(access.receiptAccessExpiresAt, Math.floor(now / 1000) + RECEIPT_ACCESS_TTL_SECONDS);
});

test('receipt access token hashing rejects malformed input', () => {
  assert.equal(hashCustomerReceiptAccessToken('password'), null);
  assert.equal(hashCustomerReceiptAccessToken(undefined), null);
});