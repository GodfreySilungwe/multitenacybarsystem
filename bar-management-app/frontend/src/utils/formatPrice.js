import { getActiveCurrency } from './businessSettings.js';

const formatMoneyNumber = (amount) => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return '0.00';
  }
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Format price in Malawi Kwacha without symbol
export const formatPrice = (amount) => {
  return formatMoneyNumber(amount);
};

const currencySymbolsWithoutSpace = new Set(['$', '€', '£', '¥', '₹', '₦', '₵', '₽']);

export const formatPriceMK = (amount) => {
  const currency = getActiveCurrency();
  const separator = currencySymbolsWithoutSpace.has(currency) ? '' : ' ';
  return `${currency}${separator}${formatMoneyNumber(amount)}`;
};

// Format large numbers with comma separators
export const formatCurrency = (amount) => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return '0.00';
  }
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};