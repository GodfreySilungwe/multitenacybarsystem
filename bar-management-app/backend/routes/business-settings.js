const express = require('express');
const router = express.Router();
const Bar = require('../models/Bar');
const { protect, isBarOwnerOrManager } = require('../middleware/auth');
const { DEFAULT_PAYMENT_METHODS, getPaymentMethods } = require('../lib/paymentMethods');

const DEFAULT_BUSINESS_SETTINGS = {
  name: 'Bar Manager',
  address: '123 Main Street, Lilongwe',
  phone: '+265 999 123 456',
  email: 'info@barmanager.com',
  taxId: '',
  currency: 'MK',
  receiptFooter: 'Thank you for your business!',
  paymentMethods: []
};

router.use(protect);

router.get('/', async (req, res) => {
  try {
    if (!req.user?.barId) {
      return res.status(403).json({ message: 'A bar account is required to view business settings.' });
    }

    const bar = await Bar.findById(req.user.barId);
    if (!bar) {
      return res.status(404).json({ message: 'Bar not found.' });
    }

    const savedSettings = bar.businessSettings || {};
    const paymentMethods = getPaymentMethods(savedSettings);
    res.json({
      ...DEFAULT_BUSINESS_SETTINGS,
      ...savedSettings,
      paymentMethods,
      paymentMethodsConfigured: true
    });
  } catch (error) {
    console.error('Error loading bar business settings:', error);
    res.status(500).json({ message: 'Could not load business settings.' });
  }
});

router.put('/', isBarOwnerOrManager, async (req, res) => {
  try {
    const bar = await Bar.findById(req.user.barId);
    if (!bar) {
      return res.status(404).json({ message: 'Bar not found.' });
    }

    const settings = req.body || {};
    const name = String(settings.name || '').trim();
    const phone = String(settings.phone || '').trim();
    const currency = String(settings.currency || '').trim();
    if (!name || !phone) {
      return res.status(400).json({ message: 'Business name and phone are required.' });
    }
    if (!currency || currency.length > 12) {
      return res.status(400).json({ message: 'Currency is required and must be 12 characters or fewer.' });
    }
    if (settings.paymentMethods !== undefined && !Array.isArray(settings.paymentMethods)) {
      return res.status(400).json({ message: 'Payment methods must be a list.' });
    }
    const paymentMethods = (settings.paymentMethods !== undefined
      ? settings.paymentMethods
      : getPaymentMethods(bar.businessSettings || {}))
      .map((method) => ({
        value: String(method?.value || '').trim(),
        label: String(method?.label || '').trim()
      }));
    const defaultMethodMap = new Map(DEFAULT_PAYMENT_METHODS.map((method) => [method.value, method.label]));
    const seenMethodValues = new Set();
    const seenMethodLabels = new Set();
    for (const method of paymentMethods) {
      const isDefault = defaultMethodMap.has(method.value);
      if (!method.value || !method.label || method.label.length > 40
        || (!isDefault && !/^custom_[a-z0-9_]+$/.test(method.value))
        || (isDefault && method.label !== defaultMethodMap.get(method.value))) {
        return res.status(400).json({ message: 'Payment methods must use valid default methods or named custom methods (40 characters maximum).' });
      }
      if (seenMethodValues.has(method.value)) {
        return res.status(400).json({ message: 'Payment method names must be unique.' });
      }
      if (seenMethodLabels.has(method.label.toLowerCase())) {
        return res.status(400).json({ message: 'Payment method names must be unique.' });
      }
      seenMethodValues.add(method.value);
      seenMethodLabels.add(method.label.toLowerCase());
    }

    const paymentMethodLabels = {
      ...(bar.businessSettings?.paymentMethodLabels || {})
    };
    const methodsToRemember = [
      ...getPaymentMethods(bar.businessSettings || {}),
      ...paymentMethods
    ];
    for (const method of methodsToRemember) {
      paymentMethodLabels[method.value] = method.label;
    }

    bar.businessSettings = {
      ...DEFAULT_BUSINESS_SETTINGS,
      ...(bar.businessSettings || {}),
      name,
      address: String(settings.address || '').trim(),
      phone,
      email: String(settings.email || '').trim(),
      taxId: String(settings.taxId || '').trim(),
      currency,
      receiptFooter: String(settings.receiptFooter || '').trim(),
      paymentMethods,
      paymentMethodsConfigured: true,
      paymentMethodLabels
    };
    await bar.save();

    res.json(bar.businessSettings);
  } catch (error) {
    console.error('Error saving bar business settings:', error);
    res.status(500).json({ message: 'Could not save business settings.' });
  }
});

module.exports = router;
