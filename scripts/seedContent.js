/**
 * Seed all content from ThriveOS_Content_Workbook_v2.xlsx into MongoDB
 * Run: node scripts/seedContent.js <path-to-xlsx>
 */
const { MongoClient } = require('mongodb');
const XLSX = require('xlsx');
require('dotenv').config();

async function seed() {
  const xlsxPath = process.argv[2] || '../ThriveOS_Content_Workbook_v2.xlsx';
  const workbook = XLSX.readFile(xlsxPath);
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('thriveos');

  // 1. Hazard Taxonomy (8 rows)
  const taxonomy = XLSX.utils.sheet_to_json(workbook.Sheets['Hazard Taxonomy']);
  await db.collection('hazard_taxonomy').deleteMany({});
  await db.collection('hazard_taxonomy').insertMany(taxonomy.map((row) => ({
    id: row.ID,
    name: row['Hazard Category'],
    description: row.Description,
    checkInFactors: row['Check-In Factors']?.split(', ') || [],
    sdtNeeds: row['SDT Need(s) Thwarted']?.split(', ') || [],
    whsHazards: row['WHS Hazards Covered']?.split('; ') || [],
    vicCategory: row['VIC Category Mapped'],
    createdAt: new Date(),
  })));
  console.log(`Seeded ${taxonomy.length} hazard categories`);

  // 2. Micro-Lessons (144 rows)
  const lessons = XLSX.utils.sheet_to_json(workbook.Sheets['Micro-Lessons']);
  await db.collection('content_lessons').deleteMany({});
  await db.collection('content_lessons').insertMany(lessons.map((row, i) => ({
    title: row.Title || row['Lesson Title'],
    description: row.Description || row['Short Description'] || '',
    type: (row.Format || 'article').toLowerCase(),
    durationMinutes: parseInt(row['Duration (min)']) || 4,
    tier: row.Tier || 'Awareness',
    contentBody: row['Lesson Body'] || row.Content || '',
    keyTakeaways: (row['Key Takeaways'] || '').split('\n').filter(Boolean),
    primaryHazard: row['Primary Hazard'] || row['Hazard Category'] || '',
    secondaryHazard: row['Secondary Hazard'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    audience: row.Audience || 'All Employees',
    category: row.Category || '',
    sortOrder: i,
    createdAt: new Date(),
  })));
  console.log(`Seeded ${lessons.length} micro-lessons`);

  // 3. Scenarios (72 rows)
  const scenarios = XLSX.utils.sheet_to_json(workbook.Sheets['Scenarios']);
  await db.collection('content_scenarios').deleteMany({});
  await db.collection('content_scenarios').insertMany(scenarios.map((row) => ({
    title: row.Title || row['Scenario Title'],
    description: row.Description || '',
    context: row.Context || row['Setup/Context'] || '',
    options: parseScenarioOptions(row),
    expertExplanation: row['Expert Explanation'] || row['Debrief'] || '',
    hazardCategory: row['Hazard Category'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    tier: row.Tier || 'Skill',
    createdAt: new Date(),
  })));
  console.log(`Seeded ${scenarios.length} scenarios`);

  // 4. Reflections (48 rows)
  const reflections = XLSX.utils.sheet_to_json(workbook.Sheets['Reflections']);
  await db.collection('content_reflections').deleteMany({});
  await db.collection('content_reflections').insertMany(reflections.map((row) => ({
    prompt: row.Prompt || row['Reflection Prompt'],
    guidance: row.Guidance || row['Follow-Up Guidance'] || '',
    hazardCategory: row['Hazard Category'] || '',
    sdtDimension: row['SDT Dimension'] || '',
    createdAt: new Date(),
  })));
  console.log(`Seeded ${reflections.length} reflections`);

  // 5. Conversation Starters (80 rows)
  const starters = XLSX.utils.sheet_to_json(workbook.Sheets['Conversation Starters']);
  await db.collection('conversation_starters').deleteMany({});
  await db.collection('conversation_starters').insertMany(starters.map((row) => ({
    title: row.Title || row['Starter Title'],
    hazardCategory: row['Hazard Category'] || '',
    openingQuestion: row['Opening Question'] || '',
    talkingPoints: (row['Talking Points'] || '').split('\n').filter(Boolean),
    dos: (row["Do's"] || row.Dos || '').split('\n').filter(Boolean),
    donts: (row["Don'ts"] || row.Donts || '').split('\n').filter(Boolean),
    sdtDimension: row['SDT Dimension'] || '',
    createdAt: new Date(),
  })));
  console.log(`Seeded ${starters.length} conversation starters`);

  // 6. Kudos Categories
  const kudos = XLSX.utils.sheet_to_json(workbook.Sheets['Kudos Categories']);
  if (kudos.length > 0) {
    await db.collection('kudos_categories').deleteMany({});
    await db.collection('kudos_categories').insertMany(kudos.map((row) => ({
      name: row.Name || row.Category,
      description: row.Description || '',
      icon: row.Icon || '',
      createdAt: new Date(),
    })));
    console.log(`Seeded ${kudos.length} kudos categories`);
  }

  // 7. Daily Quotes
  const quotes = XLSX.utils.sheet_to_json(workbook.Sheets['Daily Quotes']);
  if (quotes.length > 0) {
    await db.collection('daily_quotes').deleteMany({});
    await db.collection('daily_quotes').insertMany(quotes.map((row) => ({
      text: row.Quote || row.Text,
      author: row.Author || row.Attribution || '',
      category: row.Category || '',
      createdAt: new Date(),
    })));
    console.log(`Seeded ${quotes.length} daily quotes`);
  }

  // 8. Lived-Experience Content
  const lived = XLSX.utils.sheet_to_json(workbook.Sheets['Lived-Experience Content']);
  if (lived.length > 0) {
    await db.collection('lived_experience').deleteMany({});
    await db.collection('lived_experience').insertMany(lived.map((row) => ({
      title: row.Title || '',
      story: row.Story || row.Content || '',
      hazardCategory: row['Hazard Category'] || '',
      sdtDimension: row['SDT Dimension'] || '',
      createdAt: new Date(),
    })));
    console.log(`Seeded ${lived.length} lived-experience stories`);
  }

  // 9. Quick Tools
  const tools = XLSX.utils.sheet_to_json(workbook.Sheets['Quick Tools']);
  if (tools.length > 0) {
    await db.collection('quick_tools').deleteMany({});
    await db.collection('quick_tools').insertMany(tools.map((row) => ({
      title: row.Title || row['Tool Name'],
      description: row.Description || '',
      durationMinutes: parseInt(row['Duration (min)']) || 2,
      instructions: row.Instructions || row.Steps || '',
      hazardCategory: row['Hazard Category'] || '',
      createdAt: new Date(),
    })));
    console.log(`Seeded ${tools.length} quick tools`);
  }

  await client.close();
  console.log('Content seeding complete!');
}

function parseScenarioOptions(row) {
  const options = [];
  for (let i = 1; i <= 4; i++) {
    const text = row[`Option ${i}`] || row[`Choice ${i}`];
    if (text) {
      options.push({
        id: `opt${i}`,
        text,
        isOptimal: (row['Best Option'] || row['Optimal'] || '').includes(String(i)),
        feedback: row[`Feedback ${i}`] || '',
        sdtImpact: row[`SDT Impact ${i}`] || '',
      });
    }
  }
  return options;
}

seed().catch(console.error);
