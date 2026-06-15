// GreenMove — routes/rewards.js — Enhanced with Features 2, 7
const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getDb } = require('../src/db');
const { genId, getNextBadge } = require('../src/helpers');
const logger = require('../src/logger');

const router = express.Router();

router.get('/my', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const db = await getDb();
    const commuter = await db.get('SELECT * FROM commuters WHERE id = ? AND is_active = 1', [req.user.id]);
    
    if (!commuter) {
      return res.status(404).json({ success: false, error: 'Commuter profile not found' });
    }

    const history = await db.all('SELECT * FROM rewards WHERE commuter_id = ? ORDER BY redeemed_at DESC', [req.user.id]);
    const pointTransactions = await db.all('SELECT * FROM point_transactions WHERE commuter_id = ? ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    
    const nextBadgeInfo = getNextBadge(commuter.total_co2_saved_kg);

    res.json({
      success: true,
      data: {
        current_points: commuter.total_points,
        total_co2: commuter.total_co2_saved_kg,
        badge: commuter.badge,
        streak: commuter.current_streak,
        streak_shields: commuter.streak_shields || 0,
        streak_freezes: commuter.streak_freeze_count || 0,
        next_badge: nextBadgeInfo,
        redemption_history: history,
        transaction_history: pointTransactions
      }
    });
  } catch (err) {
    logger.error('Error fetching rewards', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 2: GET /api/rewards/catalog — returns active rewards for the commuter's employer
router.get('/catalog', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const db = await getDb();
    const commuter = await db.get('SELECT employer_id FROM commuters WHERE id = ? AND is_active = 1', [req.user.id]);
    if (!commuter) return res.status(404).json({ success: false, error: 'Commuter not found' });

    const catalog = await db.all(
      'SELECT id, name, description, points_cost, stock FROM reward_catalog WHERE employer_id = ? AND is_active = 1',
      [commuter.employer_id]
    );

    res.json({ success: true, data: catalog });
  } catch (err) {
    logger.error('Error fetching reward catalog', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 2: Updated POST /api/rewards/redeem — validates against catalog + stock
router.post('/redeem', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const { reward_type, reward_id, points_spent } = req.body;
    
    if (!reward_type || typeof points_spent !== 'number' || points_spent <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid reward_type or points_spent' });
    }

    const db = await getDb();
    const commuter = await db.get('SELECT * FROM commuters WHERE id = ? AND is_active = 1', [req.user.id]);
    
    if (!commuter) return res.status(404).json({ success: false, error: 'Commuter not found' });

    if (commuter.total_points < points_spent) {
      return res.status(400).json({ success: false, error: 'Insufficient points' });
    }

    // If reward_id is provided, validate against the catalog
    if (reward_id) {
      const catalogItem = await db.get(
        'SELECT * FROM reward_catalog WHERE id = ? AND employer_id = ? AND is_active = 1',
        [reward_id, commuter.employer_id]
      );

      if (!catalogItem) {
        return res.status(404).json({ success: false, error: 'Reward not found in your employer catalog' });
      }

      if (catalogItem.stock <= 0) {
        return res.status(400).json({ success: false, error: 'This reward is out of stock' });
      }

      if (points_spent < catalogItem.points_cost) {
        return res.status(400).json({ success: false, error: `This reward costs ${catalogItem.points_cost} points` });
      }

      // Decrement stock
      await db.run('UPDATE reward_catalog SET stock = stock - 1 WHERE id = ?', [reward_id]);
    }

    const newPoints = commuter.total_points - points_spent;
    await db.run('UPDATE commuters SET total_points = ? WHERE id = ?', [newPoints, commuter.id]);

    const rid = genId('rew');
    await db.run(
      'INSERT INTO rewards (id, commuter_id, points_spent, reward_type, employer_id) VALUES (?, ?, ?, ?, ?)',
      [rid, commuter.id, points_spent, reward_type, commuter.employer_id]
    );

    // Log transaction
    const txId = genId('ptx');
    await db.run(
      'INSERT INTO point_transactions (id, commuter_id, amount, reason) VALUES (?, ?, ?, ?)',
      [txId, commuter.id, -points_spent, `Redeemed: ${reward_type}`]
    );

    logger.info(`Commuter ${commuter.id} redeemed ${points_spent} pts for ${reward_type}`);

    res.json({ 
      success: true, 
      data: { message: 'Reward redeemed successfully', new_balance: newPoints, reward_id: rid } 
    });
  } catch (err) {
    logger.error('Error redeeming reward', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 7: POST /api/rewards/buy-freeze — costs 100 points, increments streak_freeze_count
router.post('/buy-freeze', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const db = await getDb();
    const commuter = await db.get('SELECT * FROM commuters WHERE id = ? AND is_active = 1', [req.user.id]);
    
    if (!commuter) return res.status(404).json({ success: false, error: 'Commuter not found' });

    const FREEZE_COST = 100;
    if (commuter.total_points < FREEZE_COST) {
      return res.status(400).json({ success: false, error: `Insufficient points. Need ${FREEZE_COST}, have ${commuter.total_points}` });
    }

    const newPoints = commuter.total_points - FREEZE_COST;
    const newFreezeCount = (commuter.streak_freeze_count || 0) + 1;

    await db.run(
      'UPDATE commuters SET total_points = ?, streak_freeze_count = ? WHERE id = ?',
      [newPoints, newFreezeCount, commuter.id]
    );

    // Log transaction
    const txId = genId('ptx');
    await db.run(
      'INSERT INTO point_transactions (id, commuter_id, amount, reason) VALUES (?, ?, ?, ?)',
      [txId, commuter.id, -FREEZE_COST, 'Purchased Streak Freeze']
    );

    logger.info(`Commuter ${commuter.id} bought streak freeze (now has ${newFreezeCount})`);

    res.json({
      success: true,
      data: {
        message: 'Streak freeze purchased!',
        new_balance: newPoints,
        streak_freezes: newFreezeCount
      }
    });
  } catch (err) {
    logger.error('Error buying streak freeze', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/badges', (req, res) => {
  res.json({
    success: true,
    data: [
      { name: '🌱 Green Starter', threshold: '0.1kg CO2' },
      { name: '🌍 Carbon Saver', threshold: '10kg CO2' },
      { name: '🏆 Green Champion', threshold: '50kg CO2' },
      { name: '💎 Earth Guardian', threshold: '100kg CO2' }
    ]
  });
});

module.exports = router;
