const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { recomputeCustomerCreditBalance } = require('../lib/credit');

router.use(protect);

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const validateCustomerOrderItems = async (items = [], barId) => {
  const errors = [];

  for (const rawItem of items || []) {
    const productId = rawItem?.productId || rawItem?.product || rawItem?._id;
    if (!productId) {
      continue;
    }

    const product = await Product.findOne({ _id: productId, barId });
    if (!product) {
      errors.push(`Product not found for ${rawItem?.productName || rawItem?.name || 'selected item'}.`);
      continue;
    }

    const quantity = Math.max(1, Math.floor(toNumber(rawItem?.quantity, 1)));
    if (Number(product.currentStock || 0) <= 0 || Number(product.currentStock || 0) < quantity) {
      errors.push(`Insufficient stock for ${product.name}. Available: ${product.currentStock}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

const normalizeRequestItems = async (items = [], barId) => {
  const normalizedItems = [];
  let totalAmount = 0;

  for (const rawItem of items || []) {
    const productId = rawItem?.productId || rawItem?.product || rawItem?._id;
    if (!productId) {
      continue;
    }

    const product = await Product.findOne({ _id: productId, barId });
    if (!product) {
      continue;
    }

    const quantity = Math.max(1, Math.floor(toNumber(rawItem?.quantity, 1)));
    const unitPrice = toNumber(product.sellingPrice, 0);
    const subtotal = unitPrice * quantity;

    normalizedItems.push({
      productId: product._id,
      productName: product.name,
      quantity,
      unitPrice,
      subtotal
    });

    totalAmount += subtotal;
  }

  return { items: normalizedItems, totalAmount };
};


const enrichRequest = async (request, barId) => {
  let items = [];

  if (Array.isArray(request.items) && request.items.length > 0) {
    items = request.items.map((item) => ({
      productId: item.productId || item.product || item._id || '',
      productName: item.productName || item.name || 'Product',
      quantity: toNumber(item.quantity, 1),
      unitPrice: toNumber(item.unitPrice, 0),
      subtotal: toNumber(item.subtotal, 0)
    }));
  } else if (request.productId) {
    const product = await Product.findOne({ _id: request.productId, barId });
    items = [{
      productId: request.productId,
      productName: product?.name || request.productName || 'Product',
      quantity: toNumber(request.quantity, 1),
      unitPrice: toNumber(request.unitPrice, 0),
      subtotal: toNumber(request.totalAmount, 0)
    }];
  }

  const totalAmount = toNumber(request.totalAmount, items.reduce((sum, item) => sum + toNumber(item.subtotal, 0), 0));
  const amountPaid = toNumber(request.amountPaid, 0);
  const outstandingAmount = Math.max(0, totalAmount - amountPaid);
  const status = request.status || 'pending';
  const paymentStatus = status === 'rejected'
    ? 'cancelled'
    : request.paymentStatus || 'pending';
  const amountDue = status === 'rejected'
    ? 0
    : paymentStatus === 'paid'
      ? 0
      : outstandingAmount;

  return {
    ...request,
    items,
    productName: items[0]?.productName || request.productName || 'Product',
    totalAmount,
    amountPaid,
    amountDue,
    status,
    paymentStatus
  };
};

router.get('/', async (req, res) => {
  try {
    const query = { barId: req.user.barId };
    if (req.user.role === 'customer') {
      query.customerId = req.user.customerId;
    }
    const requests = await CustomerOrderRequest.find(query).sort({ createdAt: -1 });
    const enriched = await Promise.all((requests || []).map((request) => enrichRequest(request, req.user.barId)));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    let { customerId, customerName, items = [] } = req.body;

    if (req.user.role === 'customer') {
      customerId = req.user.customerId;
      customerName = req.user.fullName || req.user.username || req.user.email || 'Customer';
    }

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Customer and at least one product are required.' });
    }

    const { items: normalizedItems, totalAmount } = await normalizeRequestItems(items, req.user.barId);
    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: 'No valid products were selected.' });
    }

    const stockValidation = await validateCustomerOrderItems(normalizedItems, req.user.barId);
    if (!stockValidation.valid) {
      return res.status(400).json({ message: stockValidation.errors.join(' | ') });
    }

    const request = new CustomerOrderRequest({
      barId: req.user.barId,
      customerId,
      customerName,
      items: normalizedItems,
      productId: normalizedItems[0]?.productId || null,
      productName: normalizedItems[0]?.productName || 'Product',
      quantity: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount,
      amountPaid: 0,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date().toISOString()
    });

    await request.save();
    res.status(201).json({ message: 'Order request submitted successfully.', request });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/confirm', isBarOwnerOrSales, async (req, res) => {
  try {
    const request = await CustomerOrderRequest.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    if (request.status === 'confirmed') {
      return res.json({ message: 'Request already confirmed.', request });
    }

    if (request.customerId && !request.linkedOrderId) {
      const orderItems = [];
      let totalAmount = 0;
      let totalCost = 0;

      for (const item of request.items || []) {
const product = await Product.findOne({ _id: item.productId || item.product || item._id, barId: req.user.barId });
        if (!product) {
          continue;
        }

        const quantity = Math.max(1, Math.floor(toNumber(item.quantity, 1)));
        const sellingPrice = toNumber(product.sellingPrice, 0);
        const costPrice = toNumber(product.costPrice, 0);
        const subtotal = sellingPrice * quantity;

        totalAmount += subtotal;
        totalCost += costPrice * quantity;

        orderItems.push({
          product: product._id,
          quantity,
          priceAtSale: sellingPrice,
          subtotal
        });
      }

      if (orderItems.length === 0) {
        return res.status(400).json({ message: 'No valid items were found to create a credit order for this request.' });
      }

      // Ensure inventory is reserved when customer order is confirmed
      const inventoryIssues = [];
      for (const item of request.items || []) {
        const product = await Product.findOne({ _id: item.productId || item.product || item._id, barId: req.user.barId });
        const quantity = Math.max(1, Math.floor(toNumber(item.quantity, 1)));
        if (!product) {
          inventoryIssues.push(`Product not found for ${item.productName || 'item'}`);
          continue;
        }
        if (product.currentStock < quantity) {
          inventoryIssues.push(`Insufficient stock for ${product.name}. Available: ${product.currentStock}`);
        }
      }

      if (inventoryIssues.length > 0) {
        return res.status(400).json({ message: inventoryIssues.join(' | ') });
      }

      for (const item of request.items || []) {
        const product = await Product.findOne({ _id: item.productId || item.product || item._id, barId: req.user.barId });
        const quantity = Math.max(1, Math.floor(toNumber(item.quantity, 1)));
        product.currentStock = Math.max(0, toNumber(product.currentStock, 0) - quantity);
        await product.save();
      }

      const creditOrder = new Order({
        barId: req.user.barId,
        customer: request.customerId,
        items: orderItems,
        totalAmount,
        profit: totalAmount - totalCost,
        paymentMethod: 'credit',
        amountPaid: 0,
        balanceDue: totalAmount,
        paymentStatus: 'partial',
        status: 'partial',
        sourceRequestId: request._id
      });

      await creditOrder.save();
      request.linkedOrderId = creditOrder._id;
    }

    request.status = 'confirmed';
    request.paymentStatus = 'partial';
    request.paymentMethod = 'credit';
    request.amountPaid = 0;
    request.amountDue = toNumber(request.totalAmount, 0);
    request.confirmedAt = new Date().toISOString();
    await request.save();

    if (request.customerId) {
      await recomputeCustomerCreditBalance(request.customerId, req.user.barId);
    }

    res.json({ message: 'Order confirmed.', request });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/reject', isBarOwnerOrSales, async (req, res) => {
  try {
    const request = await CustomerOrderRequest.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!request) {
      return res.status(404).json({ message: 'Request not found.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be rejected.' });
    }

    request.status = 'rejected';
    request.paymentStatus = 'cancelled';
    request.rejectedAt = new Date().toISOString();
    await request.save();

    res.json({ message: 'Order request rejected.', request });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/pay-bill', async (req, res) => {
  try {
    let { customerId, paymentMethod = 'cash', paymentReference = '', amount = 0 } = req.body;

    if (req.user.role === 'customer') {
      customerId = req.user.customerId;
    }

    if (!customerId) {
      return res.status(400).json({ message: 'Customer is required.' });
    }

    const paymentAmount = toNumber(amount, 0);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }

    const normalizedPaymentMethod = ['cash', 'airtel_money', 'mpamba', 'bank_account'].includes(paymentMethod) ? paymentMethod : 'cash';
    const trimmedReference = String(paymentReference || '').trim();

    if (normalizedPaymentMethod !== 'cash' && !trimmedReference) {
      return res.status(400).json({ message: 'Please provide a transaction reference or payer name for this payment method.' });
    }

    const customer = await Customer.findOne({ _id: customerId, barId: req.user.barId });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const paymentRequest = new CustomerPaymentRequest({
      barId: req.user.barId,
      customerId,
      customerName: customer.name || customer.fullName || '',
      amountRequested: paymentAmount,
      amountApplied: 0,
      paymentMethod: normalizedPaymentMethod,
      paymentReference: trimmedReference,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    await paymentRequest.save();

    res.status(201).json({ message: 'Payment request submitted. Awaiting confirmation.', paymentRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const { customerId } = req.query;
    const query = { barId: req.user.barId };
    if (customerId) {
      query.customerId = customerId;
    }
    const payments = await CustomerPaymentRequest.find(query).sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/payments/:id/confirm', isBarOwnerOrSales, async (req, res) => {
  try {
    const paymentRequest = await CustomerPaymentRequest.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found.' });
    }

    if (paymentRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending payments can be confirmed.' });
    }

    const customerId = paymentRequest.customerId;
    const creditOrders = await Order.find({
      barId: req.user.barId,
      customer: customerId,
      reversed: { $ne: true },
      paymentMethod: 'credit',
      balanceDue: { $gt: 0 }
    }).sort({ createdAt: 1 });

    if ((creditOrders || []).length === 0) {
      paymentRequest.status = 'cancelled';
      await paymentRequest.save();
      return res.status(400).json({ message: 'No outstanding credit orders to apply this payment.' });
    }

    let remainingPayment = toNumber(paymentRequest.amountRequested, 0);
    let appliedAmount = 0;
    const updatedRequests = [];
    const updatedRequestIds = new Set();

    for (const order of creditOrders) {
      if (remainingPayment <= 0) {
        break;
      }

      const amountDue = toNumber(order.balanceDue, 0);
      if (amountDue <= 0) {
        continue;
      }

      const paymentApplied = Math.min(remainingPayment, amountDue);
      order.balanceDue = Math.max(0, amountDue - paymentApplied);
      order.amountPaid = toNumber(order.amountPaid, 0) + paymentApplied;
      order.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
      await order.save();

      remainingPayment -= paymentApplied;
      appliedAmount += paymentApplied;

      const linkedRequests = await CustomerOrderRequest.find({
        barId: req.user.barId,
        $or: [
          { linkedOrderId: order._id },
          { _id: order.sourceRequestId }
        ]
      });

      for (const requestDoc of linkedRequests || []) {
        const requestId = String(requestDoc._id);
        if (updatedRequestIds.has(requestId)) {
          continue;
        }

        requestDoc.amountPaid = toNumber(requestDoc.amountPaid, 0) + paymentApplied;
        requestDoc.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
        requestDoc.paymentMethod = paymentRequest.paymentMethod;
        requestDoc.paymentReference = paymentRequest.paymentReference;
        requestDoc.paidAt = new Date().toISOString();
        await requestDoc.save();
        updatedRequests.push(requestDoc);
        updatedRequestIds.add(requestId);
      }
    }

    paymentRequest.status = 'confirmed';
    paymentRequest.amountApplied = appliedAmount;
    paymentRequest.confirmedAt = new Date().toISOString();
    await paymentRequest.save();

    await recomputeCustomerCreditBalance(customerId, req.user.barId);

    res.json({ message: 'Payment confirmed and applied.', paymentRequest, appliedAmount, updatedRequests });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/payments/:id/reject', isBarOwnerOrSales, async (req, res) => {
  try {
    const paymentRequest = await CustomerPaymentRequest.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found.' });
    }

    if (paymentRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending payments can be rejected.' });
    }

    paymentRequest.status = 'rejected';
    paymentRequest.amountApplied = 0;
    paymentRequest.rejectedAt = new Date().toISOString();
    await paymentRequest.save();

    res.json({ message: 'Payment request rejected.', paymentRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
module.exports.validateCustomerOrderItems = validateCustomerOrderItems;
