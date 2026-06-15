// GreenMove — routes/challenges.js — Feature 3: Team/Department Challenges
const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDb } = require('../src/db');
const { genId } = require('../src/helpers');
const logger = require('../src/logger');

const router = express.Router();

// POST /api/challenges — employer creates a challenge
router.post('/', authenticateToken, requireRole('employer'), async (req, res) => {
  try {
    const { title, start_date, end_date, team_a, team_b } = req.body;

    if (!title || !start_date || !end_date || !team_a || !team_b) {
      return res.status(400).json({ success: false, error: 'title, start_date, end_date, team_a, and team_b are required' });
    }

    if (new Date(end_date) <= new Date(start_date)) {
      return res.status(400).json({ success: false, error: 'end_date must be after start_date' });
    }

    const db = await getDb();
    const challengeId = genId('chl');

    await db.run(
      `INSERT INTO challenges (id, employer_id, title, start_date, end_date, team_a, team_b)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [challengeId, req.user.id, title, start_date, end_date, team_a, team_b]
    );

    logger.info(`Challenge ${challengeId} created by employer ${req.user.id}: "${title}"`);

    res.status(201).json({
      success: true,
      data: {
        message: 'Challenge created',
        challenge_id: challengeId,
        title,
        start_date,
        end_date,
        team_a,
        team_b
      }
    });
  } catch (err) {
    logger.error('Error creating challenge', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /api/challenges/active — returns active challenges with live CO2 scores
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];

    const challenges = await db.all(
      `SELECT * FROM challenges
       WHERE date(start_date) <= ? AND date(end_date) >= ?
       ORDER BY created_at DESC`,
      [today, today]
    );

    // For each active challenge, compute live CO2 scores for both teams
    const enriched = [];
    for (const ch of challenges) {
      // team_a and team_b are comma-separated commuter IDs
      const teamAIds = ch.team_a.split(',').map(s => s.trim());
      const teamBIds = ch.team_b.split(',').map(s => s.trim());

      const placeholdersA = teamAIds.map(() => '?').join(',');
      const placeholdersB = teamBIds.map(() => '?').join(',');

      const scoreA = await db.get(
        `SELECT COALESCE(SUM(co2_saved_kg), 0) as co2
         FROM trips
         WHERE commuter_id IN (${placeholdersA})
           AND date(created_at) >= ? AND date(created_at) <= ?`,
        [...teamAIds, ch.start_date, ch.end_date]
      );

      const scoreB = await db.get(
        `SELECT COALESCE(SUM(co2_saved_kg), 0) as co2
         FROM trips
         WHERE commuter_id IN (${placeholdersB})
           AND date(created_at) >= ? AND date(created_at) <= ?`,
        [...teamBIds, ch.start_date, ch.end_date]
      );

      enriched.push({
        id: ch.id,
        title: ch.title,
        employer_id: ch.employer_id,
        start_date: ch.start_date,
        end_date: ch.end_date,
        team_a: { members: teamAIds, co2_saved: parseFloat(scoreA.co2.toFixed(3)) },
        team_b: { members: teamBIds, co2_saved: parseFloat(scoreB.co2.toFixed(3)) },
        leading: scoreA.co2 > scoreB.co2 ? 'team_a' : scoreB.co2 > scoreA.co2 ? 'team_b' : 'tied'
      });
    }

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('Error fetching active challenges', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
