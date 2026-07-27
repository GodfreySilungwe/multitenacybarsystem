const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const Product = require('../models/Product');

router.use(protect, isBarOwnerOrSales);

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({ barId: req.user.barId }).populate('category', 'name');
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get low stock products
router.get('/low-stock', async (req, res) => {
  try {
    const products = await Product.find({
      barId: req.user.barId,
      $expr: {
        $lte: ['$currentStock', '$lowStockThreshold']
      }
    }).populate('category', 'name');
    res.json(products);
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, barId: req.user.barId }).populate('category', 'name');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create product
router.post('/', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update product - FIXED
router.put('/:id', async (req, res) => {
  try {
    console.log('Updating product:', req.params.id);
    console.log('Update data:', req.body);
    
    const product = await Product.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update fields
    const { name, category, costPrice, sellingPrice, currentStock, lowStockThreshold, unit } = req.body;
    
    product.name = name || product.name;
    product.category = category || product.category;
    product.costPrice = costPrice !== undefined ? costPrice : product.costPrice;
    product.sellingPrice = sellingPrice !== undefined ? sellingPrice : product.sellingPrice;
    product.currentStock = currentStock !== undefined ? currentStock : product.currentStock;
    product.lowStockThreshold = lowStockThreshold !== undefined ? lowStockThreshold : product.lowStockThreshold;
    product.unit = unit || product.unit;

    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete product
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    await product.delete();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;