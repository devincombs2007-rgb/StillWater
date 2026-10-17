// Acceleration-limited steering. A fish changes its velocity and heading before
// it changes its position, so feeding never teleports or lerps it across the tank.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function makeSwimmer(i, count = 6) {
  const a = i * 2.399963;
  return {
    p: {x: Math.sin(a) * 2.7, y: 1.05 + ((i * 0.618) % 1) * 2.8, z: Math.cos(a) * 1.25},
    v: {x: Math.cos(a) * 0.3, y: 0, z: -Math.sin(a) * 0.3},
    goal: {x: 0, y: 2, z: 0},
    yaw: Math.atan2(Math.sin(a), Math.cos(a)),
    pitch: 0,
    phase: a,
    decision: 0,
    speed: 0.45 + (i % 5) * 0.075,
    turn: 1.2 + (i % 4) * 0.2,
    tail: 0,
  };
}
export function stepSwimmer(s, dt, time, feeding, feed, neighbors = [], bottom = false) {
  dt = clamp(dt, 0, 0.05);
  s.decision -= dt;
  if (s.decision <= 0) {
    s.decision = 2.2 + (Math.sin(s.phase + time) * 0.5 + 0.5) * 3.2;
    const a = time * 0.17 + s.phase;
    // The extra per-fish offset matters: golden-angle phases times 1.31 land almost exactly on
    // multiples of pi, which used to send every fish to the same x and clump the school.
    s.goal = {
      x: Math.sin(a * 1.31 + s.phase * 0.61) * 3.35,
      y: bottom ? 0.85 + 0.15 * Math.sin(a) : 1.1 + (0.5 + 0.5 * Math.sin(a * 0.7)) * 2.8,
      z: Math.cos(a * 0.83) * 1.6,
    };
  }
  let target = s.goal;
  const panic = s.panicUntil > time;
  if (feeding) {
    const a = s.phase + time * 0.24;
    target = {
      x: feed.x + Math.sin(a) * 0.72,
      y: Math.max(1, feed.y - 0.25 - (s.phase % 1) * 0.4),
      z: feed.z + Math.cos(a) * 0.65,
    };
  }
  if (panic && s.scatter) {
    const dx = s.p.x - s.scatter.x,
      dz = s.p.z - s.scatter.z,
      n = Math.hypot(dx, dz) || 1;
    target = {x: s.p.x + (dx / n) * 2, y: s.p.y - 0.25, z: s.p.z + (dz / n) * 2};
  }
  let dx = target.x - s.p.x,
    dy = target.y - s.p.y,
    dz = target.z - s.p.z;
  let d = Math.hypot(dx, dy, dz) || 1;
  const speed = s.speed * (panic ? 1.65 : feeding ? 1.45 : 1) * clamp(d, 0.22, 1);
  let tx = (dx / d) * speed,
    ty = (dy / d) * speed * 0.6,
    tz = (dz / d) * speed;
  for (const other of neighbors) {
    if (other === s) continue;
    const x = s.p.x - other.p.x,
      y = s.p.y - other.p.y,
      z = s.p.z - other.p.z;
    const dist = Math.hypot(x, y, z);
    if (dist > 0.01 && dist < 0.5) {
      const w = (0.5 - dist) * 0.7;
      tx += (x / dist) * w;
      ty += (y / dist) * w;
      tz += (z / dist) * w;
    }
  }
  for (const [axis, min, max] of [
    ['x', -3.8, 3.8],
    ['y', 0.7, 4.25],
    ['z', -1.95, 1.95],
  ]) {
    const p = s.p[axis];
    let force = p < min ? (min - p) * 2 : p > max ? (max - p) * 2 : 0;
    if (axis === 'x') tx += force;
    if (axis === 'y') ty += force;
    if (axis === 'z') tz += force;
  }
  const ax = tx - s.v.x,
    ay = ty - s.v.y,
    az = tz - s.v.z,
    am = Math.hypot(ax, ay, az) || 1,
    maxA = (panic ? 1.5 : 0.52) * dt;
  const factor = Math.min(1, maxA / am);
  s.v.x += ax * factor;
  s.v.y += ay * factor;
  s.v.z += az * factor;
  const vmax = s.speed * 1.65,
    m = Math.hypot(s.v.x, s.v.y, s.v.z);
  if (m > vmax) {
    s.v.x *= vmax / m;
    s.v.y *= vmax / m;
    s.v.z *= vmax / m;
  }
  s.p.x += s.v.x * dt;
  s.p.y += s.v.y * dt;
  s.p.z += s.v.z * dt;
  s.p.x = clamp(s.p.x, -4, 4);
  s.p.y = clamp(s.p.y, 0.62, 4.35);
  s.p.z = clamp(s.p.z, -2.15, 2.15);
  const yaw = Math.atan2(-s.v.z, s.v.x),
    diff = Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw));
  s.yaw += clamp(diff, -s.turn * dt, s.turn * dt);
  s.pitch += (Math.atan2(s.v.y, Math.hypot(s.v.x, s.v.z)) * 0.6 - s.pitch) * Math.min(1, dt * 2);
  s.tail += dt * (3.4 + Math.hypot(s.v.x, s.v.z) * 4);
  return s;
}
