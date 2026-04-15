const HAZARD_CATEGORIES = [
  { id: 'H1', name: 'Job Demands', factors: ['f1', 'f2', 'f3'] },
  { id: 'H2', name: 'Low Job Control', factors: ['f4', 'f5', 'f6'] },
  { id: 'H3', name: 'Poor Support', factors: ['f7', 'f8', 'f9'] },
  { id: 'H4', name: 'Low Role Clarity', factors: ['f10', 'f11'] },
  { id: 'H5', name: 'Poor Change Mgmt', factors: ['f12', 'f13'] },
  { id: 'H6', name: 'Low Recognition', factors: ['f14', 'f15'] },
  { id: 'H7', name: 'Poor Org Justice', factors: ['f16', 'f17'] },
  { id: 'H8', name: 'Workplace Relationships', factors: ['f18', 'f19', 'f20', 'f21'] },
];

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

module.exports = { HAZARD_CATEGORIES, mapWHO5ToRiskSignals, mapFactorsToRiskSignals, getCategoryById };
