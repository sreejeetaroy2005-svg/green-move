// GreenMove — routes/trips.js — Enhanced with Features 1, 5, 6, 7
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDb } = require('../src/db');
const { calcCarbonKg, getEquivalents } = require('../src/carbon-engine');
const { genId, generateTxHash, calculatePoints, assignBadge, calculateNewStreak } = require('../src/helpers');
const logger = require('../src/logger');

const router = express.Router();

// Specific rate limiting for trips logging (10 per day)
const tripLoggingLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, 
  message: { success: false, error: 'Daily trip logging limit reached (Max 10).' }
});

router.post('/', authenticateToken, requireRole('commuter'), tripLoggingLimiter, async (req, res) => {
  try {
    const { mode, distance_km, city, legs } = req.body;
    const commuter_id = req.user.id; 

    const db = await getDb();
    
    // Check active status
    const commuter = await db.get('SELECT * FROM commuters WHERE id = ? AND is_active = 1', [commuter_id]);
    if (!commuter) {
      return res.status(404).json({ success: false, error: 'Commuter account not active or found.' });
    }

    let finalMode, finalDistance, totalCo2 = 0, tripLegsJson = null;
    const validModes = ['walk', 'cycle', 'bus', 'metro', 'carpool'];

    // Feature 6: Multi-leg trip support
    if (legs && Array.isArray(legs) && legs.length > 0) {
      // Validate each leg
      for (const leg of legs) {
        if (!leg.mode || !validModes.includes(leg.mode.toLowerCase())) {
          return res.status(400).json({ success: false, error: `Unsupported mode in leg: ${leg.mode}` });
        }
        if (typeof leg.distance_km !== 'number' || leg.distance_km <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid distance_km in leg' });
        }
      }

      // Feature 1: Duplicate detection for multi-leg — check each leg mode
      const today = new Date().toISOString().split('T')[0];
      for (const leg of legs) {
        const dup = await db.get(
          `SELECT id FROM trips WHERE commuter_id = ? AND mode = ? AND date(created_at) = ?`,
          [commuter_id, leg.mode.toLowerCase(), today]
        );
        if (dup) {
          return res.status(409).json({ success: false, error: `You already logged a ${leg.mode} trip today. Log another?` });
        }
      }

      // Calculate total CO2 across all legs
      let totalDistance = 0;
      const processedLegs = [];
      for (const leg of legs) {
        const { co2_saved_kg } = calcCarbonKg(leg.mode, leg.distance_km);
        totalCo2 += co2_saved_kg;
        totalDistance += leg.distance_km;
        processedLegs.push({ mode: leg.mode.toLowerCase(), distance_km: leg.distance_km, co2_saved_kg });
      }

      finalMode = legs[0].mode.toLowerCase(); // Primary mode = first leg
      finalDistance = parseFloat(totalDistance.toFixed(1));
      totalCo2 = parseFloat(totalCo2.toFixed(3));
      tripLegsJson = JSON.stringify(processedLegs);
    } else {
      // Single-leg trip (original logic)
      if (!mode || typeof distance_km !== 'number' || distance_km <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid mode or distance_km' });
      }
      if (!validModes.includes(mode.toLowerCase())) {
        return res.status(400).json({ success: false, error: `Unsupported mode: ${mode}` });
      }

      // Feature 1: Duplicate trip detection — same mode, same day
      const today = new Date().toISOString().split('T')[0];
      const duplicate = await db.get(
        `SELECT id FROM trips WHERE commuter_id = ? AND mode = ? AND date(created_at) = ?`,
        [commuter_id, mode.toLowerCase(), today]
      );
      if (duplicate) {
        return res.status(409).json({ success: false, error: `You already logged a ${mode} trip today. Log another?` });
      }

      finalMode = mode.toLowerCase();
      finalDistance = distance_km;
      const result = calcCarbonKg(mode, distance_km);
      totalCo2 = result.co2_saved_kg;
    }

    // Get last trip date to calculate streak accurately
    const lastTrip = await db.get('SELECT created_at FROM trips WHERE commuter_id = ? ORDER BY created_at DESC LIMIT 1', [commuter_id]);
    
    // Feature 6: Streak Shield integration
    const lastDate = commuter.last_trip_date || (lastTrip ? lastTrip.created_at : null);
    const shields = commuter.streak_shields || 0;
    
    const { newStreak, freezeUsed } = calculateNewStreak(
      lastDate,
      commuter.current_streak,
      shields
    );

    const points_earned = calculatePoints(totalCo2, finalMode, newStreak);
    
    const trip_id = genId('trip');
    const tx_hash = generateTxHash({ trip_id, commuter_id, mode: finalMode, distance_km: finalDistance, co2_saved_kg: totalCo2 });
    const tripCity = city || commuter.city;

    // Log trip (with optional trip_legs JSON)
    await db.run(
      `INSERT INTO trips (id, commuter_id, mode, distance_km, co2_saved_kg, points_earned, tx_hash, city, trip_legs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip_id, commuter_id, finalMode, finalDistance, totalCo2, points_earned, tx_hash, tripCity, tripLegsJson]
    );

    // Blockchain tx mock
    const tx_id = genId('tx');
    await db.run(
      'INSERT INTO transactions (id, hash, trip_id) VALUES (?, ?, ?)',
      [tx_id, tx_hash, trip_id]
    );

    // Feature 6: Award Shield at 7-day streak
    let newShields = freezeUsed ? shields - 1 : shields;
    let shieldAwarded = false;
    // Award 1 shield when reaching a multiple of 7
    if (newStreak > 0 && newStreak % 7 === 0 && newStreak > commuter.current_streak) {
      newShields += 1;
      shieldAwarded = true;
    }

    // Update commuter stats
    const newTotalCo2 = parseFloat((commuter.total_co2_saved_kg + totalCo2).toFixed(3));
    const newTotalPoints = commuter.total_points + points_earned;
    const newBadge = assignBadge(newTotalCo2);
    const todayStr = new Date().toISOString();

    await db.run(
      `UPDATE commuters 
       SET total_co2_saved_kg = ?, total_points = ?, current_streak = ?, badge = ?, streak_shields = ?, last_trip_date = ?
       WHERE id = ?`,
      [newTotalCo2, newTotalPoints, newStreak, newBadge, newShields, todayStr, commuter_id]
    );

    // Log transaction
    const ptxId = genId('ptx');
    await db.run(
      'INSERT INTO point_transactions (id, commuter_id, amount, reason) VALUES (?, ?, ?, ?)',
      [ptxId, commuter_id, points_earned, `Logged trip: ${finalMode}`]
    );

    logger.info(`Trip ${trip_id} logged for commuter ${commuter_id} (${totalCo2}kg saved${freezeUsed ? ', streak freeze used' : ''})`);

    res.status(201).json({
      success: true,
      data: {
        message: 'Trip logged successfully',
        trip_id,
        co2_saved_kg: totalCo2,
        points_earned,
        tx_hash,
        badge_awarded: newBadge !== commuter.badge ? newBadge : null,
        streak_freeze_used: freezeUsed || undefined,
        shield_awarded: shieldAwarded || undefined,
        legs: tripLegsJson ? JSON.parse(tripLegsJson) : undefined,
        equivalents: getEquivalents(totalCo2)
      }
    });
  } catch (err) {
    logger.error('Error logging trip', err);
    res.status(500).json({ success: false, error: 'Server error', details: err.message });
  }
});

router.get('/my', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const db = await getDb();
    
    // Pagination params
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const modeFilter = req.query.mode ? req.query.mode.toLowerCase() : null;

    let query = 'SELECT * FROM trips WHERE commuter_id = ?';
    let params = [req.user.id];

    if (modeFilter && modeFilter !== 'all') {
      query += ' AND mode = ?';
      params.push(modeFilter);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const trips = await db.all(query, params);
    res.json({ success: true, data: trips });
  } catch (err) {
    logger.error('Error fetching trips', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 2: Blockchain Explorer Verification Endpoint
router.get('/verify/:tx_hash', async (req, res) => {
  try {
    const db = await getDb();
    const hash = req.params.tx_hash;

    const trip = await db.get(`
      SELECT t.mode, t.distance_km, t.co2_saved_kg, t.commuter_id, t.created_at, tx.hash as tx_hash, t.has_photo_proof
      FROM transactions tx
      JOIN trips t ON tx.trip_id = t.id
      WHERE tx.hash = ?
    `, [hash]);

    if (!trip) {
      return res.status(404).json({ success: false, error: 'Hash not found in ledger' });
    }

    const { getEquivalents } = require('../src/carbon-engine');
    trip.equivalents = getEquivalents(trip.co2_saved_kg);

    res.json({ success: true, data: trip });
  } catch (err) {
    logger.error('Verify trip error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const db = await getDb();
    const leaders = await db.all(`
      SELECT c.id, u.name, c.total_co2_saved_kg, c.total_points, c.badge, c.city
      FROM commuters c
      JOIN users u ON c.user_id = u.id
      WHERE c.is_active = 1
      ORDER BY c.total_co2_saved_kg DESC
      LIMIT 5
    `);
    res.json({ success: true, data: leaders });
  } catch (err) {
    logger.error('Error fetching leaderboard', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// CO2 live preview route for frontend form
router.post('/preview', async (req, res) => {
  try {
    const { mode, distance_km } = req.body;
    if (!mode || typeof distance_km !== 'number' || distance_km <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid mode or distance_km' });
    }
    const { co2_saved_kg } = calcCarbonKg(mode, distance_km);
    res.json({ success: true, data: { co2_saved_kg } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Environmental impact equivalents for a commuter
router.get('/impact', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const db = await getDb();
    const commuter = await db.get('SELECT total_co2_saved_kg FROM commuters WHERE id = ?', [req.user.id]);
    if (!commuter) return res.status(404).json({ success: false, error: 'Commuter not found' });

    const { getEquivalents } = require('../src/carbon-engine');
    const equivalents = getEquivalents(commuter.total_co2_saved_kg);
    res.json({ success: true, data: equivalents });
  } catch (err) {
    logger.error('Error fetching impact', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 5: Carbon Budget / Personal Goal
router.put('/goal', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const { monthly_goal_kg } = req.body;
    if (typeof monthly_goal_kg !== 'number' || monthly_goal_kg <= 0) {
      return res.status(400).json({ success: false, error: 'monthly_goal_kg must be a positive number' });
    }

    const db = await getDb();
    await db.run('UPDATE commuters SET monthly_goal_kg = ? WHERE id = ? AND is_active = 1', [monthly_goal_kg, req.user.id]);

    logger.info(`Commuter ${req.user.id} set monthly goal to ${monthly_goal_kg}kg`);
    res.json({ success: true, data: { message: 'Monthly goal updated', monthly_goal_kg } });
  } catch (err) {
    logger.error('Error setting goal', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/goal', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const db = await getDb();
    const commuter = await db.get('SELECT monthly_goal_kg FROM commuters WHERE id = ? AND is_active = 1', [req.user.id]);
    if (!commuter) return res.status(404).json({ success: false, error: 'Commuter not found' });

    // Calculate current month CO2
    const monthCo2 = await db.get(
      `SELECT COALESCE(SUM(co2_saved_kg), 0) as current_month_co2
       FROM trips
       WHERE commuter_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
      [req.user.id]
    );

    const goal = commuter.monthly_goal_kg;
    const current = parseFloat(monthCo2.current_month_co2.toFixed(3));
    const progress_pct = goal ? Math.min(100, Math.floor((current / goal) * 100)) : null;

    res.json({
      success: true,
      data: {
        goal,
        current_month_co2: current,
        progress_pct
      }
    });
  } catch (err) {
    logger.error('Error fetching goal', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
