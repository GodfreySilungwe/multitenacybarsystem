const DEFAULT_CONVERSIONS = {
  bottle: 1,
  'six-pack': 6,
  case: 24,
  crate: 20,
  carton: 20
};

const VALID_PURCHASE_UNITS = Object.keys(DEFAULT_CONVERSIONS);
const VALID_SELLING_UNITS = ['piece', 'shot', 'glass', 'bottle', 'can', 'mug', 'pitcher', 'packet'];

function normalizeNumber(value, fieldName, rowNumber, { integer = false, min = 0 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || (integer && !Number.isInteger(number))) {
    throw new Error(`Row ${rowNumber}: ${fieldName} must be a valid number${integer ? ' without decimals' : ''} greater than or equal to ${min}.`);
  }
  return number;
}

function calculateProductPricing(row, rowNumber = 1) {
  const purchaseUnit = String(row.purchaseUnit || 'bottle').trim().toLowerCase();
  if (!VALID_PURCHASE_UNITS.includes(purchaseUnit)) {
    throw new Error(`Row ${rowNumber}: purchase unit must be one of ${VALID_PURCHASE_UNITS.join(', ')}.`);
  }

  const sellingUnit = String(row.sellingUnit || row.unit || 'bottle').trim().toLowerCase();
  if (!VALID_SELLING_UNITS.includes(sellingUnit)) {
    throw new Error(`Row ${rowNumber}: selling unit is not supported.`);
  }

  const purchaseCost = normalizeNumber(row.purchaseCost ?? row.costPrice, 'purchase cost', rowNumber, { min: 0 });
  const conversionQuantity = normalizeNumber(
    row.conversionQuantity ?? DEFAULT_CONVERSIONS[purchaseUnit],
    'conversion quantity',
    rowNumber,
    { integer: true, min: 1 }
  );
  const sellingPrice = normalizeNumber(row.sellingPrice, 'selling price', rowNumber, { min: 0 });
  const currentStock = normalizeNumber(row.currentStock, 'current stock', rowNumber, { integer: true, min: 0 });
  const lowStockThreshold = normalizeNumber(row.lowStockThreshold ?? 5, 'low stock threshold', rowNumber, { integer: true, min: 0 });

  return {
    purchaseCost,
    purchaseUnit,
    conversionQuantity,
    costPrice: Number((purchaseCost / conversionQuantity).toFixed(2)),
    sellingPrice,
    currentStock,
    lowStockThreshold,
    unit: sellingUnit
  };
}

module.exports = {
  DEFAULT_CONVERSIONS,
  VALID_PURCHASE_UNITS,
  VALID_SELLING_UNITS,
  calculateProductPricing
};
