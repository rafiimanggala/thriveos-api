const express = require('express');
const router = express.Router();
const Joi = require('joi');
const admin = require('firebase-admin');

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  orgCode: Joi.string().required(),
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { email, password, firstName, lastName, orgCode } = value;
    const db = req.app.locals.db;

    // Verify org code
    const org = await db.collection('organisations').findOne({ slug: orgCode });
    if (!org) return res.status(400).json({ error: 'Invalid organisation code' });

    // Create Firebase user
    const firebaseUser = await admin.auth().createUser({ email, password, displayName: `${firstName} ${lastName}` });

    // Set custom claims
    await admin.auth().setCustomUserClaims(firebaseUser.uid, { role: 'employee', orgId: org._id.toString() });

    // Create user doc
    await db.collection('users').insertOne({
      _id: firebaseUser.uid,
      orgId: org._id.toString(),
      email,
      firstName,
      lastName,
      role: 'employee',
      department: null,
      onboardingComplete: false,
      timezone: 'Australia/Sydney',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({ userId: firebaseUser.uid, message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = { authRoutes: router };
