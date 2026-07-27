const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Bar = require('../models/Bar');
const { setTenantContext } = require('../lib/tenantContext');

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

const optionalAuth = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader && authHeader.toLowerCase().startsWith('bearer')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);
    if (!user) {
      return next();
    }

    const safeUser = { ...user };
    if (safeUser.password) {
      delete safeUser.password;
    }

    req.user = safeUser;
    setTenantContext({
      barId: safeUser.barId || null,
      userId: safeUser._id,
      role: safeUser.role,
      isGlobalAdmin: safeUser.role === 'owner' && !safeUser.barId
    });
  } catch (error) {
    // Invalid token should not break unauthenticated requests
    console.error('Optional auth error:', error);
  }

  next();
};

// Verify JWT token
const protect = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  if (req.user.barId) {
    const bar = await Bar.findById(req.user.barId);
    // Only block requests when the bar exists and is explicitly suspended or deleted.
    if (bar && (bar.status === 'suspended' || bar.status === 'deleted')) {
      return res.status(403).json({ message: 'This bar is currently suspended and cannot operate.' });
    }
  }

  next();
};

// Check if user is owner
const isOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    next();
  } else {
    res.status(403).json({ message: 'Owner access required' });
  }
};

// Check if user is bar-level owner
const isBarOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner' && req.user.barId) {
    next();
  } else {
    res.status(403).json({ message: 'Bar owner access required' });
  }
};

// Check if user is a bar-level owner or sales user
const isBarOwnerOrSales = (req, res, next) => {
  if (req.user && ((req.user.role === 'owner' && req.user.barId) || req.user.role === 'sales')) {
    next();
  } else {
    res.status(403).json({ message: 'Bar user access required' });
  }
};

// Check if user is global owner (not a bar-level owner)
const isGlobalOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner' && !req.user.barId) {
    next();
  } else {
    res.status(403).json({ message: 'Global owner access required' });
  }
};

// Check if user is sales or owner
const isSalesOrOwner = (req, res, next) => {
  if (req.user && (req.user.role === 'sales' || req.user.role === 'owner')) {
    next();
  } else {
    res.status(403).json({ message: 'Sales or Owner access required' });
  }
};

module.exports = { optionalAuth, protect, isOwner, isBarOwner, isBarOwnerOrSales, isGlobalOwner, isSalesOrOwner };