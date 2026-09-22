const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCurrencyValue, buildPeriodLabel } = require('./exportFormatting');

test('formatCurrencyValue uses comma separators and two decimals', () => {
  assert.equal(formatCurrencyValue(1234567.5), '1,234,567.50');
});

test('custom date-only period labels include the full local end day', () => {
  const label = buildPeriodLabel({
    range: 'custom',
    startDate: '2026-09-22',
    endDate: '2026-09-22'
  });

  assert.match(label, /22\/09\/2026, 00:00/);
  assert.match(label, /22\/09\/2026, 23:59/);
});

test('custom local datetimes are interpreted in Malawi time', () => {
  const label = buildPeriodLabel({
    range: 'custom',
    startDate: '2026-09-22T08:30',
    endDate: '2026-09-22T17:45'
  });

  assert.match(label, /22\/09\/2026, 08:30/);
  assert.match(label, /22\/09\/2026, 17:45/);
});

test('today period labels start at Malawi midnight', () => {
  const label = buildPeriodLabel({ range: 'today' });

  assert.match(label, /Period: \d{2}\/\d{2}\/\d{4}, 00:00 to /);
});
