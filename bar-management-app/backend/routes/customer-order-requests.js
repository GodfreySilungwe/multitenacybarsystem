const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { protect, isBarOwnerOrSales, isManagerOrOwner } = require('../middleware/auth');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const User = require('../models/User');
const { recomputeCustomerCreditBalance, selectCreditOrdersForSettlement } = require('../lib/credit');
const { createAuditEntry } = require('../lib/audit');
const { getInitialCreditPayment } = require('../lib/creditPayments');

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

const enrichPaymentRequest = async (paymentRequest) => {
  if (!paymentRequest) {
    return paymentRequest;
  }

  if (!paymentRequest.customerName && paymentRequest.customerId) {
    const customer = await Customer.findOne({ _id: paymentRequest.customerId, barId: paymentRequest.barId });
    if (customer) {
      paymentRequest.customerName = customer.name || customer.fullName || paymentRequest.customerName || 'Customer';
    }
  }

  return paymentRequest;
};

const requireValidCurrentUserPassword = async (req, res) => {
  if (!['sales', 'manager'].includes(req.user.role)) {
    return true;
  }

  const password = String(req.body.password || '');
  if (!password) {
    res.status(400).json({ message: 'Password is required to confirm or reject this payment.' });
    return false;
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(401).json({ message: 'Invalid credentials.' });
    return false;
  }

  let isMatch = false;
  try {
    isMatch = await bcrypt.compare(password, user.password);
  } catch (err) {
    console.error('Password compare error:', err);
  }

  if (!isMatch && user.password === password) {
    isMatch = true;
  }

  if (!isMatch) {
    res.status(401).json({ message: 'Invalid password.' });
    return false;
  }

  return true;
};

const getOrderOutstandingBalance = (order) => {
  const totalAmount = toNumber(order?.totalAmount, 0);
  const amountPaid = toNumber(order?.amountPaid, 0);
  const recordedBalance = toNumber(order?.balanceDue, totalAmount - amountPaid);
  return Math.max(0, recordedBalance);
};

const buildPaymentRecordFromRequest = (paymentRequest) => {
    const amount = Number(paymentRequest.amountApplied || paymentRequest.amountRequested || paymentRequest.amount || 0);
  const validMethods = ['cash', 'airtel_money', 'mpamba', 'bank_account', 'credit'];
  const rawMethod = String(paymentRequest.paymentMethod || 'cash').toLowerCase();
  const normalizedMethod = validMethods.includes(rawMethod) ? rawMethod : 'cash';

  // For pending payments, use createdByName (who submitted the request)
  // For confirmed/processed payments, use approvedByName (who approved it)
  const salesAccountName = paymentRequest.status === 'pending'
    ? (paymentRequest.createdByName || 'Sales account')
    : (paymentRequest.approvedByName || paymentRequest.approvedBy || 'Sales account');

  return {
    _id: paymentRequest._id,
    customerId: paymentRequest.customerId,
    source: 'bill_settlement',
    recordType: 'payment_request',
    customerName: paymentRequest.customerName || 'Walk-in customer',
    amount,
    paymentMethod: normalizedMethod,
    status: paymentRequest.status === 'pending'
      ? 'pending'
      : paymentRequest.status === 'rejected'
        ? 'rejected'
        : paymentRequest.status === 'reversed'
          ? 'reversed'
          : paymentRequest.status === 'cancelled'
            ? 'cancelled'
            : 'confirmed',
    reference: paymentRequest.paymentReference || '',
    approvedBy: paymentRequest.approvedByName || paymentRequest.approvedBy || '',
    processedByName: salesAccountName,
    salesAccount: salesAccountName,
    createdByName: paymentRequest.createdByName || 'Sales account',
    createdAt: paymentRequest.createdAt,
    confirmedAt: paymentRequest.confirmedAt,
    description: paymentRequest.status === 'pending'
      ? 'Pending bill settlement'
      : paymentRequest.status === 'rejected'
        ? 'Rejected bill settlement'
        : paymentRequest.status === 'reversed'
          ? 'Reversed bill settlement'
          : paymentRequest.status === 'cancelled'
            ? 'Cancelled bill settlement'
            : 'Confirmed bill settlement'
  };
};

