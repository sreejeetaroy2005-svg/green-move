// GreenMove — seed.js — Enhanced for Sprint Features
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');
const { genId, generateTxHash, calculatePoints, assignBadge, calculateNewStreak } = require('./helpers');
const { calcCarbonKg } = require('./carbon-engine');
const logger = require('./logger');

const ZONES = ['Whitefield', 'Electronic City', 'Koramangala', 'Indiranagar', 'HSR Layout', 'Sarjapur', 'Hebbal', 'Yeshwanthpur', 'JP Nagar', 'Bannerghatta', 'Yelahanka', 'Marathahalli'];
const EMPLOYERS = [
  { id: 'emp_1', name: 'Infosys Electronic City', city: 'Electronic City' },
  { id: 'emp_2', name: 'Wipro Sarjapur', city: 'Sarjapur' },
  { id: 'emp_3', name: 'TCS Whitefield', city: 'Whitefield' },
  { id: 'emp_4', name: 'Mindtree Bengaluru', city: 'Indiranagar' },
  { id: 'emp_5', name: 'Accenture Hyderabad', city: 'Koramangala' }
];

const MODES = ['walk', 'cycle', 'bus', 'metro', 'carpool'];

// Generate past 30 dates
const past30Days = [];
for (let i = 30; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  past30Days.push(d);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

// Feature 2: Reward catalog items to seed per employer
const REWARD_CATALOG_ITEMS = [
  { name: 'BMTC Monthly Pass', description: 'Free BMTC bus pass for one month', points_cost: 500, stock: 10 },
  { name: 'Café Voucher', description: '₹200 voucher at partner cafés', points_cost: 200, stock: 25 },
  { name: 'WFH Day', description: 'One additional work-from-home day', points_cost: 300, stock: 15 },
  { name: 'Parking Fee Waiver', description: 'One month parking fee waived', points_cost: 150, stock: 20 }
];

async function runSeed() {
  logger.info('Starting Enhanced Data Seed...');
  const db = await getDb();

  // Clear existing data
  await db.exec(`
    DELETE FROM transactions;
    DELETE FROM point_transactions;
    DELETE FROM rewards;
    DELETE FROM trips;
    DELETE FROM commuters;
    DELETE FROM users;
    DELETE FROM employers;
    DELETE FROM carbon_log;
    DELETE FROM reward_catalog;
    DELETE FROM challenges;
  `);

  // Insert Employers
  for (let emp of EMPLOYERS) {
    await db.run(
      'INSERT INTO employers (id, name, city, points_to_perk_ratio) VALUES (?, ?, ?, ?)',
      [emp.id, emp.name, emp.city, 100]
    );
  }

  // Insert 1 City Planner
  const plannerId = genId('user');
  const hash = await bcrypt.hash('password123', 10);
  await db.run('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
    [plannerId, 'City Planner', 'planner@blr.gov.in', hash, 'city_planner']);

  // Insert 5 HRs (one per employer)
  for (let i = 0; i < EMPLOYERS.length; i++) {
    const hrId = genId('user');
    await db.run('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [hrId, 'HR ' + EMPLOYERS[i].name, `hr${i+1}@${EMPLOYERS[i].name.split(' ')[0].toLowerCase()}.com`, hash, 'employer']);
    await db.run('UPDATE employers SET id = ? WHERE name = ?', [hrId, EMPLOYERS[i].name]);
    EMPLOYERS[i].id = hrId;
  }

  // Ensure 'hr@techcorp.com' exists for the default demo script
  const hrDefaultId = genId('user');
  await db.run('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [hrDefaultId, 'TechCorp HR', 'hr@techcorp.com', hash, 'employer']);
  await db.run('INSERT INTO employers (id, name, city, points_to_perk_ratio) VALUES (?, ?, ?, ?)',
      [hrDefaultId, 'TechCorp', 'Indiranagar', 100]);
  EMPLOYERS.push({ id: hrDefaultId, name: 'TechCorp', city: 'Indiranagar' });

  // Feature 2: Seed reward catalog for each employer
  for (const emp of EMPLOYERS) {
    for (const item of REWARD_CATALOG_ITEMS) {
      await db.run(
        'INSERT INTO reward_catalog (id, employer_id, name, description, points_cost, stock, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [genId('rc'), emp.id, item.name, item.description, item.points_cost, item.stock]
      );
    }
  }

  // Generate 25 Commuters
  const commuters = [];
  for (let i = 1; i <= 25; i++) {
    const userId = genId('user');
    const comId = genId('com');
    const emp = randomChoice(EMPLOYERS);
    
    const email = i === 1 ? 'arjun@techcorp.com' : `commuter${i}@${emp.name.split(' ')[0].toLowerCase()}.com`;
    const name = i === 1 ? 'Arjun' : `Commuter ${i}`;
    const employerId = i === 1 ? hrDefaultId : emp.id;
    // Feature 5: Assign each commuter to a random zone
    const city = i === 1 ? 'Indiranagar' : randomChoice(ZONES);

    await db.run('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)', 
      [userId, name, email, hash, 'commuter']);

    await db.run(
      `INSERT INTO commuters (id, user_id, employer_id, city, preferred_mode, total_co2_saved_kg, total_points, current_streak, badge, is_active, streak_freeze_count, notify_enabled, notify_hour) 
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'Newbie', 1, 0, 1, 8)`,
      [comId, userId, employerId, city, randomChoice(MODES)]
    );

    commuters.push({ id: comId, userId, city, employerId, total_co2: 0, total_points: 0, streak: 0 });
  }

  // Generate 200 realistic trips over the last 30 days
  for (let i = 0; i < 200; i++) {
    const com = randomChoice(commuters);
    const date = randomChoice(past30Days);
    const mode = randomChoice(MODES);
    const dist = parseFloat((Math.random() * 15 + 1).toFixed(1));
    
    if (date.getDay() === 0 || date.getDay() === 6) {
      if (Math.random() > 0.3) continue;
    }

    const { co2_saved_kg } = calcCarbonKg(mode, dist);
    
    // Updated for new calculateNewStreak return format
    const { newStreak } = calculateNewStreak(date.toISOString(), com.streak);
    com.streak = newStreak;
    const pts = calculatePoints(co2_saved_kg, mode, com.streak);
    
    const tripId = genId('trip');
    const txHash = generateTxHash({ tripId, commuterId: com.id, mode, dist, co2_saved_kg });

    const timeStr = `${date.toISOString().split('T')[0]} 09:${randomInt(10,59)}:00`;
    await db.run(
      `INSERT INTO trips (id, commuter_id, mode, distance_km, co2_saved_kg, points_earned, tx_hash, city, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tripId, com.id, mode, dist, co2_saved_kg, pts, txHash, com.city, timeStr]
    );

    com.total_co2 += co2_saved_kg;
    com.total_points += pts;
  }

  // Update commuters table with final aggregated stats
  for (let com of commuters) {
    const badge = assignBadge(com.total_co2);
    await db.run(
      'UPDATE commuters SET total_co2_saved_kg = ?, total_points = ?, current_streak = ?, badge = ? WHERE id = ?',
      [parseFloat(com.total_co2.toFixed(3)), com.total_points, com.streak, badge, com.id]
    );
  }

  logger.info('Seed complete! Test Accounts:');
  logger.info('Commuter: arjun@techcorp.com | pwd: password123');
  logger.info('Employer: hr@techcorp.com | pwd: password123');
  logger.info('Planner: planner@blr.gov.in | pwd: password123');
  logger.info(`Reward catalog seeded: ${EMPLOYERS.length * REWARD_CATALOG_ITEMS.length} items across ${EMPLOYERS.length} employers`);
}

runSeed().catch(console.error);
