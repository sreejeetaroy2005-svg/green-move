// GreenMove — helpers.js — refined for Round 2
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Generates a random unique ID with a given prefix.
 * @param {string} prefix - ID prefix (e.g., 'trip', 'com')
 * @returns {string} Unique ID
 */
function genId(prefix = 'id') {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

/**
 * Mocks the blockchain transaction hash generation.
 * @param {object} tripData - Data to hash
 * @returns {string} SHA-256 Hash
 */
function generateTxHash(tripData) {
  const dataString = JSON.stringify(tripData) + Date.now().toString();
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Calculates points earned for a trip based on CO2 saved and streak.
 * @param {number} co2_saved_kg - CO2 saved in kg
 * @param {string} mode - Mode of transport
 * @param {number} streak - Current day streak
 * @returns {number} Points earned
 */
function calculatePoints(co2_saved_kg, mode, streak) {
  let basePoints = Math.floor(co2_saved_kg * 10); // 1 point per 100g

  if (mode === 'cycle' || mode === 'walk') {
    basePoints = Math.floor(basePoints * 1.5);
  }

  if (streak >= 5) {
    basePoints = basePoints * 2;
  }

  return basePoints;
}

const BADGE_THRESHOLDS = [
  { name: 'Newbie', threshold: 0 },
  { name: '🌱 Green Starter', threshold: 0.1 },
  { name: '🌍 Carbon Saver', threshold: 10 },
  { name: '🏆 Green Champion', threshold: 50 },
  { name: '💎 Earth Guardian', threshold: 100 }
];

/**
 * Assigns a badge based on total CO2 saved.
 * @param {number} total_co2_saved_kg 
 * @returns {string} Badge name
 */
function assignBadge(total_co2_saved_kg) {
  let currentBadge = 'Newbie';
  for (let b of BADGE_THRESHOLDS) {
    if (total_co2_saved_kg >= b.threshold) {
      currentBadge = b.name;
    }
  }
  return currentBadge;
}

/**
 * Determines the next badge and how much CO2 is needed to reach it.
 * @param {number} current_co2 - Current total CO2 saved
 * @returns {object|null} Object with next badge info or null if maxed out
 */
function getNextBadge(current_co2) {
  for (let b of BADGE_THRESHOLDS) {
    if (current_co2 < b.threshold) {
      return {
        next_badge: b.name,
        co2_needed: parseFloat((b.threshold - current_co2).toFixed(3)),
        progress_pct: Math.min(100, Math.floor((current_co2 / b.threshold) * 100))
      };
    }
  }
  return null; // Max badge achieved
}

/**
 * Calculates new streak based on the last trip date.
 * If skipped a calendar day, checks for available streak shields.
 * @param {string} lastTripDateStr - ISO date string of last trip
 * @param {number} currentStreak - Existing streak
 * @param {number} [streakShields=0] - Available streak shields
 * @returns {{ newStreak: number, freezeUsed: boolean }} New streak and whether a shield was consumed
 */
function calculateNewStreak(lastTripDateStr, currentStreak, streakShields = 0) {
  if (!lastTripDateStr) return { newStreak: 1, freezeUsed: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastTripDate = new Date(lastTripDateStr);
  lastTripDate.setHours(0, 0, 0, 0);

  const diffTime = today - lastTripDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Trip already logged today, streak remains the same
    return { newStreak: currentStreak, freezeUsed: false };
  } else if (diffDays === 1) {
    // Logged yesterday, increment streak
    return { newStreak: currentStreak + 1, freezeUsed: false };
  } else if (diffDays > 1) {
    // Skipped a day — check for streak shield
    if (streakShields > 0) {
      return { newStreak: currentStreak + 1, freezeUsed: true };
    }
    // No shield available, reset streak
    return { newStreak: 1, freezeUsed: false };
  }
  return { newStreak: 1, freezeUsed: false };
}

module.exports = {
  genId,
  generateTxHash,
  calculatePoints,
  assignBadge,
  getNextBadge,
  calculateNewStreak
};
