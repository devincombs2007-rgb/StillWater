import * as T from './assets/three.module.js';
export function createTackle(parent, waterHeight, onImpact = () => {}) {
  const root = new T.Group();
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
    lastImpact = -10;
  const geometry = new T.BufferGeometry().setFromPoints(points),
    line = new T.Line(geometry, new T.LineBasicMaterial({color: '#e3ddba', transparent: true, opacity: 0.8}));
  root.add(line);
  const float = new T.Group();
  root.add(float);
  const body = new T.Mesh(
    new T.SphereGeometry(0.1, 16, 12),
    new T.MeshStandardMaterial({color: '#df8d70', roughness: 0.35}),
  );
  body.scale.y = 1.55;
  float.add(body);
  const top = new T.Mesh(new T.CylinderGeometry(0.024, 0.035, 0.25, 8), new T.MeshStandardMaterial({color: '#e7e1ba'}));
  top.position.y = 0.19;
  float.add(top);
  const stripe = new T.Mesh(
    new T.TorusGeometry(0.094, 0.012, 8, 28),
    new T.MeshStandardMaterial({color: '#f6e9c9', roughness: 0.24}),
  );
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = -0.015;
  float.add(stripe);
  const cap = new T.Mesh(
    new T.SphereGeometry(0.032, 16, 12),
    new T.MeshStandardMaterial({color: '#e9b76f', metalness: 0.25, roughness: 0.2}),
  );
  cap.position.y = 0.335;
  float.add(cap);
  const leader = new T.Mesh(
    new T.CylinderGeometry(0.005, 0.005, 0.48, 5),
    new T.MeshBasicMaterial({color: '#d2d9c5', transparent: true, opacity: 0.7}),
  );
  leader.position.y = -0.33;
  float.add(leader);
  const hook = new T.Mesh(
    new T.TorusGeometry(0.07, 0.009, 5, 18, Math.PI * 1.55),
    new T.MeshStandardMaterial({color: '#b6c8c2', metalness: 0.85, roughness: 0.2}),
  );
  hook.position.y = -0.59;
  hook.rotation.z = -0.35;
  float.add(hook);
  const bait = new T.Mesh(new T.SphereGeometry(0.042, 10, 8), new T.MeshStandardMaterial({color: '#bc9d85'}));
  bait.scale.set(0.7, 1.8, 0.7);
  bait.position.set(0.04, -0.61, 0);
  float.add(bait);
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
    velocity.set((Math.random() - 0.5) * 0.4, 5.5 + power * 2.5, -7 - power * 6);
    ropeLength = 2.5;
    winch = 0;
    reset();
    bait.material.color.set(baitColor);
    root.visible = true;
  }
  function pull(amount = 0.18) {
    if (mode === 'idle' || mode === 'caught') return;
    winch += amount * ropeLength;
    velocity.add(new T.Vector3(anchor.x - end.x, 0, anchor.z - end.z).normalize().multiplyScalar(2.2));
    velocity.y += 1.65;
  }
  function update(dt, time, tip) {
    dt = Math.min(0.035, dt);
    anchor.copy(tip);
    root.visible = mode !== 'idle';
    if (mode === 'idle') return;
    const distance = anchor.distanceTo(end);
    if (mode === 'flight') {
      velocity.y -= 9.81 * dt;
      ropeLength = Math.max(ropeLength, distance * 1.045);
    } else if (mode === 'retrieve') {
      const target = anchor.clone().add(new T.Vector3(0.15, -0.65, 0));
      velocity.add(target.sub(end).multiplyScalar(35 * dt));
      velocity.multiplyScalar(Math.exp(-7 * dt));
      ropeLength = 0.65;
    } else if (mode === 'caught' || mode === 'ready') {
      velocity.y -= 9.81 * dt;
      velocity.x += Math.sin(time * 1.2) * 0.06 * dt;
      velocity.multiplyScalar(Math.exp(-0.6 * dt));
      ropeLength += (0.65 - ropeLength) * Math.min(1, dt * 5);
    } else {
      velocity.y -= 9.81 * dt;
      velocity.x *= Math.exp(-2.2 * dt);
      velocity.z *= Math.exp(-2.2 * dt);
      ropeLength = Math.max(2, ropeLength - winch * dt * 2);
      winch *= Math.exp(-2 * dt);
    }
    end.addScaledVector(velocity, dt);
    const h = waterHeight(end.x, end.z, time) + 0.15;
    if (!['caught', 'retrieve'].includes(mode) && end.y < h) {
      const impact = Math.abs(velocity.y);
      end.y = h;
      velocity.y = impact > 0.5 ? impact * 0.12 : 0;
      if ((mode === 'flight' || impact > 0.8) && time - lastImpact > 0.35) {
        lastImpact = time;
        onImpact(end.x, end.z, time, impact);
      }
      if (mode === 'flight') mode = 'water';
    }
    const d = end.distanceTo(anchor),
      limit = ropeLength;
    if (d > limit && mode !== 'flight' && mode !== 'retrieve') {
      const direction = end.clone().sub(anchor).normalize();
      end.copy(anchor).addScaledVector(direction, limit);
      const outward = velocity.dot(direction);
      if (outward > 0) velocity.addScaledVector(direction, -outward * 0.9);
      tension = Math.min(1, (d - limit) * 2 + 0.1);
    } else tension *= 0.95;
    for (let i = 1; i < n - 1; i++) {
      const p = points[i],
        v = p.clone().sub(old[i]).multiplyScalar(0.985);
      old[i].copy(p);
      p.add(v);
      p.y -= 2.8 * dt * dt;
      const water = waterHeight(p.x, p.z, time);
      if (p.y < water - 0.06) p.y = water - 0.06;
    }
    const length = (anchor.distanceTo(end) * 1.025) / (n - 1);
    for (let k = 0; k < 6; k++) {
      points[0].copy(anchor);
      points[n - 1].copy(end);
      for (let i = 0; i < n - 1; i++) {
        const a = points[i],
          b = points[i + 1],
          delta = b.clone().sub(a),
          dist = delta.length() || 1;
        delta.multiplyScalar(((dist - length) / dist) * 0.5);
        if (i > 0) a.add(delta);
        if (i + 1 < n - 1) b.sub(delta);
      }
    }
    points[0].copy(anchor);
    points[n - 1].copy(end);
    const attr = geometry.attributes.position;
    for (let i = 0; i < n; i++) attr.setXYZ(i, points[i].x, points[i].y, points[i].z);
    attr.needsUpdate = true;
    leader.scale.y = ['caught', 'retrieve'].includes(mode) ? 0.25 : 1;
    leader.position.y = ['caught', 'retrieve'].includes(mode) ? -0.1 : -0.33;
    hook.position.y = ['caught', 'retrieve'].includes(mode) ? -0.17 : -0.59;
    bait.visible = !['caught', 'retrieve'].includes(mode);
    float.position.copy(end);
    float.rotation.z = Math.max(-0.5, Math.min(0.5, -velocity.x * 0.1));
    float.rotation.x = Math.max(-0.45, Math.min(0.45, velocity.z * 0.08));
  }
  return {
    cast,
    pull,
    update,
    land() {
      mode = 'retrieve';
    },
    hang() {
      mode = 'caught';
      ropeLength = Math.max(0.65, anchor.distanceTo(end));
      if (anchor.distanceTo(end) > 3) {
        end.copy(anchor).add(new T.Vector3(0.2, -0.65, 0));
        velocity.set(0.4, 0, 0.2);
        reset();
      }
    },
    reset() {
      mode = 'ready';
      end.copy(anchor).add(new T.Vector3(0, -0.65, 0));
      velocity.set(0, 0, 0);
      ropeLength = 0.65;
      reset();
      root.visible = true;
    },
    get end() {
      return end;
    },
    get tension() {
      return tension;
    },
    get mode() {
      return mode;
    },
    hook,
    bait,
  };
}
