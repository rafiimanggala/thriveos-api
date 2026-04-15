const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { MIN_GROUP_SIZE_FOR_DISPLAY } = require('../utils/constants');

// All manager routes require authentication + manager/executive/admin role
router.use(authenticateUser, requireRole('manager', 'executive', 'admin'));

// GET /api/manager/team-pulse — Team pulse overview
router.get('/team-pulse', async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Get manager's team members
    const user = await db.collection('users').findOne({ _id: req.auth.userId });
    const members = await db.collection('users')
      .find({ department: user.department, orgId: req.auth.orgId })
      .toArray();

    if (members.length < MIN_GROUP_SIZE_FOR_DISPLAY) {
      return res.json({ message: 'Insufficient team size', pulse: null });
    }

    const memberIds = members.map((m) => m._id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentCheckins = await db.collection('checkins')
      .find({ userId: { $in: memberIds }, completedAt: { $gte: sevenDaysAgo } })
      .toArray();

    const activeMembers = new Set(recentCheckins.map((c) => c.userId)).size;
    const avgWho5 = recentCheckins.length > 0
      ? recentCheckins.reduce((sum, c) => sum + (c.who5?.total || 0), 0) / recentCheckins.length
      : 0;

    const moodCounts = { great: 0, good: 0, okay: 0, low: 0, struggling: 0 };
    recentCheckins.forEach((c) => {
      if (moodCounts[c.moodLabel] !== undefined) {
        moodCounts[c.moodLabel] += 1;
      }
    });

    res.json({
      teamSize: members.length,
      activeMembers,
      participationRate: Math.round((activeMembers / members.length) * 100),
      averageWho5: Math.round(avgWho5 * 10) / 10,
      moodDistribution: moodCounts,
      period: '7d',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team pulse' });
  }
});

// GET /api/manager/risk-signals — Aggregated risk signals for team
router.get('/risk-signals', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { aggregateTeamRisk } = require('../services/riskAggregation');
    const result = await aggregateTeamRisk(db, req.auth.userId, req.auth.orgId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch risk signals' });
  }
});

// GET /api/manager/risk/:categoryId — Drill down into specific hazard category
router.get('/risk/:categoryId', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { getCategoryById } = require('../utils/hazardMapping');

    const category = getCategoryById(req.params.categoryId);
    if (!category) return res.status(404).json({ error: 'Hazard category not found' });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const signals = await db.collection('checkin_risk_tags')
      .find({
        orgId: req.auth.orgId,
        hazardCategoryId: req.params.categoryId,
        timestamp: { $gte: thirtyDaysAgo },
      })
      .sort({ timestamp: -1 })
      .toArray();

    // Aggregate by week
    const weeklyTrend = {};
    signals.forEach((s) => {
      const week = getWeekKey(s.timestamp);
      if (!weeklyTrend[week]) weeklyTrend[week] = { count: 0, totalStrength: 0 };
      weeklyTrend[week].count += 1;
      weeklyTrend[week].totalStrength += s.signalStrength;
    });

    res.json({
      category,
      signalCount: signals.length,
      weeklyTrend: Object.entries(weeklyTrend).map(([week, data]) => ({
        week,
        count: data.count,
        avgStrength: Math.round((data.totalStrength / data.count) * 100) / 100,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch risk details' });
  }
});

// GET /api/manager/conversation-starters — Get relevant conversation starters
router.get('/conversation-starters', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { hazardCategory } = req.query;

    const filter = hazardCategory ? { hazardCategory } : {};
    const starters = await db.collection('conversation_starters')
      .find(filter)
      .limit(10)
      .toArray();

    res.json({ starters });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation starters' });
  }
});

// POST /api/manager/conversation-logs — Log a conversation
router.post('/conversation-logs', async (req, res) => {
  try {
    const schema = Joi.object({
      starterId: Joi.string().allow(null),
      notes: Joi.string().max(2000).required(),
      outcome: Joi.string().valid('positive', 'neutral', 'needs_followup').required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const result = await db.collection('conversation_logs').insertOne({
      managerId: req.auth.userId,
      ...value,
      createdAt: new Date(),
    });

    res.status(201).json({ logId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log conversation' });
  }
});

// GET /api/manager/actions — Get manager actions
router.get('/actions', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { status } = req.query;

    const filter = { managerId: req.auth.userId };
    if (status) filter.status = status;

    const actions = await db.collection('manager_actions')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ actions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch actions' });
  }
});

// PATCH /api/manager/actions/:id — Update action status
router.patch('/actions/:id', async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid('pending', 'in_progress', 'completed', 'dismissed').required(),
      notes: Joi.string().max(1000),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const { ObjectId } = require('mongodb');

    await db.collection('manager_actions').updateOne(
      { _id: new ObjectId(req.params.id), managerId: req.auth.userId },
      { $set: { ...value, updatedAt: new Date() } }
    );

    res.json({ message: 'Action updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update action' });
  }
});

function getWeekKey(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - start) / (1000 * 60 * 60 * 24) + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

module.exports = { managerRoutes: router };
