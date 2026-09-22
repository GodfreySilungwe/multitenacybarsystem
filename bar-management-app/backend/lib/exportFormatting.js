const formatCurrencyValue = (value = 0) => {
  const numericValue = Number(value || 0);
  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const REPORT_TIME_ZONE = 'Africa/Blantyre';
const MALAWI_OFFSET_MINUTES = 120;

const getMalawiNow = () => new Date(Date.now() + MALAWI_OFFSET_MINUTES * 60000);

const fromMalawiCalendarDate = (localDate) => new Date(localDate.getTime() - MALAWI_OFFSET_MINUTES * 60000);

const buildPeriodLabel = (query = {}) => {
  const range = String(query.range || 'week').toLowerCase();
  const formatDateTime = (value, endOfDay = false) => {
    if (!value) return 'N/A';
    const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
    const localDateTimeMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(String(value));
    const date = dateOnlyMatch
      ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+02:00`)
      : localDateTimeMatch
        ? new Date(`${value}+02:00`)
      : new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: REPORT_TIME_ZONE
    });
  };

  if (range === 'custom') {
    const start = formatDateTime(query.startDate, false);
    const end = formatDateTime(query.endDate, true);
    return `Custom period: ${start} to ${end}`;
  }

  const now = new Date();
  const localNow = getMalawiNow();
  const start = new Date(localNow.getTime());

  if (range === 'today') {
    start.setUTCHours(0, 0, 0, 0);
    return `Period: ${formatDateTime(fromMalawiCalendarDate(start).toISOString())} to ${formatDateTime(now.toISOString())}`;
  }

  if (range === 'week') {
    start.setUTCDate(start.getUTCDate() - 7);
    return `Period: ${formatDateTime(fromMalawiCalendarDate(start).toISOString())} to ${formatDateTime(now.toISOString())}`;
  }

  if (range === 'month') {
    start.setUTCMonth(start.getUTCMonth() - 1);
    return `Period: ${formatDateTime(fromMalawiCalendarDate(start).toISOString())} to ${formatDateTime(now.toISOString())}`;
  }

  if (range === 'year') {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    return `Period: ${formatDateTime(fromMalawiCalendarDate(start).toISOString())} to ${formatDateTime(now.toISOString())}`;
  }

  return `Period: ${formatDateTime(now.toISOString())}`;
};

module.exports = {
  formatCurrencyValue,
  buildPeriodLabel
};
