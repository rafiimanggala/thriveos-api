const { HAZARD_CATEGORIES } = require('../utils/hazardMapping');
const { getMoodLabel, RISK_THRESHOLDS } = require('../utils/constants');

/**
 * Generate a CSV string from data rows and column definitions.
 *
 * @param {Object[]} data - Array of row objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 * @returns {string} CSV content
 */
function generateCSVReport(data, columns) {
  if (!columns || columns.length === 0) {
    throw new Error('Columns required for CSV generation');
  }

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escapeCSV(c.label)).join(',');
  const rows = data.map((row) =>
    columns.map((c) => escapeCSV(row[c.key])).join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Generate a full compliance CSV report for an organisation.
 *
 * Includes: checkin summary, risk register, participation stats.
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} orgId - Organisation ID
 * @returns {Promise<string>} CSV content
 */
async function generateComplianceCSV(db, orgId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [checkins, riskTags, users] = await Promise.all([
    db.collection('checkins')
      .find({ completedAt: { $gte: thirtyDaysAgo } })
      .sort({ completedAt: -1 })
      .toArray(),
    db.collection('checkin_risk_tags')
      .find({ orgId, timestamp: { $gte: thirtyDaysAgo } })
      .toArray(),
    db.collection('users')
      .find({ orgId })
      .project({ _id: 1, department: 1 })
      .toArray(),
  ]);

  // Build checkin rows
  const checkinRows = checkins.map((c) => ({
    date: c.completedAt ? c.completedAt.toISOString().split('T')[0] : '',
    time: c.completedAt ? c.completedAt.toISOString().split('T')[1]?.slice(0, 8) : '',
    userId: c.userId || '',
    who5Total: c.who5?.total ?? '',
    moodLabel: c.moodLabel || (c.who5?.total != null ? getMoodLabel(c.who5.total) : ''),
    orangeFactors: (c.factorsSelected || []).filter((f) => f.state === 'orange').length,
    greenFactors: (c.factorsSelected || []).filter((f) => f.state === 'green').length,
  }));

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'time', label: 'Time' },
    { key: 'userId', label: 'User ID' },
    { key: 'who5Total', label: 'WHO-5 Score' },
    { key: 'moodLabel', label: 'Mood Label' },
    { key: 'orangeFactors', label: 'Orange Factors' },
    { key: 'greenFactors', label: 'Green Factors' },
  ];

  const checkinCSV = generateCSVReport(checkinRows, columns);

  // Risk register summary section
  const riskSummary = HAZARD_CATEGORIES.map((cat) => {
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

  const riskColumns = [
    { key: 'categoryId', label: 'Hazard ID' },
    { key: 'categoryName', label: 'Hazard Category' },
    { key: 'signalCount', label: 'Signal Count' },
    { key: 'avgStrength', label: 'Avg Strength' },
    { key: 'riskLevel', label: 'Risk Level' },
    { key: 'uniqueUsers', label: 'Affected Users' },
  ];

  const riskCSV = generateCSVReport(riskSummary, riskColumns);

  // Participation summary
  const totalUsers = users.length;
  const activeUserIds = new Set(checkins.map((c) => c.userId));
  const participationRate = totalUsers > 0
    ? Math.round((activeUserIds.size / totalUsers) * 100)
    : 0;

  const summaryLines = [
    `\nThriveOS Compliance Report — ${new Date().toISOString().split('T')[0]}`,
    `Period: Last 30 days`,
    `Total Users: ${totalUsers}`,
    `Active Users: ${activeUserIds.size}`,
    `Participation Rate: ${participationRate}%`,
    `Total Check-ins: ${checkins.length}`,
    '',
    'RISK REGISTER',
    riskCSV,
    '',
    'CHECK-IN DETAIL',
    checkinCSV,
  ];

  return summaryLines.join('\n');
}

module.exports = { generateCSVReport, generateComplianceCSV };
