const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Bar = require('../models/Bar');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const { protect, isGlobalOwner } = require('../middleware/auth');

const normalizeUsername = (value, fallback = 'admin') => {
  const normalized = String(value || fallback || 'admin').trim().toLowerCase().replace(/\s+/g, '');
  return normalized || 'admin';
};

const normalizeEmail = (value, fallback = 'admin@bar.local') => {
  if (value) {
    return String(value).trim();
  }
  return fallback;
};

router.use(protect, isGlobalOwner);

router.get('/', async (req, res) => {
  try {
    const bars = await Bar.find().sort({ name: 1 });
    res.json(bars);
  } catch (error) {
    console.error('Error fetching bars:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const bar = await Bar.findById(req.params.id);
    if (!bar) {
      return res.status(404).json({ message: 'Bar not found' });
    }
    res.json(bar);
  } catch (error) {
    console.error('Error fetching bar:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (req.user?.barId) {
      return res.status(403).json({ message: 'Only global owners may create new bars.' });
    }

    const {
      name,
      code,
      description,
      adminUsername,
      adminEmail,
      adminPassword,
      adminFullName,
      adminPhone
    } = req.body;

    if (!name || !adminUsername || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: 'Bar name, admin username, email, and password are required.' });
    }

    const normalizedUsername = normalizeUsername(adminUsername, name);
    const normalizedEmail = normalizeEmail(adminEmail, `${normalizedUsername}@bar.local`);

    const existingUser = await User.findOne({ $or: [{ username: normalizedUsername }, { email: normalizedEmail }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Bar admin username or email already exists.' });
    }

    const bar = new Bar({ name, code, description, status: 'active', createdAt: new Date().toISOString() });
    await bar.save();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const adminUser = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      fullName: adminFullName || `${name} Admin`,
      phone: adminPhone,
      role: 'owner',
      barId: bar._id,
      isActive: true
    });

    await adminUser.save();
    bar.ownerUserId = adminUser._id;
    await bar.save();

    res.status(201).json({
      bar,
      adminCredentials: {
        username: normalizedUsername,
        password: adminPassword
      }
    });
  } catch (error) {
    console.error('Error creating bar:', error);
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['active', 'suspended', 'deleted'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowedStatuses.join(', ')}` });
    }

    const bar = await Bar.findById(req.params.id);
    if (!bar) {
      return res.status(404).json({ message: 'Bar not found' });
    }

    if (status === 'deleted') {
      // Models don't support deleteMany; fetch and delete each record instead.
      const tasks = [];

      const users = await User.find({ barId: bar._id });
      tasks.push(...users.map((u) => u.delete()));

      const categories = await Category.find({ barId: bar._id });
      tasks.push(...categories.map((c) => c.delete()));

      const products = await Product.find({ barId: bar._id });
      tasks.push(...products.map((p) => p.delete()));

      const customers = await Customer.find({ barId: bar._id });
      tasks.push(...customers.map((c) => c.delete()));

      const orders = await Order.find({ barId: bar._id });
      tasks.push(...orders.map((o) => o.delete()));

      const requests = await CustomerOrderRequest.find({ barId: bar._id });
      tasks.push(...requests.map((r) => r.delete()));

      const payments = await CustomerPaymentRequest.find({ barId: bar._id });
      tasks.push(...payments.map((p) => p.delete()));

      const adjustments = await InventoryAdjustment.find({ barId: bar._id });
      tasks.push(...adjustments.map((a) => a.delete()));

      const pos = await PurchaseOrder.find({ barId: bar._id });
      tasks.push(...pos.map((p) => p.delete()));

      const suppliers = await Supplier.find({ barId: bar._id });
      tasks.push(...suppliers.map((s) => s.delete()));

      await Promise.all(tasks);

      await Bar.findByIdAndDelete(bar._id);
      return res.json({ message: 'Bar and related metadata deleted successfully.' });
    }

    bar.status = status;
    await bar.save();
    res.json(bar);
  } catch (error) {
    console.error('Error updating bar status:', error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
