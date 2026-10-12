const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchesApplicationDetails,
  applicationBelongsToBar
} = require('./barApplicationLifecycle');

test('application duplicate matching allows a reused email but blocks duplicate usernames and bar details', () => {
  const details = {
    barName: 'New Harbor Bar',
    ownerEmail: 'owner@example.com',
    ownerPhone: '0999000000',
    ownerUsername: 'owner-two'
  };
  assert.equal(matchesApplicationDetails({ status: 'approved', ownerEmail: 'owner@example.com', ownerUsername: 'owner-one', barName: 'Existing Bar' }, details), false);
  assert.equal(matchesApplicationDetails({ status: 'approved', ownerUsername: 'owner-two' }, details), true);
  assert.equal(matchesApplicationDetails({ status: 'pending', barName: 'New Harbor Bar' }, details), true);
  assert.equal(matchesApplicationDetails({ status: 'bar_deleted', ownerUsername: 'owner-two' }, details), false);
});

test('application duplicate matching allows the same owner contact details for a different bar', () => {
  const details = {
    barName: 'Second Harbor Bar',
    ownerEmail: 'owner@example.com',
    ownerPhone: '0999000000',
    ownerUsername: 'owner-two'
  };
  assert.equal(matchesApplicationDetails({
    status: 'approved',
    barName: 'First Harbor Bar',
    ownerFullName: 'Alex Owner',
    ownerEmail: 'owner@example.com',
    ownerPhone: '0999000000',
    ownerUsername: 'owner-one'
  }, details), false);
});

test('application ownership is matched by bar ID when available', () => {
  assert.equal(applicationBelongsToBar(
    { status: 'approved', barId: 'bar-1', barName: 'Different Name' },
    { _id: 'bar-1', name: 'Harbor Bar' }
  ), true);
  assert.equal(applicationBelongsToBar(
    { status: 'approved', barId: 'bar-2', barName: 'Harbor Bar' },
    { _id: 'bar-1', name: 'Harbor Bar' }
  ), false);
});

test('legacy approved applications are linked by matching bar name and code', () => {
  assert.equal(applicationBelongsToBar(
    { status: 'approved', barName: 'Harbor Bar', barCode: 'HB-1' },
    { _id: 'bar-1', name: 'harbor bar', code: 'hb-1' }
  ), true);
  assert.equal(applicationBelongsToBar(
    { status: 'approved', barName: 'Harbor Bar', barCode: 'HB-2' },
    { _id: 'bar-1', name: 'Harbor Bar', code: 'HB-1' }
  ), false);
  assert.equal(applicationBelongsToBar(
    { status: 'pending', barName: 'Harbor Bar', barCode: 'HB-1' },
    { _id: 'bar-1', name: 'Harbor Bar', code: 'HB-1' }
  ), false);
});