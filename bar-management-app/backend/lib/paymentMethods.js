const DEFAULT_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'mpamba', label: 'Mpamba' },
  { value: 'bank_account', label: 'Bank Account' }
];

const getPaymentMethods = (businessSettings = {}) => {
  const configuredMethods = Array.isArray(businessSettings.paymentMethods)
    ? businessSettings.paymentMethods.filter((method) => method?.value && method?.label)
    : [];
  if (businessSettings.paymentMethodsConfigured === true) {
    return configuredMethods;
  }

  const configuredValues = new Set(configuredMethods.map((method) => method.value));
  return [
    ...DEFAULT_PAYMENT_METHODS.filter((method) => !configuredValues.has(method.value)),
    ...configuredMethods
  ];
};

const isValidPaymentMethod = (value, businessSettings = {}) => (
  getPaymentMethods(businessSettings).some((method) => method.value === value)
);

const formatPaymentMethodLabel = (value, businessSettings = {}) => {
  const rawValue = String(value || 'cash').toLowerCase();
  const methodValue = rawValue.replace(/^credit_/, '');
  const historicalLabel = businessSettings.paymentMethodLabels?.[rawValue]
    || businessSettings.paymentMethodLabels?.[methodValue];
  if (historicalLabel) return historicalLabel;

  const normalizedValue = methodValue
    .replace(/^custom_/, '')
    .replace(/[\s-]+/g, '_');
  const configuredMethod = getPaymentMethods(businessSettings).find((method) => (
    method.value === value
    || method.value.replace(/^custom_/, '') === normalizedValue
    || method.label.toLowerCase().replace(/[\s-]+/g, '_') === normalizedValue
  ));
  return configuredMethod?.label
    || normalizedValue.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

module.exports = {
  DEFAULT_PAYMENT_METHODS,
  getPaymentMethods,
  isValidPaymentMethod,
  formatPaymentMethodLabel
};
