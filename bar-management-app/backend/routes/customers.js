const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { listEntities, decodeLastEvaluatedKey } = require('../lib/dynamodb');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Bar = require('../models/Bar');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const { selectCreditOrdersForSettlement, getSalesAccountMismatchMessage } = require('../lib/credit');

router.use(protect);

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const getOrderOutstandingBalance = (order) => {
  const totalAmount = toNumber(order?.totalAmount, 0);
  const amountPaid = toNumber(order?.amountPaid, 0);
  const recordedBalance = toNumber(order?.balanceDue, totalAmount - amountPaid);
  return Math.max(0, recordedBalance);
};

const buildCustomerCreditSummary = async (customerId, barId) => {
  try {
    // Query for credit orders - include those with missing or zero balanceDue since old bills might not have it
    const orders = await Order.find({
      barId,
      customer: customerId,
      reversed: { $ne: true },
      paymentMethod: 'credit'
    })
      .populate('items.product', 'name')
      .sort({ createdAt: 1 });

    const summary = await Promise.all(
      (orders || [])
        .filter((order) => order?.paymentMethod === 'credit')
        .map(async (order) => {
          const balanceDue = getOrderOutstandingBalance(order);
          // Only include orders with actual outstanding balance
          if (balanceDue <= 0) {
            return null;
          }

          const products = await Promise.all((order.items || []).map(async (item) => {
            const productId = item?.product?._id || item?.product || item?.productId;
            const product = productId ? await Product.findOne({ _id: productId, barId }) : null;
            return {
              name: product?.name || item.product?.name || 'Unknown product',
              quantity: Number(item.quantity || 0),
              price: Number(item.priceAtSale || 0),
              subtotal: Number(item.subtotal || 0)
            };
          }));

          return {
            _id: order._id,
            orderNumber: order.orderNumber,
            createdAt: order.createdAt,
            date: order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '',
            totalAmount: Number(order.totalAmount || 0),
            amountPaid: Number(order.amountPaid || 0),
            balanceDue,
            paymentStatus: order.paymentStatus || 'partial',
            processedByName: order.processedByName || order.paymentProcessedByName || order.processedBy || order.paymentProcessedBy || 'Sales account',
            salesAccount: order.processedByName || order.paymentProcessedByName || order.processedBy || order.paymentProcessedBy || 'Sales account',
            products
          };
        })
    );

    return summary.filter(Boolean);
  } catch (error) {
    console.error('Error building customer credit summary:', error);
    return [];
  }
};

const normalizeUsername = (value, fallback = 'customer') => {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized || 'customer';
};

const generateCustomerUsername = async (barIdentifier) => {
  const barKey = normalizeUsername(barIdentifier, 'bar').slice(0, 12);
  for (let i = 1; i <= 99; i += 1) {
    const suffix = String(i).padStart(2, '0');
    const candidate = `${barKey}${suffix}`;
    const existingUser = await User.findOne({ username: candidate });
    if (!existingUser) {
      return candidate;
    }
  }
  throw new Error('Unable to generate unique customer username');
};

const deleteCustomerRelatedData = async (customerId, barId) => {
  if (!customerId) {
    return;
  }

  const [requests, payments, orders] = await Promise.all([
    CustomerOrderRequest.find({ barId, customerId }),
    CustomerPaymentRequest.find({ barId, customerId }),
    Order.find({ barId, customer: customerId })
  ]);

  await Promise.all([
    ...requests.map((request) => request.delete()),
    ...payments.map((payment) => payment.delete()),
    ...orders.map((order) => order.delete())
  ]);
};

const enrichCustomer = async (customer, barId) => {
  if (!customer) return customer;

  const creditSummary = await buildCustomerCreditSummary(customer._id || customer.id, barId);
  const outstandingBalance = creditSummary.reduce((sum, item) => sum + Number(item.balanceDue || 0), 0);

  return {
    ...customer,
    creditBalance: outstandingBalance,
    creditSummary,
    accountUsername: customer.accountUsername || customer.username || '',
    accountPassword: customer.accountPassword || customer.password || ''
  };
};

