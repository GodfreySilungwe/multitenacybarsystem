const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');

router.use(protect, isBarOwnerOrSales);

// Get all purchase orders
router.get('/', async (req, res) => {
  try {
    const orders = await PurchaseOrder.find({ barId: req.user.barId }).sort({ createdAt: -1 });
    const productIds = Array.from(
      new Set(
        orders.flatMap((order) =>
          (order.items || []).map((item) => String(item.product?._id || item.product || item.productId || item._id || item.id || ''))
        ).filter(Boolean)
      )
    );
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds }, barId: req.user.barId })
      : [];
    const productMap = new Map((products || []).map((product) => [String(product._id || product.id), product]));

    const hydratedOrders = orders.map((order) => ({
      ...order,
      items: (order.items || []).map((item) => {
        const productId = String(item.product?._id || item.product || item.productId || item._id || item.id || '');
        const product = productMap.get(productId);
        return {
          ...item,
          product: product ? { _id: product._id || product.id, name: product.name, category: product.category } : (item.product || null),
          productName: item.productName || (product ? product.name : item.productName)
        };
      })
    }));

    res.json(hydratedOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get single purchase order
router.get('/:id', async (req, res) => {
  try {
    const order = await PurchaseOrder.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const productIds = Array.from(
      new Set(
        (order.items || []).map((item) => String(item.product?._id || item.product || item.productId || item._id || item.id || '')).filter(Boolean)
      )
    );
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds }, barId: req.user.barId })
      : [];
    const productMap = new Map((products || []).map((product) => [String(product._id || product.id), product]));

    const hydratedOrder = {
      ...order,
      items: (order.items || []).map((item) => {
        const productId = String(item.product?._id || item.product || item.productId || item._id || item.id || '');
        const product = productMap.get(productId);
        return {
          ...item,
          product: product ? { _id: product._id || product.id, name: product.name, category: product.category } : (item.product || null),
          productName: item.productName || (product ? product.name : item.productName)
        };
      })
    };

    res.json(hydratedOrder);
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
    const supplierExists = await Supplier.findOne({ _id: supplier, barId: req.user.barId });
    if (!supplierExists) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    let totalAmount = 0;
    const orderItems = [];

    // Process each item
    for (const item of items) {
      const product = await Product.findOne({ _id: item.product, barId: req.user.barId });
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
      barId: req.user.barId,
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
    const order = await PurchaseOrder.findOne({ _id: req.params.id, barId: req.user.barId });
    
    if (!order) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    order.status = status;
    
    // If status is 'received', update product stock
    if (status === 'received') {
      order.receivedDate = new Date();
      
      // Update product stock
      for (const item of order.items) {
        const product = await Product.findOne({ _id: item.product, barId: req.user.barId });
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
    const order = await PurchaseOrder.findOne({ _id: req.params.id, barId: req.user.barId });
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