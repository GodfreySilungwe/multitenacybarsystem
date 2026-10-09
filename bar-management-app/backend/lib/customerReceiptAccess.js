const crypto = require('crypto');

const RECEIPT_ACCESS_TTL_SECONDS = 24 * 60 * 60;
const RECEIPT_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const createCustomerReceiptAccessToken = (now = Date.now()) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return {
    token,
    tokenHash,
    receiptAccessExpiresAt: Math.floor(now / 1000) + RECEIPT_ACCESS_TTL_SECONDS
  };
};

const hashCustomerReceiptAccessToken = (token) => {
  if (typeof token !== 'string' || !RECEIPT_ACCESS_TOKEN_PATTERN.test(token)) {
    return null;
  }

  return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = {
  RECEIPT_ACCESS_TTL_SECONDS,
  createCustomerReceiptAccessToken,
  hashCustomerReceiptAccessToken
};