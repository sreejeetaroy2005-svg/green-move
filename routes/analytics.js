// GreenMove — routes/analytics.js — Enhanced with Feature 8
const express = require('express');
const { getDb } = require('../src/db');
const logger = require('../src/logger');

const router = express.Router();

router.get('/city', async (req, res) => {
  try {
    const db = await getDb();
    const cityFilter = req.query.city;
    
    let whereClause = '1=1';
    let params = [];
    if (cityFilter && cityFilter !== 'All') {
      whereClause = 'c.city = ?';
      params.push(cityFilter);
    }

    const stats = await db.get(`
      SELECT 
        SUM(t.co2_saved_kg) as total_co2,
        COUNT(t.id) as total_trips,
        COUNT(DISTINCT t.commuter_id) as active_commuters
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      WHERE ${whereClause}
    `, params);

    const modalShareRaw = await db.all(`
      SELECT t.mode, COUNT(t.id) as count 
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      WHERE ${whereClause}
      GROUP BY t.mode
    `, params);
    
    const modalShare = modalShareRaw.reduce((acc, row) => ({...acc, [row.mode]: row.count}), {});

    const topEmployers = await db.all(`
      SELECT e.name, SUM(t.co2_saved_kg) as total_co2
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      JOIN employers e ON c.employer_id = e.id
      WHERE ${whereClause.replace('c.city', 'e.city')}
      GROUP BY e.id
      ORDER BY total_co2 DESC
      LIMIT 10
    `, params);

    res.json({
      success: true,
      data: {
        total_co2: stats.total_co2 || 0,
        total_trips: stats.total_trips || 0,
        active_commuters: stats.active_commuters || 0,
        modal_share: modalShare,
        top_employers: topEmployers
      }
    });
  } catch (err) {
    logger.error('Analytics city error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GreenMove — Feature 1: Live Carbon Counter endpoint
router.get('/city/today', async (req, res) => {
  try {
    const db = await getDb();
    
    // Get today's date in YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    const stats = await db.get(`
      SELECT 
        SUM(co2_saved_kg) as total_co2_kg_today,
        COUNT(id) as total_trips_today,
        COUNT(DISTINCT commuter_id) as active_commuters_today
      FROM trips
      WHERE date(created_at) = ?
    `, [today]);

    const topCityRow = await db.get(`
      SELECT city, SUM(co2_saved_kg) as city_co2
      FROM trips
      WHERE date(created_at) = ?
      GROUP BY city
      ORDER BY city_co2 DESC
      LIMIT 1
    `, [today]);

    res.json({
      success: true,
      data: {
        total_co2_kg_today: stats.total_co2_kg_today || 0,
        active_commuters_today: stats.active_commuters_today || 0,
        total_trips_today: stats.total_trips_today || 0,
        top_city: topCityRow ? topCityRow.city : 'Bengaluru'
      }
    });
  } catch (err) {
    logger.error('Analytics city today error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/employer/:id', async (req, res) => {
  try {
    const db = await getDb();
    const employer_id = req.params.id;
    const timeFilter = req.query.timeRange || 'all'; // 'this_week', 'this_month'

    let timeClause = '';
    if (timeFilter === 'this_month') timeClause = "AND t.created_at >= date('now', 'start of month')";
    else if (timeFilter === 'this_week') timeClause = "AND t.created_at >= date('now', '-7 days')";

    const stats = await db.get(`
      SELECT 
        SUM(t.co2_saved_kg) as total_co2,
        COUNT(t.id) as total_trips,
        COUNT(DISTINCT t.commuter_id) as active_commuters
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      WHERE c.employer_id = ? ${timeClause}
    `, [employer_id]);

    const modalShareRaw = await db.all(`
      SELECT t.mode, COUNT(t.id) as count 
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      WHERE c.employer_id = ? ${timeClause}
      GROUP BY t.mode
    `, [employer_id]);

    const modalShare = modalShareRaw.reduce((acc, row) => ({...acc, [row.mode]: row.count}), {});

    const team_leaderboard = await db.all(`
      SELECT u.name, t.mode, SUM(t.co2_saved_kg) as total_co2, SUM(t.points_earned) as total_points, c.badge
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE c.employer_id = ? ${timeClause}
      GROUP BY t.commuter_id
      ORDER BY total_co2 DESC
    `, [employer_id]);

    const verified_trips = await db.all(`
      SELECT u.name, t.mode, t.distance_km, t.co2_saved_kg, t.tx_hash, t.created_at
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE c.employer_id = ? ${timeClause}
      ORDER BY t.created_at DESC
    `, [employer_id]);

    res.json({
      success: true,
      data: {
        total_co2: stats.total_co2 || 0,
        total_trips: stats.total_trips || 0,
        active_commuters: stats.active_commuters || 0,
        modal_share: modalShare,
        team_leaderboard,
        verified_trips
      }
    });
  } catch (err) {
    logger.error('Analytics employer error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 4: Employer Carbon Certificate PDF
router.get('/employer/certificate/:employer_id', async (req, res) => {
  try {
    const db = await getDb();
    const employer_id = req.params.employer_id;
    const month = new Date().toLocaleString('default', { month: 'long' });
    const year = new Date().getFullYear();

    const employer = await db.get('SELECT name FROM employers WHERE id = ?', [employer_id]);
    if (!employer) return res.status(404).json({ success: false, error: 'Employer not found' });

    const stats = await db.get(`
      SELECT SUM(t.co2_saved_kg) as total_co2, COUNT(t.id) as total_trips
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      WHERE c.employer_id = ? AND strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now')
    `, [employer_id]);

    const topCommuters = await db.all(`
      SELECT u.name, SUM(t.co2_saved_kg) as total_co2
      FROM trips t
      JOIN commuters c ON t.commuter_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE c.employer_id = ? AND strftime('%Y-%m', t.created_at) = strftime('%Y-%m', 'now')
      GROUP BY c.id
      ORDER BY total_co2 DESC
      LIMIT 3
    `, [employer_id]);

    const { getEquivalents } = require('../src/carbon-engine');
    const equivalents = getEquivalents(stats.total_co2 || 0);

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="GreenMove-Certificate-${month}-${year}.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 20).fill('#1A2E1A');
    
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#1A2E1A').text('GreenMove', { align: 'center' });
    doc.moveDown(1);
    
    doc.font('Helvetica-Bold').fontSize(20).text('Green Commute Verification Certificate', { align: 'center' });
    doc.font('Helvetica').fontSize(12).fillColor('#666666').text('Issued by GreenMove | Blockchain-Verified', { align: 'center' });
    
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(28).fillColor('#1A2E1A').text(employer.name, { align: 'center' });
    doc.font('Helvetica').fontSize(14).fillColor('#666666').text(`${month} ${year}`, { align: 'center' });
    
    doc.moveDown(2);
    
    const totalTrips = stats.total_trips || 0;
    const totalCo2 = (stats.total_co2 || 0).toFixed(2);
    
    doc.font('Helvetica').fontSize(16).fillColor('#1A2E1A').text(`Total verified green trips: ${totalTrips}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#97BC62').text(`${totalCo2} kg CO₂ Avoided`, { align: 'center' });
    
    doc.moveDown(1.5);
    
    doc.font('Helvetica').fontSize(12).fillColor('#666666').text(`Equivalents: 🌳 ${equivalents.trees_planted} trees | 🚗 ${equivalents.km_driving_avoided} car km | 📱 ${equivalents.phone_charges} charges`, { align: 'center' });
    
    doc.moveDown(2);
    
    doc.rect(doc.page.width/2 - 200, doc.y, 400, 120).stroke('#97BC62');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1A2E1A').text('Top 3 Green Commuters', { align: 'center' });
    doc.moveDown(0.5);
    
    topCommuters.forEach((c, idx) => {
      const firstName = c.name.split(' ')[0];
      doc.font('Helvetica').fontSize(12).fillColor('#1A2E1A').text(`${idx+1}. ${firstName} - ${c.total_co2.toFixed(1)} kg`, { align: 'center' });
    });
    
    doc.moveDown(4);
    
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666666')
       .text('All trips recorded in this certificate are cryptographically verified on the GreenMove blockchain ledger. This certificate is tamper-proof and independently auditable.', 
             { align: 'center', width: 400 });
             
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(10).fillColor('#1A2E1A').text('GreenMove | Carbon Reduction & Green Mobility Platform | Bengaluru, India', { align: 'center' });

    doc.rect(0, doc.page.height - 20, doc.page.width, 20).fill('#1A2E1A');

    doc.end();

  } catch (err) {
    logger.error('Certificate generation error', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 8: Enhanced trends with weekly period + mode breakdown
router.get('/trends', async (req, res) => {
  try {
    const db = await getDb();
    const period = req.query.period || 'daily'; // daily, weekly, monthly
    
    let dateFormat;
    if (period === 'weekly') {
      dateFormat = "strftime('%Y-%W', created_at)";
    } else if (period === 'monthly') {
      dateFormat = "strftime('%Y-%m', created_at)";
    } else {
      dateFormat = "date(created_at)";
    }

    // Get total CO2 per period
    const trends = await db.all(`
      SELECT ${dateFormat} as period_lbl, SUM(co2_saved_kg) as co2
      FROM trips
      GROUP BY period_lbl
      ORDER BY period_lbl ASC
      LIMIT 30
    `);

    // Get mode breakdown per period
    const modeBreakdown = await db.all(`
      SELECT 
        ${dateFormat} as period_lbl,
        mode,
        SUM(co2_saved_kg) as mode_co2
      FROM trips
      GROUP BY period_lbl, mode
      ORDER BY period_lbl ASC
    `);

    // Merge mode breakdown into trends
    const breakdownMap = {};
    for (const row of modeBreakdown) {
      if (!breakdownMap[row.period_lbl]) {
        breakdownMap[row.period_lbl] = { walk: 0, cycle: 0, bus: 0, metro: 0, carpool: 0 };
      }
      breakdownMap[row.period_lbl][row.mode] = parseFloat(row.mode_co2.toFixed(3));
    }

    const enrichedTrends = trends.map(t => ({
      period_lbl: t.period_lbl,
      co2: parseFloat(t.co2),
      mode_breakdown: breakdownMap[t.period_lbl] || { walk: 0, cycle: 0, bus: 0, metro: 0, carpool: 0 }
    }));
    
    res.json({ success: true, data: enrichedTrends });
  } catch (err) {
    logger.error('Analytics trends error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Feature 5: City Zone Green Score Map
router.get('/zones', async (req, res) => {
  try {
    const db = await getDb();
    
    const statsRaw = await db.all(`
      SELECT city as zone_name, SUM(co2_saved_kg) as total_co2_kg, COUNT(id) as total_trips
      FROM trips
      GROUP BY city
    `);
    
    const zonesData = [];
    for (const stat of statsRaw) {
      if (!stat.zone_name) continue;
      const topModeRow = await db.get(`
        SELECT mode, COUNT(id) as cnt
        FROM trips
        WHERE city = ?
        GROUP BY mode
        ORDER BY cnt DESC
        LIMIT 1
      `, [stat.zone_name]);
      
      zonesData.push({
        zone_name: stat.zone_name,
        total_co2_kg: parseFloat(stat.total_co2_kg.toFixed(3)),
        total_trips: stat.total_trips,
        top_mode: topModeRow ? topModeRow.mode : 'N/A'
      });
    }

    res.json({ success: true, data: zonesData });
  } catch (err) {
    logger.error('Analytics zones error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
