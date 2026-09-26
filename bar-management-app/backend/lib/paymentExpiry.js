const PAYMENT_REQUEST_TTL_MS = 30 * 60 * 1000;

const getPaymentRequestExpiry = (createdAt) => {
  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + PAYMENT_REQUEST_TTL_MS).toISOString();
};

const isPaymentRequestExpired = (paymentRequest, now = Date.now()) => {
  if (!paymentRequest || paymentRequest.status !== 'pending') {
    return false;
  }

  const explicitExpiry = Date.parse(paymentRequest.expiresAt || '');
  const createdAt = Date.parse(paymentRequest.createdAt || '');
  const expiresAt = Number.isNaN(explicitExpiry)
    ? (Number.isNaN(createdAt) ? NaN : createdAt + PAYMENT_REQUEST_TTL_MS)
    : explicitExpiry;

  return Number.isFinite(expiresAt) && expiresAt <= now;
};

module.exports = {
  PAYMENT_REQUEST_TTL_MS,
  getPaymentRequestExpiry,
  isPaymentRequestExpired
};
