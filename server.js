/*
 * Entry point for the Sorgulen Industriservice backend.
 *
 * This service exposes a REST API for authenticating administrators,
 * creating and managing customer orders, and mounting an AdminJS
 * interface for backoffice operations. It is designed to be deployed
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

// Load configuration from a .env file in development. In production
// these variables are expected to be provided by the hosting
// environment. The dotenv dependency is intentionally not listed in
// package.json to avoid bundling it in production. Only if dotenv
// exists locally will it be used.
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  require('dotenv').config();
} catch (err) {
  // ignore if dotenv is not installed
}

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const buildAdminRouter = require('./admin');
const { ensureOwner } = require('./seed/ensureOwner');

const app = express();

// Standard security and parsing middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Configure CORS based on a comma-separated list of allowed origins
const allowedOrigins = (process.env.NETLIFY_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
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

// Apply a basic rate limiter to all API routes to protect against
// abusive clients. Adjust the window and max values as needed.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Health check endpoint used by Render for liveness probes
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Mount authentication and order routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// Mount AdminJS interface. The admin router returns an Express
// router instance configured with the provided models and options.
app.use(process.env.ADMIN_BASE_URL || '/admin', buildAdminRouter());

// Global error handler. Express will pass any error thrown in a
// middleware or route handler down to this handler. A production
// environment should not leak stack traces.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
});

// Connect to MongoDB and start the HTTP server. Use a small
// connection pool and disable auto-indexing in production. If the
// connection fails the process will exit with an error so that
// Render restarts the service.
async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
  }
  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    autoIndex: false,
  });
  // Seed an owner account if none exist
  await ensureOwner();
  const port = process.env.PORT || 10000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});