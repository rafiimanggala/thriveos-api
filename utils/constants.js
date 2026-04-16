// WHO-5 score thresholds (0-25 scale)
const WHO5_THRESHOLDS = {
  struggling: 8,
  low: 13,
  okay: 17,
  good: 21,
  great: 25,
};

// Mood labels mapped to WHO-5 score ranges
const MOOD_LABELS = {
  struggling: { min: 0, max: 8, label: 'Struggling', description: 'Significant wellbeing concerns' },
  low: { min: 9, max: 13, label: 'Low', description: 'Below average wellbeing' },
  okay: { min: 14, max: 17, label: 'Okay', description: 'Moderate wellbeing' },
  good: { min: 18, max: 21, label: 'Good', description: 'Above average wellbeing' },
  great: { min: 22, max: 25, label: 'Great', description: 'Excellent wellbeing' },
};

const ROLES = ['employee', 'manager', 'executive', 'admin'];

const WHO5_CONCERN_THRESHOLD = 13;

const MIN_GROUP_SIZE_FOR_DISPLAY = 5;

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

const RISK_THRESHOLDS = { low: 0.25, medium: 0.5, high: 0.75 };

const GROWTH_SCORE_WEIGHTS = {
  checkinConsistency: 0.30,
  learningProgress: 0.25,
  who5Trend: 0.20,
  socialEngagement: 0.15,
  reflectionDepth: 0.10,
};

/**
 * Derive mood label from WHO-5 total score.
 * @param {number} total - WHO-5 sum (0-25)
 * @returns {string} mood label key
 */
function getMoodLabel(total) {
  if (total <= WHO5_THRESHOLDS.struggling) return 'struggling';
  if (total <= WHO5_THRESHOLDS.low) return 'low';
  if (total <= WHO5_THRESHOLDS.okay) return 'okay';
  if (total <= WHO5_THRESHOLDS.good) return 'good';
  return 'great';
}

module.exports = {
  WHO5_THRESHOLDS,
  MOOD_LABELS,
  ROLES,
  WHO5_CONCERN_THRESHOLD,
  MIN_GROUP_SIZE_FOR_DISPLAY,
  RISK_LEVELS,
  RISK_THRESHOLDS,
  GROWTH_SCORE_WEIGHTS,
  getMoodLabel,
};
