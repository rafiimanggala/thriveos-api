/**
 * Seed badge definitions into MongoDB
 * Run: node scripts/seedBadges.js
 *
 * Uses upsert on badge `id` to avoid duplicates on re-run.
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const BADGE_DEFINITIONS = [
  {
    id: 'streak_3',
    name: '3-Day Streak',
    description: 'Check in 3 consecutive days',
    category: 'streak',
    threshold: 3,
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Check in 7 consecutive days',
    category: 'streak',
    threshold: 7,
  },
  {
    id: 'streak_14',
    name: 'Fortnight Focus',
    description: '14 consecutive days',
    category: 'streak',
    threshold: 14,
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: '30 consecutive days',
    category: 'streak',
    threshold: 30,
  },
  {
    id: 'first_checkin',
    name: 'First Step',
    description: 'Complete your first check-in',
    category: 'milestone',
    threshold: 1,
  },
  {
    id: 'first_kudos',
    name: 'Kindness Counts',
    description: 'Send your first kudos',
    category: 'social',
    threshold: 1,
  },
  {
    id: 'five_lessons',
    name: 'Eager Learner',
    description: 'Complete 5 lessons',
    category: 'learning',
    threshold: 5,
  },
  {
    id: 'ten_lessons',
    name: 'Knowledge Seeker',
    description: 'Complete 10 lessons',
    category: 'learning',
    threshold: 10,
  },
  {
    id: 'first_scenario',
    name: 'Decision Maker',
    description: 'Complete your first scenario',
    category: 'milestone',
    threshold: 1,
  },
  {
    id: 'first_reflection',
    name: 'Deep Thinker',
    description: 'Write your first reflection',
    category: 'milestone',
    threshold: 1,
  },
  {
    id: 'team_player',
    name: 'Team Spirit',
    description: 'Send kudos to 5 different people',
    category: 'social',
    threshold: 5,
  },
  {
    id: 'growth_50',
    name: 'Rising Star',
    description: 'Reach a growth score of 50',
    category: 'growth',
    threshold: 50,
  },
  {
    id: 'growth_75',
    name: 'Thriver',
    description: 'Reach a growth score of 75',
    category: 'growth',
    threshold: 75,
  },
];

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('thriveos');
  const collection = db.collection('badge_definitions');

  const ops = BADGE_DEFINITIONS.map((badge) => ({
    updateOne: {
      filter: { id: badge.id },
      update: { $set: { ...badge, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(ops);
  console.log(`Badge definitions: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);

  await client.close();
  console.log('Badge seeding complete!');
}

seed().catch((err) => {
  console.error('Badge seed failed:', err);
  process.exit(1);
});
