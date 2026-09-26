const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const User = require('../models/User');
const dynamodb = require('../lib/dynamodb');
const { recomputeCustomerCreditBalance } = require('../lib/credit');
const { getOrderExpiryEpochSeconds } = require('../lib/orderExpiry');
const { queryActiveCreditOrders, queryPaymentRequestsByBarStatus } = require('../lib/dynamodb');
const { PAYMENT_REQUEST_TTL_MS, getPaymentRequestExpiry, isPaymentRequestExpired } = require('../lib/paymentExpiry');

router.use(protect);

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const RESERVATION_TTL_MS = 30 * 60 * 1000;

const productKey = (productId) => ({
  pk: 'PRODUCT',
  sk: `PRODUCT#${productId}`
});

const requestKey = (requestId) => ({
  pk: 'CUSTOMERORDERREQUEST',
  sk: `CUSTOMERORDERREQUEST#${requestId}`
});

const requestItemsByProduct = (items = []) => items.reduce((quantities, item) => {
  const productId = item.productId || item.product || item._id;
  const quantity = Math.max(1, Math.floor(toNumber(item.quantity, 1)));
  if (productId) {
    quantities[productId] = (quantities[productId] || 0) + quantity;
  }
  return quantities;
}, {});

const reservationUpdate = (productId, quantity, barId, operation, expectedStock, expectedReserved) => {
  const isRelease = operation === 'release';
  const hasExpectedValues = expectedStock !== undefined;
  return {
    Update: {
      Key: productKey(productId),
      UpdateExpression: isRelease
        ? 'SET #reserved = if_not_exists(#reserved, :zero) - :quantity, #updatedAt = :updatedAt'
        : 'SET #reserved = if_not_exists(#reserved, :zero) + :quantity, #updatedAt = :updatedAt',
      ConditionExpression: isRelease
        ? '#barId = :barId AND #reserved >= :quantity'
        : hasExpectedValues
          ? expectedReserved === undefined
            ? '#barId = :barId AND #stock = :expectedStock AND attribute_not_exists(#reserved)'
            : '#barId = :barId AND #stock = :expectedStock AND #reserved = :expectedReserved'
          : '#barId = :barId AND #stock >= :quantity',
      ExpressionAttributeNames: {
        '#reserved': 'reservedStock',
        '#updatedAt': 'updatedAt',
        '#barId': 'barId',
        ...(isRelease ? {} : { '#stock': 'currentStock' })
      },
      ExpressionAttributeValues: {
        ':quantity': quantity,
        ':zero': 0,
        ':updatedAt': new Date().toISOString(),
        ':barId': barId,
        ...(hasExpectedValues ? { ':expectedStock': expectedStock } : {}),
        ...(expectedReserved !== undefined ? { ':expectedReserved': expectedReserved } : {})
      }
    }
  };
};

const inventoryConversionUpdate = (productId, quantity, barId) => ({
  Update: {
    Key: productKey(productId),
    UpdateExpression: 'SET #stock = #stock - :quantity, #reserved = #reserved - :quantity, #updatedAt = :updatedAt',
    ConditionExpression: '#barId = :barId AND #stock >= :quantity AND #reserved >= :quantity',
    ExpressionAttributeNames: {
      '#stock': 'currentStock',
      '#reserved': 'reservedStock',
      '#updatedAt': 'updatedAt',
      '#barId': 'barId'
    },
    ExpressionAttributeValues: {
      ':quantity': quantity,
      ':updatedAt': new Date().toISOString(),
      ':barId': barId
    }
  }
});

const releaseRequestReservation = async (request, barId, status = 'expired') => {
  if (!request || request.status !== 'pending' || request.reservationReleased) {
    return request;
  }

  const quantities = requestItemsByProduct(request.items);
  const requestData = request.toJSON();
  requestData.status = status;
  requestData.paymentStatus = 'cancelled';
  requestData.reservationReleased = true;
  requestData.releasedAt = new Date().toISOString();
  if (status === 'expired') {
    requestData.expiredAt = requestData.releasedAt;
  } else {
    requestData.rejectedAt = requestData.releasedAt;
  }

  const requestRecord = dynamodb.toDynamoItem('customerorderrequest', requestData);
  await dynamodb.transactWrite([
    ...Object.entries(quantities).map(([productId, quantity]) => reservationUpdate(productId, quantity, barId, 'release')),
    {
      Put: {
        Item: requestRecord,
        ConditionExpression: '#status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':pending': 'pending' }
      }
    }
  ]);

  Object.assign(request, requestData);
  return request;
};

