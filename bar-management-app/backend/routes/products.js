const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const { queryEntities, decodeLastEvaluatedKey } = require('../lib/dynamodb');
const Product = require('../models/Product');
const Category = require('../models/Category');

router.use(protect);

// Get all products with optional pagination
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const lastKey = req.query.lastKey ? decodeLastEvaluatedKey(req.query.lastKey) : null;
    const query = { barId: req.user.barId };

    const search = req.query.search ? String(req.query.search).trim() : '';

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matchingCategories = await Category.find({
        barId: req.user.barId,
        name: searchRegex
      }).select('_id');
      const categoryIds = matchingCategories.map((category) => category._id);

      const searchConditions = [
        { name: searchRegex },
        { unit: searchRegex },
        { description: searchRegex }
      ];

      if (categoryIds.length > 0) {
        searchConditions.push({ category: { $in: categoryIds } });
      }

      const products = await Product.find({
        ...query,
        $or: searchConditions
      })
        .populate('category', 'name')
        .limit(limit || 3);

      const enrichedProducts = products.map((product) => ({
        ...product.toObject(),
        category: product.category || null
      }));

      return res.json(enrichedProducts);
    }

    if (limit || lastKey) {
      const options = {
        barId: req.user.barId,
        limit: limit || 20,
        lastEvaluatedKey: lastKey
      };
      const result = await queryEntities('product', options);
      const products = (result.items || []).map((product) => ({
        ...product,
        category: product.category ? (typeof product.category === 'object' ? product.category : { _id: product.category, name: 'Category' }) : null
      }));
      return res.json({ items: products, nextKey: result.lastEvaluatedKey });
    }

    const products = await Product.find(query).populate('category', 'name');
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get low stock products
router.get('/low-stock', isBarOwnerOrSales, async (req, res) => {
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
router.post('/', isBarOwnerOrSales, async (req, res) => {
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
router.put('/:id', isBarOwnerOrSales, async (req, res) => {
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
router.delete('/:id', isBarOwnerOrSales, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (Number(product.currentStock || 0) > 0) {
      return res.status(400).json({
        message: 'Cannot delete product with available stock. Reduce stock to zero before deleting.'
      });
    }

    await product.delete();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;