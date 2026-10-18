// Damped shallow-water height field with reflecting tank walls. Positions are metres.
export function createTankSurface(nx = 47, nz = 29, width = 9.15, depth = 5.15) {
  const height = new Float32Array(nx * nz),
    velocity = new Float32Array(nx * nz),
    next = new Float32Array(nx * nz),
    dx = width / (nx - 1),
    dz = depth / (nz - 1),
    speed = 1.65;
  let debt = 0;
  function impulse(x, z, strength = 0.3, radius = 0.36) {
    let total = 0;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const px = i * dx - width / 2,
          pz = j * dz - depth / 2,
          d2 = (px - x) ** 2 + (pz - z) ** 2,
          k = Math.exp(-d2 / (radius * radius));
        const kick = strength * k;
        velocity[j * nx + i] += kick;
        total += kick;
      }
    const mean = total / velocity.length;
    for (let k = 0; k < velocity.length; k++) velocity[k] -= mean;
  }
  function update(dt) {
    debt += Math.min(0.1, Math.max(0, dt));
    const step = 1 / 120;
    while (debt >= step) {
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i,
            h = height[k],
            left = height[j * nx + Math.max(0, i - 1)],
            right = height[j * nx + Math.min(nx - 1, i + 1)],
            up = height[Math.max(0, j - 1) * nx + i],
            down = height[Math.min(nz - 1, j + 1) * nx + i],
            lap = (left + right - 2 * h) / (dx * dx) + (up + down - 2 * h) / (dz * dz);
          next[k] = (velocity[k] + speed * speed * lap * step) * Math.exp(-step * 0.95);
        }
      for (let k = 0; k < height.length; k++) {
        velocity[k] = next[k];
        height[k] = Math.max(-0.3, Math.min(0.3, height[k] + velocity[k] * step));
      }
      debt -= step;
    }
  }
  function sample(x, z) {
    const fx = Math.max(0, Math.min(nx - 1, (x + width / 2) / dx)),
      fz = Math.max(0, Math.min(nz - 1, (z + depth / 2) / dz)),
      i = Math.min(nx - 2, Math.floor(fx)),
      j = Math.min(nz - 2, Math.floor(fz)),
      a = fx - i,
      b = fz - j;
    return (
      (height[j * nx + i] * (1 - a) + height[j * nx + i + 1] * a) * (1 - b) +
      (height[(j + 1) * nx + i] * (1 - a) + height[(j + 1) * nx + i + 1] * a) * b
    );
  }
  return {height, velocity, impulse, update, sample, nx, nz};
}
// Four hull contact samples provide pitch and roll from the same rendered water.
export function buoyancyPose(waterHeight, x, z, time, length = 5, width = 2) {
  const h = waterHeight(x, z, time),
    fore = waterHeight(x + length / 2, z, time),
    aft = waterHeight(x - length / 2, z, time),
    port = waterHeight(x, z - width / 2, time),
    starboard = waterHeight(x, z + width / 2, time);
  return {y: h, pitch: Math.atan2(starboard - port, width), roll: Math.atan2(fore - aft, length)};
}
// Damped second-order hull response. Each axis is a mass-spring-damper driven toward
// the water's local height and slope, so hulls lag, overshoot slightly and settle like a
// body with inertia instead of lerping. Signs follow three.js Euler rotations:
// rotation.x > 0 lowers +z (starboard), rotation.z > 0 raises +x (bow).
export function createHullMotion({heave = 2.2, pitch = 2.6, roll = 1.9, damping = 0.42} = {}) {
  const axes = {
    y: {x: 0, v: 0, w: heave},
    rx: {x: 0, v: 0, w: pitch},
    rz: {x: 0, v: 0, w: roll},
  };
  let started = false;
  function step(dt, target) {
    if (!started) {
      for (const k in axes) axes[k].x = target[k];
      started = true;
    }
    // Sub-step so long frames stay stable.
    let left = Math.min(0.1, Math.max(0, dt));
    while (left > 1e-6) {
      const h = Math.min(1 / 60, left);
      left -= h;
      for (const k in axes) {
        const a = axes[k],
          acc = a.w * a.w * (target[k] - a.x) - 2 * damping * a.w * a.v;
        a.v += acc * h;
        a.x += a.v * h;
      }
    }
    return {y: axes.y.x, rx: axes.rx.x, rz: axes.rz.x};
  }
  // An external push (wake, a fish tugging the line) adds angular or vertical velocity.
  function kick(axis, amount) {
    if (axes[axis]) axes[axis].v += amount;
  }
  return {step, kick, axes};
}
// Converts a sampled water pose into hull targets for a boat with the given yaw (0 or PI).
export function hullTarget(pose, draft, yaw = 0) {
  const flip = Math.cos(yaw) < 0 ? -1 : 1;
  return {y: pose.y + draft, rx: -pose.pitch, rz: pose.roll * flip};
}
// Water pose sampled along a boat's own axes (bow along heading), for rotation order 'YXZ'
// with rotation.y = -heading. pitch is the across-beam slope, roll the fore-aft slope.
export function orientedPose(waterHeight, x, z, time, heading, length = 5, width = 2) {
  const fx = Math.cos(heading),
    fz = Math.sin(heading),
    sx = -fz,
    sz = fx;
  const h = waterHeight(x, z, time),
    fore = waterHeight(x + (fx * length) / 2, z + (fz * length) / 2, time),
    aft = waterHeight(x - (fx * length) / 2, z - (fz * length) / 2, time),
    starboard = waterHeight(x + (sx * width) / 2, z + (sz * width) / 2, time),
    port = waterHeight(x - (sx * width) / 2, z - (sz * width) / 2, time);
  return {y: h, pitch: Math.atan2(starboard - port, width), roll: Math.atan2(fore - aft, length)};
}
// Steering for boats that must stay on open water. Each step looks ahead along the
// heading; when land (or the edge of the sailing area) is ahead, the boat picks the
// smallest turn that opens clear water, slows while turning, and if it ever touches
// shore it backs off instead of passing through.
export function steerBoat(s, dt, isWater, time = 0) {
  dt = Math.min(0.1, Math.max(0, dt));
  const look = 3 + s.size * 4,
    clear = h => isWater(s.x + Math.cos(h) * look, s.z + Math.sin(h) * look) && isWater(s.x + Math.cos(h) * look * 0.5, s.z + Math.sin(h) * look * 0.5);
  if (Math.abs(s.turnLeft || 0) < 1e-3 && !clear(s.heading)) {
    s.turnLeft = Math.PI;
    for (const k of [0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.8]) {
      const side = Math.sin(time * 0.3 + s.seed) > 0 ? 1 : -1;
      if (clear(s.heading + k * side)) {
        s.turnLeft = k * side;
        break;
      }
      if (clear(s.heading - k * side)) {
        s.turnLeft = -k * side;
        break;
      }
    }
  }
  const rate = 0.45,
    step = Math.sign(s.turnLeft || 0) * Math.min(Math.abs(s.turnLeft || 0), rate * dt);
  s.heading += step;
  s.turnLeft = (s.turnLeft || 0) - step;
  if (Math.abs(s.turnLeft) < 1e-3) s.heading += Math.sin(time * 0.07 + s.seed) * 0.03 * dt;
  const target = Math.abs(s.turnLeft) > 0.05 ? s.cruise * 0.45 : s.cruise;
  s.speed += (target - s.speed) * Math.min(1, dt * 0.8);
  const nx = s.x + Math.cos(s.heading) * s.speed * dt,
    nz = s.z + Math.sin(s.heading) * s.speed * dt;
  if (isWater(nx, nz)) {
    s.x = nx;
    s.z = nz;
  } else {
    // Bumped the shore: push back out the way it came and lose way.
    s.x -= Math.cos(s.heading) * s.speed * dt * 0.6;
    s.z -= Math.sin(s.heading) * s.speed * dt * 0.6;
    s.speed *= 0.5;
    if (Math.abs(s.turnLeft) < 1e-3) s.turnLeft = Math.PI * 0.8;
  }
  return s;
}
