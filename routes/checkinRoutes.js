const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');
const { mapWHO5ToRiskSignals, mapFactorsToRiskSignals } = require('../utils/hazardMapping');
const { getMoodLabel } = require('../utils/constants');

const checkinSchema = Joi.object({
  who5: Joi.object({
    q1: Joi.number().integer().min(0).max(5).required(),
    q2: Joi.number().integer().min(0).max(5).required(),
    q3: Joi.number().integer().min(0).max(5).required(),
    q4: Joi.number().integer().min(0).max(5).required(),
    q5: Joi.number().integer().min(0).max(5).required(),
  }).required(),
  factors: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    hazardCategoryId: Joi.string().required(),
    state: Joi.string().valid('green', 'orange').required(),
  })).required(),
});

// POST /api/checkins — Submit a check-in
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { error, value } = checkinSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const { who5, factors } = value;
    const who5Total = who5.q1 + who5.q2 + who5.q3 + who5.q4 + who5.q5;

    // Determine mood label from WHO-5 total
    const moodLabel = getMoodLabel(who5Total);

    // Generate risk signals
    const who5Signals = mapWHO5ToRiskSignals({ ...who5, total: who5Total });
    const factorSignals = mapFactorsToRiskSignals(factors);
    const allSignals = [...who5Signals, ...factorSignals];

    const checkin = {
      userId: req.auth.userId,
      orgId: req.auth.orgId,
      completedAt: new Date(),
      who5: { ...who5, total: who5Total },
      factorsSelected: factors,
      moodLabel,
      createdAt: new Date(),
    };

    const result = await db.collection('checkins').insertOne(checkin);

    // Store risk signals
    if (allSignals.length > 0) {
      const riskTags = allSignals.map((s) => ({
        checkinId: result.insertedId,
        userId: req.auth.userId,
        orgId: req.auth.orgId,
        ...s,
        timestamp: new Date(),
      }));
      await db.collection('checkin_risk_tags').insertMany(riskTags);
    }

    // Update streak
    await updateStreak(db, req.auth.userId, req.auth.orgId);

    res.status(201).json({
      checkinId: result.insertedId,
      moodLabel,
      who5Total,
      riskSignalCount: allSignals.length,
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to submit check-in' });
  }
});

// GET /api/checkins/history — User's check-in history
router.get('/history', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const checkins = await db.collection('checkins')
      .find({ userId: req.auth.userId })
      .sort({ completedAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ checkins });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/checkins/recommendations — Post-check-in recommendations
router.get('/recommendations', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Get latest check-in
    const latestCheckin = await db.collection('checkins')
      .findOne({ userId: req.auth.userId }, { sort: { completedAt: -1 } });

    if (!latestCheckin) return res.json({ recommendations: [] });

    // Get orange factors -> find content matching those hazard categories
    const orangeCategories = (latestCheckin.factorsSelected || [])
      .filter((f) => f.state === 'orange')
      .map((f) => f.hazardCategoryId);

    const uniqueCategories = [...new Set(orangeCategories)];

    // Find matching micro-lessons
    const recommendations = await db.collection('content_lessons')
      .find({ primaryHazard: { $in: uniqueCategories } })
      .sort({ sortOrder: 1 })
      .limit(5)
      .toArray();

    res.json({
      recommendations: recommendations.map((r) => ({
        id: r._id.toString(),
        title: r.title,
        description: r.description,
        type: r.type || 'lesson',
        durationMinutes: r.durationMinutes,
        hazardCategoryId: r.primaryHazard,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

async function updateStreak(db, userId, orgId) {
  const today = new Date().toISOString().split('T')[0];
  const streak = await db.collection('streaks').findOne({ userId });

  if (!streak) {
    await db.collection('streaks').insertOne({
      userId, orgId, currentStreak: 1, longestStreak: 1, lastCheckinDate: today,
    });
    return;
  }

  const lastDate = new Date(streak.lastCheckinDate);
  const todayDate = new Date(today);
  const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return; // Already checked in today

  const newStreak = diffDays === 1 ? streak.currentStreak + 1 : 1;
  const longestStreak = Math.max(newStreak, streak.longestStreak);

  await db.collection('streaks').updateOne(
    { userId },
    { $set: { currentStreak: newStreak, longestStreak, lastCheckinDate: today } }
  );
}

module.exports = { checkinRoutes: router };
