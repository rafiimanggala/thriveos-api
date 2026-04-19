const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');

// POST /api/risk-signals — Store batch of client-side risk signals
router.post('/', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      signals: Joi.array().items(Joi.object({
        id: Joi.string().required(),
        hazardCategoryId: Joi.string().required(),
        severity: Joi.number().min(0).max(1).required(),
        source: Joi.string().required(),
        timestamp: Joi.alternatives().try(Joi.date(), Joi.string()).optional(),
      })).min(1).max(100).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const docs = value.signals.map((s) => ({
      ...s,
      userId: req.auth.userId,
      orgId: req.auth.orgId,
      timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
      createdAt: new Date(),
    }));

    await db.collection('risk_signals').insertMany(docs);
    res.status(201).json({ message: 'Signals stored', count: docs.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to store risk signals' });
  }
});

module.exports = { riskSignalsRoutes: router };
