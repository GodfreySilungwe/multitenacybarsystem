const test = require('node:test');
const assert = require('node:assert/strict');
const { getSubscriptionGraceNotice } = require('./subscriptionStatus');

test('returns subscription dates while the bar is in its grace period', () => {
  const notice = getSubscriptionGraceNotice({
    paidThrough: '2026-10-20T00:00:00.000Z',
    graceEndsAt: '2026-10-30T00:00:00.000Z'
  }, '2026-10-24T00:00:00.000Z');

  assert.deepEqual(notice, {
    paidThrough: '2026-10-20T00:00:00.000Z',
    graceEndsAt: '2026-10-30T00:00:00.000Z'
  });
});

test('does not return a notice before expiry, after grace, or for invalid dates', () => {
  const subscription = {
    paidThrough: '2026-10-20T00:00:00.000Z',
    graceEndsAt: '2026-10-30T00:00:00.000Z'
  };

  assert.equal(getSubscriptionGraceNotice(subscription, '2026-10-20T00:00:00.000Z'), null);
  assert.equal(getSubscriptionGraceNotice(subscription, '2026-10-30T00:00:00.001Z'), null);
  assert.equal(getSubscriptionGraceNotice({ paidThrough: 'invalid', graceEndsAt: 'invalid' }, '2026-10-24T00:00:00.000Z'), null);
});
