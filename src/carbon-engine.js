// GreenMove — src/carbon-engine.js — refined for Round 2

/**
 * Emission factors based on IPCC / UITP India standards.
 * Represent grams of CO2 emitted per passenger kilometer.
 * @constant
 * @type {Object<string, number>}
 */
const EMISSION_FACTORS = {
  walk: 0,
  cycle: 0,
  metro: 41,
  bus: 89,
  carpool: 43,
  car: 192 // baseline private car
};

/**
 * Validates mode and distance inputs.
 * @param {string} mode - Mode of transport
 * @param {number} distance_km - Distance in km
 * @throws {Error} If inputs are invalid
 */
function validateInputs(mode, distance_km) {
  if (!mode || typeof mode !== 'string') {
    throw new Error("Invalid mode: Mode must be a valid string.");
  }
  if (!EMISSION_FACTORS.hasOwnProperty(mode.toLowerCase())) {
    throw new Error(`Invalid mode: '${mode}' is not supported.`);
  }
  if (typeof distance_km !== 'number' || isNaN(distance_km) || distance_km <= 0) {
    throw new Error("Invalid distance: Distance must be a positive number.");
  }
}

/**
 * Converts CO2 saved in kg to relatable environmental equivalents.
 * @param {number} co2_saved_kg - The amount of CO2 saved in kilograms
 * @returns {object} Object containing equivalent metrics
 */
function getEquivalents(co2_saved_kg) {
  if (co2_saved_kg < 0) co2_saved_kg = 0;
  
  return {
    trees_planted: parseFloat((co2_saved_kg / 21).toFixed(3)),
    phone_charges: Math.round(co2_saved_kg / 0.008),
    km_driving_avoided: parseFloat((co2_saved_kg / 0.192).toFixed(1)),
    plastic_bottles_recycled: Math.round(co2_saved_kg / 0.05),
    led_bulb_hours: Math.round(co2_saved_kg / 0.01)
  };
}

/**
 * Calculates CO2 savings based on baseline vs chosen mode.
 * @param {string} mode - Mode of transport
 * @param {number} distance_km - Distance in km
 * @returns {object} { co2_saved_kg, equivalents }
 */
function calcCarbonKg(mode, distance_km) {
  validateInputs(mode, distance_km);
  
  const modeKey = mode.toLowerCase();
  const modeFactor = EMISSION_FACTORS[modeKey];
  const baselineFactor = EMISSION_FACTORS.car;

  // Formula: co2_saved_kg = (baseline_factor - mode_factor) * distance_km / 1000
  let co2_saved_kg = ((baselineFactor - modeFactor) * distance_km) / 1000;
  
  if (co2_saved_kg < 0) co2_saved_kg = 0;

  const equivalents = getEquivalents(co2_saved_kg);

  return {
    co2_saved_kg: parseFloat(co2_saved_kg.toFixed(3)),
    equivalents
  };
}

/**
 * Projects CO2 saved over 30 days based on a daily commute pattern.
 * @param {number} daily_km - Distance commuted per day
 * @param {string} mode - Mode of transport used
 * @returns {number} Projected CO2 saved over 30 days (kg)
 */
function getMonthlyProjection(daily_km, mode) {
  validateInputs(mode, daily_km);
  const dailySavings = calcCarbonKg(mode, daily_km).co2_saved_kg;
  return parseFloat((dailySavings * 30).toFixed(3));
}

module.exports = {
  EMISSION_FACTORS,
  calcCarbonKg,
  getEquivalents,
  getMonthlyProjection
};
