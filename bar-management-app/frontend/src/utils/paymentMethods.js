export const DEFAULT_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'mpamba', label: 'Mpamba' },
  { value: 'bank_account', label: 'Bank Account' }
];

export const getPaymentMethods = (settings = {}) => {
  const configuredMethods = Array.isArray(settings.paymentMethods)
    ? settings.paymentMethods
      .filter((method) => method?.value && method?.label)
      .map((method) => ({ value: method.value, label: method.label }))
    : [];
  if (settings.paymentMethodsConfigured === true) {
    return configuredMethods;
  }

  const configuredValues = new Set(configuredMethods.map((method) => method.value));
  return [
    ...DEFAULT_PAYMENT_METHODS.filter((method) => !configuredValues.has(method.value)),
    ...configuredMethods
  ];
};

export const getPaymentMethodLabel = (value, settings = {}) => {
  const normalizedValue = String(value || 'cash')
    .toLowerCase()
    .replace(/^credit_/, '')
    .replace(/^custom_/, '')
    .replace(/[\s-]+/g, '_');
  const configuredMethod = getPaymentMethods(settings).find((method) => (
    method.value === value
    || method.value.replace(/^custom_/, '') === normalizedValue
    || method.label.toLowerCase().replace(/[\s-]+/g, '_') === normalizedValue
  ));
  return configuredMethod?.label
    || normalizedValue.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};