const releaseExpiredReservations = async (barId) => {
  const requests = await CustomerOrderRequest.find({ barId, status: 'pending' });
  const now = Date.now();
  for (const request of requests || []) {
    if (request.reservationExpiresAt && Date.parse(request.reservationExpiresAt) <= now) {
      try {
        await releaseRequestReservation(request, barId, 'expired');
      } catch (error) {
        if (error?.name !== 'TransactionCanceledException') {
          throw error;
        }
      }
    }
  }
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
    const availableStock = Number(product.currentStock || 0) - Number(product.reservedStock || 0);
    if (availableStock <= 0 || availableStock < quantity) {
      errors.push(`Insufficient stock for ${product.name}. Available: ${Math.max(0, availableStock)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

const enrichPaymentRequest = async (paymentRequest, salesUsers = new Map()) => {
  if (!paymentRequest) {
    return paymentRequest;
  }

  if (!paymentRequest.customerName && paymentRequest.customerId) {
    const customer = await Customer.findOne({ _id: paymentRequest.customerId, barId: paymentRequest.barId });
    if (customer) {
      paymentRequest.customerName = customer.name || customer.fullName || paymentRequest.customerName || 'Customer';
    }
  }

  if (!paymentRequest.approvedByName && paymentRequest.approvedBy) {
    const approvedByUser = salesUsers.get(String(paymentRequest.approvedBy));
    if (approvedByUser) {
      paymentRequest.approvedByName = approvedByUser.fullName || approvedByUser.username || approvedByUser.email || 'Sales account';
    }
  }

  return paymentRequest;
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
    await releaseExpiredReservations(req.user.barId);
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

    await releaseExpiredReservations(req.user.barId);

    const requestId = dynamodb.generateId();
    const request = new CustomerOrderRequest({
      _id: requestId,
      id: requestId,
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
      reservationExpiresAt: new Date(Date.now() + RESERVATION_TTL_MS).toISOString(),
      createdAt: new Date().toISOString()
    });

    const requestRecord = dynamodb.toDynamoItem('customerorderrequest', request.toJSON());
    const quantities = requestItemsByProduct(normalizedItems);
    const reservationProducts = await Promise.all(Object.keys(quantities).map(async (productId) => {
      const product = await Product.findOne({ _id: productId, barId: req.user.barId });
      return { productId, product };
    }));
    const unavailableProduct = reservationProducts.find(({ product, productId }) => {
      const quantity = quantities[productId];
      const availableStock = Number(product?.currentStock || 0) - Number(product?.reservedStock || 0);
      return !product || availableStock < quantity;
    });
    if (unavailableProduct) {
      const productName = unavailableProduct.product?.name || 'selected product';
      const availableStock = Math.max(0, Number(unavailableProduct.product?.currentStock || 0) - Number(unavailableProduct.product?.reservedStock || 0));
      return res.status(400).json({ message: `Insufficient available stock for ${productName}. Available: ${availableStock}` });
    }

    try {
      await dynamodb.transactWrite([
        ...reservationProducts.map(({ productId, product }) => reservationUpdate(
          productId,
          quantities[productId],
          req.user.barId,
          'reserve',
          Number(product.currentStock || 0),
          product.reservedStock === undefined ? undefined : Number(product.reservedStock || 0)
        )),
        {
          Put: {
            Item: requestRecord,
            ConditionExpression: 'attribute_not_exists(pk)'
          }
        }
      ]);
    } catch (error) {
      if (error?.name === 'TransactionCanceledException') {
        return res.status(400).json({ message: 'Insufficient available stock for one or more requested products.' });
      }
      throw error;
    }

    res.status(201).json({ message: 'Order request submitted successfully.', request });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/confirm', isBarOwnerOrSales, async (req, res) => {
  try {
    await releaseExpiredReservations(req.user.barId);
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
          productName: product.name,
          quantity,
          priceAtSale: sellingPrice,
          subtotal
        });
      }

      if (orderItems.length === 0) {
        return res.status(400).json({ message: 'No valid items were found to create a credit order for this request.' });
      }

      const creditOrder = new Order({
        _id: dynamodb.generateId(),
        barId: req.user.barId,
        processedBy: req.user._id || req.user.id,
        processedByName: req.user.fullName || req.user.username || req.user.email || 'Sales account',
        customer: request.customerId,
        customerName: request.customerName || 'Customer',
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

      const quantities = requestItemsByProduct(request.items);
      const requestData = request.toJSON();
      requestData.linkedOrderId = creditOrder._id;
      requestData.status = 'confirmed';
      requestData.paymentStatus = 'partial';
      requestData.paymentMethod = 'credit';
      requestData.amountPaid = 0;
      requestData.amountDue = toNumber(request.totalAmount, 0);
      requestData.confirmedAt = new Date().toISOString();
      requestData.confirmedBy = req.user._id || req.user.id;
      requestData.confirmedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';
      requestData.reservationReleased = true;
      requestData.reservationConvertedAt = requestData.confirmedAt;

      const orderRecord = dynamodb.toDynamoItem('order', creditOrder.toJSON());
      const requestRecord = dynamodb.toDynamoItem('customerorderrequest', requestData);
      await dynamodb.transactWrite([
        ...Object.entries(quantities).map(([productId, quantity]) => inventoryConversionUpdate(productId, quantity, req.user.barId)),
        {
          Put: {
            Item: orderRecord,
            ConditionExpression: 'attribute_not_exists(pk)'
          }
        },
        {
          Put: {
            Item: requestRecord,
            ConditionExpression: '#status = :pending AND attribute_not_exists(#linkedOrderId)',
            ExpressionAttributeNames: { '#status': 'status', '#linkedOrderId': 'linkedOrderId' },
            ExpressionAttributeValues: { ':pending': 'pending' }
          }
        }
      ]);

      Object.assign(creditOrder, dynamodb.fromDynamoItem(orderRecord));
      Object.assign(request, requestData);
    }

    if (request.status !== 'confirmed') {
      request.status = 'confirmed';
      request.paymentStatus = 'partial';
      request.paymentMethod = 'credit';
      request.amountPaid = 0;
      request.amountDue = toNumber(request.totalAmount, 0);
      request.confirmedAt = new Date().toISOString();
      await request.save();
    }

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

    await releaseRequestReservation(request, req.user.barId, 'rejected');

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
    paymentRequest.expiresAt = getPaymentRequestExpiry(paymentRequest.createdAt);

    await paymentRequest.save();

    res.status(201).json({ message: 'Payment request submitted. Awaiting confirmation.', paymentRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const { customerId } = req.query;
    const status = String(req.query.status || '').trim().toLowerCase();
    const statuses = status
      ? [status]
      : ['pending', 'confirmed', 'rejected', 'reversed', 'cancelled', 'expired'];
    const now = new Date();
    const pendingWindow = status === 'pending'
      ? {
          startDate: new Date(now.getTime() - PAYMENT_REQUEST_TTL_MS).toISOString(),
          endDate: now.toISOString()
        }
      : {};
    const paymentResults = await Promise.all(statuses.map((paymentStatus) => (
      queryPaymentRequestsByBarStatus(req.user.barId, paymentStatus, {
        startDate: pendingWindow.startDate || req.query.startDate,
        endDate: pendingWindow.endDate || req.query.endDate,
        scanIndexForward: req.query.oldestFirst === 'true'
      })
    )));
    const payments = paymentResults
      .flatMap((result) => result.items || [])
      .filter((payment) => !customerId || String(payment.customerId || '') === String(customerId))
      .filter((payment) => status !== 'pending' || !isPaymentRequestExpired(payment))
      .map((payment) => (isPaymentRequestExpired(payment) ? { ...payment, status: 'expired' } : payment))
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));

    if (status === 'pending') {
      return res.json(payments);
    }

    const users = await User.find({ barId: req.user.barId });
    const salesUsers = new Map((users || []).map((user) => [String(user._id || user.id), user]));
    const enrichedPayments = await Promise.all((payments || []).map((payment) => enrichPaymentRequest(payment, salesUsers)));
    res.json(enrichedPayments);
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

    if (isPaymentRequestExpired(paymentRequest)) {
      paymentRequest.status = 'expired';
      paymentRequest.expiredAt = new Date().toISOString();
      await paymentRequest.save();
      return res.status(410).json({ message: 'This payment request has expired.' });
    }

    const customerId = paymentRequest.customerId;
    const { items: queriedCreditOrders = [] } = await queryActiveCreditOrders(req.user.barId, customerId, {
      scanIndexForward: true
    });
    const creditOrders = queriedCreditOrders.map((order) => new Order(order));

    if ((creditOrders || []).length === 0) {
      paymentRequest.status = 'cancelled';
      await paymentRequest.save();
      return res.status(400).json({ message: 'No outstanding credit orders to apply this payment.' });
    }

    let remainingPayment = toNumber(paymentRequest.amountRequested, 0);
    let appliedAmount = 0;
    const allocations = [];
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
      allocations.push({
        orderId: order._id,
        amount: paymentApplied,
        orderCreatedAt: order.createdAt
      });
      order.balanceDue = Math.max(0, amountDue - paymentApplied);
      order.amountPaid = toNumber(order.amountPaid, 0) + paymentApplied;
      order.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
      if (order.balanceDue <= 0) {
        order.expiresAt = getOrderExpiryEpochSeconds(new Date(), 0);
      } else {
        delete order.expiresAt;
      }
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
    paymentRequest.creditPaymentMethod = `credit_${paymentRequest.paymentMethod || 'cash'}`;
    paymentRequest.allocations = allocations;
    paymentRequest.approvedBy = req.user._id || req.user.id;
    paymentRequest.approvedByName = req.user.fullName || req.user.username || req.user.email || 'Sales account';
    paymentRequest.confirmedAt = new Date().toISOString();
    await paymentRequest.save();

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

    if (isPaymentRequestExpired(paymentRequest)) {
      paymentRequest.status = 'expired';
      paymentRequest.expiredAt = new Date().toISOString();
      await paymentRequest.save();
      return res.status(410).json({ message: 'This payment request has expired.' });
    }

    paymentRequest.status = 'rejected';
    paymentRequest.amountApplied = 0;
    paymentRequest.rejectedAt = new Date().toISOString();
    await paymentRequest.save();

    const enrichedRequest = await enrichPaymentRequest(paymentRequest.toObject ? paymentRequest.toObject() : paymentRequest);
    res.json({ message: 'Payment request rejected.', paymentRequest: enrichedRequest });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
module.exports.validateCustomerOrderItems = validateCustomerOrderItems;
module.exports.requestItemsByProduct = requestItemsByProduct;
module.exports.reservationUpdate = reservationUpdate;
