const rateLimit = require('express-rate-limit');

// Global: 500 requests per 15 minutes per IP (normal demo/usage session needs ~30-50)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Auth routes: 20 requests per 15 minutes per IP (brute force prevention)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many auth attempts, please try again later' },
});

module.exports = { globalLimiter, authLimiter };
