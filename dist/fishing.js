import {BAITS, LINES, effectiveRod, fishWeight, rollFish} from './economy.js?v=8';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// Weather by water: each region has its own climate. A spell of weather lasts about seven
// minutes and the scene eases from one spell into the next.
const CLIMATES = [
  {clear: 30, cloudy: 22, overcast: 12, mist: 12, rain: 14, storm: 4, wind: 6},
  {clear: 22, cloudy: 20, overcast: 14, mist: 16, rain: 18, storm: 4, wind: 6},
  {clear: 24, cloudy: 16, overcast: 12, mist: 24, rain: 14, storm: 4, wind: 6},
  {clear: 24, cloudy: 22, overcast: 14, mist: 10, rain: 12, storm: 6, wind: 12},
  {clear: 42, cloudy: 22, overcast: 6, mist: 4, rain: 12, storm: 8, wind: 6},
  {clear: 30, cloudy: 18, overcast: 10, mist: 4, rain: 12, storm: 10, wind: 16},
];
const BASE_TEMP = [15, 13, 11, 17, 27, 22],
  WEATHER_TEMP = {clear: 1.5, cloudy: 0, overcast: -1, mist: -2, rain: -3, storm: -4, wind: -2},
  WEATHER_WIND = {clear: 6, cloudy: 10, overcast: 12, mist: 3, rain: 14, storm: 42, wind: 32},
  WEATHER_COVER = {clear: 0.08, cloudy: 0.45, overcast: 0.9, mist: 0.7, rain: 0.95, storm: 1, wind: 0.35};
