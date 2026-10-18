import * as T from './assets/three.module.js';
import {merge, paint, place} from './models.js?v=10';
import {landHeight} from './land.js?v=10';
import {cloudTexture} from './textures.js?v=10';
// Background life in the spirit of Roku City: the world carries on around the angler, slowly
// and quietly, at the edge of the frame. Nothing here is interactive and nothing flashes.
//
// Freshwater: wind turbines turning on the far ridges, a little train crossing the far
// valley, street lamps along the lakeside road with pools of light after dark, chimney smoke
// from the cottages, and now and then a hot-air balloon drifting over the hills.
// Harbor Reach: a lighthouse on the headland whose beam sweeps the water at night.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function turbine() {
  const g = new T.Group(),
    white = new T.MeshStandardMaterial({color: '#e8ece9', roughness: 0.45}),
    tower = new T.Mesh(new T.CylinderGeometry(0.55, 1.1, 44, 10), white);
  tower.position.y = 22;
  g.add(tower);
  const nacelle = new T.Mesh(new T.BoxGeometry(1.6, 1.6, 4.2), white);
  nacelle.position.set(0, 44.5, 0.6);
  g.add(nacelle);
  const rotor = new T.Group();
  rotor.position.set(0, 44.5, 2.9);
  const blade = place(new T.BoxGeometry(0.9, 17, 0.25), [0, 8.5, 0]);
  blade.translate(0, 0, 0);
  const blades = [0, 1, 2].map(k => place(blade.clone(), [0, 0, 0], [0, 0, (k * Math.PI * 2) / 3]));
  rotor.add(new T.Mesh(merge(blades), white));
  rotor.add(new T.Mesh(new T.SphereGeometry(0.8, 12, 8), white));
  g.add(rotor);
  const beacon = new T.Mesh(new T.SphereGeometry(0.35, 8, 6), new T.MeshStandardMaterial({color: '#7a1c16', emissive: '#ff2a1a', emissiveIntensity: 0}));
  beacon.position.set(0, 45.5, 0.6);
  g.add(beacon);
  g.userData = {rotor, beacon};
  return g;
}

function train() {
  // A locomotive and four carriages that follow a track along the far hills.
  const cars = [],
    body = ['#3f5d6b', '#b9a87f', '#b9a87f', '#b9a87f', '#b9a87f'];
  const windowMat = new T.MeshStandardMaterial({color: '#f3dca8', emissive: '#f0c47a', emissiveIntensity: 0});
  for (let i = 0; i < 5; i++) {
    const g = new T.Group(),
      shell = paint(place(new T.BoxGeometry(12, 3.4, 3.2), [0, 2.4, 0]), body[i]),
      roof = paint(place(new T.CylinderGeometry(1.7, 1.7, 12, 10, 1, false, 0, Math.PI), [0, 4.1, 0], [0, 0, Math.PI / 2], [1, 1, 0.32]), '#6b6f6a'),
      base = paint(place(new T.BoxGeometry(11.6, 0.8, 2.6), [0, 0.6, 0]), '#2e3232');
    g.add(new T.Mesh(merge([shell, roof, base]), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.6})));
    const panes = [];
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) panes.push(place(new T.BoxGeometry(1.2, 1.1, 0.06), [-4.6 + k * 1.85, 2.9, s * 1.62]));
    g.add(new T.Mesh(merge(panes), windowMat));
    cars.push(g);
  }
  return {cars, windowMat};
}

function balloon() {
  const g = new T.Group(),
    stripes = new T.LatheGeometry(
      [
        [0.1, -6],
        [2.4, -5.2],
        [5.6, -2.2],
        [6.4, 1.5],
        [5.4, 4.6],
        [2.6, 6.4],
        [0.1, 6.8],
      ].map(([r, y]) => new T.Vector2(r, y)),
      16,
    );
  paint(stripes, (x, y, z, out) => out.set(Math.floor((Math.atan2(z, x) / Math.PI + 1) * 4) % 2 ? '#d9694e' : '#efd8a4'));
  g.add(new T.Mesh(stripes, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.7})));
  const basket = new T.Mesh(new T.BoxGeometry(1.6, 1.3, 1.6), new T.MeshStandardMaterial({color: '#7a5a3a', roughness: 0.9}));
  basket.position.y = -8.2;
  g.add(basket);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4,
      rope = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.4, 3), new T.MeshBasicMaterial({color: '#4d3f31'}));
    rope.position.set(Math.cos(a) * 0.9, -6.6, Math.sin(a) * 0.9);
    g.add(rope);
  }
  return g;
}

