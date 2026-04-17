const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');

// POST /api/social/kudos — Send kudos
router.post('/kudos', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      toUserId: Joi.string().required(),
      message: Joi.string().min(1).max(500).required(),
      category: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;

    // Verify target user exists
    const toUser = await db.collection('users').findOne({ _id: value.toUserId });
    if (!toUser) return res.status(404).json({ error: 'Recipient not found' });

    const result = await db.collection('kudos').insertOne({
      fromUserId: req.auth.userId,
      toUserId: value.toUserId,
      message: value.message,
      category: value.category,
      reactions: [],
      createdAt: new Date(),
    });

    res.status(201).json({ kudosId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send kudos' });
  }
});

// GET /api/social/kudos/feed — Kudos feed for user's team
router.get('/kudos/feed', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const kudos = await db.collection('kudos')
      .find({ $or: [{ fromUserId: req.auth.userId }, { toUserId: req.auth.userId }] })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ kudos });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch kudos feed' });
  }
});

// POST /api/social/kudos/:id/react — React to kudos
router.post('/kudos/:id/react', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      emoji: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const { ObjectId } = require('mongodb');

    await db.collection('kudos').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $push: { reactions: { userId: req.auth.userId, emoji: value.emoji, createdAt: new Date() } } }
    );

    res.json({ message: 'Reaction added' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// GET /api/social/teams/:id/mood — Team mood summary
router.get('/teams/:id/mood', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { MIN_GROUP_SIZE_FOR_DISPLAY } = require('../utils/constants');

    // Get team members
    const members = await db.collection('users')
      .find({ department: req.params.id, orgId: req.auth.orgId })
      .toArray();

    if (members.length < MIN_GROUP_SIZE_FOR_DISPLAY) {
      return res.json({ message: 'Insufficient team size for mood display', mood: null });
    }

    const memberIds = members.map((m) => m._id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentCheckins = await db.collection('checkins')
      .find({ userId: { $in: memberIds }, completedAt: { $gte: sevenDaysAgo } })
      .toArray();

    const moodCounts = { great: 0, good: 0, okay: 0, low: 0, struggling: 0 };
    recentCheckins.forEach((c) => {
      if (moodCounts[c.moodLabel] !== undefined) {
        moodCounts[c.moodLabel] += 1;
      }
    });

    const avgWho5 = recentCheckins.length > 0
      ? recentCheckins.reduce((sum, c) => sum + (c.who5?.total || 0), 0) / recentCheckins.length
      : 0;

    res.json({
      teamSize: members.length,
      checkinCount: recentCheckins.length,
      moodDistribution: moodCounts,
      averageWho5: Math.round(avgWho5 * 10) / 10,
      period: '7d',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team mood' });
  }
});

// GET /api/social/teams/:id/members — Team member list
router.get('/teams/:id/members', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const members = await db.collection('users')
      .find({ department: req.params.id, orgId: req.auth.orgId })
      .project({ firstName: 1, lastName: 1, role: 1 })
      .toArray();

    res.json({ members });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// GET /api/social/chat/:teamId/messages — Get chat messages
router.get('/chat/:teamId/messages', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : new Date();

    const messages = await db.collection('chat_messages')
      .find({ teamId: req.params.teamId, createdAt: { $lt: before } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({ messages: messages.reverse() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/social/chat/:teamId/messages — Send chat message
router.post('/chat/:teamId/messages', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      text: Joi.string().min(1).max(2000).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const result = await db.collection('chat_messages').insertOne({
      teamId: req.params.teamId,
      userId: req.auth.userId,
      text: value.text,
      createdAt: new Date(),
    });

    res.status(201).json({ messageId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/social/teams/:id/leaderboard — Top contributors by growth score
router.get('/teams/:id/leaderboard', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Aggregate kudos count + checkins in last 30 days per user
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const kudosAgg = await db.collection('kudos').aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$recipientId', kudosCount: { $sum: 1 } } },
      { $sort: { kudosCount: -1 } },
      { $limit: limit },
    ]).toArray();

    const userIds = kudosAgg.map((k) => k._id);
    const users = await db.collection('users').find({ _id: { $in: userIds } }).toArray();
    const userMap = new Map(users.map((u) => [u._id, u]));

    const entries = kudosAgg.map((k, idx) => {
      const u = userMap.get(k._id) || {};
      return {
        rank: idx + 1,
        userId: k._id,
        name: u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : 'Anonymous',
        score: k.kudosCount,
        department: u.department || null,
      };
    });

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = { socialRoutes: router };