const hash = n => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;
export function worldConditions(now = Date.now(), region = 0) {
  const cycle = (now % 1200000) / 1200000,
    phase = cycle < 0.12 ? 'dawn' : cycle < 0.51 ? 'day' : cycle < 0.64 ? 'dusk' : 'night';
  const spell = Math.floor(now / 420000),
    climate = CLIMATES[region] || CLIMATES[0],
    total = Object.values(climate).reduce((a, b) => a + b, 0);
  let pick = hash(spell * 1.37 + region * 31.7) * total,
    weather = 'clear';
  for (const [w, weight] of Object.entries(climate)) {
    if ((pick -= weight) <= 0) {
      weather = w;
      break;
    }
  }
  const moon = (Math.floor(now / 86400000) % 8) / 8,
    day = Math.floor(now / 1200000);
  // Temperature: the water's climate, warmest early afternoon and coldest before dawn,
  // shifted by the weather and by a slow day-to-day drift.
  const tempC =
    Math.round(
      (BASE_TEMP[region] + 5 * Math.sin((cycle - 0.15) * Math.PI * 2) + (WEATHER_TEMP[weather] || 0) * (phase === 'night' && weather === 'clear' ? -1 : 1) + Math.sin(day * 1.7 + region) * 2.5) * 10,
    ) / 10;
  const windKmh = Math.round((WEATHER_WIND[weather] || 8) + (hash(spell + 9.1) - 0.5) * 8);
  const rarity =
    (phase === 'dawn' || phase === 'dusk' ? 1.22 : phase === 'night' ? 1.12 : 1) *
    (weather === 'rain' && region < 3 ? 1.18 : weather === 'mist' ? 1.08 : weather === 'overcast' ? 1.06 : weather === 'storm' ? 1.22 : 1) *
    (moon > 0.3 && moon < 0.7 ? 1.08 : 1);
  return {
    cycle,
    phase,
    weather,
    moon,
    rarity,
    tempC,
    windKmh,
    cover: WEATHER_COVER[weather] ?? 0.3,
    bite: {wind: 0.83, rain: 1.12, overcast: 1.06, cloudy: 1.03, storm: 0.88}[weather] || 1,
    swell: region >= 3 ? (weather === 'storm' ? 1.75 : weather === 'wind' ? 1.4 : 1) : weather === 'storm' ? 0.32 : 0.2,
  };
}
// How the weather reads to the player.
export const WEATHER_NAMES = {clear: 'Clear', cloudy: 'Partly cloudy', overcast: 'Overcast', mist: 'Fog', rain: 'Rain', storm: 'Storm', wind: 'Windy'};
export function startEncounter(s, conditions, rng = Math.random) {
  let bait = BAITS[s.bait] || BAITS[0];
  if (!s.ownedBaits.includes(bait.id)) {
    s.bait = 0;
    bait = BAITS[0];
  }
  const fish = rollFish(s, rng, conditions);
  s.attempts++;
  s.activeCast = true;
  s.rodCondition = Math.max(0, s.rodCondition - (s.rodBroken ? 0 : 0.18));
  const bites = rng() < Math.min(0.98, bait.bite * conditions.bite);
  const weight = fishWeight(fish),
    spPower = 0.7 + Math.sqrt(weight) * 1.1;
  return {
    fish,
    bites,
    bait: bait.id,
    progress: 0,
    tension: 0.24,
    slack: 0,
    misses: 0,
    elapsed: 0,
    overload: 0,
    weight,
    power: spPower,
    outcome: null,
    pulls: 0,
    environment: conditions,
    held: false,
  };
}
export function reelProfile(rarity = 0) {
  const r = clamp(Math.floor(rarity), 0, 4);
  return {width: [0.68, 0.5, 0.34, 0.22, 0.12][r], speed: [0.00105, 0.0016, 0.0022, 0.0031, 0.0042][r]};
}
export function isReelHit(fight, accuracy) {
  return Math.abs(accuracy - 0.5) <= reelProfile(fight.rarity).width / 2;
}
export function setFishPower(fight, rarity) {
  fight.rarity = rarity;
  fight.power += rarity * 0.55;
  return fight;
}
export function stepFight(fight, s, dt) {
  if (fight.outcome) return fight.outcome;
  dt = clamp(dt, 0, 0.1);
  fight.elapsed += dt;
  const rod = effectiveRod(s),
    line = LINES[s.line],
    ratio = fight.power / Math.min(rod.power, line.power);
  fight.tension = clamp(fight.tension + ((ratio > 1 ? (ratio - 1) * 0.027 : 0) - 0.035) * dt, 0.08, 1.2);
  fight.slack += dt * 0.014;
  fight.overload = fight.tension > 0.91 ? fight.overload + dt : Math.max(0, fight.overload - dt * 0.7);
  if (fight.overload > 1.7) {
    fight.outcome = rod.power < line.power && s.rod > 0 && !s.rodBroken ? 'rod-snap' : 'line-snap';
  } else if (fight.slack > 1 || fight.elapsed > 48 || fight.misses >= 4) fight.outcome = 'escaped';
  return fight.outcome;
}
export function reelPull(fight, s, accuracy) {
  if (fight.outcome) return fight.outcome;
  const ratio = fight.power / Math.min(effectiveRod(s).power, LINES[s.line].power);
  fight.pulls++;
  const hit = isReelHit(fight, accuracy);
  if (hit) {
    fight.slack = Math.max(0, fight.slack - 0.16);
    fight.progress += 0.24 / Math.max(0.85, ratio);
    fight.tension += 0.07 + Math.max(0, ratio - 1) * 0.17;
  } else {
    fight.misses++;
    fight.progress = Math.max(0, fight.progress - 0.035);
    fight.tension += 0.19 + Math.max(0, ratio - 1) * 0.12;
    fight.slack += 0.13;
  }
  if (s.rod > 0 && !s.rodBroken) {
    s.rodCondition = Math.max(0, s.rodCondition - (hit ? 0.25 : 0.9));
    if (s.rodCondition <= 0) {
      fight.outcome = 'rod-snap';
      return fight.outcome;
    }
  }
  if (ratio > 1.1) fight.progress = Math.min(0.82, fight.progress);
  if (fight.tension >= 1.06)
    fight.outcome = effectiveRod(s).power < LINES[s.line].power && s.rod > 0 && !s.rodBroken ? 'rod-snap' : 'line-snap';
  else if (fight.misses >= 4) fight.outcome = 'escaped';
  else if (fight.progress >= 1 && ratio <= 1.1) fight.outcome = 'caught';
  return fight.outcome;
}
export function resolveFailure(s, reason) {
  s.activeCast = false;
  if (reason === 'rod-snap') {
    s.rodBroken = true;
    s.rodCondition = 0;
  } else if (reason === 'line-snap') {
    s.rodCondition = Math.max(0, s.rodCondition - 8);
    if (s.line > 0) {
      const cost = Math.max(6, Math.ceil(LINES[s.line].cost * 0.06));
      if (s.pearls >= cost) s.pearls -= cost;
      else s.line = 0;
    }
  } else s.rodCondition = Math.max(0, s.rodCondition - 2);
  if (s.rodCondition <= 0 && s.rod > 0) s.rodBroken = true;
}
