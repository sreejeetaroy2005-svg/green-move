// GreenMove — routes/auth.js — refined for Round 2
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../src/db');
const { genId } = require('../src/helpers');
const { JWT_SECRET, authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../src/logger');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, employer_id, city, preferred_mode } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!strongRegex.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' });
    }

    const validRoles = ['commuter', 'employer', 'city_planner'];
    const userRole = validRoles.includes(role) ? role : 'commuter';

    const db = await getDb();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = genId('user');

    await db.run(
      'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [userId, name, email, hashedPassword, userRole]
    );

    if (userRole === 'commuter') {
      const commuterId = genId('com');
      const comCity = city || 'Bengaluru';
      const comMode = preferred_mode || 'bus';
      
      // Find an employer to link to, or leave null
      let empId = employer_id || null;
      if (!empId) {
        // Auto-assign to a random employer in the same city for demo purposes
        const emp = await db.get('SELECT id FROM employers WHERE city = ? LIMIT 1', [comCity]);
        if (emp) empId = emp.id;
      }

      await db.run(
        `INSERT INTO commuters (id, user_id, employer_id, city, preferred_mode, total_co2_saved_kg, total_points, current_streak, badge, is_active, streak_freeze_count, notify_enabled, notify_hour) 
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'Newbie', 1, 0, 1, 8)`,
        [commuterId, userId, empId, comCity, comMode]
      );
    } else if (userRole === 'employer') {
      // Create employer entry linked to this user
      await db.run(
        'INSERT INTO employers (id, name, city, points_to_perk_ratio) VALUES (?, ?, ?, ?)',
        [userId, name, city || 'Bengaluru', 100]
      );
    }
    // city_planner only needs a user record — no extra table entry

    logger.info(`User registered: ${email} (${userRole})`);
    res.status(201).json({ success: true, data: { message: 'User registered successfully', userId, role: userRole } });
  } catch (err) {
    logger.error('Registration error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    let extraData = {};
    if (user.role === 'commuter') {
      const commuter = await db.get('SELECT id, employer_id, city FROM commuters WHERE user_id = ? AND is_active = 1', [user.id]);
      if (commuter) extraData = commuter;
      else return res.status(403).json({ success: false, error: 'Commuter profile inactive or missing' });
    }

    const token = jwt.sign({ id: user.id, role: user.role, ...extraData }, JWT_SECRET, { expiresIn: '1d' });
    
    logger.info(`User logged in: ${email}`);
    res.json({ success: true, data: { token, role: user.role, name: user.name, extraData } });
  } catch (err) {
    logger.error('Login error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 9: PUT /api/auth/preferences — commuter updates notification prefs
router.put('/preferences', authenticateToken, requireRole('commuter'), async (req, res) => {
  try {
    const { notify_enabled, notify_hour } = req.body;
    const db = await getDb();

    const updates = [];
    const params = [];

    if (typeof notify_enabled === 'boolean' || typeof notify_enabled === 'number') {
      updates.push('notify_enabled = ?');
      params.push(notify_enabled ? 1 : 0);
    }

    if (typeof notify_hour === 'number' && notify_hour >= 0 && notify_hour <= 23) {
      updates.push('notify_hour = ?');
      params.push(notify_hour);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide notify_enabled (bool) and/or notify_hour (0-23)' });
    }

    params.push(req.user.id);
    await db.run(`UPDATE commuters SET ${updates.join(', ')} WHERE id = ? AND is_active = 1`, params);

    logger.info(`Commuter ${req.user.id} updated notification preferences`);
    res.json({ success: true, data: { message: 'Preferences updated' } });
  } catch (err) {
    logger.error('Error updating preferences', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
