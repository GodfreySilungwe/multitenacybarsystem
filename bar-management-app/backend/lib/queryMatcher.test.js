const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesFieldCondition } = require('./queryMatcher');

test('date ranges include end-of-period adjustments and exclude later adjustments', () => {
  const range = {
    $gte: '2026-09-01T00:00:00.000Z',
    $lte: '2026-09-30T23:59:59.999Z'
  };
  const adjustments = [
    { id: 'before', createdAt: '2026-08-31T23:59:59.999Z' },
    { id: 'start', createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'end', createdAt: '2026-09-30T23:59:59.999Z' },
    { id: 'after', createdAt: '2026-10-01T00:00:00.000Z' }
  ];

  const inPeriod = adjustments
    .filter((adjustment) => matchesFieldCondition(adjustment, 'createdAt', range))
    .map((adjustment) => adjustment.id);

  assert.deepEqual(inPeriod, ['start', 'end']);
});

test('field conditions combine range and inequality operators', () => {
  assert.equal(matchesFieldCondition({ amount: 10 }, 'amount', { $gte: 5, $lte: 10, $ne: 7 }), true);
  assert.equal(matchesFieldCondition({ amount: 11 }, 'amount', { $gte: 5, $lte: 10 }), false);
});