const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');

// POST /api/crisis/report — Submit a crisis report (anonymous option)
router.post('/report', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      type: Joi.string().valid('self', 'colleague', 'general').required(),
      severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
      description: Joi.string().max(2000).allow(''),
      anonymous: Joi.boolean().default(false),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const result = await db.collection('crisis_reports').insertOne({
      userId: value.anonymous ? null : req.auth.userId,
      orgId: req.auth.orgId,
      type: value.type,
      severity: value.severity,
      description: value.description,
      status: 'open',
      createdAt: new Date(),
    });

    res.status(201).json({
      reportId: result.insertedId,
      message: 'Report submitted. If you need immediate help, please call 000 or Lifeline 13 11 14.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// GET /api/crisis/resources — Get crisis resources (PUBLIC — no auth required)
router.get('/resources', async (req, res) => {
  try {
    const resources = [
      {
        name: 'Lifeline Australia',
        phone: '13 11 14',
        description: '24/7 crisis support and suicide prevention',
        url: 'https://www.lifeline.org.au',
      },
      {
        name: 'Beyond Blue',
        phone: '1300 22 4636',
        description: 'Anxiety, depression and suicide prevention support',
        url: 'https://www.beyondblue.org.au',
      },
      {
        name: '1800RESPECT',
        phone: '1800 737 732',
        description: 'National sexual assault, domestic family violence counselling',
        url: 'https://www.1800respect.org.au',
      },
      {
        name: 'Emergency Services',
        phone: '000',
        description: 'For immediate danger — police, fire, ambulance',
        url: null,
      },
      {
        name: 'Safe Work Australia',
        phone: null,
        description: 'Work health and safety information and resources',
        url: 'https://www.safeworkaustralia.gov.au',
      },
    ];

    // If authenticated, check for org-specific EAP provider
    const db = req.app.locals.db;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ') && db) {
      try {
        const admin = require('firebase-admin');
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        if (decoded.orgId) {
          const org = await db.collection('organisations').findOne({ _id: decoded.orgId });
          if (org?.eapProvider) {
            resources.unshift({
              name: `${org.name} EAP — ${org.eapProvider.name}`,
              phone: org.eapProvider.phone,
              description: 'Your organisation\'s Employee Assistance Program',
              url: org.eapProvider.url,
            });
          }
        }
      } catch (_) {
        // Ignore auth errors — resources still served without EAP
      }
    }

    res.json({ resources });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

module.exports = { crisisRoutes: router };