const buildPaymentRecordFromOrder = (order) => {
  const amount = getInitialCreditPayment(order).amount;
  const status = order.paymentStatus === 'paid' ? 'confirmed' : 'partial';
  return {
    _id: `order-${order._id}`,
    customerId: order.customer || order.customerId || '',
    source: 'pos_sale',
    recordType: 'order_payment',
    orderId: order._id,
    orderNumber: order.orderNumber || '',
    customerName: order.customerName || 'Walk-in customer',
    amount,
    paymentMethod: order.paymentMethod === 'credit' ? 'cash' : (order.paymentMethod || 'cash'),
    status,
    reference: order.paymentReference || '',
    approvedBy: order.processedByName || order.processedBy || '',
    processedByName: order.processedByName || order.processedBy || 'Sales account',
    salesAccount: order.processedByName || order.processedBy || 'Sales account',
    createdAt: order.createdAt,
    description: order.paymentStatus === 'paid' ? 'POS receipt' : 'Partial POS payment'
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
        sourceRequestId: request._id,
        processedBy: req.user._id,
        processedByName: req.user.fullName || req.user.username || req.user.email || 'Sales account',
        paymentProcessedBy: req.user._id,
        paymentProcessedByName: req.user.fullName || req.user.username || req.user.email || 'Sales account'
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

    const allowedPaymentMethods = ['cash', 'airtel_money', 'mpamba', 'bank_account'];
    const normalizedPaymentMethod = allowedPaymentMethods.includes(paymentMethod) ? paymentMethod : 'cash';
    const trimmedReference = String(paymentReference || '').trim();

    if (normalizedPaymentMethod !== 'cash' && !trimmedReference) {
      return res.status(400).json({ message: 'Please provide a transaction reference or payer name for this payment method.' });
    }

    const customer = await Customer.findOne({ _id: customerId, barId: req.user.barId });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const creditPaymentMethod = `credit_${normalizedPaymentMethod}`;
    const paymentRequest = new CustomerPaymentRequest({
      barId: req.user.barId,
      customerId,
      customerName: customer.name || customer.fullName || '',
      amountRequested: paymentAmount,
      amountApplied: 0,
      paymentMethod: normalizedPaymentMethod || 'cash',
      creditPaymentMethod,
      paymentReference: trimmedReference,
      source: 'credit_settlement',
      status: 'pending',
      createdByUserId: req.user._id,
      createdByName: req.user.fullName || req.user.username || req.user.email || 'Sales account',
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
    const { customerId, customerName, status, summary } = req.query;
    const offset = Math.max(0, Number.parseInt(req.query.offset || '0', 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '10', 10) || 10));
    const requestQuery = { barId: req.user.barId };
    if (customerId) {
      requestQuery.customerId = customerId;
    }

    const paymentRequests = await CustomerPaymentRequest.find(requestQuery).sort({ createdAt: -1 });
    const enrichedPaymentRequests = await Promise.all((paymentRequests || []).map(enrichPaymentRequest));
    const requestRecords = (enrichedPaymentRequests || []).map(buildPaymentRecordFromRequest);

    const orderQuery = {
      barId: req.user.barId,
      reversed: { $ne: true },
      amountPaid: { $gt: 0 }
    };
    if (customerId) {
      orderQuery.customer = customerId;
    }

    const paidOrders = await Order.find(orderQuery).sort({ createdAt: -1 });
    const orderRecords = (paidOrders || []).map(buildPaymentRecordFromOrder);

    const payments = [...requestRecords, ...orderRecords].sort((a, b) => {
      const first = new Date(a.createdAt).getTime() || 0;
      const second = new Date(b.createdAt).getTime() || 0;
      return second - first;
    });

    if (summary === 'true' || summary === '1') {
      const customerNames = Array.from(new Set(payments.map((payment) => payment.customerName || 'Walk-in customer'))).sort();
      const filteredPayments = payments.filter((payment) => {
        const matchesStatus = !status || status === 'all' || payment.status === status;
        const matchesCustomer = !customerName || customerName === 'all' || (payment.customerName || 'Walk-in customer') === customerName;
        return matchesStatus && matchesCustomer;
      });
      const paginatedPayments = filteredPayments.slice(offset, offset + limit);

      const methodLabels = {
        cash: 'Cash',
        airtel_money: 'Airtel Money',
        mpamba: 'Mpamba',
        bank_account: 'Bank Account',
        credit: 'Credit'
      };

      const totalsByMethod = filteredPayments.reduce((acc, payment) => {
        if (payment.status !== 'confirmed') {
          return acc;
        }
        const amount = Number(payment.amount || 0);
        if (amount <= 0) {
          return acc;
        }
        const methodKey = String(payment.paymentMethod || 'cash').toLowerCase();
        const label = methodLabels[methodKey] || methodKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        acc[label] = (acc[label] || 0) + amount;
        return acc;
      }, {});

      const totalsList = Object.keys(totalsByMethod)
        .map((label) => ({ method: label, amount: totalsByMethod[label] }))
        .sort((a, b) => b.amount - a.amount);
      const totalAmount = totalsList.reduce((sum, item) => sum + item.amount, 0);

      return res.json({
        payments: paginatedPayments,
        hasMore: offset + paginatedPayments.length < filteredPayments.length,
        total: filteredPayments.length,
        customerNames,
        summary: { totalsByMethod: totalsList, totalAmount }
      });
    }

    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/payments/:id/confirm', isBarOwnerOrSales, async (req, res) => {
  try {
    if (!(await requireValidCurrentUserPassword(req, res))) {
      return;
    }

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

    // Validate maximum settlement amount based on sales account
    const requestedAmount = toNumber(paymentRequest.amountRequested, 0);
    const outstandingBalance = (creditOrders || []).reduce((sum, order) => sum + getOrderOutstandingBalance(order), 0);
    
    const eligibleOrders = selectCreditOrdersForSettlement(creditOrders || [], req.user);
    
    // For non-manager/owner users, restrict settlement to their own sales account credit
    let maxSettleableAmount = outstandingBalance;
    if (!['owner', 'manager'].includes(req.user.role)) {
      maxSettleableAmount = (eligibleOrders || []).reduce((sum, order) => sum + getOrderOutstandingBalance(order), 0);
      
      if (maxSettleableAmount <= 0) {
        paymentRequest.status = 'cancelled';
        await paymentRequest.save();
        return res.status(400).json({
          message: 'No outstanding credit from your sales account to settle. Contact your manager to settle bills from other sales accounts.'
        });
      }

      if (requestedAmount > maxSettleableAmount) {
        return res.status(400).json({
          message: `Maximum amount you can settle is ${maxSettleableAmount} MK (credit tied to your sales account only). You requested ${requestedAmount} MK.`,
          maxAmount: maxSettleableAmount,
          requestedAmount
        });
      }
    }

    let remainingPayment = toNumber(paymentRequest.amountRequested, 0);
    let appliedAmount = 0;
    const updatedRequests = [];
    const updatedRequestIds = new Set();

    // For non-owner/manager users, use only their eligible orders
    const ordersToProcess = ['owner', 'manager'].includes(req.user.role) ? creditOrders : eligibleOrders;

    for (const order of ordersToProcess) {
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

        const rawMethod = String(paymentRequest.paymentMethod || 'cash').toLowerCase();
        const allowedPaymentMethods = ['cash', 'airtel_money', 'mpamba', 'bank_account'];
        const normalizedMethod = allowedPaymentMethods.includes(rawMethod) ? rawMethod : 'cash';

        requestDoc.amountPaid = toNumber(requestDoc.amountPaid, 0) + paymentApplied;
        requestDoc.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
        requestDoc.paymentMethod = normalizedMethod;
        requestDoc.paymentReference = paymentRequest.paymentReference || '';
        requestDoc.paidAt = new Date().toISOString();
        await requestDoc.save();
        updatedRequests.push(requestDoc);
        updatedRequestIds.add(requestId);
      }
    }

    paymentRequest.status = 'confirmed';
    paymentRequest.amountApplied = appliedAmount;
    paymentRequest.confirmedAt = new Date().toISOString();
    paymentRequest.approvedBy = req.user._id;
    paymentRequest.approvedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';
    paymentRequest.approvedAt = new Date().toISOString();
    await paymentRequest.save();

    await createAuditEntry({
      action: 'confirm_payment',
      entityType: 'CustomerPaymentRequest',
      entityId: paymentRequest._id,
      details: {
        amountRequested: paymentRequest.amountRequested,
        amountApplied: appliedAmount,
        customerId,
        updatedRequests: updatedRequests.map((item) => item._id || item.id)
      }
    });

    await recomputeCustomerCreditBalance(customerId, req.user.barId);

    const enrichedRequest = await enrichPaymentRequest(paymentRequest.toObject ? paymentRequest.toObject() : paymentRequest);
    res.json({ message: 'Payment confirmed and applied.', paymentRequest: enrichedRequest, appliedAmount, updatedRequests });
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
    paymentRequest.approvedBy = req.user._id;
    paymentRequest.approvedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';
    paymentRequest.approvedAt = new Date().toISOString();
    await paymentRequest.save();

    await createAuditEntry({
      action: 'reject_payment',
      entityType: 'CustomerPaymentRequest',
      entityId: paymentRequest._id,
      details: {
        amountRequested: paymentRequest.amountRequested,
        customerId: paymentRequest.customerId
      }
    });

    const enrichedRequest = await enrichPaymentRequest(paymentRequest.toObject ? paymentRequest.toObject() : paymentRequest);
    res.json({ message: 'Payment request rejected.', paymentRequest: enrichedRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/payments/:id/reverse', isManagerOrOwner, async (req, res) => {
  try {
    if (!(await requireValidCurrentUserPassword(req, res))) {
      return;
    }

    const paymentRequest = await CustomerPaymentRequest.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found.' });
    }

    if (paymentRequest.status !== 'confirmed') {
      return res.status(400).json({ message: 'Only confirmed payments can be reversed.' });
    }

    const customerId = paymentRequest.customerId;
    let remainingReversal = toNumber(paymentRequest.amountApplied || paymentRequest.amountRequested || 0);
    const creditOrders = await Order.find({
      barId: req.user.barId,
      customer: customerId,
      reversed: { $ne: true },
      paymentMethod: 'credit'
    }).sort({ createdAt: 1 });

    for (const order of creditOrders) {
      if (remainingReversal <= 0) {
        break;
      }

      const paidAmount = toNumber(order.amountPaid, 0);
      const revertAmount = Math.min(remainingReversal, paidAmount);
      if (revertAmount <= 0) {
        continue;
      }

      order.amountPaid = Math.max(0, paidAmount - revertAmount);
      const totalAmount = toNumber(order.totalAmount, 0);
      order.balanceDue = Math.max(0, totalAmount - order.amountPaid);
      order.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
      await order.save();

      let remainingOrderRevert = revertAmount;
      const linkedRequests = await CustomerOrderRequest.find({
        barId: req.user.barId,
        $or: [
          { linkedOrderId: order._id },
          { _id: order.sourceRequestId }
        ]
      }).sort({ createdAt: 1 });

      for (const requestDoc of linkedRequests) {
        if (remainingOrderRevert <= 0) {
          break;
        }

        const currentPaid = toNumber(requestDoc.amountPaid, 0);
        const requestRevert = Math.min(remainingOrderRevert, currentPaid);
        requestDoc.amountPaid = Math.max(0, currentPaid - requestRevert);
        requestDoc.paymentStatus = requestDoc.amountPaid > 0 ? 'partial' : 'pending';
        requestDoc.paidAt = requestDoc.amountPaid > 0 ? requestDoc.paidAt : null;
        await requestDoc.save();
        remainingOrderRevert -= requestRevert;
      }

      remainingReversal -= revertAmount;
    }

    paymentRequest.status = 'reversed';
    paymentRequest.reversed = true;
    paymentRequest.reversedAt = new Date().toISOString();
    paymentRequest.reversalReason = req.body?.reason || 'Payment request reversed';
    paymentRequest.approvedBy = req.user._id;
    paymentRequest.approvedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';
    paymentRequest.approvedAt = new Date().toISOString();
    await paymentRequest.save();

    await createAuditEntry({
      action: 'reverse_payment',
      entityType: 'CustomerPaymentRequest',
      entityId: paymentRequest._id,
      details: {
        amountReversed: toNumber(paymentRequest.amountApplied || paymentRequest.amountRequested || 0),
        customerId
      }
    });

    await recomputeCustomerCreditBalance(customerId, req.user.barId);

    const enrichedRequest = await enrichPaymentRequest(paymentRequest.toObject ? paymentRequest.toObject() : paymentRequest);
    res.json({ message: 'Payment request reversed.', paymentRequest: enrichedRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
module.exports.validateCustomerOrderItems = validateCustomerOrderItems;
