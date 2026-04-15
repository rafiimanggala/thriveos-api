const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || '*' }));
app.use(express.json({ limit: '10mb' }));

// Firebase Admin — skip if credentials missing
if (process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
} else {
  console.warn('⚠ FIREBASE_PROJECT_ID not set — Firebase Auth disabled');
}

// MongoDB
let db;
async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.warn('⚠ MONGODB_URI not set — database unavailable');
    return;
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db('thriveos');
  app.locals.db = db;
  console.log('Connected to MongoDB (thriveos)');
}

// Routes
app.get('/health', (req, res) => res.json({
  status: 'ok',
  timestamp: new Date(),
  db: !!app.locals.db,
  firebase: !!process.env.FIREBASE_PROJECT_ID,
}));

// Mount routes after DB connect
async function mountRoutes() {
  const { authRoutes } = require('./routes/authRoutes');
  const { userRoutes } = require('./routes/userRoutes');
  const { checkinRoutes } = require('./routes/checkinRoutes');
  const { contentRoutes } = require('./routes/contentRoutes');
  const { socialRoutes } = require('./routes/socialRoutes');
  const { managerRoutes } = require('./routes/managerRoutes');
  const { executiveRoutes } = require('./routes/executiveRoutes');
  const { crisisRoutes } = require('./routes/crisisRoutes');

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/checkins', checkinRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/manager', managerRoutes);
  app.use('/api/executive', executiveRoutes);
  app.use('/api/crisis', crisisRoutes);
}

// Start — graceful even without env vars
connectDB()
  .then(() => mountRoutes())
  .then(() => {
    const { errorHandler } = require('./middleware/errorHandler');
    app.use(errorHandler);
  })
  .then(() => {
    app.listen(PORT, () => console.log(`ThriveOS API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
