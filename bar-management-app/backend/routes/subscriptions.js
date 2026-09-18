const express = require('express');
const router = express.Router();
const Bar = require('../models/Bar');
const User = require('../models/User');
const BarSubscription = require('../models/BarSubscription');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const dynamodb = require('../lib/dynamodb');
const { protect, isGlobalOwner } = require('../middleware/auth');

const GRACE_PERIOD_DAYS = 10;

const toDate = (value, fallback = new Date()) => {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonths = (date, months) => {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getDuration = (body = {}) => {
  const durationUnit = String(body.durationUnit || (body.billingDays ? 'days' : 'months')).toLowerCase() === 'days' ? 'days' : 'months';
  const rawValue = durationUnit === 'days' ? body.durationValue ?? body.billingDays : body.durationValue ?? body.billingMonths;
  const durationValue = Math.max(1, Math.floor(Number(rawValue || 1)));
  return { durationUnit, durationValue };
};

const extendDate = (date, durationUnit, durationValue) => (
  durationUnit === 'days' ? addDays(date, durationValue) : addMonths(date, durationValue)
);

const rebuildSubscriptionFromPayments = async (barId, payments) => {
  let paidThrough = null;
  let lastPayment = null;
  for (const payment of payments.sort((left, right) => new Date(left.paymentDate || left.createdAt) - new Date(right.paymentDate || right.createdAt))) {
    const paymentDate = toDate(payment.paymentDate || payment.createdAt);
    if (!paymentDate) continue;
    const extensionStart = paidThrough && paidThrough > paymentDate ? paidThrough : paymentDate;
    const durationUnit = payment.durationUnit || 'months';
    const durationValue = Number(payment.durationValue || payment.billingMonths || 1);
    paidThrough = extendDate(extensionStart, durationUnit, durationValue);
    payment.extensionStart = extensionStart.toISOString();
    payment.paidThrough = paidThrough.toISOString();
    payment.graceEndsAt = addDays(paidThrough, GRACE_PERIOD_DAYS).toISOString();
    if (durationUnit === 'months') {
      payment.billingMonths = durationValue;
      delete payment.billingDays;
    } else {
      payment.billingDays = durationValue;
      delete payment.billingMonths;
    }
    lastPayment = payment;
  }

  const subscription = await BarSubscription.findOne({ barId });
  if (!subscription || !lastPayment) return subscription;
  Object.assign(subscription, {
    paidThrough: lastPayment.paidThrough,
    graceEndsAt: lastPayment.graceEndsAt,
    lastPaymentDate: lastPayment.paymentDate,
    lastPaymentAmount: lastPayment.amount,
    paymentMethod: lastPayment.paymentMethod,
    updatedAt: new Date().toISOString()
  });
  await subscription.save();
  for (const payment of payments) {
    await payment.save();
  }
  return subscription;
};

const getStatus = (subscription, now = new Date()) => {
  if (!subscription?.paidThrough) return 'awaiting_payment';
  const paidThrough = new Date(subscription.paidThrough);
  const graceEndsAt = new Date(subscription.graceEndsAt || subscription.paidThrough);
  if (now <= paidThrough) return 'active';
  if (now <= graceEndsAt) return 'grace_period';
  return 'expired';
};

const enrichSubscriptions = async () => {
  const [bars, subscriptions, users] = await Promise.all([
    Bar.find().sort({ name: 1 }),
    BarSubscription.find(),
    User.find({ barId: { $ne: null } })
  ]);
  const subscriptionMap = new Map(subscriptions.map((subscription) => [String(subscription.barId), subscription]));
  const ownerMap = new Map(
    users.filter((user) => user.role === 'owner').map((user) => [String(user.barId), user])
  );
  const now = new Date();

  return bars.map((bar) => {
    const subscription = subscriptionMap.get(String(bar._id));
    return {
      barId: bar._id,
      barName: bar.name,
      barCode: bar.code,
      ownerName: ownerMap.get(String(bar._id))?.fullName || ownerMap.get(String(bar._id))?.username || '-',
      subscriptionId: subscription?._id || null,
      paidThrough: subscription?.paidThrough || null,
      graceEndsAt: subscription?.graceEndsAt || null,
      lastPaymentDate: subscription?.lastPaymentDate || null,
      lastPaymentAmount: subscription?.lastPaymentAmount || 0,
      paymentMethod: subscription?.paymentMethod || null,
      status: getStatus(subscription, now),
      daysRemaining: subscription?.graceEndsAt
        ? Math.max(0, Math.ceil((new Date(subscription.graceEndsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        : 0
    };
  });
};

router.use(protect, isGlobalOwner);

router.get('/', async (req, res) => {
  try {
    res.json(await enrichSubscriptions());
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/:barId/history', async (req, res) => {
  try {
    const payments = await SubscriptionPayment.find({ barId: req.params.barId });
    payments.sort((left, right) => new Date(right.confirmedAt || right.createdAt) - new Date(left.confirmedAt || left.createdAt));
    res.json(payments);
  } catch (error) {
    console.error('Error fetching subscription history:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/:barId/confirm-payment', async (req, res) => {
  try {
    const bar = await Bar.findById(req.params.barId);
    if (!bar) return res.status(404).json({ message: 'Bar not found.' });

    const body = req.body || {};
    const paymentDate = toDate(body.paymentDate);
    const amount = Number(body.amount || 0);
    const { durationUnit, durationValue } = getDuration(body);
    const paymentMethod = String(body.paymentMethod || 'manual').trim();
    const reference = String(body.reference || req.get('x-idempotency-key') || '').trim();
    if (!paymentDate || paymentDate > new Date()) {
      return res.status(400).json({ message: 'Payment date must be a valid date that is not in the future.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero.' });
    }
    if (!reference) {
      return res.status(400).json({ message: 'A payment reference or idempotency key is required.' });
    }

    const subscription = await BarSubscription.findOne({ barId: bar._id });
    const currentPaidThrough = subscription?.paidThrough ? toDate(subscription.paidThrough, paymentDate) : null;
    const extensionStart = currentPaidThrough && currentPaidThrough > paymentDate ? currentPaidThrough : paymentDate;
    const paidThrough = extendDate(extensionStart, durationUnit, durationValue);
    const graceEndsAt = addDays(paidThrough, GRACE_PERIOD_DAYS);
    const now = new Date().toISOString();

    const record = subscription || new BarSubscription({ _id: dynamodb.generateId(), barId: bar._id });
    Object.assign(record, {
      barId: bar._id,
      paidThrough: paidThrough.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
      lastPaymentDate: paymentDate.toISOString(),
      lastPaymentAmount: amount,
      paymentMethod,
      updatedAt: now
    });
    const payment = new SubscriptionPayment({
      _id: `subscription-payment-${bar._id}-${reference}`,
      barId: bar._id,
      paymentDate: paymentDate.toISOString(),
      amount,
      paymentMethod,
      durationUnit,
      durationValue,
      extensionStart: extensionStart.toISOString(),
      paidThrough: paidThrough.toISOString(),
      graceEndsAt: graceEndsAt.toISOString(),
      reference,
      idempotencyKey: reference,
      note: String(body.note || '').trim(),
      confirmedBy: req.user._id,
      confirmedByName: req.user.fullName || req.user.username,
      confirmedAt: now
    });
    if (durationUnit === 'months') {
      payment.billingMonths = durationValue;
    } else {
      payment.billingDays = durationValue;
    }
    try {
      await dynamodb.transactWrite([
        {
          Put: {
            Item: dynamodb.toDynamoItem(BarSubscription.entityType, record.toJSON())
          }
        },
        {
          Put: {
            Item: dynamodb.toDynamoItem(SubscriptionPayment.entityType, payment.toJSON()),
            ConditionExpression: 'attribute_not_exists(pk)'
          }
        }
      ]);
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        const existingPayment = await SubscriptionPayment.findById(payment._id);
        const existingSubscription = await BarSubscription.findOne({ barId: bar._id });
        if (existingPayment) {
          return res.status(200).json({ subscription: existingSubscription, payment: existingPayment, duplicate: true });
        }
      }
      throw error;
    }

    res.status(201).json({ subscription: record, payment });
  } catch (error) {
    console.error('Error confirming subscription payment:', error);
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:barId/history/:paymentId', async (req, res) => {
  try {
    const payment = await SubscriptionPayment.findOne({ _id: req.params.paymentId, barId: req.params.barId });
    if (!payment) return res.status(404).json({ message: 'Subscription payment not found.' });

    const { durationUnit, durationValue } = getDuration(req.body);
    payment.durationUnit = durationUnit;
    payment.durationValue = durationValue;
    if (durationUnit === 'months') {
      payment.billingMonths = durationValue;
      delete payment.billingDays;
    } else {
      payment.billingDays = durationValue;
      delete payment.billingMonths;
    }

    const payments = await SubscriptionPayment.find({ barId: req.params.barId });
    const paymentInHistory = payments.find((entry) => String(entry._id || entry.id) === String(payment._id || payment.id));
    if (paymentInHistory) {
      paymentInHistory.durationUnit = payment.durationUnit;
      paymentInHistory.durationValue = payment.durationValue;
      if (durationUnit === 'months') {
        paymentInHistory.billingMonths = durationValue;
        delete paymentInHistory.billingDays;
      } else {
        paymentInHistory.billingDays = durationValue;
        delete paymentInHistory.billingMonths;
      }
    }
    const updatedSubscription = await rebuildSubscriptionFromPayments(req.params.barId, payments);
    res.json({ subscription: updatedSubscription, payment: paymentInHistory || payment });
  } catch (error) {
    console.error('Error updating subscription payment period:', error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;