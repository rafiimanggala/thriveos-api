const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { MIN_GROUP_SIZE_FOR_DISPLAY, RISK_THRESHOLDS } = require('../utils/constants');
const { HAZARD_CATEGORIES } = require('../utils/hazardMapping');

// All executive routes require authentication + executive/admin role
router.use(authenticateUser, requireRole('executive', 'admin'));

// GET /api/executive/dashboard — Org-wide dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, activeUsers, checkins, riskTags] = await Promise.all([
      db.collection('users').countDocuments({ orgId: req.auth.orgId }),
      db.collection('checkins').distinct('userId', {
        completedAt: { $gte: thirtyDaysAgo },
      }),
      db.collection('checkins').find({ completedAt: { $gte: thirtyDaysAgo } }).toArray(),
      db.collection('checkin_risk_tags').find({
        orgId: req.auth.orgId,
        timestamp: { $gte: thirtyDaysAgo },
      }).toArray(),
    ]);

    const avgWho5 = checkins.length > 0
      ? checkins.reduce((sum, c) => sum + (c.who5?.total || 0), 0) / checkins.length
      : 0;

    // Risk summary by category
    const riskByCategory = {};
    riskTags.forEach((tag) => {
      if (!riskByCategory[tag.hazardCategoryId]) {
        riskByCategory[tag.hazardCategoryId] = { count: 0, totalStrength: 0 };
      }
      riskByCategory[tag.hazardCategoryId].count += 1;
      riskByCategory[tag.hazardCategoryId].totalStrength += tag.signalStrength;
    });

    res.json({
      totalUsers,
      activeUsers: activeUsers.length,
      participationRate: totalUsers > 0 ? Math.round((activeUsers.length / totalUsers) * 100) : 0,
      averageWho5: Math.round(avgWho5 * 10) / 10,
      totalCheckins: checkins.length,
      riskSummary: Object.entries(riskByCategory).map(([categoryId, data]) => ({
        categoryId,
        categoryName: HAZARD_CATEGORIES.find((c) => c.id === categoryId)?.name || categoryId,
        signalCount: data.count,
        avgStrength: Math.round((data.totalStrength / data.count) * 100) / 100,
      })),
      period: '30d',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// GET /api/executive/department-comparison — Compare departments
router.get('/department-comparison', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const users = await db.collection('users')
      .find({ orgId: req.auth.orgId })
      .toArray();

    // Group by department
    const departments = {};
    users.forEach((u) => {
      const dept = u.department || 'Unassigned';
      if (!departments[dept]) departments[dept] = [];
      departments[dept].push(u._id);
    });

    const comparison = await Promise.all(
      Object.entries(departments)
        .filter(([, memberIds]) => memberIds.length >= MIN_GROUP_SIZE_FOR_DISPLAY)
        .map(async ([dept, memberIds]) => {
          const checkins = await db.collection('checkins')
            .find({ userId: { $in: memberIds }, completedAt: { $gte: thirtyDaysAgo } })
            .toArray();

          const activeMembers = new Set(checkins.map((c) => c.userId)).size;
          const avgWho5 = checkins.length > 0
            ? checkins.reduce((sum, c) => sum + (c.who5?.total || 0), 0) / checkins.length
            : 0;

          return {
            department: dept,
            memberCount: memberIds.length,
            activeMembers,
            participationRate: Math.round((activeMembers / memberIds.length) * 100),
            averageWho5: Math.round(avgWho5 * 10) / 10,
            checkinCount: checkins.length,
          };
        })
    );

    res.json({ departments: comparison });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch department comparison' });
  }
});

// GET /api/executive/compliance — Compliance dashboard
router.get('/compliance', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const totalUsers = await db.collection('users').countDocuments({ orgId: req.auth.orgId });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const activeUsers = await db.collection('checkins').distinct('userId', {
      completedAt: { $gte: thirtyDaysAgo },
    });

    const conversationLogs = await db.collection('conversation_logs')
      .find({ createdAt: { $gte: thirtyDaysAgo } })
      .toArray();

    const managerActions = await db.collection('manager_actions')
      .find({ createdAt: { $gte: thirtyDaysAgo } })
      .toArray();

    res.json({
      checkinCompliance: {
        total: totalUsers,
        active: activeUsers.length,
        rate: totalUsers > 0 ? Math.round((activeUsers.length / totalUsers) * 100) : 0,
      },
      managerEngagement: {
        conversationsLogged: conversationLogs.length,
        actionsCreated: managerActions.length,
        actionsCompleted: managerActions.filter((a) => a.status === 'completed').length,
      },
      period: '30d',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch compliance data' });
  }
});

// GET /api/executive/risk-register — Full risk register
router.get('/risk-register', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const riskTags = await db.collection('checkin_risk_tags')
      .find({ orgId: req.auth.orgId, timestamp: { $gte: thirtyDaysAgo } })
      .toArray();

    const register = HAZARD_CATEGORIES.map((cat) => {
      const catTags = riskTags.filter((t) => t.hazardCategoryId === cat.id);
      const avgStrength = catTags.length > 0
        ? catTags.reduce((sum, t) => sum + t.signalStrength, 0) / catTags.length
        : 0;

      let riskLevel = 'low';
      if (avgStrength >= RISK_THRESHOLDS.high) riskLevel = 'critical';
      else if (avgStrength >= RISK_THRESHOLDS.medium) riskLevel = 'high';
      else if (avgStrength >= RISK_THRESHOLDS.low) riskLevel = 'medium';

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        signalCount: catTags.length,
        avgStrength: Math.round(avgStrength * 100) / 100,
        riskLevel,
        uniqueUsers: new Set(catTags.map((t) => t.userId)).size,
      };
    });

    res.json({ register, period: '30d' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch risk register' });
  }
});

// GET /api/executive/export/:format — Export compliance report
router.get('/export/:format', async (req, res) => {
  try {
    const { format } = req.params;
    if (!['csv', 'pdf'].includes(format)) {
      return res.status(400).json({ error: 'Supported formats: csv, pdf' });
    }

    const db = req.app.locals.db;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const checkins = await db.collection('checkins')
      .find({ completedAt: { $gte: thirtyDaysAgo } })
      .toArray();

    if (format === 'csv') {
      const header = 'Date,UserID,WHO5_Total,MoodLabel\n';
      const rows = checkins.map((c) =>
        `${c.completedAt.toISOString()},${c.userId},${c.who5?.total || ''},${c.moodLabel}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=thriveos-report.csv');
      res.send(header + rows);
    } else {
      // PDF placeholder - would use a PDF library in production
      res.json({ message: 'PDF export coming soon', checkinCount: checkins.length });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to export report' });
  }
});

module.exports = { executiveRoutes: router };
