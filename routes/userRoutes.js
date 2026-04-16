const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');
const { GROWTH_SCORE_WEIGHTS } = require('../utils/constants');

// GET /api/users/me — Get current user profile
router.get('/me', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = await db.collection('users').findOne({ _id: req.auth.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PATCH /api/users/me — Update profile
router.patch('/me', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      firstName: Joi.string(),
      lastName: Joi.string(),
      department: Joi.string().allow(null),
      timezone: Joi.string(),
      onboardingComplete: Joi.boolean(),
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    await db.collection('users').updateOne(
      { _id: req.auth.userId },
      { $set: { ...value, updatedAt: new Date() } }
    );

    const updated = await db.collection('users').findOne({ _id: req.auth.userId });
    res.json({ user: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/users/me/goals — Set user goals
router.post('/me/goals', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      goals: Joi.array().items(Joi.object({
        id: Joi.string().required(),
        label: Joi.string().required(),
      })).min(1).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    await db.collection('users').updateOne(
      { _id: req.auth.userId },
      { $set: { goals: value.goals, updatedAt: new Date() } }
    );

    res.json({ message: 'Goals updated', goals: value.goals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update goals' });
  }
});

// GET /api/users/me/growth-score — Calculate growth score
router.get('/me/growth-score', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.auth.userId;

    // Gather data for score calculation
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [checkins, progress, kudos, reflections] = await Promise.all([
      db.collection('checkins').find({ userId, completedAt: { $gte: thirtyDaysAgo } }).toArray(),
      db.collection('lesson_progress').find({ userId, completedAt: { $gte: thirtyDaysAgo } }).toArray(),
      db.collection('kudos').find({ fromUserId: userId, createdAt: { $gte: thirtyDaysAgo } }).toArray(),
      db.collection('reflections').find({ userId, createdAt: { $gte: thirtyDaysAgo } }).toArray(),
    ]);

    // Calculate components
    const checkinDays = new Set(checkins.map((c) => c.completedAt.toISOString().split('T')[0])).size;
    const checkinScore = Math.min((checkinDays / 30) * 100, 100);

    const learningScore = Math.min((progress.length / 10) * 100, 100);

    const avgWho5 = checkins.length > 0
      ? checkins.reduce((sum, c) => sum + (c.who5?.total || 0), 0) / checkins.length
      : 0;
    const who5Score = (avgWho5 / 25) * 100;

    const socialScore = Math.min((kudos.length / 5) * 100, 100);
    const reflectionScore = Math.min((reflections.length / 5) * 100, 100);

    const totalScore = Math.round(
      checkinScore * GROWTH_SCORE_WEIGHTS.checkinConsistency +
      learningScore * GROWTH_SCORE_WEIGHTS.learningProgress +
      who5Score * GROWTH_SCORE_WEIGHTS.who5Trend +
      socialScore * GROWTH_SCORE_WEIGHTS.socialEngagement +
      reflectionScore * GROWTH_SCORE_WEIGHTS.reflectionDepth
    );

    res.json({
      totalScore,
      components: {
        checkinConsistency: Math.round(checkinScore),
        learningProgress: Math.round(learningScore),
        who5Trend: Math.round(who5Score),
        socialEngagement: Math.round(socialScore),
        reflectionDepth: Math.round(reflectionScore),
      },
      period: '30d',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate growth score' });
  }
});

// GET /api/users/me/timeline — Activity timeline
router.get('/me/timeline', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const [checkins, kudos, progress] = await Promise.all([
      db.collection('checkins')
        .find({ userId: req.auth.userId })
        .sort({ completedAt: -1 }).limit(limit).toArray(),
      db.collection('kudos')
        .find({ $or: [{ fromUserId: req.auth.userId }, { toUserId: req.auth.userId }] })
        .sort({ createdAt: -1 }).limit(limit).toArray(),
      db.collection('lesson_progress')
        .find({ userId: req.auth.userId })
        .sort({ completedAt: -1 }).limit(limit).toArray(),
    ]);

    const timeline = [
      ...checkins.map((c) => ({ type: 'checkin', date: c.completedAt, data: { moodLabel: c.moodLabel, who5Total: c.who5?.total } })),
      ...kudos.map((k) => ({ type: 'kudos', date: k.createdAt, data: { message: k.message, category: k.category } })),
      ...progress.map((p) => ({ type: 'lesson', date: p.completedAt, data: { lessonTitle: p.lessonTitle } })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);

    res.json({ timeline });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// PATCH /api/users/me/settings — Update user settings
router.patch('/me/settings', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      checkin_time: Joi.string().pattern(/^\d{2}:\d{2}$/),
      notifications_enabled: Joi.boolean(),
      theme: Joi.string().valid('light', 'dark', 'system'),
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    await db.collection('users').updateOne(
      { _id: req.auth.userId },
      { $set: { settings: value, updatedAt: new Date() } },
    );

    const updated = await db.collection('users').findOne({ _id: req.auth.userId });
    res.json({ settings: updated.settings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/users/me/streak — Get streak data
router.get('/me/streak', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const streak = await db.collection('streaks').findOne({ userId: req.auth.userId });

    res.json({
      streak: streak || { currentStreak: 0, longestStreak: 0, lastCheckinDate: null },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

module.exports = { userRoutes: router };
