const test = require('node:test');
const assert = require('node:assert/strict');
const { getExportLimit, applyExportLimit, createTopNCollector } = require('./exportLimit');

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

test('top-N collector retains the best rows without keeping the full input', () => {
  const collector = createTopNCollector(3, (left, right) => right.value - left.value);
  [2, 10, 4, 8, 1, 7].forEach((value) => collector.add({ value }));

  assert.deepEqual(collector.getSorted().map((item) => item.value), [10, 8, 7]);
});

test('applyExportLimit accepts a count from paginated retrieval', () => {
  const rows = Array.from({ length: 5001 }, (_, index) => ({ id: index }));
  const result = applyExportLimit(rows, 'sales', 12000);

  assert.equal(result.rows.length, 5000);
  assert.equal(result.totalCount, 12000);
  assert.equal(result.exceeded, true);
});
