const ORDER_RETENTION_MONTHS = 6;

const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const addCalendarMonths = (dateValue, months = ORDER_RETENTION_MONTHS) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return date;
};

const getOrderExpiryEpochSeconds = (createdAt = new Date(), balanceDue = 0) => {
  if (toFiniteNumber(balanceDue) > 0) {
    return undefined;
  }

  const expiryDate = addCalendarMonths(createdAt);
  return expiryDate ? Math.floor(expiryDate.getTime() / 1000) : undefined;
};

module.exports = {
  ORDER_RETENTION_MONTHS,
  addCalendarMonths,
  getOrderExpiryEpochSeconds
};
