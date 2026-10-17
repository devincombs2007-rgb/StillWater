import * as T from './assets/three.module.js';
// Physical tackle: a constrained Verlet line drawn as a camera-facing ribbon, a
// spring-buoyant bobber that sits *in* the water, bite plunges, and a hooked fish
// that drags the float against the line while the angler reels.
export function createTackle(parent, waterHeight, onImpact = () => {}) {
  const root = new T.Group();
  root.name = 'Tackle';
  parent.add(root);
  const n = 25,
    points = Array.from({length: n}, () => new T.Vector3()),
    old = points.map(p => p.clone()),
    anchor = new T.Vector3(),
    end = new T.Vector3(0, 0.2, -6),
    velocity = new T.Vector3();
  let mode = 'idle',
    ropeLength = 5,
    winch = 0,
    tension = 0,
    lastImpact = -10,
    biting = 0,
    biteTime = 0,
    nibble = 0,
    nibbleWait = 2,
    fishPull = 0,
    fishPower = 1,
    fishSeed = Math.random() * 10,
    splashWait = 0,
    spin = 0,
    respawn = 0;
  // Ribbon line: two vertices per rope point, widened toward the camera each frame.
  const lineGeo = new T.BufferGeometry(),
    linePos = new Float32Array(n * 2 * 3),
    lineIndex = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    lineIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  lineGeo.setAttribute('position', new T.BufferAttribute(linePos, 3));
  lineGeo.setIndex(lineIndex);
  const line = new T.Mesh(
    lineGeo,
    new T.MeshBasicMaterial({
      color: '#efe8c8',
      transparent: true,
      opacity: 0.82,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  line.name = 'Fishing line';
  line.frustumCulled = false;
  line.renderOrder = 2;
  root.add(line);
  const float = new T.Group();
  float.name = 'Bobber';
  // Slightly oversized so the strike stays readable twenty metres out on a phone.
  float.scale.setScalar(1);
  root.add(float);
  const glossy = (color, extra = {}) =>
    new T.MeshPhysicalMaterial({color, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2, ...extra});
  // Classic two-tone float: red cap above a cream belly, joined by a white band.
  const upper = new T.Mesh(new T.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glossy('#d9573f'));
  upper.scale.y = 1.45;
  float.add(upper);
  const lower = new T.Mesh(
    new T.SphereGeometry(0.1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    glossy('#f1e8d2'),
  );
  lower.scale.y = 1.2;
  float.add(lower);
  const stripe = new T.Mesh(new T.TorusGeometry(0.099, 0.011, 8, 32), glossy('#fbf6e8'));
  stripe.rotation.x = Math.PI / 2;
  float.add(stripe);
  const top = new T.Mesh(new T.CylinderGeometry(0.012, 0.022, 0.2, 10), glossy('#f3d27a'));
  top.position.y = 0.23;
  float.add(top);
  const cap = new T.Mesh(
    new T.SphereGeometry(0.026, 14, 10),
    glossy('#ffb347', {emissive: '#ff9b3d', emissiveIntensity: 0.35}),
  );
  cap.position.y = 0.335;
  float.add(cap);
  const eye = new T.Mesh(
    new T.TorusGeometry(0.016, 0.004, 6, 14),
    new T.MeshStandardMaterial({color: '#c9cfc6', metalness: 0.9, roughness: 0.2}),
  );
  eye.position.y = -0.135;
  float.add(eye);
  const leader = new T.Mesh(
    new T.CylinderGeometry(0.0035, 0.0035, 0.48, 5),
    new T.MeshBasicMaterial({color: '#d2d9c5', transparent: true, opacity: 0.6}),
  );
  leader.position.y = -0.38;
  float.add(leader);
  const sinker = new T.Mesh(
    new T.SphereGeometry(0.022, 10, 8),
    new T.MeshStandardMaterial({color: '#7d8582', metalness: 0.7, roughness: 0.35}),
  );
  sinker.position.y = -0.4;
  float.add(sinker);
  const hook = new T.Mesh(
    new T.TorusGeometry(0.055, 0.007, 6, 20, Math.PI * 1.45),
    new T.MeshStandardMaterial({color: '#c4d0cb', metalness: 0.9, roughness: 0.18}),
  );
  hook.position.y = -0.64;
  hook.rotation.z = -0.35;
  float.add(hook);
  const shank = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.09, 6), hook.material);
  shank.position.set(0.055, -0.6, 0);
  float.add(shank);
  const bait = new T.Mesh(
    new T.CapsuleGeometry(0.024, 0.07, 4, 10),
    new T.MeshStandardMaterial({color: '#bc9d85', roughness: 0.5}),
  );
  bait.position.set(0.045, -0.66, 0);
  bait.rotation.z = 0.4;
  float.add(bait);
  const tmp = new T.Vector3(),
    side = new T.Vector3(),
    toCam = new T.Vector3(),
    tangent = new T.Vector3();
  function resetTackle() {
    mode = 'ready';
    biting = 0;
    fishPull = 0;
    respawn = 0;
    end.copy(anchor).add(new T.Vector3(0, -0.65, 0));
    velocity.set(0, 0, 0);
    ropeLength = 0.65;
    reset();
    root.visible = true;
  }
  function reset() {
    for (let i = 0; i < n; i++) {
      points[i].lerpVectors(anchor, end, i / (n - 1));
      old[i].copy(points[i]);
    }
  }
  function cast(power, tip, baitColor) {
    mode = 'flight';
    anchor.copy(tip);
    end.copy(tip);
    velocity.set((Math.random() - 0.5) * 0.5, 5.6 + power * 2.6, -7.2 - power * 6.4);
    ropeLength = 2.5;
    winch = 0;
    biting = 0;
    fishPull = 0;
    spin = 0;
    reset();
    bait.material.color.set(baitColor);
    root.visible = true;
  }
  function pull(amount = 0.18) {
    if (mode === 'idle' || mode === 'caught' || mode === 'ready') return;
    winch += amount * ropeLength;
    tmp.set(anchor.x - end.x, 0, anchor.z - end.z).normalize();
    velocity.addScaledVector(tmp, 2.2);
    velocity.y += 1.2;
  }
  // Waterline sits a little above the bobber's equator, like a real float.
  const restY = 0.025,
    HANG = 0.9,
    floatBody = [upper, lower, stripe, top, cap, eye];
  function update(dt, time, tip, camera) {
    dt = Math.min(0.035, dt);
    anchor.copy(tip);
    if (respawn > 0 && (respawn -= dt) <= 0) resetTackle();
    root.visible = mode !== 'idle';
    if (mode === 'idle') return;
    const water = waterHeight(end.x, end.z, time);
    if (mode === 'flight') {
      velocity.y -= 9.81 * dt;
      velocity.multiplyScalar(Math.exp(-0.06 * dt));
      ropeLength = Math.max(ropeLength, anchor.distanceTo(end) * 1.045);
      spin += dt * 9;
    } else if (mode === 'retrieve') {
      tmp.copy(anchor).add(new T.Vector3(0.12, -HANG, 0));
      velocity.add(tmp.sub(end).multiplyScalar(35 * dt));
      velocity.multiplyScalar(Math.exp(-7 * dt));
      ropeLength = HANG;
    } else if (mode === 'recall') {
      // Wind the float home: it skims the surface, then lifts to the rod tip.
      tmp.copy(anchor).add(new T.Vector3(0, -0.65, 0));
      const left = tmp.distanceTo(end);
      velocity.add(tmp.sub(end).multiplyScalar(Math.min(14, 4 + 30 / Math.max(1, left)) * dt));
      velocity.multiplyScalar(Math.exp(-3.2 * dt));
      if (left > 2.5) velocity.y += (water + restY - end.y) * 40 * dt;
      ropeLength = Math.max(0.65, left + 0.2);
      if (left < 0.6) mode = 'ready';
    } else if (mode === 'caught' || mode === 'ready') {
      velocity.y -= 9.81 * dt;
      velocity.x += Math.sin(time * 1.2) * 0.06 * dt;
      velocity.multiplyScalar(Math.exp(-0.6 * dt));
      ropeLength += ((mode === 'caught' ? HANG : 0.65) - ropeLength) * Math.min(1, dt * 5);
    } else {
      // Floating: buoyancy spring toward a waterline that bites and fish can pull under.
      let sink = 0;
      if (mode === 'water') {
        nibbleWait -= dt;
        if (nibbleWait <= 0 && !biting) {
          nibble = 0.05 + Math.random() * 0.05;
          nibbleWait = 1.5 + Math.random() * 3.5;
        }
        nibble *= Math.exp(-dt * 7);
        sink += nibble * Math.max(0, Math.sin(time * 26));
      }
      if (biting) {
        biteTime += dt;
        const plunge = biteTime < 0.35 ? biteTime / 0.35 : 1,
          pulse = Math.pow(Math.max(0, Math.sin(biteTime * 7.5)), 2);
        sink += 0.12 * plunge + 0.16 * pulse;
        if (pulse > 0.97 && time - lastImpact > 0.45) {
          lastImpact = time;
          onImpact(end.x, end.z, time, 1.2, 'nibble');
        }
      }
      if (mode === 'hooked') {
        const wander = Math.sin(time * 0.83 + fishSeed) * 0.75 + Math.sin(time * 2.1 + fishSeed * 2) * 0.25;
        tmp.set(end.x - anchor.x, 0, end.z - anchor.z).normalize();
        side.set(-tmp.z, 0, tmp.x);
        const force = (1.2 + fishPower * 0.9) * (0.35 + fishPull);
        velocity.addScaledVector(tmp, force * 0.55 * dt).addScaledVector(side, wander * force * dt * 1.4);
        sink += 0.06 + fishPull * 0.24 + Math.max(0, Math.sin(time * 5.3 + fishSeed)) * 0.05 * fishPull;
        splashWait -= dt;
        if (splashWait <= 0 && fishPull > 0.35) {
          splashWait = 0.7 + Math.random() * 1.4;
          onImpact(end.x + side.x * 0.3, end.z + side.z * 0.3, time, 2.2 + fishPull * 3, 'thrash');
        }
      }
      const target = water + restY - sink,
        depth = target - end.y;
      velocity.y += (depth * (depth > 0 ? 95 : 60) - velocity.y * (depth > 0 ? 9 : 5)) * dt;
      if (end.y > water + 0.4) velocity.y -= 9.81 * dt;
      velocity.x *= Math.exp(-2.2 * dt);
      velocity.z *= Math.exp(-2.2 * dt);
      ropeLength = Math.max(1.6, ropeLength - winch * dt * 2);
      winch *= Math.exp(-2 * dt);
    }
    end.addScaledVector(velocity, dt);
    if (mode === 'flight' && end.y < water + restY) {
      const impact = Math.abs(velocity.y);
      end.y = water + restY - 0.05;
      velocity.y = -impact * 0.05;
      velocity.x *= 0.25;
      velocity.z *= 0.25;
      mode = 'water';
      nibbleWait = 2 + Math.random() * 2;
      if (time - lastImpact > 0.35) {
        lastImpact = time;
        onImpact(end.x, end.z, time, impact, 'land');
      }
    }
    const d = end.distanceTo(anchor),
      limit = ropeLength;
    if (d > limit && mode !== 'flight' && mode !== 'retrieve') {
      tmp.copy(end).sub(anchor).normalize();
      end.copy(anchor).addScaledVector(tmp, limit);
      const outward = velocity.dot(tmp);
      if (outward > 0) velocity.addScaledVector(tmp, -outward * 0.9);
      tension = Math.min(1, (d - limit) * 2 + 0.1);
    } else tension *= 0.95;
    for (let i = 1; i < n - 1; i++) {
      const p = points[i];
      tmp.copy(p).sub(old[i]).multiplyScalar(0.985);
      old[i].copy(p);
      p.add(tmp);
      p.y -= 2.8 * dt * dt;
      const w = waterHeight(p.x, p.z, time);
      if (p.y < w - 0.04) p.y += (w - 0.04 - p.y) * 0.6;
    }
    const length = (anchor.distanceTo(end) * (mode === 'hooked' ? 1.004 : 1.012)) / (n - 1);
    for (let k = 0; k < 10; k++) {
      points[0].copy(anchor);
      points[n - 1].copy(end);
      for (let i = 0; i < n - 1; i++) {
        const a = points[i],
          b = points[i + 1];
        tmp.copy(b).sub(a);
        const dist = tmp.length() || 1;
        tmp.multiplyScalar(((dist - length) / dist) * 0.5);
        if (i > 0) a.add(tmp);
        if (i + 1 < n - 1) b.sub(tmp);
      }
    }
    points[0].copy(anchor);
    points[n - 1].copy(end);
    // Widen the ribbon in screen space so the line stays a crisp hairline at any zoom.
    const eyePos = camera ? camera.position : anchor;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      tangent
        .copy(points[Math.min(n - 1, i + 1)])
        .sub(points[Math.max(0, i - 1)])
        .normalize();
      toCam.copy(eyePos).sub(p);
      const dist = toCam.length();
      side
        .crossVectors(tangent, toCam.normalize())
        .normalize()
        .multiplyScalar(0.0025 + dist * 0.00085);
      linePos.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
    }
    lineGeo.attributes.position.needsUpdate = true;
    const held = ['caught', 'retrieve'].includes(mode);
    leader.scale.y = held ? 0.25 : 1;
    leader.position.y = held ? -0.2 : -0.38;
    sinker.visible = !held;
    hook.position.y = held ? -0.27 : -0.64;
    shank.position.y = held ? -0.23 : -0.6;
    bait.visible = !held;
    // A landed fish hangs straight off the hook; the float slides out of the way.
    for (const part of floatBody) part.visible = !held;
    float.position.copy(end);
    const out = ['flight', 'water', 'hooked', 'recall'].includes(mode) && end.distanceTo(anchor) > 3;
    float.scale.setScalar(float.scale.x + ((out ? 1.6 : 1) - float.scale.x) * Math.min(1, dt * 4));
    // The float leans toward the line under load and wobbles in flight.
    tmp.copy(anchor).sub(end);
    const lean = Math.min(0.9, tension * 1.4 + (mode === 'hooked' ? fishPull * 0.5 : 0));
    float.rotation.z = Math.max(-0.6, Math.min(0.6, -velocity.x * 0.1 + tmp.x * 0.02 * lean));
    float.rotation.x = Math.max(
      -0.9,
      Math.min(0.9, velocity.z * 0.06 + (mode === 'flight' ? Math.sin(spin) * 0.25 : 0) - lean * 0.8),
    );
  }
  return {
    cast,
    pull,
    update,
    land() {
      mode = 'retrieve';
      biting = 0;
      fishPull = 0;
    },
    bite(on = true) {
      biting = on ? 1 : 0;
      biteTime = 0;
    },
    hookSet(power = 1) {
      if (mode === 'water' || mode === 'hooked') {
        mode = 'hooked';
        biting = 0;
        fishPower = power;
        fishSeed = Math.random() * 10;
        splashWait = 0.2;
        velocity.y -= 1.4;
      }
    },
    fight(strength = 0) {
      fishPull = Math.max(0, Math.min(1, strength));
    },
    hang() {
      mode = 'caught';
      ropeLength = Math.max(HANG, anchor.distanceTo(end));
      if (anchor.distanceTo(end) > 3) {
        end.copy(anchor).add(new T.Vector3(0.2, -HANG, 0));
        velocity.set(0.4, 0, 0.2);
        reset();
      }
    },
    reset: resetTackle,
    // Bring an outstanding line home. A snapped line loses its float; a fresh rig appears shortly.
    recall(lost = false) {
      biting = 0;
      fishPull = 0;
      winch = 0;
      if (lost) {
        mode = 'idle';
        root.visible = false;
        respawn = 0.8;
      } else if (['water', 'hooked', 'flight'].includes(mode)) mode = 'recall';
      else resetTackle();
    },
    get end() {
      return end;
    },
    get root() {
      return root;
    },
    get tension() {
      return tension;
    },
    get mode() {
      return mode;
    },
    get line() {
      return points;
    },
    hook,
    bait,
    float,
  };
}
