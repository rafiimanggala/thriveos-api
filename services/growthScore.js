const { GROWTH_SCORE_WEIGHTS } = require('../utils/constants');

/**
 * Calculate 5-component weighted growth score.
 * Components:
 *   - checkinConsistency (30%): days checked in / 30
 *   - learningProgress (25%): lessons completed / 10
 *   - who5Trend (20%): average WHO-5 / 25
 *   - socialEngagement (15%): kudos sent / 5
 *   - reflectionDepth (10%): reflections written / 5
 *
 * Each component capped at 100. Final score 0-100.
 */
async function calculateGrowthScore(db, userId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [checkins, progress, kudos, reflections] = await Promise.all([
    db.collection('checkins').find({ userId, completedAt: { $gte: thirtyDaysAgo } }).toArray(),
    db.collection('lesson_progress').find({ userId, completedAt: { $gte: thirtyDaysAgo } }).toArray(),
    db.collection('kudos').find({ fromUserId: userId, createdAt: { $gte: thirtyDaysAgo } }).toArray(),
    db.collection('reflections').find({ userId, createdAt: { $gte: thirtyDaysAgo } }).toArray(),
  ]);

  const components = computeComponents(checkins, progress, kudos, reflections);
  const totalScore = computeTotal(components);

  return {
    totalScore,
    components,
    period: '30d',
    sdtSubScores: computeSDTSubScores(checkins, progress, kudos, reflections),
  };
}

function computeComponents(checkins, progress, kudos, reflections) {
  const checkinDays = new Set(checkins.map((c) => c.completedAt.toISOString().split('T')[0])).size;
  const checkinConsistency = Math.min((checkinDays / 30) * 100, 100);

  const learningProgress = Math.min((progress.length / 10) * 100, 100);

  const avgWho5 = checkins.length > 0
    ? checkins.reduce((sum, c) => sum + (c.who5?.total || 0), 0) / checkins.length
    : 0;
  const who5Trend = (avgWho5 / 25) * 100;

  const socialEngagement = Math.min((kudos.length / 5) * 100, 100);
  const reflectionDepth = Math.min((reflections.length / 5) * 100, 100);

  return {
    checkinConsistency: Math.round(checkinConsistency),
    learningProgress: Math.round(learningProgress),
    who5Trend: Math.round(who5Trend),
    socialEngagement: Math.round(socialEngagement),
    reflectionDepth: Math.round(reflectionDepth),
  };
}

function computeTotal(components) {
  return Math.round(
    components.checkinConsistency * GROWTH_SCORE_WEIGHTS.checkinConsistency +
    components.learningProgress * GROWTH_SCORE_WEIGHTS.learningProgress +
    components.who5Trend * GROWTH_SCORE_WEIGHTS.who5Trend +
    components.socialEngagement * GROWTH_SCORE_WEIGHTS.socialEngagement +
    components.reflectionDepth * GROWTH_SCORE_WEIGHTS.reflectionDepth
  );
}

/**
 * Self-Determination Theory sub-scores:
 *   - Autonomy: checkin consistency + learning choice
 *   - Competence: learning progress + scenario accuracy
 *   - Relatedness: social engagement + reflections
 */
function computeSDTSubScores(checkins, progress, kudos, reflections) {
  const checkinDays = new Set(checkins.map((c) => c.completedAt.toISOString().split('T')[0])).size;

  const autonomy = Math.round(Math.min(((checkinDays / 30) * 50 + (progress.length / 10) * 50), 100));
  const competence = Math.round(Math.min((progress.length / 10) * 100, 100));
  const relatedness = Math.round(Math.min(((kudos.length / 5) * 60 + (reflections.length / 5) * 40), 100));

  return { autonomy, competence, relatedness };
}

module.exports = { calculateGrowthScore };
