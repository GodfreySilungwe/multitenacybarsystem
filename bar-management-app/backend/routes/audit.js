const express = require('express');
const router = express.Router();
const { protect, isBarOwner } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

router.use(protect);

// readonly list with filters: action, userId, entityType, entityId, from, to, limit
router.get('/', isBarOwner, async (req, res) => {
  try {
    const { action, userId, entityType, entityId, from, to, limit = 100 } = req.query;
    const query = { barId: req.user.barId };

    if (action) query.action = action;
    if (userId) query.userId = userId;
    if (entityType) query.entityType = entityType;
    if (entityId) query.entityId = entityId;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from).toISOString();
      if (to) query.createdAt.$lte = new Date(to).toISOString();
    }

    const items = await AuditLog.find(query).sort({ createdAt: -1 });
    res.json((items || []).slice(0, Math.min(Number(limit || 100), 1000)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
