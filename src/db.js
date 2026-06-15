// GreenMove — db.js — refined for Round 2
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const logger = require('./logger');

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: path.join(__dirname, '..', 'greenmove.sqlite'),
    driver: sqlite3.Database
  });

  await initSchema(dbInstance);
  return dbInstance;
}

async function initSchema(db) {
  logger.info('Initializing database schema (Round 2 Refined)...');
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      hash TEXT,
      trip_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      commuter_id TEXT,
      mode TEXT,
      distance_km REAL,
      co2_saved_kg REAL,
      points_earned INTEGER,
      tx_hash TEXT,
      city TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS commuters (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      employer_id TEXT,
      city TEXT,
      preferred_mode TEXT,
      total_co2_saved_kg REAL,
      total_points INTEGER,
      current_streak INTEGER,
      badge TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      commuter_id TEXT,
      points_spent INTEGER,
      reward_type TEXT,
      redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      employer_id TEXT
    );

    CREATE TABLE IF NOT EXISTS employers (
      id TEXT PRIMARY KEY,
      name TEXT,
      city TEXT,
      points_to_perk_ratio INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carbon_log (
      date TEXT,
      city TEXT,
      total_co2_kg REAL,
      total_trips INTEGER,
      modal_share_json TEXT,
      PRIMARY KEY (date, city)
    );

    CREATE TABLE IF NOT EXISTS point_transactions (
      id TEXT PRIMARY KEY,
      commuter_id TEXT,
      amount INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Feature 2: Employer Reward Catalog
    CREATE TABLE IF NOT EXISTS reward_catalog (
      id TEXT PRIMARY KEY,
      employer_id TEXT,
      name TEXT,
      description TEXT,
      points_cost INTEGER,
      stock INTEGER,
      is_active BOOLEAN DEFAULT 1
    );

    -- Feature 3: Team/Department Challenges
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      employer_id TEXT,
      title TEXT,
      start_date TEXT,
      end_date TEXT,
      team_a TEXT,
      team_b TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_trips_commuter_id ON trips(commuter_id);
    CREATE INDEX IF NOT EXISTS idx_trips_created_at ON trips(created_at);
    CREATE INDEX IF NOT EXISTS idx_commuters_employer_id ON commuters(employer_id);
  `);

  // Safe ALTER TABLE migrations for new columns on existing tables
  const migrations = [
    { table: 'trips', column: 'trip_legs', type: 'TEXT' },
    { table: 'trips', column: 'has_photo_proof', type: 'INTEGER DEFAULT 0' },
    { table: 'trips', column: 'photo_media_id', type: 'TEXT' },
    { table: 'users', column: 'phone', type: 'TEXT' },
    { table: 'commuters', column: 'monthly_goal_kg', type: 'REAL' },
    { table: 'commuters', column: 'streak_freeze_count', type: 'INTEGER DEFAULT 0' },
    { table: 'commuters', column: 'notify_enabled', type: 'INTEGER DEFAULT 1' },
    { table: 'commuters', column: 'notify_hour', type: 'INTEGER DEFAULT 8' },
    { table: 'commuters', column: 'streak_shields', type: 'INTEGER DEFAULT 0' },
    { table: 'commuters', column: 'last_trip_date', type: 'DATE' },
  ];

  for (const m of migrations) {
    try {
      await db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
      logger.info(`Migration: Added ${m.column} to ${m.table}`);
    } catch (e) {
      // Column already exists — safe to ignore
    }
  }
}

module.exports = { getDb };
