const assert = require('node:assert/strict');
const { selectCreditOrdersForSettlement, getSalesAccountMismatchMessage } = require('./credit');

const orders = [
  {
    _id: 'old-other',
    processedBy: 'sales-2',
    processedByName: 'Alice',
    createdAt: '2024-01-01T00:00:00.000Z',
    paymentMethod: 'credit',
    paymentStatus: 'partial',
    balanceDue: 100
  },
  {
    _id: 'current-1',
    processedBy: 'sales-1',
    processedByName: 'Bob',
    createdAt: '2024-01-05T00:00:00.000Z',
    paymentMethod: 'credit',
    paymentStatus: 'partial',
    balanceDue: 80
  },
  {
    _id: 'current-2',
    processedBy: 'sales-1',
    processedByName: 'Bob',
    createdAt: '2024-01-03T00:00:00.000Z',
    paymentMethod: 'credit',
    paymentStatus: 'partial',
    balanceDue: 60
  },
  {
    _id: 'current-3',
    processedBy: 'sales-1',
    processedByName: 'Bob',
    createdAt: '2024-01-10T00:00:00.000Z',
    paymentMethod: 'credit',
    paymentStatus: 'partial',
    balanceDue: 40
  }
];

const salesMatch = selectCreditOrdersForSettlement(orders, { _id: 'sales-1', role: 'sales', fullName: 'Bob' });
assert.deepEqual(salesMatch.map((order) => order._id), ['current-2', 'current-1', 'current-3']);

const noMatch = selectCreditOrdersForSettlement(orders, { _id: 'sales-3', role: 'sales', fullName: 'Carol' });
assert.deepEqual(noMatch, []);

const mismatchedMessage = getSalesAccountMismatchMessage(orders, { _id: 'sales-3', role: 'sales', fullName: 'Carol' });
assert.equal(mismatchedMessage, 'This bill can only be settled by Alice.');

const managerMatch = selectCreditOrdersForSettlement(orders, { _id: 'manager-1', role: 'manager', fullName: 'Dana' });
assert.deepEqual(managerMatch.map((order) => order._id), ['old-other', 'current-2', 'current-1', 'current-3']);

console.log('credit settlement tests passed');
