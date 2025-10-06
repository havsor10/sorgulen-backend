/*
 * Entry point for the Sorgulen Industriservice backend.
 *
 * This service exposes a REST API for authenticating administrators,
 * creating and managing customer orders. It is designed to be deployed
 * on a managed host such as Render and to serve requests from a
 * frontend hosted on Netlify. CORS configuration, JWT secrets,
 * database URIs and mail credentials are read from environment
 * variables. See `.env.example` for the expected configuration keys.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

// Load configuration from a .env file in development.
// In production these are injected via Render environment variables.
try {
  require('dotenv').config();
} catch (err) {
  // ignore if dotenv not installed
}

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const { ensureOwner } = require('./seed/ensureOwner');

const app = express();

// Security and parsing middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Configure CORS for Netlify domains
const allowedOrigins = (process.env.NETLIFY_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

// Basic rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Health check endpoint (used by Render)
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

// Connect to MongoDB and start the server
async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not defined');

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    autoIndex: false,
  });

  // Ensure admin account exists
  await ensureOwner();

  const port = process.env.PORT || 10000;
  app.listen(port, () => {
    console.log(`✅ Server listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
