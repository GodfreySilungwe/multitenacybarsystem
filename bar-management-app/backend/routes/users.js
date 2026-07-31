const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const CustomerOrderRequest = require('../models/CustomerOrderRequest');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const { protect, isBarOwner } = require('../middleware/auth');

const toSafeUser = (user) => {
  const safe = { ...user };
  delete safe.password;
  return safe;
};

const normalizeUsername = (value, fallback = 'sales') => {
  const normalized = String(value || fallback || 'sales').trim().toLowerCase().replace(/\s+/g, '');
  return normalized || 'sales';
};

const normalizeEmail = (value, fallback = 'sales') => {
  if (value) {
    return String(value).trim();
  }

  return `${normalizeUsername(fallback, 'sales')}@bar.local`;
};

const generatePassword = (username) => {
  const base = String(username || 'sales').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base || 'sales'}${suffix}`;
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

router.use(protect, isBarOwner);

router.get('/', async (req, res) => {
  try {
    const users = await User.find({ barId: req.user.barId }).sort({ username: 1 });
    const safeUsers = users.map((user) => toSafeUser(user));
    res.json(safeUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    const targetPassword = String(newPassword || '').trim();

    if (!targetPassword) {
      return res.status(400).json({ message: 'New password is required.' });
    }

    if (targetPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (String(user._id) === String(req.user._id || req.user.id)) {
      return res.status(400).json({ message: 'Use the change password option for your own account.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(targetPassword, salt);
    await user.save();

    res.json({
      message: 'Password reset successfully.',
      username: user.username,
      password: targetPassword
    });
  } catch (error) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { username, email, password, fullName, role = 'sales' } = req.body;
    const normalizedUsername = normalizeUsername(username || fullName, 'sales');
    const normalizedEmail = normalizeEmail(email, normalizedUsername);
    const normalizedPassword = password || generatePassword(normalizedUsername);

    if (!normalizedUsername || !normalizedEmail || !normalizedPassword) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    const existingUser = await User.findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedEmail }],
      barId: req.user?.barId || null
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already exists.' });
    }

    const normalizedRole = role === 'owner' ? 'sales' : role || 'sales';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(normalizedPassword, salt);

    const user = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      fullName,
      role: normalizedRole,
      barId: req.user?.barId || null,
      isActive: true
    });

    await user.save();
    res.status(201).json({
      user: toSafeUser(user),
      credentials: {
        username: normalizedUsername,
        password: normalizedPassword
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, barId: req.user.barId });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.role === 'customer') {
      const customer = await Customer.findOne({ accountUserId: user._id, barId: req.user.barId });
      if (customer) {
        await deleteCustomerRelatedData(customer._id, req.user.barId);
        await customer.delete();
      }
    }

    await user.delete();
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
