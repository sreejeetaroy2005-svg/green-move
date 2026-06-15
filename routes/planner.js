// GreenMove — routes/planner.js — Feature 10: City Planner Dashboard
const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDb } = require('../src/db');
const logger = require('../src/logger');

const router = express.Router();

// GET /api/planner/modal-trends — mode share by week across all cities
router.get('/modal-trends', authenticateToken, requireRole('city_planner'), async (req, res) => {
  try {
    const db = await getDb();

    const trends = await db.all(`
      SELECT 
        strftime('%Y-%W', created_at) as week,
        mode,
        COUNT(id) as trip_count,
        SUM(co2_saved_kg) as co2_saved
      FROM trips
      GROUP BY week, mode
      ORDER BY week ASC, mode ASC
    `);

    // Pivot into { week, modes: { walk: { count, co2 }, cycle: ... } }
    const weekMap = {};
    for (const row of trends) {
      if (!weekMap[row.week]) {
        weekMap[row.week] = { week: row.week, modes: {} };
      }
      weekMap[row.week].modes[row.mode] = {
        trip_count: row.trip_count,
        co2_saved: parseFloat(row.co2_saved.toFixed(3))
      };
    }

    res.json({ success: true, data: Object.values(weekMap) });
  } catch (err) {
    logger.error('Planner modal-trends error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/planner/peak-hours — trips grouped by hour to find peak green commute hours
router.get('/peak-hours', authenticateToken, requireRole('city_planner'), async (req, res) => {
  try {
    const db = await getDb();

    const hours = await db.all(`
      SELECT 
        strftime('%H', created_at) as hour,
        COUNT(id) as trip_count,
        SUM(co2_saved_kg) as co2_saved
      FROM trips
      GROUP BY hour
      ORDER BY hour ASC
    `);

    // Find peak hour
    let peakHour = null;
    let maxTrips = 0;
    for (const h of hours) {
      if (h.trip_count > maxTrips) {
        maxTrips = h.trip_count;
        peakHour = h.hour;
      }
      h.co2_saved = parseFloat(h.co2_saved.toFixed(3));
    }

    res.json({
      success: true,
      data: {
        hours,
        peak_hour: peakHour,
        peak_trip_count: maxTrips
      }
    });
  } catch (err) {
    logger.error('Planner peak-hours error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/planner/neighborhood — trips grouped by city with top mode
router.get('/neighborhood', authenticateToken, requireRole('city_planner'), async (req, res) => {
  try {
    const db = await getDb();

    const cities = await db.all(`
      SELECT 
        city,
        SUM(co2_saved_kg) as total_co2,
        COUNT(id) as total_trips
      FROM trips
      GROUP BY city
      ORDER BY total_co2 DESC
    `);

    // For each city, find top mode
    const enriched = [];
    for (const c of cities) {
      const topMode = await db.get(`
        SELECT mode, COUNT(id) as cnt
        FROM trips
        WHERE city = ?
        GROUP BY mode
        ORDER BY cnt DESC
        LIMIT 1
      `, [c.city]);

      enriched.push({
        city: c.city,
        total_co2: parseFloat(c.total_co2.toFixed(3)),
        total_trips: c.total_trips,
        top_mode: topMode ? topMode.mode : null
      });
    }

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('Planner neighborhood error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
