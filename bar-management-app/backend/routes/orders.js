const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const { recomputeCustomerCreditBalance } = require('../lib/credit');

router.use(protect, isBarOwnerOrSales);

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

// Get all orders
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find({ barId: req.user.barId })
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 });

    const products = await Product.find({ barId: req.user.barId });
    const productMap = new Map((products || []).map((product) => [product._id || product.id, product]));

    const enrichedOrders = (orders || []).map((order) => ({
      ...order,
      items: (order.items || []).map((item) => {
        const itemProductId = item.product?._id || item.product;
        const catalogProduct = itemProductId ? productMap.get(itemProductId) : null;
        const productName = item.productName || catalogProduct?.name || item.product?.name || 'Product';
        const productCategory = catalogProduct?.category?.name || catalogProduct?.categoryName || item.product?.category?.name || 'Uncategorized';

        return {
          ...item,
          productName,
          product: catalogProduct
            ? { _id: catalogProduct._id || catalogProduct.id, name: catalogProduct.name, category: catalogProduct.category }
            : item.product || null,
          categoryName: productCategory
        };
      })
    }));

    res.json(enrichedOrders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get today's orders (for dashboard)
router.get('/today', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayOrders = await Order.find({
      barId: req.user.barId,
      createdAt: { $gte: startOfDay }
    });

    const reversedOrders = (todayOrders || []).filter((order) => order.reversed);
    const activeOrders = (todayOrders || []).filter((order) => !order.reversed);
    
    const totalSales = activeOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalProfit = activeOrders.reduce((sum, o) => sum + (o.profit || 0), 0);
    
    // Enrich orders with product names
    const products = await Product.find({ barId: req.user.barId });
    const productMap = new Map((products || []).map((product) => [product._id || product.id, product]));

    const enrichedOrders = (todayOrders || []).map((order) => ({
      ...order,
      items: (order.items || []).map((item) => {
        const itemProductId = item.product?._id || item.product;
        const catalogProduct = itemProductId ? productMap.get(itemProductId) : null;
        const productName = item.productName || catalogProduct?.name || item.product?.name || 'Product';
        const productCategory = catalogProduct?.category?.name || catalogProduct?.categoryName || item.product?.category?.name || 'Uncategorized';

        return {
          ...item,
          productName,
          product: catalogProduct
            ? { _id: catalogProduct._id || catalogProduct.id, name: catalogProduct.name, category: catalogProduct.category }
            : item.product || null,
          categoryName: productCategory
        };
      })
    }));
    
    res.json({
      count: activeOrders.length,
      totalSales,
      totalProfit,
      reversedCount: reversedOrders.length,
      orders: enrichedOrders
    });
  } catch (error) {
    console.error('Error fetching today orders:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create order (POS)
router.post('/', async (req, res) => {
  try {
    const { customer, items, paymentMethod, amountPaid } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    let totalAmount = 0;
    let totalCost = 0;
    const orderItems = [];

    // Process each item
    for (const item of items) {
      const product = await Product.findOne({ _id: item.product, barId: req.user.barId });
      
      if (!product) {
        return res.status(404).json({ message: `Product not found: ${item.product}` });
      }

      const quantity = Math.max(0, Math.floor(toNumber(item.quantity, 0)));

      // Check if enough stock
      if (product.currentStock < quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}. Available: ${product.currentStock}`
        });
      }

      // Deduct from inventory
      product.currentStock -= quantity;
      await product.save();

      const sellingPrice = toNumber(product.sellingPrice, 0);
      const costPrice = toNumber(product.costPrice, 0);
      const subtotal = sellingPrice * quantity;
      totalAmount += subtotal;
      totalCost += costPrice * quantity;

      orderItems.push({
        product: product._id,
        productName: product.name,
        quantity,
        priceAtSale: sellingPrice,
        subtotal
      });
    }

    const normalizedAmountPaid = toNumber(amountPaid, 0);
    let customerDoc = null;
    let paidAmount = Math.max(0, normalizedAmountPaid);
    let remainingBalance = totalAmount;
    let paymentStatus = 'paid';

    if (paymentMethod === 'credit' && customer) {
      customerDoc = await Customer.findOne({ _id: customer, barId: req.user.barId });
      if (!customerDoc) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      const isRegisteredCustomer = Boolean(customerDoc.accountUsername || customerDoc.accountUserId || customerDoc.username);
      if (!isRegisteredCustomer) {
        return res.status(400).json({ message: 'Credit payments are only available for registered customer accounts.' });
      }

      if (paidAmount < 0) {
        return res.status(400).json({ message: 'Payment amount cannot be negative' });
      }

      const safePaidAmount = Math.min(paidAmount, totalAmount);
      remainingBalance = Math.max(0, totalAmount - safePaidAmount);
      paymentStatus = remainingBalance > 0 ? 'partial' : 'paid';

      customerDoc.totalSpent = toNumber(customerDoc.totalSpent, 0) + totalAmount;
      customerDoc.loyaltyPoints = toNumber(customerDoc.loyaltyPoints, 0) + Math.floor(totalAmount / 100);
      customerDoc.lastCreditPayment = safePaidAmount;
      // persist other customer fields now; creditBalance will be recomputed from orders after save
      await customerDoc.save();
    } else if (customer) {
      customerDoc = await Customer.findOne({ _id: customer, barId: req.user.barId });
      if (customerDoc) {
        customerDoc.totalSpent = toNumber(customerDoc.totalSpent, 0) + totalAmount;
        customerDoc.loyaltyPoints = toNumber(customerDoc.loyaltyPoints, 0) + Math.floor(totalAmount / 100);
        await customerDoc.save();
      }
    }

    const order = new Order({
      barId: req.user.barId,
      orderNumber: `ORD-${Date.now().toString().slice(-8)}`,
      customer: customer || null,
      customerName: customerDoc?.name || 'Walk-in Customer',
      items: orderItems,
      totalAmount,
      profit: totalAmount - totalCost,
      paymentMethod: paymentMethod || 'cash',
      amountPaid: paymentMethod === 'credit' ? Math.min(paidAmount, totalAmount) : totalAmount,
      balanceDue: paymentMethod === 'credit' ? remainingBalance : 0,
      paymentStatus,
      status: paymentStatus === 'paid' ? 'completed' : 'partial'
    });

    const savedOrder = await order.save();

    // Recompute and persist customer's creditBalance from outstanding credit orders
    if (customerDoc) {
      await recomputeCustomerCreditBalance(customerDoc._id, req.user.barId);
    }

    await savedOrder.populate('customer');
    await savedOrder.populate('items.product');

    // Enrich response with product names
    const enrichedOrder = {
      ...savedOrder,
      items: (savedOrder.items || []).map((item) => {
        const itemProductId = item.product?._id || item.product;
        const productData = itemProductId && typeof itemProductId === 'object' ? itemProductId : null;
        const productName = item.productName || productData?.name || 'Product';

        return {
          ...item,
          productName,
          product: productData || item.product || null
        };
      })
    };

    res.status(201).json(enrichedOrder);

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get order by ID
router.post('/:id/reverse', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, barId: req.user.barId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.reversed) {
      return res.status(400).json({ message: 'This sale has already been reversed.' });
    }

    for (const item of order.items || []) {
      const product = await Product.findOne({ _id: item.product, barId: req.user.barId });
      if (product) {
        product.currentStock = toNumber(product.currentStock, 0) + toNumber(item.quantity, 0);
        await product.save();
      }
    }

    let customerDoc = null;
    if (order.customer) {
      customerDoc = await Customer.findOne({ _id: order.customer, barId: req.user.barId });
      if (customerDoc) {
        customerDoc.totalSpent = Math.max(0, toNumber(customerDoc.totalSpent, 0) - toNumber(order.totalAmount, 0));
        customerDoc.loyaltyPoints = Math.max(0, toNumber(customerDoc.loyaltyPoints, 0) - Math.floor(toNumber(order.totalAmount, 0) / 100));
        // do not adjust creditBalance here; we'll recompute from orders after marking reversed
        await customerDoc.save();
      }
    }

    order.reversed = true;
    order.reversedAt = new Date().toISOString();
    order.reversalReason = req.body?.reason || 'Sale reversed';
    order.status = 'reversed';
    await order.save();

    // Recompute customer's credit balance excluding reversed orders
    if (customerDoc) {
      const customerOrders = await Order.find({ customer: customerDoc._id, barId: req.user.barId });
      const outstanding = (customerOrders || [])
        .filter(o => !o.reversed && (o.paymentMethod === 'credit' || o.paymentStatus === 'partial' || o.paymentStatus === 'credit'))
        .reduce((sum, o) => sum + Number(o.balanceDue || 0), 0);
      customerDoc.creditBalance = outstanding;
      await customerDoc.save();
    }

    res.json(order);
  } catch (error) {
    console.error('Error reversing order:', error);
    res.status(400).json({ message: error.message });
  }
});

router.post('/:id/pay', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await Order.findOne({ _id: req.params.id, barId: req.user.barId });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const paymentAmount = toNumber(amount, 0);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }

    const currentBalance = toNumber(order.balanceDue, 0);
    const safeAmount = Math.min(paymentAmount, currentBalance);
    const updatedBalance = currentBalance - safeAmount;

    order.balanceDue = updatedBalance;
    order.paymentStatus = updatedBalance > 0 ? 'partial' : 'paid';
    order.amountPaid = toNumber(order.amountPaid, 0) + safeAmount;
    order.paymentMethod = order.paymentMethod || 'credit';

    if (order.customer) {
      const customerDocLocal = await Customer.findOne({ _id: order.customer, barId: req.user.barId });
      if (customerDocLocal) {
        await recomputeCustomerCreditBalance(customerDocLocal._id, req.user.barId);
      }
    }

    await order.save();
    res.json(order);
  } catch (error) {
    console.error('Error paying order balance:', error);
    res.status(400).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, barId: req.user.barId })
      .populate('customer', 'name phone')
      .populate('items.product', 'name');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;