const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const Customer = require('../models/Customer');
const { protect } = require('../middleware/auth');

const DEFAULT_JWT_SECRET = 'secret_key';
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || DEFAULT_JWT_SECRET;
const JWT_SECRETS = Array.from(new Set([JWT_SECRET, DEFAULT_JWT_SECRET, process.env.JWT_SECRET_KEY, 'jwt_secret'])).filter(Boolean);

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

    const query = {
      $or: [{ username }, { email: username }]
    };
    if (req.body.barId) {
      query.barId = req.body.barId;
    }
    const user = await User.findOne(query);
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
        phone: user.phone || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
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

    const safeUser = { ...user };
    if (safeUser.password) delete safeUser.password;
    if (linkedCustomer) {
      safeUser.customerId = linkedCustomer._id;
    }

    res.json(safeUser);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
module.exports.ensureDefaultOwnerUser = ensureDefaultOwnerUser;