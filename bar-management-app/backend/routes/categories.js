const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const Category = require('../models/Category');

router.use(protect, isBarOwnerOrSales);

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ barId: req.user.barId }).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single category
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create category
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = new Category({ name, description });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Category already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

// Update category
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.name = name || category.name;
    category.description = description || category.description;
    await category.save();

    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const Product = require('../models/Product');
    const categoryProducts = await Product.find({ barId: req.user.barId, category: category._id });
    const hasStock = (categoryProducts || []).some((product) => Number(product.currentStock || 0) > 0);
    if (categoryProducts.length > 0 || hasStock) {
      return res.status(400).json({
        message: 'Cannot delete category while it still has products assigned or stock remaining.'
      });
    }

    await category.delete();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;