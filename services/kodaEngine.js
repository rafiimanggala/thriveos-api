const { HAZARD_CATEGORIES } = require('../utils/hazardMapping');

/**
 * Koda Engine: Analyse last 5 check-ins to determine:
 *   1. Focus area (most frequent orange hazard category)
 *   2. Today's picks (content matching focus area)
 *   3. Strengths (consistently green factors)
 */
async function analyseCheckins(db, userId) {
  const checkins = await db.collection('checkins')
    .find({ userId })
    .sort({ completedAt: -1 })
    .limit(5)
    .toArray();

  if (checkins.length === 0) {
    return {
      focusArea: null,
      todaysPicks: await getDefaultPicks(db),
      strengths: [],
      message: 'Complete your first check-in to get personalised recommendations',
    };
  }

  const focusArea = determineFocusArea(checkins);
  const strengths = determineStrengths(checkins);
  const todaysPicks = await getTodaysPicks(db, focusArea, userId);

  return {
    focusArea,
    todaysPicks,
    strengths,
    checkinCount: checkins.length,
    latestMood: checkins[0]?.moodLabel,
  };
}

/**
 * Count orange factors across recent check-ins.
 * Most frequent hazard category = focus area.
 */
function determineFocusArea(checkins) {
  const categoryCounts = {};

  checkins.forEach((checkin) => {
    (checkin.factorsSelected || [])
      .filter((f) => f.state === 'orange')
      .forEach((f) => {
        const catId = f.hazardCategoryId;
        categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
      });
  });

  if (Object.keys(categoryCounts).length === 0) return null;

  const topCategoryId = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)[0][0];

  const category = HAZARD_CATEGORIES.find((c) => c.id === topCategoryId);

  return {
    categoryId: topCategoryId,
    categoryName: category?.name || topCategoryId,
    occurrences: categoryCounts[topCategoryId],
    totalCheckins: checkins.length,
  };
}

/**
 * Factors that are consistently green across check-ins.
 */
function determineStrengths(checkins) {
  const factorGreenCount = {};
  const factorTotalCount = {};

  checkins.forEach((checkin) => {
    (checkin.factorsSelected || []).forEach((f) => {
      factorTotalCount[f.id] = (factorTotalCount[f.id] || 0) + 1;
      if (f.state === 'green') {
        factorGreenCount[f.id] = (factorGreenCount[f.id] || 0) + 1;
      }
    });
  });

  return Object.entries(factorGreenCount)
    .filter(([id]) => {
      const total = factorTotalCount[id] || 0;
      const green = factorGreenCount[id] || 0;
      return total >= 3 && green / total >= 0.8;
    })
    .map(([id, count]) => ({
      factorId: id,
      greenRate: Math.round((count / factorTotalCount[id]) * 100),
    }));
}

/**
 * Get content picks matching focus area.
 * Mix: 2 lessons + 1 scenario + 1 reflection + 1 quick tool.
 */
async function getTodaysPicks(db, focusArea, userId) {
  if (!focusArea) return getDefaultPicks(db);

  const catId = focusArea.categoryId;

  // Get completed lesson IDs to exclude
  const completed = await db.collection('lesson_progress')
    .find({ userId })
    .project({ lessonId: 1 })
    .toArray();
  const completedIds = new Set(completed.map((p) => p.lessonId));

  const [lessons, scenarios, reflections, tools] = await Promise.all([
    db.collection('content_lessons')
      .find({ primaryHazard: catId })
      .sort({ sortOrder: 1 })
      .limit(10)
      .toArray(),
    db.collection('content_scenarios')
      .find({ hazardCategory: catId })
      .limit(3)
      .toArray(),
    db.collection('content_reflections')
      .find({ hazardCategory: catId })
      .limit(3)
      .toArray(),
    db.collection('quick_tools')
      .find({ hazardCategory: catId })
      .limit(3)
      .toArray(),
  ]);

  // Filter out completed lessons
  const uncompletedLessons = lessons.filter((l) => !completedIds.has(l._id.toString()));

  const picks = [
    ...uncompletedLessons.slice(0, 2).map((l) => ({
      type: 'lesson',
      id: l._id.toString(),
      title: l.title,
      description: l.description,
      durationMinutes: l.durationMinutes,
    })),
    ...scenarios.slice(0, 1).map((s) => ({
      type: 'scenario',
      id: s._id.toString(),
      title: s.title,
      description: s.description || s.context,
    })),
    ...reflections.slice(0, 1).map((r) => ({
      type: 'reflection',
      id: r._id.toString(),
      title: r.prompt,
    })),
    ...tools.slice(0, 1).map((t) => ({
      type: 'quick_tool',
      id: t._id.toString(),
      title: t.title,
      description: t.description,
      durationMinutes: t.durationMinutes,
    })),
  ];

  return picks;
}

async function getDefaultPicks(db) {
  const lessons = await db.collection('content_lessons')
    .find({})
    .sort({ sortOrder: 1 })
    .limit(3)
    .toArray();

  return lessons.map((l) => ({
    type: 'lesson',
    id: l._id.toString(),
    title: l.title,
    description: l.description,
    durationMinutes: l.durationMinutes,
  }));
}

module.exports = { analyseCheckins };
