const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const { selectLoginUser } = require('../lib/loginIdentity');
const Customer = require('../models/Customer');
const Bar = require('../models/Bar');
const BarSubscription = require('../models/BarSubscription');
const { protect, hasSubscriptionAccess } = require('../middleware/auth');
const { getCustomerReceiptAccessToken, consumeCustomerReceiptAccessToken } = require('../lib/dynamodb');
const { hashCustomerReceiptAccessToken } = require('../lib/customerReceiptAccess');
const { setTenantContext } = require('../lib/tenantContext');
const { getSubscriptionGraceNotice } = require('../lib/subscriptionStatus');

const DEFAULT_JWT_SECRET = 'secret_key';
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || DEFAULT_JWT_SECRET;
const JWT_SECRETS = Array.from(new Set([JWT_SECRET, DEFAULT_JWT_SECRET, process.env.JWT_SECRET_KEY, 'jwt_secret'])).filter(Boolean);

const getBarSubscriptionNotice = async (barId) => {
  if (!barId) return null;
  const subscription = await BarSubscription.findOne({ barId });
  return getSubscriptionGraceNotice(subscription);
};

const verifyToken = (token) => {
  let lastError;

  for (const secret of JWT_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

async function ensureUserAccount(userConfig = {}) {
  const existingUser = await User.findGlobalOne({
    $or: [
      { email: userConfig.email },
      { username: userConfig.username }
    ]
  });

  if (existingUser) {
    const updates = {};

    if (existingUser.role !== userConfig.role) {
      updates.role = userConfig.role;
    }

    if (!existingUser.fullName && userConfig.fullName) {
      updates.fullName = userConfig.fullName;
    }

    if (!existingUser.phone && userConfig.phone) {
      updates.phone = userConfig.phone;
    }

    if (existingUser.gender === undefined && userConfig.gender !== undefined) {
      updates.gender = userConfig.gender;
    }

    if (!existingUser.isActive) {
      updates.isActive = true;
    }

    if (Object.keys(updates).length > 0) {
      Object.assign(existingUser, updates);
      await existingUser.save();
    }

    return existingUser;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userConfig.password, salt);
  const user = new User({
    ...userConfig,
    password: hashedPassword,
    isActive: true
  });

  await user.save();
  return user;
}

async function ensureDefaultOwnerUser() {
  const ownerConfig = {
    username: process.env.DEFAULT_OWNER_USERNAME || 'gsilungwe',
    email: process.env.DEFAULT_OWNER_EMAIL || 'silungwegod@gmail.com',
    password: process.env.DEFAULT_OWNER_PASSWORD || 'godfrey1234',
    fullName: process.env.DEFAULT_OWNER_FULL_NAME || 'Godfrey Silungwe',
    phone: process.env.DEFAULT_OWNER_PHONE || '0995718815',
    role: 'owner'
  };

  const secondaryOwnerConfig = {
    username: process.env.DEFAULT_SECONDARY_OWNER_USERNAME || 'msauwa',
    email: process.env.DEFAULT_SECONDARY_OWNER_EMAIL || 'mtisunge@smartbar.com',
    password: process.env.DEFAULT_SECONDARY_OWNER_PASSWORD || 'mtisunge1234',
    fullName: process.env.DEFAULT_SECONDARY_OWNER_FULL_NAME || 'Mtisunge Sauwa',
    phone: process.env.DEFAULT_SECONDARY_OWNER_PHONE || '0999921878',
    role: 'owner',
    gender: 'female'
  };

  await ensureUserAccount(ownerConfig);
  await ensureUserAccount(secondaryOwnerConfig);
}

// Register
router.post('/register', async (req, res) => {
  try {
    await ensureDefaultOwnerUser();

    const { username, email, password, fullName, role, barId } = req.body;
    const normalizedUsername = String(username || '').trim().toLowerCase().replace(/\s+/g, '');

    const existingUser = await User.findGlobalOne({
      $or: [{ email }, { username: normalizedUsername }]
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists' 
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      username: normalizedUsername,
      email,
      password: hashedPassword,
      fullName,
      role: role || 'sales',
      barId: req.user?.barId || barId || null
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, barId: user.barId || null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        barId: user.barId || null
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const body = req.body || {};
    const username = body.username || body.email || body.userName || body.login;
    const password = body.password;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    console.log('Login attempt:', { username, password: password ? '[REDACTED]' : undefined, body });

    const loginMatches = await User.findGlobalLoginMatches(username, body.barId || null);
    const { user, ambiguous } = selectLoginUser(loginMatches, username);
    if (ambiguous) {
      return res.status(409).json({
        message: 'This email is linked to multiple bar accounts. Sign in with your unique username.'
      });
    }
    console.log('Login lookup result:', !!user, user ? { id: user._id, username: user.username, email: user.email, role: user.role, isActive: user.isActive } : null);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account disabled' });
    }

    if (user.barId) {
      const bar = await require('../models/Bar').findById(user.barId);
      if (!bar || bar.status === 'suspended' || bar.status === 'deleted') {
        return res.status(403).json({ message: 'This bar is currently suspended and cannot operate.' });
      }

      if (!(await hasSubscriptionAccess(user.barId))) {
        return res.status(403).json({ message: 'This bar subscription has expired. Please contact support on +265 995 718 815.' });
      }
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (compareError) {
      console.error('Password compare error:', compareError);
    }

    if (!isMatch && user.password === password) {
      isMatch = true;
    }

    console.log('Login password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, barId: user.barId || null },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const linkedCustomer = user.role === 'customer'
      ? await Customer.findOne({ accountUserId: user._id, barId: user.barId })
      : null;
    const subscriptionGraceNotice = await getBarSubscriptionNotice(user.barId);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        barId: user.barId || null,
        customerId: linkedCustomer ? linkedCustomer._id : null,
        phone: user.phone || null,
        subscriptionGraceNotice
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/customer-receipt-access/redeem', async (req, res) => {
  const tokenHash = hashCustomerReceiptAccessToken(req.body?.token);
  if (!tokenHash) {
    return res.status(401).json({ message: 'This customer access link is invalid or expired.' });
  }

  try {
    const access = await getCustomerReceiptAccessToken(tokenHash);
    if (!access) {
      return res.status(401).json({ message: 'This customer access link is invalid, expired, or already used.' });
    }

    if (!access.barId) {
      return res.status(401).json({ message: 'This customer access link is invalid or expired.' });
    }
    setTenantContext({ barId: access.barId, userId: access.accountUserId, role: 'customer' });

    const user = await User.findById(access.accountUserId);
    if (!user
      || String(user.barId || '') !== String(access.barId)
      || user.role !== 'customer'
      || !user.isActive) {
      return res.status(401).json({ message: 'This customer account is unavailable.' });
    }

    const customer = await Customer.findById(access.customerId);
    if (!customer
      || String(customer.barId || '') !== String(user.barId || '')
      || String(customer.accountUserId || '') !== String(user._id || user.id)) {
      return res.status(401).json({ message: 'This customer account is unavailable.' });
    }

    const bar = await Bar.findById(user.barId);
    if (!bar || bar.status === 'suspended' || bar.status === 'deleted') {
      return res.status(403).json({ message: 'This bar cannot currently provide customer access.' });
    }
    if (!(await hasSubscriptionAccess(user.barId))) {
      return res.status(403).json({ message: 'This bar subscription has expired.' });
    }

    const consumedAccess = await consumeCustomerReceiptAccessToken(tokenHash);
    if (!consumedAccess) {
      return res.status(401).json({ message: 'This customer access link is invalid, expired, or already used.' });
    }

    const token = jwt.sign(
      { id: user._id, role: 'customer', barId: user.barId || null },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: 'customer',
        barId: user.barId || null,
        customerId: customer._id,
        phone: user.phone || null
      }
    });
  } catch (error) {
    console.error('Error redeeming customer receipt access link:', error);
    res.status(500).json({ message: 'Could not sign in from this customer access link.' });
  }
});

router.patch('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(req.user?._id || req.user?.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    let isCurrentPasswordValid = false;
    try {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    } catch (compareError) {
      console.error('Password compare error:', compareError);
    }

    if (!isCurrentPasswordValid && user.password === currentPassword) {
      isCurrentPasswordValid = true;
    }

    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get current user - ADD THIS
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const linkedCustomer = user.role === 'customer'
      ? await Customer.findOne({ accountUserId: user._id, barId: user.barId })
      : null;
    let barDetails = null;
    if (user.barId) {
      const bar = await Bar.findById(user.barId);
      let barOwner = bar?.ownerUserId ? await User.findById(bar.ownerUserId) : null;
      if (!barOwner || barOwner.role !== 'owner' || String(barOwner.barId || '') !== String(user.barId)) {
        barOwner = await User.findOne({ barId: user.barId, role: 'owner' });
      }
      barDetails = {
        name: bar?.name || '',
        address: bar?.address || '',
        district: bar?.district || '',
        country: bar?.country || '',
        email: barOwner?.email || '',
        phone: barOwner?.phone || ''
      };
    }

    const safeUser = { ...user };
    if (safeUser.password) delete safeUser.password;
    if (barDetails) safeUser.barDetails = barDetails;
    if (linkedCustomer) {
      safeUser.customerId = linkedCustomer._id;
    }
    safeUser.subscriptionGraceNotice = await getBarSubscriptionNotice(user.barId);

    res.json(safeUser);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
module.exports.ensureDefaultOwnerUser = ensureDefaultOwnerUser;