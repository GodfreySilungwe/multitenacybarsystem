const test = require('node:test');
const assert = require('node:assert/strict');
const { getExportLimit, applyExportLimit } = require('./exportLimit');

test('export limits default to safe maximum rows', () => {
  assert.equal(getExportLimit('sales'), 5000);
  assert.equal(getExportLimit('inventory'), 10000);
});

test('applyExportLimit truncates oversized exports and reports overflow', () => {
  const rows = Array.from({ length: 5001 }, (_, index) => ({ id: index }));
  const result = applyExportLimit(rows, 'sales');

  assert.equal(result.exceeded, true);
  assert.equal(result.rows.length, 5000);
  assert.equal(result.totalCount, 5001);
});

test('applyExportLimit allows normal exports without truncation', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: index }));
  const result = applyExportLimit(rows, 'sales');

  assert.equal(result.exceeded, false);
  assert.equal(result.rows.length, 10);
  assert.equal(result.totalCount, 10);
});
