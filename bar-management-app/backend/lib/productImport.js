const Product = require('../models/Product');
const Category = require('../models/Category');

const normalizeProductName = (value = '') => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const getProductCategoryName = (product = {}) => {
  if (!product || typeof product !== 'object') {
    return '';
  }

  if (typeof product.category === 'object' && product.category) {
    return product.category.name || product.category.label || '';
  }

  if (typeof product.category === 'string') {
    return product.category;
  }

  return '';
};

const cloneProductsAcrossBars = async ({
  sourceBarId,
  targetBarId,
  sourceProducts = [],
  targetProducts = [],
  productIds = [],
  preservePrices = true,
  resetStock = true,
  targetCategories = []
}) => {
  if (!sourceBarId || !targetBarId) {
    throw new Error('A source bar and target bar are required for product import.');
  }

  if (String(sourceBarId) === String(targetBarId)) {
    return {
      created: [],
      skipped: [],
      errors: [{ message: 'Cannot import products into the same bar.' }],
      importedCount: 0
    };
  }

  const selectedProductIds = new Set((productIds || []).map((productId) => String(productId)).filter(Boolean));
  const selectedProducts = sourceProducts.filter((product) => {
    const productId = String(product?._id || product?.id || '').trim();
    return !selectedProductIds.size || selectedProductIds.has(productId);
  });

  const targetNameSet = new Set((targetProducts || []).map((product) => normalizeProductName(product?.name)));
  const targetCategoryLookup = new Map((targetCategories || []).map((category) => [normalizeProductName(category?.name), category]));
  const created = [];
  const skipped = [];
  const errors = [];

  for (const sourceProduct of selectedProducts) {
    const name = String(sourceProduct?.name || '').trim();
    if (!name) {
      errors.push({ product: sourceProduct, message: 'Product name is required.' });
      continue;
    }

    const normalizedName = normalizeProductName(name);
    if (targetNameSet.has(normalizedName)) {
      skipped.push({
        _id: sourceProduct?._id || sourceProduct?.id,
        name,
        reason: 'Already exists in target bar.'
      });
      continue;
    }

    let categoryId = sourceProduct?.category;
    if (typeof sourceProduct?.category === 'object' && sourceProduct.category) {
      categoryId = sourceProduct.category._id || sourceProduct.category.id || sourceProduct.category;
    }

    let mappedCategory = null;
    const sourceCategoryName = getProductCategoryName(sourceProduct).trim();
    if (sourceCategoryName) {
      const mappedCategoryKey = normalizeProductName(sourceCategoryName);
      const existingCategory = targetCategoryLookup.get(mappedCategoryKey);
      if (existingCategory) {
        mappedCategory = existingCategory;
      } else {
        try {
          const category = new Category({ name: sourceCategoryName, barId: targetBarId });
          await category.save();
          targetCategories.push(category);
          targetCategoryLookup.set(mappedCategoryKey, category);
          mappedCategory = category;
        } catch (error) {
          errors.push({ product: name, message: `Unable to create target category for ${sourceCategoryName}: ${error.message}` });
        }
      }
    }

    const productData = {
      name,
      category: mappedCategory ? (mappedCategory._id || mappedCategory.id) : categoryId || null,
      description: sourceProduct?.description || '',
      costPrice: Number(sourceProduct?.costPrice || 0),
      sellingPrice: Number(sourceProduct?.sellingPrice || 0),
      currentStock: resetStock ? 0 : Number(sourceProduct?.currentStock || 0),
      lowStockThreshold: Number(sourceProduct?.lowStockThreshold || 0),
      unit: sourceProduct?.unit || '',
      barId: targetBarId,
      reservedStock: 0,
      supplier: null,
      supplierName: 'General Supplier',
      isActive: sourceProduct?.isActive !== false
    };

    try {
      const importedProduct = new Product(productData);
      await importedProduct.save();
      created.push(importedProduct.toObject ? importedProduct.toObject() : importedProduct);
      targetNameSet.add(normalizedName);
    } catch (error) {
      errors.push({ product: name, message: error.message || 'Failed to import product.' });
    }
  }

  return {
    created,
    skipped,
    errors,
    importedCount: created.length
  };
};

module.exports = {
  normalizeProductName,
  cloneProductsAcrossBars
};
