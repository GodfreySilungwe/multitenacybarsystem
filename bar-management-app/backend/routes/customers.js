const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { queryEntities, decodeLastEvaluatedKey } = require('../lib/dynamodb');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Bar = require('../models/Bar');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');

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
    const orders = await Order.find({
      barId,
      customer: customerId,
      reversed: { $ne: true },
      paymentMethod: 'credit',
      balanceDue: { $gt: 0 }
    })
      .populate('items.product', 'name')
      .sort({ createdAt: 1 });

    const summary = await Promise.all(
      (orders || [])
        .filter((order) => order?.paymentMethod === 'credit')
        .map(async (order) => {
          const balanceDue = getOrderOutstandingBalance(order);
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
    // always derive creditBalance from outstanding credit orders to avoid drift
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
    const lastKey = req.query.lastKey ? decodeLastEvaluatedKey(req.query.lastKey) : null;

    const queryOptions = {
      barId: req.user.barId,
      limit,
      lastEvaluatedKey: lastKey
    };

    const result = await queryEntities('customer', queryOptions);
    const customers = (result.items || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const enrichedCustomers = await Promise.all(customers.map((customer) => enrichCustomer(customer, req.user.barId)));

    if (limit || lastKey) {
      return res.json({ items: enrichedCustomers, nextKey: result.lastEvaluatedKey });
    }

    res.json(enrichedCustomers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/summary', isBarOwnerOrSales, async (req, res) => {
  try {
    const { items: customers = [] } = await queryEntities('customer', { barId: req.user.barId });
    const creditAccounts = (customers || [])
      .filter((customer) => Number(customer.creditBalance || 0) > 0)
      .map((customer) => ({
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        balance: Number(customer.creditBalance || 0)
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    const totalCreditOutstanding = creditAccounts.reduce((sum, customer) => sum + customer.balance, 0);

    res.json({
      totalCustomers: customers.length,
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

    const existingUsername = await User.findOne({ username: normalizedUsername });
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
      paymentMethod: 'credit',
      balanceDue: { $gt: 0 }
    })
      .populate('items.product', 'name')
      .sort({ createdAt: 1 });

    const outstandingBalance = (unpaidOrders || [])
      .reduce((sum, order) => sum + Number(order.balanceDue || 0), 0);

    const paymentAmount = Math.min(requestedAmount, outstandingBalance);
    let remainingPayment = paymentAmount;

    const updatedRequests = [];

    for (const order of unpaidOrders || []) {
      if (order.paymentMethod !== 'credit' || Number(order.balanceDue || 0) <= 0 || remainingPayment <= 0) {
        continue;
      }

      const currentBalance = toNumber(order.balanceDue, 0);
      const appliedAmount = Math.min(remainingPayment, currentBalance);
      remainingPayment -= appliedAmount;

      order.balanceDue = Math.max(0, currentBalance - appliedAmount);
      order.amountPaid = toNumber(order.amountPaid, 0) + appliedAmount;
      order.paymentStatus = order.balanceDue > 0 ? 'partial' : 'paid';
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