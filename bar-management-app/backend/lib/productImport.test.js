'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { cloneProductsAcrossBars, normalizeProductName } = require('./productImport');

test('normalizeProductName collapses case and extra whitespace', () => {
  assert.equal(normalizeProductName('  Beer   Light  '), 'beer light');
});

test('cloneProductsAcrossBars rejects importing to the same bar', async () => {
  const sourceProducts = [
    { _id: 'prod-1', name: 'Beer Light', category: 'cat-1', costPrice: 40, sellingPrice: 80, currentStock: 12, lowStockThreshold: 5, unit: 'bottle', description: 'Low alcohol' }
  ];

  const result = await cloneProductsAcrossBars({
    sourceBarId: 'bar-a',
    targetBarId: 'bar-a',
    sourceProducts,
    targetProducts: [],
    productIds: ['prod-1'],
    preservePrices: true,
    resetStock: true
  });

  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.errors[0].message.includes('same bar'), true);
});

test('cloneProductsAcrossBars skips duplicates that already exist in the target bar', async () => {
  const sourceProducts = [
    { _id: 'prod-1', name: 'Beer Light', category: 'cat-1', costPrice: 40, sellingPrice: 80, currentStock: 12, lowStockThreshold: 5, unit: 'bottle', description: 'Low alcohol' },
    { _id: 'prod-2', name: 'Beer Light', category: 'cat-1', costPrice: 42, sellingPrice: 82, currentStock: 8, lowStockThreshold: 4, unit: 'bottle', description: 'Duplicate name' }
  ];
  const targetProducts = [
    { _id: 'target-1', name: 'Beer Light', category: 'existing-cat', barId: 'bar-b' }
  ];

  const result = await cloneProductsAcrossBars({
    sourceBarId: 'bar-a',
    targetBarId: 'bar-b',
    sourceProducts,
    targetProducts,
    productIds: ['prod-1', 'prod-2'],
    preservePrices: true,
    resetStock: true
  });

  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.errors.length, 0);
});
