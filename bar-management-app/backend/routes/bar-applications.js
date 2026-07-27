const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Bar = require('../models/Bar');
const User = require('../models/User');
const BarApplication = require('../models/BarApplication');
const { protect, isGlobalOwner } = require('../middleware/auth');

const normalizeUsername = (value, fallback = 'owner') => {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/\s+/g, '');
  return normalized.replace(/[^a-z0-9]/g, '') || 'owner';
};

const normalizeEmail = (value, fallback = 'owner@bar.local') => {
  if (value) {
    return String(value).trim();
  }
  return fallback;
};

const generatePassword = (username) => {
  const base = String(username || 'owner').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base || 'owner'}${suffix}`;
};

router.post('/', async (req, res) => {
  try {
    const {
      barName,
      barCode,
      description,
      ownerFullName,
      ownerEmail,
      ownerPhone,
      ownerUsername,
      ownerPassword
    } = req.body;

    if (!barName || !ownerFullName || !ownerEmail || !ownerPhone) {
      return res.status(400).json({ message: 'Bar name, owner name, email and phone are required.' });
    }

    if (!ownerUsername || !String(ownerUsername).trim()) {
      return res.status(400).json({ message: 'Owner username is required.' });
    }

    if (!ownerPassword || String(ownerPassword).length < 6) {
      return res.status(400).json({ message: 'Owner password is required and must be at least 6 characters.' });
    }

    const normalizedUsername = normalizeUsername(ownerUsername || ownerFullName, barName);
    const normalizedEmail = normalizeEmail(ownerEmail, `${normalizedUsername}@bar.local`);
    const password = ownerPassword || generatePassword(normalizedUsername);
    const existingBar = await Bar.findOne({ $or: [{ name: barName }, { code: barCode }] });
    if (existingBar) {
      return res.status(400).json({ message: 'A bar with that name or code already exists.' });
    }

    const existingApplication = await BarApplication.findOne({
      $or: [
        { barName },
        { ownerEmail: normalizedEmail },
        { ownerPhone },
        { ownerUsername: normalizedUsername }
      ]
    });

    if (existingApplication) {
      return res.status(400).json({ message: 'An application with matching bar or owner details already exists.' });
    }

    const application = new BarApplication({
      barName,
      barCode,
      description,
      ownerFullName,
      ownerEmail: normalizedEmail,
      ownerPhone,
      ownerUsername: normalizedUsername,
      ownerPassword: password,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    await application.save();
    res.status(201).json({ message: 'Your bar application was submitted successfully.', application });
  } catch (error) {
    console.error('Error submitting bar application:', error);
    res.status(500).json({ message: error.message });
  }
});

router.use(protect, isGlobalOwner);

router.get('/', async (req, res) => {
  try {
    const applications = await BarApplication.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/approve', async (req, res) => {
  try {
    const application = await BarApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }
    if (application.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending applications can be approved.' });
    }

    const existingBar = await Bar.findOne({ $or: [{ name: application.barName }, { code: application.barCode }] });
    if (existingBar) {
      return res.status(400).json({ message: 'A bar with this name or code already exists.' });
    }

    const bar = new Bar({
      name: application.barName,
      code: application.barCode,
      description: application.description,
      createdAt: new Date().toISOString()
    });
    await bar.save();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(application.ownerPassword || generatePassword(application.ownerUsername), salt);

    const adminUser = new User({
      username: normalizeUsername(application.ownerUsername || application.ownerFullName, application.barName),
      email: normalizeEmail(application.ownerEmail, `${application.ownerUsername || application.ownerFullName}@bar.local`),
      password: hashedPassword,
      fullName: application.ownerFullName,
      phone: application.ownerPhone,
      role: 'owner',
      barId: bar._id,
      isActive: true
    });
    await adminUser.save();

    bar.ownerUserId = adminUser._id;
    await bar.save();

    application.status = 'approved';
    application.approvedAt = new Date().toISOString();
    application.approvedBy = req.user._id;
    application.adminCredentials = {
      username: adminUser.username,
      password: application.ownerPassword || generatePassword(application.ownerUsername)
    };
    await application.save();

    res.json({ message: 'Application approved successfully.', bar, adminCredentials: application.adminCredentials, application });
  } catch (error) {
    console.error('Error approving application:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/reject', async (req, res) => {
  try {
    const application = await BarApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }
    if (application.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending applications can be rejected.' });
    }

    application.status = 'rejected';
    application.rejectedAt = new Date().toISOString();
    application.rejectedBy = req.user._id;
    application.rejectionReason = String(req.body.reason || 'Rejected by global owner').trim();
    await application.save();

    res.json({ message: 'Application rejected successfully.', application });
  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
