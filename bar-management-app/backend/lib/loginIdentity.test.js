const test = require('node:test');
const assert = require('node:assert/strict');
const { selectLoginUser } = require('./loginIdentity');

test('shared email is ambiguous but unique username selects its matching account', () => {
  const users = [
    { username: 'harbor-owner', email: 'owner@example.com', barId: 'bar-1' },
    { username: 'lakeside-owner', email: 'owner@example.com', barId: 'bar-2' }
  ];

  assert.deepEqual(selectLoginUser(users, 'OWNER@example.com'), { user: null, ambiguous: true });
  assert.deepEqual(selectLoginUser(users, 'lakeside-owner'), { user: users[1], ambiguous: false });
});

test('email login still works when only one account uses that email', () => {
  const user = { username: 'harbor-owner', email: 'owner@example.com' };
  assert.deepEqual(selectLoginUser([user], ' owner@example.com '), { user, ambiguous: false });
});