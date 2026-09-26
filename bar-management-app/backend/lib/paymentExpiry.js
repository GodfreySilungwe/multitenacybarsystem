const PAYMENT_REQUEST_TTL_MS = 30 * 60 * 1000;

const getPaymentRequestExpiry = (createdAt) => {
  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs + PAYMENT_REQUEST_TTL_MS).toISOString();
};

const getPaymentCreatedAtQueryWindow = (startDate, endDate) => {
  const window = {};
  if (startDate) {
    const startTime = Date.parse(startDate);
    if (Number.isNaN(startTime)) {
      throw new Error('A valid payment query start date is required.');
    }
    window.startDate = new Date(startTime - PAYMENT_REQUEST_TTL_MS).toISOString();
  }

  if (endDate) {
    const endTime = Date.parse(endDate);
    if (Number.isNaN(endTime)) {
      throw new Error('A valid payment query end date is required.');
    }
    window.endDate = new Date(endTime).toISOString();
  }

  return window;
};

const getPaymentStatusQueryWindow = (requestedStatus, paymentStatus, startDate, endDate, now = Date.now()) => {
  let queryStartDate = startDate;
  let queryEndDate = endDate;

  if (requestedStatus === 'pending' && paymentStatus === 'pending') {
    const pendingStartDate = new Date(now - PAYMENT_REQUEST_TTL_MS).toISOString();
    const currentDate = new Date(now).toISOString();
    if (!queryStartDate || pendingStartDate > queryStartDate) queryStartDate = pendingStartDate;
    if (!queryEndDate || currentDate < queryEndDate) queryEndDate = currentDate;
  }

  return {
    startDate: queryStartDate || undefined,
    endDate: queryEndDate || undefined,
    isEmpty: Boolean(queryStartDate && queryEndDate && queryStartDate > queryEndDate)
  };
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
  getPaymentCreatedAtQueryWindow,
  getPaymentStatusQueryWindow,
  isPaymentRequestExpired
};
