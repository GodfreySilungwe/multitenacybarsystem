const MALAWI_OFFSET_MINUTES = 120;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

const formatLocalDateTime = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
};

export const getDailyReportPeriod = (referenceTime = new Date()) => {
  const malawiNow = new Date(referenceTime.getTime() + MALAWI_OFFSET_MINUTES * 60 * 1000);
  const todaySixAmLocal = Date.UTC(
    malawiNow.getUTCFullYear(),
    malawiNow.getUTCMonth(),
    malawiNow.getUTCDate(),
    6
  );
  const startLocal = malawiNow.getTime() < todaySixAmLocal
    ? todaySixAmLocal - DAY_MILLISECONDS
    : todaySixAmLocal;

  return {
    startDate: formatLocalDateTime(new Date(startLocal)),
    endDate: formatLocalDateTime(malawiNow)
  };
};