export function createAmbience(groups, {ground, roadCurve, roadLength, sideOf, cottages}) {
  const {fresh, salt} = groups;
  // --- Wind turbines on the far ridges, facing the prevailing wind ---------------------------
  const turbines = [];
  const turbineSpots = [];
  for (let k = 0; k < 400 && turbineSpots.length < 5; k++) {
    const a = -1.3 + (k % 40) * 0.065 + Math.floor(k / 40) * 0.013,
      r = 210 + (k % 7) * 9,
      x = Math.sin(a) * r,
      z = -40 - Math.cos(a) * r,
      y = landHeight(0, x, z);
    if (y < 24 || y > 70) continue;
    if (turbineSpots.some(([px, , pz]) => Math.hypot(px - x, pz - z) < 34)) continue;
    turbineSpots.push([x, y, z]);
  }
  for (const [x, y, z] of turbineSpots) {
    const t = turbine();
    t.position.set(x, y - 1, z);
    t.rotation.y = 0.35;
    t.scale.setScalar(0.85);
    t.userData.speed = 0.32 + Math.random() * 0.12;
    t.userData.phase = Math.random() * 6;
    fresh.add(t);
    turbines.push(t);
  }
  // --- A train on the far side of the lake ----------------------------------------------------
  // Its track follows a contour above the far shore; it crosses every couple of minutes.
  const trackPts = [];
  for (let x = -380; x <= 380; x += 10) {
    const z = -236 + Math.sin(x * 0.011) * 14;
    trackPts.push(new T.Vector3(x, 0, z));
  }
  // Track bed: the land under it, smoothed so the line runs level like a real railway.
  const raw = trackPts.map(p => landHeight(0, p.x, p.z));
  trackPts.forEach((p, i) => {
    let sum = 0,
      n = 0;
    for (let k = -3; k <= 3; k++) {
      const v = raw[Math.min(raw.length - 1, Math.max(0, i + k))];
      sum += v;
      n++;
    }
    p.y = Math.max(raw[i] + 0.6, sum / n + 0.6);
  });
  const track = new T.CatmullRomCurve3(trackPts),
    trackLen = track.getLength(),
    {cars: carriages, windowMat} = train();
  for (const c of carriages) fresh.add(c);
  // Viaduct piers wherever the line runs above the ground.
  const piers = [];
  for (let u = 0; u <= 1; u += 6 / trackLen) {
    const p = track.getPointAt(u),
      floor = landHeight(0, p.x, p.z);
    if (p.y - floor > 2.5) piers.push(paint(place(new T.BoxGeometry(2.2, p.y - floor + 2, 2.2), [p.x, floor + (p.y - floor) / 2 - 1, p.z]), '#8d8578'));
  }
  const bedParts = [];
  for (let u = 0; u < 1; u += 4 / trackLen) {
    const p = track.getPointAt(u),
      t = track.getTangentAt(u);
    bedParts.push(paint(place(new T.BoxGeometry(4.4, 0.6, 4.2), [p.x, p.y - 0.3, p.z], [0, Math.atan2(t.x, t.z), 0]), '#6f6a60'));
  }
  fresh.add(new T.Mesh(merge([...piers, ...bedParts]), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.95})));
  // --- Street lamps along the lakeside road, with soft pools of light after dark -------------
  const posts = [],
    heads = [],
    pools = [];
  const lampEvery = 30;
  for (let s = 12; s < roadLength - 12; s += lampEvery) {
    const u = s / roadLength,
      q = sideOf(u, -6.2),
      y = ground(q.x, q.z),
      t = roadCurve.getTangentAt(u),
      // The arm reaches out over the road (toward +normal).
      ax = -t.z * 1.6,
      az = t.x * 1.6;
    posts.push(paint(place(new T.CylinderGeometry(0.1, 0.16, 7.2, 6), [q.x, y + 3.6, q.z]), '#2f3534'));
    posts.push(paint(place(new T.BoxGeometry(0.14, 0.14, 1.8), [q.x + ax / 2, y + 7.1, q.z + az / 2], [0, Math.atan2(ax, az), 0]), '#2f3534'));
    heads.push(place(new T.BoxGeometry(0.55, 0.22, 0.8), [q.x + ax, y + 6.95, q.z + az], [0, Math.atan2(ax, az), 0]));
    const pool = place(new T.CircleGeometry(4.2, 20), [q.x + ax * 1.4, ground(q.x + ax * 1.4, q.z + az * 1.4) + 0.12, q.z + az * 1.4], [-Math.PI / 2, 0, 0]);
    pools.push(pool);
  }
  fresh.add(new T.Mesh(merge(posts), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.5, metalness: 0.4})));
  const lampMat = new T.MeshStandardMaterial({color: '#fff2d2', emissive: '#ffd99a', emissiveIntensity: 0});
  fresh.add(new T.Mesh(merge(heads), lampMat));
  // Light pools are drawn additively on the road: warm light that only shows after dusk.
  const poolMat = new T.MeshBasicMaterial({color: '#ffcf86', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, map: poolTexture()});
  const poolMesh = new T.Mesh(merge(pools), poolMat);
  poolMesh.renderOrder = 3;
  fresh.add(poolMesh);
  // --- Chimney smoke --------------------------------------------------------------------------
  const puffs = [],
    smokeMat = new T.SpriteMaterial({map: cloudTexture(3), color: '#d9dcd8', transparent: true, depthWrite: false, opacity: 0.35});
  for (const c of cottages) {
    c.updateMatrixWorld(true);
    const top = new T.Vector3(0.9, 4.9, -0.6).applyMatrix4(c.matrixWorld);
    for (let k = 0; k < 6; k++) {
      const s = new T.Sprite(smokeMat.clone());
      s.userData = {origin: top.clone(), age: k / 6};
      fresh.add(s);
      puffs.push(s);
    }
  }
  // --- A hot-air balloon that drifts across the far hills now and then -----------------------
  const ball = balloon();
  ball.visible = false;
  fresh.add(ball);
  // --- Harbor lighthouse ----------------------------------------------------------------------
  const lighthouse = new T.Group();
  {
    const x = 58,
      z = -80,
      y = landHeight(3, x, z) - 0.4,
      white = new T.MeshStandardMaterial({color: '#ece8de', roughness: 0.6}),
      red = new T.MeshStandardMaterial({color: '#a8443a', roughness: 0.6});
    lighthouse.position.set(x, y, z);
    for (let k = 0; k < 4; k++) {
      const seg = new T.Mesh(new T.CylinderGeometry(2.2 - k * 0.3, 2.5 - k * 0.3, 4, 16), k % 2 ? red : white);
      seg.position.y = 2 + k * 4;
      lighthouse.add(seg);
    }
    const lamp = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 2, 12), new T.MeshStandardMaterial({color: '#fff1c8', emissive: '#ffe4a0', emissiveIntensity: 0.2}));
    lamp.position.y = 17;
    lighthouse.add(lamp);
    const cap = new T.Mesh(new T.ConeGeometry(1.8, 1.8, 12), red);
    cap.position.y = 18.9;
    lighthouse.add(cap);
    // The beam: two long, faint additive cones sweeping round.
    const beam = new T.Group();
    beam.position.y = 17;
    const beamMat = new T.MeshBasicMaterial({color: '#fff1c8', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide});
    for (const s of [-1, 1]) {
      const cone = new T.Mesh(new T.ConeGeometry(9, 120, 16, 1, true), beamMat);
      cone.rotation.z = (s * Math.PI) / 2;
      cone.position.x = s * 60;
      beam.add(cone);
    }
    lighthouse.add(beam);
    lighthouse.userData = {lamp, beam, beamMat};
    salt.add(lighthouse);
  }

  let trainU = Math.random(),
    trainWait = 0,
    balloonT = -1,
    balloonNext = 40 + Math.random() * 60;
  return {
    update(dt, t, region, c) {
      const night = c.phase === 'night',
        dusk = c.phase === 'dusk' || c.phase === 'dawn',
        lights = night ? 1 : dusk ? 0.55 : ['rain', 'storm', 'overcast', 'mist'].includes(c.weather) ? 0.25 : 0;
      if (region < 3) {
        const wind = c.weather === 'storm' ? 2 : c.weather === 'wind' ? 1.6 : 1;
        for (const tb of turbines) {
          tb.userData.rotor.rotation.z = -(t * tb.userData.speed * wind + tb.userData.phase);
          // Slow red aviation beacons blink after dark.
          tb.userData.beacon.material.emissiveIntensity = lights > 0.3 && Math.sin(t * 1.6 + tb.userData.phase) > 0.6 ? 2.5 : 0;
        }
        // The train runs end to end, then waits out of sight before the next crossing.
        if (trainWait > 0) trainWait -= dt;
        else {
          trainU += (dt * 11) / trackLen;
          if (trainU > 1.06) {
            trainU = -0.06;
            trainWait = 50 + Math.random() * 70;
          }
        }
        carriages.forEach((car, i) => {
          const u = trainU - (i * 12.6) / trackLen,
            inside = u > 0.001 && u < 0.999 && trainWait <= 0;
          car.visible = inside;
          if (!inside) return;
          const p = track.getPointAt(u),
            tan = track.getTangentAt(u);
          car.position.copy(p);
          car.rotation.set(0, Math.atan2(-tan.z, tan.x), Math.atan2(tan.y, Math.hypot(tan.x, tan.z)));
        });
        windowMat.emissiveIntensity = lights * 1.6;
        lampMat.emissiveIntensity = lights * 2.4;
        poolMat.opacity = lights * 0.32;
        for (const s of puffs) {
          const u = s.userData;
          u.age += dt / 9;
          if (u.age > 1) u.age -= 1;
          const drift = c.weather === 'wind' || c.weather === 'storm' ? 6 : 2;
          s.position.set(u.origin.x + u.age * drift, u.origin.y + u.age * 7, u.origin.z + u.age * drift * 0.4);
          s.scale.setScalar(1 + u.age * 4.5);
          s.material.opacity = 0.32 * smooth(0, 0.15, u.age) * (1 - u.age) * (c.weather === 'rain' || c.weather === 'storm' ? 0.4 : 1);
        }
        // Balloon: fine weather, daytime only.
        if (balloonT < 0) {
          balloonNext -= dt;
          if (balloonNext <= 0 && c.phase === 'day' && ['clear', 'cloudy'].includes(c.weather)) balloonT = 0;
        } else {
          balloonT += dt / 150;
          if (balloonT > 1) {
            balloonT = -1;
            balloonNext = 180 + Math.random() * 240;
          }
        }
        ball.visible = balloonT >= 0;
        if (ball.visible) {
          const x = -260 + balloonT * 520;
          ball.position.set(x, landHeight(0, x, -190) + 55 + Math.sin(t * 0.2) * 2, -190);
          ball.rotation.y = t * 0.05;
        }
      } else if (region === 3) {
        const {lamp, beam, beamMat} = lighthouse.userData;
        lamp.material.emissiveIntensity = 0.2 + lights * 3;
        beam.rotation.y = t * 0.45;
        beamMat.opacity = lights * 0.07;
      }
    },
  };
}

// Soft round falloff for light pools on the ground.
let pool = null;
function poolTexture() {
  if (pool) return pool;
  const n = 64,
    data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.min(1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2),
        a = Math.pow(1 - d, 2.2);
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  pool = new T.DataTexture(data, n, n, T.RGBAFormat);
  pool.needsUpdate = true;
  return pool;
}
