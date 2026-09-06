const express = require('express');
const router = express.Router();
const { protect, isBarOwnerOrSales, isBarOwnerOrManager } = require('../middleware/auth');
const CashSession = require('../models/CashSession');
const CashChestEntry = require('../models/CashChestEntry');
const Order = require('../models/Order');
const CustomerPaymentRequest = require('../models/CustomerPaymentRequest');
const { getInitialCreditPayment } = require('../lib/creditPayments');

router.use(protect);

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const getCurrentSession = async (barId) => {
  const sessions = await CashSession.find({ barId, status: 'open' }).sort({ openedAt: -1 });
  return sessions[0] || null;
};

const calculateSessionSummary = async (session) => {
  const endAt = session.closedAt || new Date().toISOString();
  const dateQuery = {
    $gte: session.openedAt,
    $lte: endAt
  };

  const [orders, settlements, entries] = await Promise.all([
    Order.find({
      barId: session.barId,
      createdAt: dateQuery,
      reversed: { $ne: true }
    }),
    CustomerPaymentRequest.find({
      barId: session.barId,
      createdAt: dateQuery,
      status: 'confirmed',
      paymentMethod: 'cash'
    }),
    CashChestEntry.find({ barId: session.barId, sessionId: session._id })
  ]);

  let cashSales = 0;
  let initialCreditCash = 0;
  for (const order of orders || []) {
    if (order.paymentMethod === 'cash') {
      cashSales += toNumber(order.amountPaid || order.totalAmount);
    } else if (order.paymentMethod === 'credit') {
      const initialPayment = getInitialCreditPayment(order);
      if (initialPayment.paymentMethod === 'credit_cash') {
        initialCreditCash += initialPayment.amount;
      }
    }
  }

  const cashSettlements = (settlements || []).reduce((sum, settlement) => (
    sum + toNumber(settlement.amountApplied || settlement.amountRequested || settlement.amount)
  ), 0);
  const manualCashIn = (entries || [])
    .filter((entry) => entry.type === 'cash_in')
    .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const cashOut = (entries || [])
    .filter((entry) => entry.type === 'cash_out')
    .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const cashIn = cashSales + initialCreditCash + cashSettlements + manualCashIn;
  const expectedCash = toNumber(session.openingFloat) + cashIn - cashOut;

  return {
    openingFloat: toNumber(session.openingFloat),
    cashSales,
    initialCreditCash,
    cashSettlements,
    manualCashIn,
    cashIn,
    cashOut,
    expectedCash,
    countedCash: session.countedCash === undefined ? null : toNumber(session.countedCash),
    variance: session.countedCash === undefined ? null : toNumber(session.countedCash) - expectedCash,
    entries: entries || []
  };
};

const buildResponse = async (session) => ({
  ...session,
  summary: await calculateSessionSummary(session)
});

router.get('/current', isBarOwnerOrSales, async (req, res) => {
  try {
    const session = await getCurrentSession(req.user.barId);
    if (!session) {
      return res.json({ session: null });
    }

    return res.json({ session: await buildResponse(session) });
  } catch (error) {
    console.error('Error loading cash chest:', error);
    return res.status(500).json({ message: error.message });
  }
});

router.get('/history', isBarOwnerOrManager, async (req, res) => {
  try {
    const sessions = await CashSession.find({ barId: req.user.barId }).sort({ openedAt: -1 });
    const limitedSessions = sessions.slice(0, 50);
    const response = await Promise.all(limitedSessions.map(buildResponse));
    return res.json({ sessions: response });
  } catch (error) {
    console.error('Error loading cash chest history:', error);
    return res.status(500).json({ message: error.message });
  }
});

router.post('/open', isBarOwnerOrManager, async (req, res) => {
  try {
    const existing = await getCurrentSession(req.user.barId);
    if (existing) {
      return res.status(409).json({ message: 'A cash chest session is already open.', session: await buildResponse(existing) });
    }

    const openingFloat = toNumber(req.body.openingFloat, -1);
    if (openingFloat < 0) {
      return res.status(400).json({ message: 'Opening float must be zero or greater.' });
    }

    const now = new Date().toISOString();
    const session = new CashSession({
      barId: req.user.barId,
      status: 'open',
      openingFloat,
      openedAt: now,
      openedBy: req.user._id,
      openedByName: req.user.fullName || req.user.username || req.user.email || 'User',
      note: String(req.body.note || '').trim(),
      createdAt: now
    });
    await session.save();

    return res.status(201).json({ session: await buildResponse(session) });
  } catch (error) {
    console.error('Error opening cash chest:', error);
    return res.status(400).json({ message: error.message });
  }
});

router.post('/entries', isBarOwnerOrManager, async (req, res) => {
  try {
    const session = await getCurrentSession(req.user.barId);
    if (!session) {
      return res.status(400).json({ message: 'Open a cash chest session first.' });
    }

    const type = String(req.body.type || '').trim();
    const amount = toNumber(req.body.amount, 0);
    const description = String(req.body.description || '').trim();
    if (!['cash_in', 'cash_out'].includes(type)) {
      return res.status(400).json({ message: 'Entry type must be cash_in or cash_out.' });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero.' });
    }
    if (!description) {
      return res.status(400).json({ message: 'A description is required.' });
    }

    const entry = new CashChestEntry({
      barId: req.user.barId,
      sessionId: session._id,
      type,
      amount,
      description,
      recordedBy: req.user._id,
      recordedByName: req.user.fullName || req.user.username || req.user.email || 'User',
      createdAt: new Date().toISOString()
    });
    await entry.save();

    return res.status(201).json({ entry, session: await buildResponse(session) });
  } catch (error) {
    console.error('Error recording cash chest entry:', error);
    return res.status(400).json({ message: error.message });
  }
});

router.post('/close', isBarOwnerOrManager, async (req, res) => {
  try {
    const session = await getCurrentSession(req.user.barId);
    if (!session) {
      return res.status(400).json({ message: 'There is no open cash chest session.' });
    }

    const countedCash = toNumber(req.body.countedCash, -1);
    if (countedCash < 0) {
      return res.status(400).json({ message: 'Counted cash must be zero or greater.' });
    }

    session.closedAt = new Date().toISOString();
    const summary = await calculateSessionSummary(session);
    session.status = 'closed';
    session.countedCash = countedCash;
    session.expectedCash = summary.expectedCash;
    session.variance = countedCash - summary.expectedCash;
    session.closedBy = req.user._id;
    session.closedByName = req.user.fullName || req.user.username || req.user.email || 'User';
    session.closingNote = String(req.body.note || '').trim();
    await session.save();

    return res.json({ session: await buildResponse(session) });
  } catch (error) {
    console.error('Error closing cash chest:', error);
    return res.status(400).json({ message: error.message });
  }
});

module.exports = router;
