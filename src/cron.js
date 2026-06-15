// GreenMove — cron.js — Enhanced with Features 4, 9
const cron = require('node-cron');
const { getDb } = require('./db');
const logger = require('./logger');

/**
 * Aggregates trips into the carbon_log table.
 * Runs daily at midnight.
 */
async function aggregateDailyCarbonLog() {
  try {
    logger.info('Starting daily carbon_log aggregation...');
    const db = await getDb();
    
    // Get yesterday's date string (YYYY-MM-DD)
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const targetDate = date.toISOString().split('T')[0];

    // Fetch trips for yesterday, grouped by city
    const stats = await db.all(`
      SELECT 
        city,
        SUM(co2_saved_kg) as total_co2,
        COUNT(id) as total_trips
      FROM trips
      WHERE date(created_at) = ?
      GROUP BY city
    `, [targetDate]);

    for (let stat of stats) {
      // Calculate modal share
      const modesRaw = await db.all(`
        SELECT mode, COUNT(id) as count 
        FROM trips 
        WHERE date(created_at) = ? AND city = ?
        GROUP BY mode
      `, [targetDate, stat.city]);

      const modalShare = modesRaw.reduce((acc, row) => ({ ...acc, [row.mode]: row.count }), {});

      await db.run(`
        INSERT OR REPLACE INTO carbon_log (date, city, total_co2_kg, total_trips, modal_share_json)
        VALUES (?, ?, ?, ?, ?)
      `, [targetDate, stat.city, stat.total_co2, stat.total_trips, JSON.stringify(modalShare)]);
    }

    logger.info(`Daily aggregation completed for ${targetDate}. Processed ${stats.length} cities.`);
  } catch (err) {
    logger.error('Error during daily carbon_log aggregation:', err);
  }
}

/**
 * Feature 4: Weekly WhatsApp Digest
 * Runs every Monday at 8AM. For each active commuter (who has notify_enabled=1),
 * calculates last week's stats and sends a summary via the WhatsApp webhook logic.
 */
async function sendWeeklyDigest() {
  try {
    logger.info('Starting weekly WhatsApp digest...');
    const db = await getDb();

    const currentHour = new Date().getHours();

    // Get all active commuters with notifications enabled
    // Feature 9: Respect notify_enabled and notify_hour
    const commuters = await db.all(`
      SELECT c.id as commuter_id, c.employer_id, c.notify_hour, u.name
      FROM commuters c
      JOIN users u ON c.user_id = u.id
      WHERE c.is_active = 1 AND c.notify_enabled = 1
    `);

    let sentCount = 0;

    for (const com of commuters) {
      // Feature 9: Respect notify_hour — only send if current hour matches preference
      const preferredHour = com.notify_hour != null ? com.notify_hour : 8;
      if (currentHour !== preferredHour) {
        continue;
      }

      // Last week's stats
      const weekStats = await db.get(`
        SELECT 
          COUNT(id) as trip_count,
          COALESCE(SUM(co2_saved_kg), 0) as co2_saved
        FROM trips
        WHERE commuter_id = ?
          AND created_at >= date('now', '-7 days')
      `, [com.commuter_id]);

      if (weekStats.trip_count === 0) continue; // Skip if no trips last week

      // Rank within their company
      const rankResult = await db.get(`
        SELECT COUNT(*) + 1 as rank
        FROM commuters
        WHERE employer_id = ? AND is_active = 1
          AND total_co2_saved_kg > (SELECT total_co2_saved_kg FROM commuters WHERE id = ?)
      `, [com.employer_id, com.commuter_id]);

      const rank = rankResult ? rankResult.rank : '?';
      const co2 = parseFloat(weekStats.co2_saved.toFixed(2));

      const digestMessage = `Last week: ${weekStats.trip_count} trips, ${co2}kg saved 🌍 — you're #${rank} in your company!`;

      // Log the digest (in production, this would call Twilio/WhatsApp API)
      logger.info(`[Weekly Digest] ${com.name} (${com.commuter_id}): ${digestMessage}`);
      sentCount++;
    }

    logger.info(`Weekly digest complete. Sent ${sentCount} notifications.`);
  } catch (err) {
    logger.error('Error during weekly digest:', err);
  }
}

// Schedule tasks
function initCronJobs() {
  // Daily aggregation at midnight (00:00)
  cron.schedule('0 0 * * *', () => {
    aggregateDailyCarbonLog();
  });

  // Feature 4: Weekly digest every Monday at 8AM
  // Feature 9: Runs hourly on Mondays to respect per-user notify_hour
  cron.schedule('0 * * * 1', () => {
    sendWeeklyDigest();
  });

  logger.info('Cron jobs initialized: Daily aggregation at midnight, Weekly digest on Mondays.');
}

module.exports = { initCronJobs, aggregateDailyCarbonLog, sendWeeklyDigest };
