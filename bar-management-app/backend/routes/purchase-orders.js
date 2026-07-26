const express = require('express');
const router = express.Router();
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');

// Get all purchase orders
router.get('/', async (req, res) => {
  try {
    const orders = await PurchaseOrder.find()
      .populate('supplier', 'name')
      .populate('items.product', 'name')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single purchase order
router.get('/:id', async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('supplier', 'name phone email')
      .populate('items.product', 'name');
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create purchase order
router.post('/', async (req, res) => {
  try {
    const { supplier, items, expectedDelivery, notes } = req.body;

    // Check supplier exists
    const supplierExists = await Supplier.findById(supplier);
    if (!supplierExists) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    let totalAmount = 0;
    const orderItems = [];

    // Process each item
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const subtotal = item.costPrice * item.quantity;
      totalAmount += subtotal;

      orderItems.push({
        product: item.product,
        quantity: item.quantity,
        costPrice: item.costPrice,
        subtotal
      });
    }

    const order = new PurchaseOrder({
      supplier,
      items: orderItems,
      totalAmount,
      expectedDelivery,
      notes,
      status: 'pending'
    });

    await order.save();
    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update purchase order status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await PurchaseOrder.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    order.status = status;
    
    // If status is 'received', update product stock
    if (status === 'received') {
      order.receivedDate = new Date();
      
      // Update product stock
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          product.currentStock += item.quantity;
          await product.save();
        }
      }
    }

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error updating purchase order status:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete purchase order
router.delete('/:id', async (req, res) => {
  try {
    const order = await PurchaseOrder.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;