const HAZARD_CATEGORIES = [
  {
    id: 'H1',
    name: 'Job Demands',
    description: 'Workload, time pressure, emotional demands, role overload',
    factors: ['f1', 'f2', 'f3'],
  },
  {
    id: 'H2',
    name: 'Low Job Control',
    description: 'Limited decision-making authority, lack of autonomy over tasks and schedule',
    factors: ['f4', 'f5', 'f6'],
  },
  {
    id: 'H3',
    name: 'Poor Support',
    description: 'Insufficient support from managers, peers, or the organisation',
    factors: ['f7', 'f8', 'f9'],
  },
  {
    id: 'H4',
    name: 'Low Role Clarity',
    description: 'Unclear responsibilities, conflicting expectations, ambiguous reporting lines',
    factors: ['f10', 'f11'],
  },
  {
    id: 'H5',
    name: 'Poor Change Mgmt',
    description: 'Poorly communicated organisational change, lack of consultation',
    factors: ['f12', 'f13'],
  },
  {
    id: 'H6',
    name: 'Low Recognition',
    description: 'Lack of acknowledgement, unfair reward distribution, undervalued contributions',
    factors: ['f14', 'f15'],
  },
  {
    id: 'H7',
    name: 'Poor Org Justice',
    description: 'Perceived unfairness in processes, decisions, or resource allocation',
    factors: ['f16', 'f17'],
  },
  {
    id: 'H8',
    name: 'Workplace Relationships',
    description: 'Conflict, bullying, harassment, isolation, poor team dynamics',
    factors: ['f18', 'f19', 'f20', 'f21'],
  },
];

// Factor ID -> hazard category lookup
const FACTOR_TO_CATEGORY = {};
HAZARD_CATEGORIES.forEach((cat) => {
  cat.factors.forEach((f) => {
    FACTOR_TO_CATEGORY[f] = cat.id;
  });
});

// WHO-5 question -> hazard mapping
function mapWHO5ToRiskSignals(who5) {
  const signals = [];
  if (who5.q1 <= 2) signals.push({ hazardCategoryId: 'H1', signalStrength: 0.6, source: 'who5_q1' });
  if (who5.q2 <= 2) signals.push({ hazardCategoryId: 'H3', signalStrength: 0.4, source: 'who5_q2' });
  if (who5.q3 <= 2) signals.push({ hazardCategoryId: 'H1', signalStrength: 0.5, source: 'who5_q3' });
  if (who5.q4 <= 2) signals.push({ hazardCategoryId: 'H3', signalStrength: 0.3, source: 'who5_q4' });
  if (who5.q5 <= 2) signals.push({ hazardCategoryId: 'H2', signalStrength: 0.4, source: 'who5_q5' });
  if (who5.total <= 13) signals.push({ hazardCategoryId: 'ALL', signalStrength: 0.8, source: 'who5_total' });
  return signals;
}

// Factor selection -> hazard mapping
function mapFactorsToRiskSignals(factors) {
  return factors
    .filter((f) => f.state === 'orange')
    .map((f) => ({
      hazardCategoryId: f.hazardCategoryId,
      signalStrength: 0.6,
      source: `factor_${f.id}`,
    }));
}

function getCategoryById(id) {
  return HAZARD_CATEGORIES.find((c) => c.id === id);
}

module.exports = {
  HAZARD_CATEGORIES,
  FACTOR_TO_CATEGORY,
  mapWHO5ToRiskSignals,
  mapFactorsToRiskSignals,
  getCategoryById,
};
