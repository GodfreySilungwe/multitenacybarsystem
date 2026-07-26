const express = require('express');
const router = express.Router();
const InventoryAdjustment = require('../models/InventoryAdjustment');
const Product = require('../models/Product');

// Get all adjustments
router.get('/', async (req, res) => {
  try {
    const adjustments = await InventoryAdjustment.find()
      .populate('product', 'name')
      .sort({ createdAt: -1 });
    res.json(adjustments);
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
    const productData = await Product.findById(product);
    if (!productData) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let newStock = productData.currentStock;

    // Apply adjustment
    if (type === 'wastage' || type === 'damage' || type === 'return') {
      // These decrease stock
      if (productData.currentStock < quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock. Available: ${productData.currentStock}` 
        });
      }
      newStock = productData.currentStock - quantity;
    } else if (type === 'restock') {
      // This increases stock
      newStock = productData.currentStock + quantity;
    } else if (type === 'count_correction') {
      // This sets stock to the new value
      newStock = quantity;
    }

    // Create adjustment record
    const adjustment = new InventoryAdjustment({
      product,
      type,
      quantity,
      reason,
      previousStock: productData.currentStock,
      newStock
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
    const adjustments = await InventoryAdjustment.find({
      product: req.params.productId
    }).sort({ createdAt: -1 });
    res.json(adjustments);
  } catch (error) {
    console.error('Error fetching product adjustments:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get summary stats
router.get('/summary', async (req, res) => {
  try {
    const stats = await InventoryAdjustment.aggregate([
      {
        $group: {
          _id: '$type',
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;