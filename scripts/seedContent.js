/**
 * Seed all content from ThriveOS_Content_Workbook_v2.xlsx into MongoDB
 * Run: node scripts/seedContent.js [path-to-xlsx]
 *
 * Uses upsert to avoid duplicates on re-run.
 */
const { MongoClient } = require('mongodb');
const XLSX = require('xlsx');
require('dotenv').config();

async function upsertMany(collection, docs, keyField) {
  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { [keyField]: doc[keyField] },
      update: { $set: doc },
      upsert: true,
    },
  }));
  if (ops.length === 0) return { upsertedCount: 0, modifiedCount: 0 };
  return collection.bulkWrite(ops);
}

async function seed() {
  const xlsxPath = process.argv[2] || '../ThriveOS_Content_Workbook_v2.xlsx';
  const workbook = XLSX.readFile(xlsxPath);
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('thriveos');

  // 1. Hazard Taxonomy (8 rows)
  const taxonomy = XLSX.utils.sheet_to_json(workbook.Sheets['Hazard Taxonomy']);
  const taxonomyDocs = taxonomy.map((row) => ({
    id: row.ID,
    name: row['Hazard Category'],
    description: row.Description,
    checkInFactors: row['Check-In Factors']?.split(', ') || [],
    sdtNeeds: row['SDT Need(s) Thwarted']?.split(', ') || [],
    whsHazards: row['WHS Hazards Covered']?.split('; ') || [],
    vicCategory: row['VIC Category Mapped'],
    updatedAt: new Date(),
  }));
  await upsertMany(db.collection('hazard_taxonomy'), taxonomyDocs, 'id');
  console.log(`Upserted ${taxonomy.length} hazard categories`);

  // 2. Micro-Lessons (144 rows)
  const lessons = XLSX.utils.sheet_to_json(workbook.Sheets['Micro-Lessons']);
  const lessonDocs = lessons.map((row, i) => ({
    contentId: row.ID,
    title: row['Lesson Title'] || row.Title || '',
    description: row['Key Insight (green card)'] || '',
    type: 'article',
    durationMinutes: parseInt(row.Duration) || 4,
    tier: row.Tier || 'Awareness',
    topic: row.Topic || '',
    primaryHazard: row['Primary Hazard'] || '',
    secondaryHazard: row['Secondary Hazard'] || '',
    severity: row.Severity || '',
    audience: row.Audience || 'All Employees',
    contentLayer: row['Content Layer'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    icon: row.Icon || '',
    iconColor: row['Icon Color'] || '',
    bulletSectionTitle: row['Bullet Section Title'] || '',
    bullet1Label: row['Bullet 1 Label'] || '',
    bullet1Body: row['Bullet 1 Body'] || '',
    bullet2Label: row['Bullet 2 Label'] || '',
    bullet2Body: row['Bullet 2 Body'] || '',
    bullet3Label: row['Bullet 3 Label'] || '',
    bullet3Body: row['Bullet 3 Body'] || '',
    tryThisToday: row['Try This Today'] || '',
    quickCheckQ1: row['Quick Check Q1'] || '',
    quickCheckQ2: row['Quick Check Q2'] || '',
    frameworkSource: row['Framework Source'] || '',
    audioScriptNotes: row['Audio Script Notes'] || '',
    illustrationDescription: row['Illustration Description'] || '',
    sortOrder: i,
    updatedAt: new Date(),
  }));
  await upsertMany(db.collection('content_lessons'), lessonDocs, 'contentId');
  console.log(`Upserted ${lessons.length} micro-lessons`);

  // 3. Scenarios (80 rows)
  const scenarios = XLSX.utils.sheet_to_json(workbook.Sheets['Scenarios']);
  const scenarioDocs = scenarios.map((row) => ({
    contentId: row.ID,
    title: row['Scenario Title'] || row.Title || '',
    description: row['Context Description'] || '',
    tier: row.Tier || 'Skill',
    topic: row.Topic || '',
    primaryHazard: row['Primary Hazard'] || '',
    secondaryHazard: row['Secondary Hazard'] || '',
    severity: row.Severity || '',
    audience: row.Audience || 'All Employees',
    contentLayer: row['Content Layer'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    hazardCategory: row['Primary Hazard'] || '',
    stakes: {
      red: row['Stake 1 (red)'] || '',
      orange: row['Stake 2 (orange)'] || '',
      green: row['Stake 3 (green)'] || '',
    },
    options: parseScenarioOptions(row),
    bestOption: row['Best Option'] || '',
    expertExplanation: row['Expert Analysis'] || '',
    frameworkSource: row['Framework Source'] || '',
    crowdData: row['Crowd Data (placeholder)'] || '',
    audioScriptNotes: row['Audio Script Notes'] || '',
    illustrationDescription: row['Illustration Description'] || '',
    updatedAt: new Date(),
  }));
  await upsertMany(db.collection('content_scenarios'), scenarioDocs, 'contentId');
  console.log(`Upserted ${scenarios.length} scenarios`);

  // 4. Reflections (48 rows)
  const reflections = XLSX.utils.sheet_to_json(workbook.Sheets['Reflections']);
  const reflectionDocs = reflections.map((row) => ({
    contentId: row.ID,
    title: row['Reflection Title'] || '',
    prompt: row['Prompt (displayed to user)'] || '',
    tier: row.Tier || '',
    topic: row.Topic || '',
    primaryHazard: row['Primary Hazard'] || '',
    secondaryHazard: row['Secondary Hazard'] || '',
    severity: row.Severity || '',
    audience: row.Audience || 'All Employees',
    contentLayer: row['Content Layer'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    hazardCategory: row['Primary Hazard'] || '',
    frameworkUsed: row['Framework Used'] || '',
    frameworkSteps: (row['Framework Steps (pipe-separated)'] || '').split('|').filter(Boolean),
    stepLabels: (row['Step Labels (pipe-separated)'] || '').split('|').filter(Boolean),
    stepQuestions: (row['Step Questions (pipe-separated)'] || '').split('|').filter(Boolean),
    stepColors: (row['Step Colors (pipe-separated)'] || '').split('|').filter(Boolean),
    journalCtaText: row['Journal CTA Text'] || '',
    privacyNote: row['Privacy Note'] || '',
    audioScriptNotes: row['Audio Script Notes'] || '',
    illustrationDescription: row['Illustration Description'] || '',
    updatedAt: new Date(),
  }));
  await upsertMany(db.collection('content_reflections'), reflectionDocs, 'contentId');
  console.log(`Upserted ${reflections.length} reflections`);

  // 5. Conversation Starters (80 rows)
  const starters = XLSX.utils.sheet_to_json(workbook.Sheets['Conversation Starters']);
  const starterDocs = starters.map((row) => ({
    contentId: row.ID,
    title: row.Title || '',
    primaryHazard: row['Primary Hazard'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    severity: row.Severity || '',
    triggerContext: row['Trigger Context'] || '',
    openingQuestion: row['Opening Question'] || '',
    autonomyTalkingPoint: row['Autonomy Talking Point'] || '',
    competenceTalkingPoint: row['Competence Talking Point'] || '',
    relatednessTalkingPoint: row['Relatedness Talking Point'] || '',
    doGuidance: row['Do (guidance)'] || '',
    doNotGuidance: row['Do Not (guidance)'] || '',
    markCompleteAction: row['Mark Complete Action'] || '',
    frameworkSource: row['Framework Source'] || '',
    hazardCategory: row['Primary Hazard'] || '',
    updatedAt: new Date(),
  }));
  await upsertMany(db.collection('conversation_starters'), starterDocs, 'contentId');
  console.log(`Upserted ${starters.length} conversation starters`);

  // 6. Kudos Categories (10 rows)
  const kudos = XLSX.utils.sheet_to_json(workbook.Sheets['Kudos Categories']);
  if (kudos.length > 0) {
    const kudosDocs = kudos.map((row) => ({
      name: row.Category || row.Name || '',
      description: row.Description || '',
      sdtDimension: row['SDT Dimension'] || '',
      mappedHazards: row['Mapped Hazard(s)'] || '',
      icon: row.Icon || '',
      colorToken: row['Color Token'] || '',
      exampleMessage: row['Example Message'] || '',
      updatedAt: new Date(),
    }));
    await upsertMany(db.collection('kudos_categories'), kudosDocs, 'name');
    console.log(`Upserted ${kudos.length} kudos categories`);
  }

  // 7. Lived-Experience Content (101 rows)
  const lived = XLSX.utils.sheet_to_json(workbook.Sheets['Lived-Experience Content']);
  if (lived.length > 0) {
    const livedDocs = lived.map((row) => ({
      contentId: row.ID,
      title: row.Title || '',
      hazardCategory: row['Hazard Category'] || '',
      severity: row.Severity || '',
      contentType: row['Content Type'] || '',
      contentLayer: row['Content Layer'] || '',
      description: row.Description || '',
      sdtNeedAddressed: row['SDT Need Addressed'] || '',
      updatedAt: new Date(),
    }));
    await upsertMany(db.collection('lived_experience'), livedDocs, 'contentId');
    console.log(`Upserted ${lived.length} lived-experience stories`);
  }

  // 8. Daily Quotes (120 rows)
  const quotes = XLSX.utils.sheet_to_json(workbook.Sheets['Daily Quotes']);
  if (quotes.length > 0) {
    const quoteDocs = quotes.map((row) => ({
      contentId: row.ID,
      text: row['Quote Text'] || '',
      author: row.Attribution || '',
      topicTag: row['Topic Tag'] || '',
      primaryHazard: row['Primary Hazard'] || '',
      displayStyle: row['Display Style'] || '',
      updatedAt: new Date(),
    }));
    await upsertMany(db.collection('daily_quotes'), quoteDocs, 'contentId');
    console.log(`Upserted ${quotes.length} daily quotes`);
  }

  // 9. Quick Tools (20 rows)
  const tools = XLSX.utils.sheet_to_json(workbook.Sheets['Quick Tools']);
  if (tools.length > 0) {
    const toolDocs = tools.map((row) => ({
      contentId: row.ID,
      title: row['Tool Name'] || row.Title || '',
      topic: row.Topic || '',
      toolType: row['Tool Type'] || '',
      primaryHazard: row['Primary Hazard'] || '',
      hazardCategory: row['Primary Hazard'] || '',
      description: row.Description || '',
      content: row['Content (markdown-formatted)'] || '',
      frameworkSource: row['Framework Source'] || '',
      durationMinutes: 2,
      updatedAt: new Date(),
    }));
    await upsertMany(db.collection('quick_tools'), toolDocs, 'contentId');
    console.log(`Upserted ${tools.length} quick tools`);
  }

  await client.close();
  console.log('Content seeding complete!');
}

function parseScenarioOptions(row) {
  const labels = ['A', 'B', 'C'];
  return labels
    .filter((label) => row[`Option ${label} Text`])
    .map((label) => ({
      id: `opt${label}`,
      label: row[`Option ${label} Label`] || '',
      style: row[`Option ${label} Style`] || '',
      text: row[`Option ${label} Text`] || '',
      isOptimal: (row['Best Option'] || '').includes(label),
    }));
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
