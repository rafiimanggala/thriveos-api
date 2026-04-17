/**
 * Seed demo org + demo user for client preview.
 * Run: node scripts/seedDemo.js
 *
 * Creates:
 *   - Organisation: "Demo Organisation" (slug: DEMO)
 *   - Firebase Auth user: demo@thriveos.com / Demo2026!
 *   - MongoDB user doc mirroring the Firebase uid
 *
 * Idempotent: checks existing records before creating.
 */
const { MongoClient } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();

const DEMO_EMAIL = 'demo@thriveos.com';
const DEMO_PASSWORD = 'Demo2026!';
const DEMO_ORG_SLUG = 'DEMO';

function initFirebase() {
  if (admin.apps.length > 0) return;
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID not set in .env');
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

async function ensureOrg(db) {
  const existing = await db.collection('organisations').findOne({ slug: DEMO_ORG_SLUG });
  if (existing) {
    console.log(`Org exists: ${existing._id}`);
    return existing;
  }
  const result = await db.collection('organisations').insertOne({
    name: 'Demo Organisation',
    slug: DEMO_ORG_SLUG,
    plan: 'trial',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`Org created: ${result.insertedId}`);
  return await db.collection('organisations').findOne({ _id: result.insertedId });
}

async function ensureUser(db, org) {
  let fbUser;
  try {
    fbUser = await admin.auth().getUserByEmail(DEMO_EMAIL);
    console.log(`Firebase user exists: ${fbUser.uid}`);
    // Reset password to known value
    await admin.auth().updateUser(fbUser.uid, { password: DEMO_PASSWORD });
    console.log('Password reset to known value');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      fbUser = await admin.auth().createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        displayName: 'Demo User',
        emailVerified: true,
      });
      console.log(`Firebase user created: ${fbUser.uid}`);
    } else {
      throw err;
    }
  }

  await admin.auth().setCustomUserClaims(fbUser.uid, {
    role: 'manager',
    orgId: org._id.toString(),
  });

  const existingMongo = await db.collection('users').findOne({ _id: fbUser.uid });
  if (existingMongo) {
    await db.collection('users').updateOne(
      { _id: fbUser.uid },
      { $set: { role: 'manager', orgId: org._id.toString(), updatedAt: new Date() } }
    );
    console.log('Mongo user updated (role: manager)');
  } else {
    await db.collection('users').insertOne({
      _id: fbUser.uid,
      orgId: org._id.toString(),
      email: DEMO_EMAIL,
      firstName: 'Demo',
      lastName: 'User',
      role: 'manager',
      department: 'Operations',
      onboardingComplete: true,
      timezone: 'Australia/Sydney',
      goals: [
        { id: 'resilience', label: 'Build resilience' },
        { id: 'recognition', label: 'Feel recognised' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Mongo user created');
  }

  return fbUser;
}

async function main() {
  initFirebase();

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('thriveos');

  const org = await ensureOrg(db);
  const user = await ensureUser(db, org);

  console.log('\n=== Demo Credentials ===');
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Org slug: ${DEMO_ORG_SLUG}`);
  console.log(`UID:      ${user.uid}`);

  await client.close();
}

main().catch((err) => {
  console.error('Seed demo failed:', err);
  process.exit(1);
});
