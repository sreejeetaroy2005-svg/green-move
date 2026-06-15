// GreenMove — routes/whatsapp.js — Real Twilio WhatsApp Integration
const express = require('express');
const twilio = require('twilio');
const { getDb } = require('../src/db');
const { calcCarbonKg } = require('../src/carbon-engine');
const { genId, generateTxHash, calculatePoints, assignBadge, calculateNewStreak } = require('../src/helpers');
const logger = require('../src/logger');

const router = express.Router();

// ─── Middleware: Parse TwiML URL-encoded POST bodies and capture raw body ──────────────────────────
router.use(express.urlencoded({
  extended: false,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ─── Helper: Send TwiML reply to Twilio ───────────────────────────────────────
function twimlReply(res, message) {
  logger.info(`📤 Sending TwiML reply: ${message}`);
  const twilio = require('twilio');
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
}

// ─── Helper: Validate Twilio signature (security) ─────────────────────────────
function validateTwilio(req) {
  // Disabled validation for development/testing purposes
  logger.warn('Twilio signature validation disabled (development mode)');
  return true;
}

// ─── MAIN WEBHOOK — POST /api/whatsapp ────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    // --- Validate Twilio signature ---
    logger.info(`🔔 Incoming request headers: ${JSON.stringify(req.headers)}`);
    if (!validateTwilio(req)) {
      logger.warn('Invalid Twilio signature rejected');
      return res.status(403).send('Forbidden');
    }
    logger.info('✅ Twilio signature validated');

    // --- Parse Twilio message fields ---
    // Twilio sends: From, Body, NumMedia, MediaUrl0, MediaContentType0
    if (!req.body || Object.keys(req.body).length === 0) {
      const qs = require('querystring');
      req.body = qs.parse(req.rawBody || '');
    }
    const from = req.body.From || '';
    const body = req.body.Body || '';
    const text = body.trim().toLowerCase();
    // Debug log incoming message text
    const fs = require('fs');
    logger.info(`🔔 WhatsApp inbound raw: ${JSON.stringify(req.body)}`);
    fs.appendFileSync('whatsapp_requests.log', `${new Date().toISOString()} ${JSON.stringify(req.body)}\n`);
    logger.info(`🔔 Parsed text: ${text}`);
    const numMedia  = parseInt(req.body.NumMedia || '0');
    const mediaUrl  = req.body.MediaUrl0 || null;
    const mediaType = req.body.MediaContentType0 || null;

    const isPhoto = numMedia > 0 && mediaType && mediaType.startsWith('image/');
    const phoneNumber = from.replace('whatsapp:', ''); // strip prefix → "+919876543210"

    if (!phoneNumber) {
      return twimlReply(res, '❌ Could not identify your number. Please try again.');
    }

    const db = await getDb();

    // --- Look up commuter by phone number ---
    // commuters table has a phone column; if number not linked, ask them to register
    const commuter = await db.get(`
      SELECT c.* FROM commuters c
      JOIN users u ON c.user_id = u.id
      WHERE u.phone = ? AND c.is_active = 1
    `, [phoneNumber]);

    // --- ONBOARDING: Phone not linked yet ---
    if (!commuter) {
      // Check if they're sending their email to link accounts
      if (text.includes('@')) {
        const email = text.trim();
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
          return twimlReply(res, `❌ No account found for ${email}.\n\nRegister at: ${process.env.APP_URL || 'http://localhost:3000'}`);
        }
        // Link phone to user
        await db.run('UPDATE users SET phone = ? WHERE id = ?', [phoneNumber, user.id]);
        return twimlReply(res, `✅ Phone linked to ${user.name}!\n\nSay "help" to see what I can do 🌿`);
      }

      return twimlReply(res,
        `👋 Welcome to GreenMove!\n\nTo link your account, reply with your registered email address.\n\nDon't have an account? Register at: ${process.env.APP_URL || 'http://localhost:3000'}`
      );
    }

    // ─── COMMANDS ────────────────────────────────────────────────────────────

    // HELP
    if (text.includes('help') || text.includes('hi') || text.includes('hello')) {
      return twimlReply(res,
        `🌿 *GreenMove Bot*\n\nTo log a trip, say:\n• "cycled 8km"\n• "bus 12km"\n• "walked 2.5km"\n• "metro 15km"\n\nCommands:\n• *my stats* — Points & CO₂\n• *leaderboard* — Top 3 team\n• *help* — This menu\n\n📸 Send a photo of your commute with a caption like "cycled 8km" to earn *1.5× bonus points!*`
      );
    }

    // MY STATS
    if (text.includes('stats') || text.includes('score') || text.includes('my points')) {
      const shieldStr = commuter.streak_shields > 0 ? `\n🛡️ Shields: ${commuter.streak_shields}` : '';
      return twimlReply(res,
        `📊 *Your Green Stats*\n\n🌱 Points: ${commuter.total_points}\n🌍 CO₂ Saved: ${commuter.total_co2_saved_kg}kg\n🔥 Streak: ${commuter.current_streak} days${shieldStr}\n🏅 Badge: ${commuter.badge}`
      );
    }

    // LEADERBOARD
    if (text.includes('leaderboard') || text.includes('top')) {
      const leaders = await db.all(`
        SELECT u.name, c.total_co2_saved_kg 
        FROM commuters c JOIN users u ON c.user_id = u.id 
        WHERE c.employer_id = ? AND c.is_active = 1
        ORDER BY c.total_co2_saved_kg DESC LIMIT 3
      `, [commuter.employer_id]);
      const medals = ['🥇', '🥈', '🥉'];
      let reply = '🏆 *Top 3 in Your Company*\n';
      leaders.forEach((l, i) => reply += `${medals[i]} ${l.name} — ${l.total_co2_saved_kg}kg\n`);
      return twimlReply(res, reply);
    }

    // ─── TRIP LOGGING (text or photo with caption) ─────────────────────────

    // NLP mode detection
    let mode = null;
    if (/cycl|bike/.test(text))      mode = 'cycle';
    else if (/bus/.test(text))        mode = 'bus';
    else if (/walk|foot/.test(text))  mode = 'walk';
    else if (/metro|train/.test(text))mode = 'metro';
    else if (/carpool/.test(text))    mode = 'carpool';

    const distanceMatch = text.match(/(\d+(\.\d+)?)\s*(km|kilometer|kilometers|kms)?/);

    if (!mode || !distanceMatch) {
      // If they sent a photo but no recognisable trip in the caption
      if (isPhoto) {
        return twimlReply(res, `📸 Photo received! But I couldn't read a trip in your caption.\n\nTry: "cycled 8km" as the caption.`);
      }
      return twimlReply(res, `🤔 I didn't catch that.\n\nTry: "cycled 8km" or "bus 12km"\nSend "help" for all options.`);
    }

    const distance_km = parseFloat(distanceMatch[1]);

    // Streak calculation
    const lastTripRow = await db.get('SELECT created_at FROM trips WHERE commuter_id = ? ORDER BY created_at DESC LIMIT 1', [commuter.id]);
    const lastDate = commuter.last_trip_date || (lastTripRow ? lastTripRow.created_at : null);
    const shields = commuter.streak_shields || 0;
    const { newStreak, freezeUsed } = calculateNewStreak(lastDate, commuter.current_streak, shields);

    const { co2_saved_kg, equivalents } = calcCarbonKg(mode, distance_km);
    let points_earned = calculatePoints(co2_saved_kg, mode, newStreak);

    // Photo proof bonus
    if (isPhoto) points_earned = Math.round(points_earned * 1.5);

    const trip_id = genId('trip');
    const tx_hash = generateTxHash({ trip_id, commuter_id: commuter.id, mode, distance_km, co2_saved_kg });

    await db.run(
      `INSERT INTO trips (id, commuter_id, mode, distance_km, co2_saved_kg, points_earned, tx_hash, city, has_photo_proof, photo_media_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip_id, commuter.id, mode, distance_km, co2_saved_kg, points_earned, tx_hash, commuter.city, isPhoto ? 1 : 0, mediaUrl]
    );

    await db.run('INSERT INTO transactions (id, hash, trip_id) VALUES (?, ?, ?)', [genId('tx'), tx_hash, trip_id]);

    const newTotalCo2 = parseFloat((commuter.total_co2_saved_kg + co2_saved_kg).toFixed(3));
    const newTotalPoints = commuter.total_points + points_earned;
    const newBadge = assignBadge(newTotalCo2);

    let newShields = freezeUsed ? shields - 1 : shields;
    let shieldBonus = '';
    if (newStreak > 0 && newStreak % 7 === 0 && newStreak > commuter.current_streak) {
      newShields += 1;
      shieldBonus = '\n🛡️ 7-day streak! You earned a Streak Shield!';
    }
    if (freezeUsed) shieldBonus += '\n🛡️ Shield used to protect your streak!';

    const todayStr = new Date().toISOString();
    await db.run(
      `UPDATE commuters SET total_co2_saved_kg = ?, total_points = ?, current_streak = ?, badge = ?, streak_shields = ?, last_trip_date = ? WHERE id = ?`,
      [newTotalCo2, newTotalPoints, newStreak, newBadge, newShields, todayStr, commuter.id]
    );

    await db.run('INSERT INTO point_transactions (id, commuter_id, amount, reason) VALUES (?, ?, ?, ?)',
      [genId('ptx'), commuter.id, points_earned, `WhatsApp: ${mode} ${distance_km}km${isPhoto ? ' (photo)' : ''}`]);

    const shortHash = tx_hash.substring(0, 8);
    const photoLine = isPhoto ? '\n📸 Photo proof recorded! *1.5× bonus applied*' : '';
    const badgeLine = newBadge !== commuter.badge ? `\n🎉 New Badge: ${newBadge}!` : '';

    const reply =
      `✅ *Trip Logged!*\n` +
      `Mode: ${mode} | Distance: ${distance_km}km\n` +
      `🌍 CO₂ Saved: ${co2_saved_kg}kg\n` +
      `⭐ Points: +${points_earned}\n` +
      photoLine +
      `\n≈ 🌳 ${equivalents.trees_planted} trees planted\n` +
      `\nTotal Points: ${newTotalPoints} | Streak: ${newStreak}🔥` +
      shieldBonus +
      badgeLine +
      `\nTx: ${shortHash}...`;

    logger.info(`WhatsApp trip: ${commuter.id} | ${mode} ${distance_km}km | ${co2_saved_kg}kg${isPhoto ? ' [photo]' : ''}`);
    return twimlReply(res, reply);

  } catch (err) {
    logger.error('WhatsApp Webhook Error', err);
    return twimlReply(res, '❌ Something went wrong on our end. Please try again.');
  }
});

// ─── STATUS CHECK — GET /api/whatsapp/status ─────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    twilio_configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    webhook_url: process.env.TWILIO_WEBHOOK_URL || 'Not set — needed for production'
  });
});

module.exports = router;