// Get all customers
router.get('/', isBarOwnerOrSales, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const pageToken = req.query.lastKey ? decodeLastEvaluatedKey(req.query.lastKey) : null;
    const allCustomers = await listEntities('customer');
    const sortedCustomers = allCustomers.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const pageOffset = Number.isInteger(pageToken?.offset) && pageToken.offset >= 0 ? pageToken.offset : 0;
    const customers = limit
      ? sortedCustomers.slice(pageOffset, pageOffset + limit)
      : sortedCustomers;
    const enrichedCustomers = await Promise.all(customers.map((customer) => enrichCustomer(customer, req.user.barId)));

    if (limit || pageToken) {
      const nextOffset = pageOffset + customers.length;
      const nextKey = nextOffset < sortedCustomers.length
        ? Buffer.from(JSON.stringify({ offset: nextOffset })).toString('base64')
        : null;
      return res.json({ items: enrichedCustomers, nextKey });
    }

    res.json(enrichedCustomers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/summary', isBarOwnerOrSales, async (req, res) => {
  try {
    const outstandingOrders = await Order.find({
      barId: req.user.barId,
      reversed: { $ne: true },
      paymentMethod: 'credit',
      balanceDue: { $gt: 0 }
    });

    const customerBalances = (outstandingOrders || []).reduce((acc, order) => {
      const customerId = String(order.customer || order.customerId || '').trim();
      const balanceDue = Number(order.balanceDue || 0);
      if (!customerId || balanceDue <= 0) return acc;
      acc[customerId] = (acc[customerId] || 0) + balanceDue;
      return acc;
    }, {});

    const customerIds = Object.keys(customerBalances);
    const customerRecords = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds }, barId: req.user.barId })
      : [];

    const creditAccounts = customerIds.map((id) => {
      const customer = customerRecords.find((record) => String(record._id || record.id) === id);
      return {
        _id: id,
        name: customer?.name || 'Unknown customer',
        phone: customer?.phone || '',
        balance: customerBalances[id]
      };
    })
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    const totalCreditOutstanding = creditAccounts.reduce((sum, customer) => sum + customer.balance, 0);

    res.json({
      totalCustomers: customerIds.length,
      customersWithCredit: creditAccounts.length,
      totalCreditOutstanding,
      topCreditAccounts: creditAccounts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single customer
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    if (req.user.role === 'customer' && String(req.user.customerId) !== String(req.params.id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const enrichedCustomer = await enrichCustomer(customer, req.user.barId);
    res.json(enrichedCustomer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create customer
router.post('/', isBarOwnerOrSales, async (req, res) => {
  try {
    const { name, phone, gender, creditBalance = 0, username, password } = req.body;

    const bar = await Bar.findById(req.user.barId);
    const barIdentifier = bar?.name || bar?.code || String(req.user.barId);
    const normalizedUsername = await generateCustomerUsername(barIdentifier);
    const normalizedPassword = password || `${phone || 'customer'}123`;

    const existingCustomer = await Customer.findOne({ phone, barId: req.user.barId });
    if (existingCustomer) {
      return res.status(400).json({ message: 'Phone number already exists' });
    }

    const existingUsername = await User.findGlobalByUsername(normalizedUsername);
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const existingEmailInBar = await User.findOne({ email: phone, barId: req.user.barId || null });
    if (existingEmailInBar) {
      return res.status(400).json({ message: 'Phone number already exists in this bar' });
    }

    const customer = new Customer({
      barId: req.user.barId,
      name,
      phone,
      gender,
      creditBalance: toNumber(creditBalance, 0),
      totalSpent: 0,
      loyaltyPoints: 0
    });
    await customer.save();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(normalizedPassword, salt);
    const accountUser = new User({
      username: normalizedUsername,
      email: phone,
      password: hashedPassword,
      fullName: name,
      phone,
      role: 'customer',
      barId: req.user.barId,
      isActive: true
    });
    await accountUser.save();

    const updatedCustomer = await Customer.findOne({ _id: customer._id, barId: req.user.barId });
    updatedCustomer.accountUserId = accountUser._id;
    updatedCustomer.accountUsername = normalizedUsername;
    updatedCustomer.accountPassword = normalizedPassword;
    await updatedCustomer.save();

    res.status(201).json({
      customer: updatedCustomer,
      credentials: {
        username: normalizedUsername,
        password: normalizedPassword
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update customer
router.put('/:id', isBarOwnerOrSales, async (req, res) => {
  try {
    const updates = {
      ...req.body,
      creditBalance: toNumber(req.body.creditBalance, 0)
    };

    const customer = await Customer.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    Object.assign(customer, updates);
    await customer.save();
    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Pay part or all of a customer credit balance
router.post('/:id/pay', isBarOwnerOrSales, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const requestedAmount = toNumber(req.body.amount, 0);
    const paymentMethod = ['cash', 'airtel_money', 'mpamba', 'bank_account'].includes(req.body.paymentMethod)
      ? req.body.paymentMethod
      : 'cash';
    const paymentReference = String(req.body.paymentReference || '').trim();

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }

    if (paymentMethod !== 'cash' && !paymentReference) {
      return res.status(400).json({ message: 'Please provide a transaction reference or payer name for this payment method.' });
    }

    const unpaidOrders = await Order.find({
      barId: req.user.barId,
      customer: req.params.id,
      reversed: { $ne: true },
      paymentMethod: 'credit'
    })
      .populate('items.product', 'name')
      .sort({ createdAt: 1 });

    console.debug('DEBUG /customers/:id/pay -> unpaidOrders fetched:', unpaidOrders.length, 'orders. FIFO order (oldest first):', unpaidOrders.map(o => ({ 
      orderNumber: o.orderNumber, 
      createdAt: o.createdAt, 
      balanceDue: o.balanceDue,
      totalAmount: o.totalAmount,
      amountPaid: o.amountPaid,
      calculatedBalance: getOrderOutstandingBalance(o),
      processedByName: o.processedByName,
      paymentProcessedByName: o.paymentProcessedByName
    })));

    // Use the proper balance calculation that handles old bills
    const outstandingBalance = (unpaidOrders || []).reduce((sum, order) => sum + getOrderOutstandingBalance(order), 0);
    
    const eligibleOrders = selectCreditOrdersForSettlement(unpaidOrders || [], req.user);

    // Owners and managers can clear any unpaid customer credit regardless of which sales account created it.
    const canSettleAllCustomerCredits = ['owner', 'manager'].includes(req.user.role);
    let maxSettleableAmount = outstandingBalance;
    if (!canSettleAllCustomerCredits) {
      maxSettleableAmount = (eligibleOrders || []).reduce((sum, order) => sum + getOrderOutstandingBalance(order), 0);
      
      if (maxSettleableAmount <= 0) {
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

    const paymentAmount = Math.min(requestedAmount, maxSettleableAmount);
    let remainingPayment = paymentAmount;

    console.debug('DEBUG /customers/:id/pay -> eligible orders after filtering by user:', eligibleOrders.length, 'orders. FIFO order:', eligibleOrders.map(o => ({ 
      orderNumber: o.orderNumber, 
      createdAt: o.createdAt, 
      balanceDue: o.balanceDue,
      calculatedBalance: getOrderOutstandingBalance(o),
      processedByName: o.processedByName
    })));

    // Only check for mismatch if user has NO eligible orders but is trying to settle
    if (eligibleOrders.length === 0 && (req.user?._id || req.user?.fullName || req.user?.username || req.user?.email)) {
      const currentUnpaid = (unpaidOrders || []).filter((order) => {
        const orderSalesAccountId = String(order.processedBy || order.paymentProcessedBy || '').trim();
        const orderSalesAccountName = String(order.processedByName || order.paymentProcessedByName || 'Sales account').trim() || 'Sales account';
        const sameId = !req.user?._id || orderSalesAccountId === String(req.user._id || '').trim();
        const sameName = !req.user?.fullName && !req.user?.username && !req.user?.email
          || orderSalesAccountName === String(req.user?.fullName || req.user?.username || req.user?.email || '').trim()
          || orderSalesAccountName === 'Sales account';
        return !(sameId && sameName);
      }).length;

      if (currentUnpaid > 0) {
        return res.status(400).json({
          message: 'This bill can only be settled by the sales account that created it.',
          skipped: true
        });
      }
    }

    const updatedRequests = [];
    const allocations = [];

    for (const order of eligibleOrders) {
      if (order.paymentMethod !== 'credit' || remainingPayment <= 0) {
        continue;
      }

      // Use proper balance calculation for old bills
      const currentBalance = getOrderOutstandingBalance(order);
      if (currentBalance <= 0) {
        continue;
      }

      const appliedAmount = Math.min(remainingPayment, currentBalance);
      remainingPayment -= appliedAmount;
      allocations.push({
        orderId: order._id,
        amount: appliedAmount,
        orderCreatedAt: order.createdAt
      });

      console.debug(`FIFO settlement: Order ${order.orderNumber} (created: ${order.createdAt}), balance: ${currentBalance}, applied: ${appliedAmount}, remaining payment: ${remainingPayment}`);

      order.balanceDue = Math.max(0, currentBalance - appliedAmount);
      order.amountPaid = toNumber(order.amountPaid, 0) + appliedAmount;
      order.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
      order.paymentProcessedBy = order.paymentProcessedBy || req.user._id;
      order.paymentProcessedByName = order.paymentProcessedByName || req.user.fullName || req.user.username || req.user.email || 'Sales account';
      order.paymentMethod = order.paymentMethod || 'credit';
      await order.save();

      const linkedRequests = await CustomerOrderRequest.find({
        barId: req.user.barId,
        $or: [
          { linkedOrderId: order._id },
          { _id: order.sourceRequestId }
        ]
      });

      for (const requestDoc of linkedRequests || []) {
        requestDoc.paymentMethod = paymentMethod;
        requestDoc.paymentReference = paymentReference;
        requestDoc.amountPaid = toNumber(requestDoc.amountPaid, 0) + appliedAmount;
        requestDoc.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
        requestDoc.paidAt = new Date().toISOString();
        await requestDoc.save();
        updatedRequests.push(requestDoc);
      }
    }

    const paymentRecord = new CustomerPaymentRequest({
      barId: req.user.barId,
      customerId: req.params.id,
      customerName: customer.name || customer.fullName || customer.username || '',
      amountRequested: paymentAmount,
      amountApplied: paymentAmount,
      paymentMethod,
      creditPaymentMethod: `credit_${paymentMethod}`,
      paymentReference,
      source: 'staff_credit_payment',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      approvedBy: req.user._id,
      approvedByName: req.user.fullName || req.user.username || req.user.email || 'Sales account',
      approvedAt: new Date().toISOString(),
      allocations
    });
    await paymentRecord.save();

    const updatedCustomer = await Customer.findOne({ _id: req.params.id, barId: req.user.barId });
    if (updatedCustomer) {
      const creditSummary = await buildCustomerCreditSummary(req.params.id, req.user.barId);
      const updatedOutstandingBalance = creditSummary.reduce((sum, item) => sum + Number(item.balanceDue || 0), 0);
      updatedCustomer.creditBalance = updatedOutstandingBalance;
      updatedCustomer.lastCreditPayment = paymentAmount;
      await updatedCustomer.save();
      const enrichedCustomer = await enrichCustomer(updatedCustomer, req.user.barId);
      return res.json(enrichedCustomer);
    }

    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete customer
router.delete('/:id', isBarOwnerOrSales, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const creditSummary = await buildCustomerCreditSummary(customer._id || customer.id, req.user.barId);
    const outstandingBalance = creditSummary.reduce((sum, item) => sum + Number(item.balanceDue || 0), 0);
    if (outstandingBalance > 0) {
      return res.status(400).json({
        message: 'Cannot delete customer with outstanding credit balance. Please clear all unpaid credit orders before deleting.'
      });
    }

    await deleteCustomerRelatedData(customer._id || customer.id, req.user.barId);

    if (customer.accountUserId) {
      const linkedUser = await User.findOne({ _id: customer.accountUserId, barId: req.user.barId });
      if (linkedUser) {
        await linkedUser.delete();
      }
    }

    await customer.delete();
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;