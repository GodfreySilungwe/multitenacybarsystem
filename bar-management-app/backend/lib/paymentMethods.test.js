const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PAYMENT_METHODS,
  getPaymentMethods,
  isValidPaymentMethod,
  formatPaymentMethodLabel
} = require('./paymentMethods');

test('Malawi payment methods remain defaults and custom methods are bar-specific', () => {
  const settings = { paymentMethods: [{ value: 'custom_mobile_wallet', label: 'Mobile Wallet' }] };
  const methods = getPaymentMethods(settings);

  assert.deepEqual(methods.slice(0, 4), DEFAULT_PAYMENT_METHODS);
  assert.equal(isValidPaymentMethod('custom_mobile_wallet', settings), true);
  assert.equal(isValidPaymentMethod('custom_mobile_wallet', {}), false);
  assert.equal(formatPaymentMethodLabel('custom_mobile_wallet', settings), 'Mobile Wallet');
});

test('configured method lists can remove defaults while older settings retain them', () => {
  const removedDefaults = {
    paymentMethods: [
      { value: 'cash', label: 'Cash' },
      { value: 'custom_mobile_wallet', label: 'Mobile Wallet' }
    ],
    paymentMethodsConfigured: true
  };
  const legacySettings = {
    paymentMethods: [{ value: 'custom_mobile_wallet', label: 'Mobile Wallet' }]
  };

  assert.deepEqual(getPaymentMethods(removedDefaults), removedDefaults.paymentMethods);
  assert.equal(isValidPaymentMethod('airtel_money', removedDefaults), false);
  assert.equal(isValidPaymentMethod('airtel_money', legacySettings), true);
  assert.equal(getPaymentMethods(legacySettings).length, DEFAULT_PAYMENT_METHODS.length + 1);
});

test('historical custom method labels remain available after removal', () => {
  const settings = {
    paymentMethods: [],
    paymentMethodsConfigured: true,
    paymentMethodLabels: { custom_mobile_wallet: 'Mobile Wallet' }
  };

  assert.equal(formatPaymentMethodLabel('custom_mobile_wallet', settings), 'Mobile Wallet');
  assert.equal(formatPaymentMethodLabel('credit_custom_mobile_wallet', settings), 'Mobile Wallet');
});
