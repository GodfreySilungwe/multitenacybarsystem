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
      await Promise.all([
        User.deleteMany({ barId: bar._id }),
        Category.deleteMany({ barId: bar._id }),
        Product.deleteMany({ barId: bar._id }),
        Customer.deleteMany({ barId: bar._id }),
        Order.deleteMany({ barId: bar._id }),
        CustomerOrderRequest.deleteMany({ barId: bar._id }),
        CustomerPaymentRequest.deleteMany({ barId: bar._id }),
        InventoryAdjustment.deleteMany({ barId: bar._id }),
        PurchaseOrder.deleteMany({ barId: bar._id }),
        Supplier.deleteMany({ barId: bar._id })
      ]);

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
