module.exports = {
  ROLES: ['employee', 'manager', 'executive', 'admin'],
  WHO5_CONCERN_THRESHOLD: 13,
  MIN_GROUP_SIZE_FOR_DISPLAY: 5,
  RISK_LEVELS: ['low', 'medium', 'high', 'critical'],
  RISK_THRESHOLDS: { low: 0.25, medium: 0.5, high: 0.75 },
  GROWTH_SCORE_WEIGHTS: {
    checkinConsistency: 0.30,
    learningProgress: 0.25,
    who5Trend: 0.20,
    socialEngagement: 0.15,
    reflectionDepth: 0.10,
  },
};
