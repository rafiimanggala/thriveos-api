const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { authenticateUser } = require('../middleware/authMiddleware');

// GET /api/content/topics — List all topics
router.get('/topics', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const topics = await db.collection('hazard_taxonomy').find({}).toArray();
    res.json({ topics });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// GET /api/content/topics/:id — Topic detail with lessons
router.get('/topics/:id', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const topicId = req.params.id;
    const topic = await db.collection('hazard_taxonomy').findOne({ id: topicId });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    // Primary query by primaryHazard; fallback to topicId or category
    let lessons = await db.collection('content_lessons')
      .find({ primaryHazard: topicId })
      .sort({ sortOrder: 1 })
      .toArray();

    if (!lessons.length) {
      lessons = await db.collection('content_lessons')
        .find({ $or: [{ topicId }, { category: topicId }] })
        .sort({ sortOrder: 1 })
        .toArray();
    }

    // Get user progress for these lessons
    const lessonIds = lessons.map((l) => l._id.toString());
    const progress = await db.collection('lesson_progress')
      .find({ userId: req.auth.userId, lessonId: { $in: lessonIds } })
      .toArray();

    const progressMap = new Map(progress.map((p) => [p.lessonId, p]));

    res.json({
      topic: {
        ...topic,
        id: topic.id,
        title: topic.title || topic.name,
        description: topic.description || topic.summary || '',
      },
      lessons: lessons.map((l) => ({
        ...l,
        id: l._id.toString(),
        title: l.title || l.name,
        durationMin: l.durationMin ?? l.durationMinutes ?? l.duration_minutes ?? 0,
        completed: progressMap.has(l._id.toString()),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch topic' });
  }
});

// GET /api/content/lessons/:id — Single lesson
router.get('/lessons/:id', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { ObjectId } = require('mongodb');
    const lesson = await db.collection('content_lessons').findOne({ _id: new ObjectId(req.params.id) });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ lesson });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// POST /api/content/lessons/:id/progress — Mark lesson complete
router.post('/lessons/:id/progress', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { ObjectId } = require('mongodb');

    const lesson = await db.collection('content_lessons').findOne({ _id: new ObjectId(req.params.id) });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    await db.collection('lesson_progress').updateOne(
      { userId: req.auth.userId, lessonId: req.params.id },
      {
        $set: {
          userId: req.auth.userId,
          orgId: req.auth.orgId,
          lessonId: req.params.id,
          lessonTitle: lesson.title,
          completedAt: new Date(),
        },
      },
      { upsert: true }
    );

    res.json({ message: 'Progress saved' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// GET /api/content/scenarios — List scenarios
router.get('/scenarios', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { hazardCategory } = req.query;

    const filter = hazardCategory ? { hazardCategory } : {};
    const scenarios = await db.collection('content_scenarios')
      .find(filter)
      .toArray();

    res.json({ scenarios });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

// POST /api/content/scenarios/:id/respond — Submit scenario response
router.post('/scenarios/:id/respond', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      selectedOptionId: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const { ObjectId } = require('mongodb');

    const scenario = await db.collection('content_scenarios').findOne({ _id: new ObjectId(req.params.id) });
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const selectedOption = (scenario.options || []).find((o) => o.id === value.selectedOptionId);

    await db.collection('scenario_responses').insertOne({
      userId: req.auth.userId,
      orgId: req.auth.orgId,
      scenarioId: req.params.id,
      selectedOptionId: value.selectedOptionId,
      isOptimal: selectedOption?.isOptimal || false,
      createdAt: new Date(),
    });

    res.json({
      isOptimal: selectedOption?.isOptimal || false,
      feedback: selectedOption?.feedback || '',
      expertExplanation: scenario.expertExplanation || '',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// POST /api/content/reflections — Submit a reflection
router.post('/reflections', authenticateUser, async (req, res) => {
  try {
    const schema = Joi.object({
      promptId: Joi.string().required(),
      response: Joi.string().min(1).max(2000).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const db = req.app.locals.db;
    const result = await db.collection('reflections').insertOne({
      userId: req.auth.userId,
      orgId: req.auth.orgId,
      promptId: value.promptId,
      response: value.response,
      createdAt: new Date(),
    });

    res.status(201).json({ reflectionId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save reflection' });
  }
});

// GET /api/content/lived-experience — List lived experience stories (paginated)
router.get('/lived-experience', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.hazardCategory) filter.hazardCategory = req.query.hazardCategory;

    const [stories, total] = await Promise.all([
      db.collection('lived_experience')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('lived_experience').countDocuments(filter),
    ]);

    res.json({ stories, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lived experience stories' });
  }
});

// GET /api/content/daily-quotes — Get daily quote(s)
router.get('/daily-quotes', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;

    // Use date-based seed for consistent daily quote
    const today = new Date().toISOString().split('T')[0];
    const dateSeed = today.replace(/-/g, '');
    const total = await db.collection('daily_quotes').countDocuments();

    if (total === 0) return res.json({ quote: null });

    const index = parseInt(dateSeed, 10) % total;
    const quote = await db.collection('daily_quotes')
      .find({})
      .skip(index)
      .limit(1)
      .toArray();

    res.json({ quote: quote[0] || null, date: today });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily quote' });
  }
});

// GET /api/content/quick-tools — List quick intervention tools
router.get('/quick-tools', authenticateUser, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const filter = {};
    if (req.query.hazardCategory) filter.hazardCategory = req.query.hazardCategory;

    const tools = await db.collection('quick_tools')
      .find(filter)
      .sort({ title: 1 })
      .toArray();

    res.json({ tools });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quick tools' });
  }
});

// GET /api/content/koda — Koda AI recommendations
router.get('/koda', authenticateUser, async (req, res) => {
  try {
    const { analyseCheckins } = require('../services/kodaEngine');
    const db = req.app.locals.db;
    const result = await analyseCheckins(db, req.auth.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get Koda recommendations' });
  }
});

module.exports = { contentRoutes: router };
