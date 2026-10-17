import {BAITS, LINES, effectiveRod, fishWeight, rollFish} from './economy.js?v=6';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function worldConditions(now = Date.now(), region = 0) {
  const cycle = (now % 1200000) / 1200000,
    phase = cycle < 0.12 ? 'dawn' : cycle < 0.51 ? 'day' : cycle < 0.64 ? 'dusk' : 'night';
  const bucket = Math.floor(now / 300000),
    h = Math.abs(Math.sin(bucket * 127.1 + region * 31.7) * 43758.5453) % 1,
    weather = h < 0.45 ? 'clear' : h < 0.69 ? 'mist' : h < 0.88 ? 'rain' : 'wind';
  const moon = (Math.floor(now / 86400000) % 8) / 8;
  const rarity =
    (phase === 'dawn' || phase === 'dusk' ? 1.22 : phase === 'night' ? 1.12 : 1) *
    (weather === 'rain' && region < 3 ? 1.18 : weather === 'mist' ? 1.08 : 1) *
    (moon > 0.3 && moon < 0.7 ? 1.08 : 1);
  return {
    cycle,
    phase,
    weather,
    moon,
    rarity,
    bite: weather === 'wind' ? 0.83 : weather === 'rain' ? 1.12 : 1,
    swell: region >= 3 ? (weather === 'wind' ? 1.4 : 1) : 0.2,
  };
}
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
