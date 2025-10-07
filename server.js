/*
 * Sorgulen Industriservice – backend med AdminJS og API.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

// Prøv å laste .env lokalt, men ignorer i prod.
try {
  require('dotenv').config();
} catch (_) {}

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const buildAdminRouter = require('./admin');
const { ensureOwner } = require('./seed/ensureOwner');

const app = express();

// Tillat Render proxy – nødvendig for AdminJS-cookies
app.set('trust proxy', 1);

// Standard middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// CORS for Netlify-domener
const allowedOrigins = (process.env.NETLIFY_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

// Rate limiting
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

// AdminJS
const ADMIN_BASE = process.env.ADMIN_BASE_URL || '/admin';
app.use(ADMIN_BASE, buildAdminRouter());

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// Start server
async function start() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined');

  await mongoose.connect(uri, { maxPoolSize: 10, autoIndex: false });

  await ensureOwner(); // oppretter admin hvis ikke finnes

  const port = process.env.PORT || 10000;
  app.listen(port, () =>
    console.log(`✅ Server live på port ${port} | Admin-panel: ${ADMIN_BASE}`)
  );
}

start().catch(err => {
  console.error('❌ Server startup error:', err);
  process.exit(1);
});
