// GreenMove — index.js — refined for Round 2
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDb } = require('./db');
const { initCronJobs } = require('./cron');
const logger = require('./logger');

const authRoutes = require('../routes/auth');
const tripsRoutes = require('../routes/trips');
const whatsappRoutes = require('../routes/whatsapp');
const rewardsRoutes = require('../routes/rewards');
const analyticsRoutes = require('../routes/analytics');
const challengesRoutes = require('../routes/challenges');
const plannerRoutes = require('../routes/planner');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Hardening & Security Middleware
app.use(helmet({
  contentSecurityPolicy: false // disabled for simple CDN scripts (chart.js) in hackathon
}));
app.use(cors());
app.use(express.json());

// Basic Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', globalLimiter);

// Static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    // Simple query to verify DB connection
    await db.get('SELECT 1');
    res.json({
      success: true,
      data: {
        status: 'UP',
        database: 'Connected',
        uptime_seconds: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('Health check failed:', err);
    res.status(500).json({ success: false, error: 'System unhealthy', details: err.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/planner', plannerRoutes);

// Fallback logic
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start application
async function bootstrap() {
  try {
    await getDb();
    logger.info('Database initialized successfully.');
    
    initCronJobs();

    app.listen(PORT, () => {
      logger.info('GreenMove API Server running on http://localhost:' + PORT);
    });
  } catch (err) {
    logger.error('Failed to bootstrap application', err);
    process.exit(1);
  }
}

bootstrap();
