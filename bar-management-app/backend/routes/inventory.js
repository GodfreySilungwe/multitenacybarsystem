const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Product = require('../models/Product');
const { queryEntities, decodeLastEvaluatedKey } = require('../lib/dynamodb');

router.use(protect, isBarOwnerOrSales);

const parsePageOptions = (query) => ({
  limit: Math.min(Math.max(Number(query.limit) || 50, 1), 100),
  ...(query.lastKey ? { lastEvaluatedKey: decodeLastEvaluatedKey(query.lastKey) } : {})
});

const hydrateAdjustment = (adjustment) => {
  const productId = adjustment.product?._id || adjustment.product?.id || adjustment.product || '';
  const productName = adjustment.productName || adjustment.product?.name || 'Unknown';
  return {
    ...adjustment,
    product: productId ? { _id: productId, name: productName } : null,
    productName
  };
};

// Get all adjustments
router.get('/', async (req, res) => {
  try {
    const result = await queryEntities('inventoryadjustment', {
      barId: req.user.barId,
      ...parsePageOptions(req.query),
      scanIndexForward: false
    });
    const items = (result.items || []).map(hydrateAdjustment);

    res.json({ items, nextKey: result.lastEvaluatedKey });
  } catch (error) {
    console.error('Error fetching adjustments:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create adjustment
router.post('/', async (req, res) => {
  try {
    const { product, type, quantity, reason } = req.body;

    // Get current product stock
    const productData = await Product.findOne({ _id: product, barId: req.user.barId });
    if (!productData) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let newStock = productData.currentStock;
    const reservedStock = Number(productData.reservedStock || 0);

    // Apply adjustment
    if (type === 'wastage' || type === 'damage' || type === 'return') {
      // These decrease stock
      if (productData.currentStock - reservedStock < quantity) {
        return res.status(400).json({ 
          message: `Insufficient unreserved stock. Available: ${Math.max(0, productData.currentStock - reservedStock)}`
        });
      }
      newStock = productData.currentStock - quantity;
    } else if (type === 'restock') {
      // This increases stock
      newStock = productData.currentStock + quantity;
    } else if (type === 'count_correction') {
      // This sets stock to the new value
      if (quantity < reservedStock) {
        return res.status(400).json({
          message: `Count correction cannot be below reserved stock (${reservedStock}).`
        });
      }
      newStock = quantity;
    }

    // Create adjustment record
    const adjustment = new InventoryAdjustment({
      barId: req.user.barId,
      product,
      productName: productData.name,
      type,
      quantity,
      reason,
      previousStock: productData.currentStock,
      newStock,
      createdAt: new Date().toISOString()
    });

    await adjustment.save();

    // Update product stock
    productData.currentStock = newStock;
    await productData.save();

    res.status(201).json(adjustment);
  } catch (error) {
    console.error('Error creating adjustment:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get adjustments by product
router.get('/product/:productId', async (req, res) => {
  try {
    const result = await queryEntities('inventoryadjustment', {
      barId: req.user.barId,
      filters: { product: req.params.productId },
      ...parsePageOptions(req.query),
      scanIndexForward: false
    });
    res.json({
      items: (result.items || []).map(hydrateAdjustment),
      nextKey: result.lastEvaluatedKey
    });
  } catch (error) {
    console.error('Error fetching product adjustments:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get summary stats
router.get('/summary', async (req, res) => {
  try {
    const totalsByType = new Map();
    let lastEvaluatedKey;

    do {
      const result = await queryEntities('inventoryadjustment', {
        barId: req.user.barId,
        limit: 100,
        ...(lastEvaluatedKey ? { lastEvaluatedKey } : {})
      });

      for (const adjustment of result.items || []) {
        const type = adjustment.type || 'default';
        if (!totalsByType.has(type)) totalsByType.set(type, { _id: type, totalQuantity: 0, count: 0 });
        const total = totalsByType.get(type);
        total.totalQuantity += Number(adjustment.quantity || 0);
        total.count += 1;
      }

      lastEvaluatedKey = result.lastEvaluatedKey
        ? decodeLastEvaluatedKey(result.lastEvaluatedKey)
        : null;
    } while (lastEvaluatedKey);

    res.json(Array.from(totalsByType.values()));
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;