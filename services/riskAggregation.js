const { HAZARD_CATEGORIES } = require('../utils/hazardMapping');
const { MIN_GROUP_SIZE_FOR_DISPLAY, RISK_THRESHOLDS } = require('../utils/constants');

/**
 * Time-weighted rolling average for risk signals.
 * Recent signals weighted more heavily (exponential decay).
 */
function timeWeightedAverage(signals, decayDays = 30) {
  if (signals.length === 0) return 0;

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  signals.forEach((s) => {
    const ageMs = now - new Date(s.timestamp).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-ageDays / decayDays);
    weightedSum += s.signalStrength * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Aggregate team-level risk from individual check-in risk tags.
 * Enforces min 5 members privacy rule.
 */
async function aggregateTeamRisk(db, managerId, orgId) {
  const manager = await db.collection('users').findOne({ _id: managerId });
  if (!manager?.department) return { riskCategories: [], message: 'No department assigned' };

  const members = await db.collection('users')
    .find({ department: manager.department, orgId })
    .toArray();

  if (members.length < MIN_GROUP_SIZE_FOR_DISPLAY) {
    return { riskCategories: [], message: 'Insufficient team size for risk display' };
  }

  const memberIds = members.map((m) => m._id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const signals = await db.collection('checkin_risk_tags')
    .find({
      userId: { $in: memberIds },
      timestamp: { $gte: thirtyDaysAgo },
    })
    .toArray();

  const riskCategories = HAZARD_CATEGORIES.map((cat) => {
    const catSignals = signals.filter((s) => s.hazardCategoryId === cat.id);
    const avgScore = timeWeightedAverage(catSignals);

    let riskLevel = 'low';
    if (avgScore >= RISK_THRESHOLDS.high) riskLevel = 'critical';
    else if (avgScore >= RISK_THRESHOLDS.medium) riskLevel = 'high';
    else if (avgScore >= RISK_THRESHOLDS.low) riskLevel = 'medium';

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      riskLevel,
      score: Math.round(avgScore * 100) / 100,
      signalCount: catSignals.length,
      uniqueContributors: new Set(catSignals.map((s) => s.userId)).size,
    };
  });

  return {
    teamSize: members.length,
    riskCategories: riskCategories.sort((a, b) => b.score - a.score),
    period: '30d',
  };
}

/**
 * Org-wide risk aggregation for executive view.
 */
async function aggregateOrgRisk(db, orgId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const signals = await db.collection('checkin_risk_tags')
    .find({ orgId, timestamp: { $gte: thirtyDaysAgo } })
    .toArray();

  return HAZARD_CATEGORIES.map((cat) => {
    const catSignals = signals.filter((s) => s.hazardCategoryId === cat.id);
    const avgScore = timeWeightedAverage(catSignals);

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      score: Math.round(avgScore * 100) / 100,
      signalCount: catSignals.length,
    };
  });
}

module.exports = { aggregateTeamRisk, aggregateOrgRisk, timeWeightedAverage };
