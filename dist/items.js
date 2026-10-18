import * as T from './assets/three.module.js';
import {lathe, displace, paint, place, merge, tube, vcMaterial} from './models.js?v=8';
import {hookGeometry, baitModel, lantern, broadleaf, pine, rock, palm, coral, reedGeometry, lilyPadGeometry, harborBuilding} from './scenery.js?v=8';
import {boatModel} from './environment.js?v=8';
import {surfaceTexture} from './textures.js?v=8';
import {BAITS} from './economy.js?v=8';
// 3D models for market items, rendered into the shop's thumbnails. Each builder returns
// the object and how to look at it: a turn (yaw), a tilt (pitch) and an optional focus box.
const V = (x, y, z) => new T.Vector3(x, y, z);
const std = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: 0.6, ...extra});

const ROD_BLANKS = ['#7c6a4a', '#6f8458', '#c9ccc3', '#3e4c72', '#1c3348'],
  ROD_WRAPS = ['#8c3f32', '#c49a4a', '#38606e', '#c9b16a', '#d8dfe2'],
  LINE_COLORS = ['#ece6c8', '#7f9c6b', '#d4ecef', '#3c80aa', '#2d4e66'];

function rod(i) {
  const g = new T.Group(),
    blank = std(ROD_BLANKS[i], {metalness: i >= 2 ? 0.4 : 0.15, roughness: i >= 3 ? 0.25 : 0.45}),
    wrap = std(ROD_WRAPS[i], {roughness: 0.4}),
    chrome = std('#d9ddd6', {metalness: 0.9, roughness: 0.15}),
    cork = std('#b4956f', {map: surfaceTexture('cork'), roughness: 0.95}),
    reel = std(i >= 3 ? '#26313a' : '#3a4542', {metalness: 0.55, roughness: 0.3});
  // The butt section only, so the grip, reel and guides read at thumbnail size.
  g.add(new T.Mesh(new T.CylinderGeometry(0.011, 0.02, 1.3, 10), blank));
  g.children.at(-1).position.y = 0.65;
  for (let k = 0; k < 4; k++) {
    const y = 0.4 + k * 0.26,
      r = 0.03 - k * 0.003;
    g.add(new T.Mesh(new T.CylinderGeometry(0.021 - k * 0.002, 0.021 - k * 0.002, 0.035, 10), wrap));
    g.children.at(-1).position.y = y;
    const ring = new T.Mesh(new T.TorusGeometry(r, 0.004, 6, 14), chrome);
    ring.position.set(0, y, r + 0.02);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
  }
  g.add(new T.Mesh(lathe([[0.02, -0.34], [0.032, -0.32], [0.035, -0.18], [0.03, -0.04], [0.024, 0.0]], 16), cork));
  g.add(new T.Mesh(lathe([[0.023, 0.12], [0.03, 0.14], [0.031, 0.26], [0.022, 0.3]], 16), cork));
  g.add(new T.Mesh(new T.CylinderGeometry(0.027, 0.027, 0.12, 16), chrome));
  g.children.at(-1).position.y = 0.06;
  const body = new T.Group();
  body.position.set(0, 0.06, 0.11);
  body.add(new T.Mesh(lathe([[0.001, -0.07], [0.036, -0.06], [0.046, -0.02], [0.043, 0.02], [0.03, 0.04]], 20), reel));
  body.add(new T.Mesh(lathe([[0.041, 0.04], [0.041, 0.05], [0.033, 0.056], [0.033, 0.11], [0.043, 0.115], [0.001, 0.125]], 20), chrome));
  body.add(new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.05, 20), std(LINE_COLORS[i])));
  body.children.at(-1).position.y = 0.085;
  const crank = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.07, 6), reel);
  crank.position.set(-0.06, 0, 0.03);
  crank.rotation.x = 0.8;
  body.add(crank);
  body.add(new T.Mesh(new T.CapsuleGeometry(0.012, 0.025, 4, 8), cork));
  body.children.at(-1).position.set(-0.075, 0.025, 0.055);
  g.add(body);
  g.add(new T.Mesh(new T.CylinderGeometry(0.008, 0.009, 0.08, 8), reel));
  g.children.at(-1).position.set(0, 0.06, 0.06);
  g.children.at(-1).rotation.x = Math.PI / 2;
  g.rotation.z = -0.95;
  return {object: g, yaw: 0.9, pitch: 0.2};
}

function spool(i) {
  const g = new T.Group(),
    side = std(i >= 3 ? '#26313a' : '#6c4f37', {metalness: i >= 3 ? 0.5 : 0, roughness: 0.4}),
    line = std(LINE_COLORS[i], {roughness: i === 2 ? 0.15 : 0.55, transparent: i === 2, opacity: i === 2 ? 0.85 : 1});
  const wound = new T.CylinderGeometry(0.34, 0.34, 0.36, 40, 12),
    p = wound.attributes.position;
  // Braids show their weave; monofilament stays smooth.
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k),
      y = p.getY(k),
      z = p.getZ(k),
      a = Math.atan2(z, x),
      bump = i % 2 ? 0.006 * Math.sin(a * 60 + y * 90) : 0;
    p.setXYZ(k, x * (1 + bump), y, z * (1 + bump));
  }
  wound.computeVertexNormals();
  g.add(new T.Mesh(wound, line));
  for (const y of [-0.2, 0.2]) {
    g.add(new T.Mesh(new T.CylinderGeometry(0.46, 0.46, 0.04, 40), side));
    g.children.at(-1).position.y = y;
  }
  g.add(new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.46, 20), std('#d8d2c0')));
  g.children.at(-1).position.y = 0;
  g.add(new T.Mesh(tube([V(0.34, 0.05, 0), V(0.5, -0.05, 0.12), V(0.62, -0.25, 0.1), V(0.7, -0.4, 0.2)], 0.008, 5, false), line));
  g.rotation.x = 0.5;
  return {object: g, yaw: 0.4, pitch: 0.3};
}

function bait(i) {
  const g = new T.Group();
  g.add(new T.Mesh(hookGeometry(1), std('#c4d0cb', {metalness: 0.9, roughness: 0.18})));
  const id = BAITS[i]?.id;
  if (id && id !== 'bare') {
    const b = baitModel(id);
    b.animate(1.2);
    g.add(b.group);
  }
  g.rotation.z = 0.35;
  return {object: g, yaw: 0.3, pitch: 0.1};
}

function tank(i) {
  const g = new T.Group(),
    w = 1.2 + i * 0.35,
    h = 0.7 + i * 0.08,
    d = 0.6 + i * 0.12;
  const wood = std('#5d4632', {map: surfaceTexture('wood')});
  g.add(new T.Mesh(new T.BoxGeometry(w + 0.12, 0.1, d + 0.12), wood));
  g.children.at(-1).position.y = -0.05;
  g.add(new T.Mesh(new T.BoxGeometry(w + 0.12, 0.06, d + 0.12), wood));
  g.children.at(-1).position.y = h + 0.03;
  const water = new T.Mesh(new T.BoxGeometry(w, h * 0.88, d), std('#3f8f95', {transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false}));
  water.position.y = h * 0.44;
  water.renderOrder = 1;
  g.add(water);
  const sand = new T.Mesh(displace(new T.BoxGeometry(w * 0.98, 0.08, d * 0.98, 12, 1, 6), 0.02, 4, 3, 2), std('#c9b78f', {roughness: 1}));
  sand.position.y = 0.04;
  g.add(sand);
  for (let k = 0; k < 3 + i * 2; k++) {
    const blade = new T.Mesh(reedGeometry(k + 1), vcMaterial('matte'));
    blade.scale.setScalar(0.18 + (k % 3) * 0.04);
    blade.position.set(-w / 2 + 0.1 + ((k * 0.37) % 1) * (w - 0.2), 0.06, -d / 4 + ((k * 0.61) % 1) * d * 0.4);
    g.add(blade);
  }
  const fishMat = std('#e7a35b', {roughness: 0.4});
  for (let k = 0; k < 2 + i; k++) {
    const f = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), fishMat);
    f.scale.set(1.6, 0.8, 0.5);
    f.position.set(-w / 3 + k * (w / (2 + i)), h * (0.35 + (k % 2) * 0.25), 0.05);
    g.add(f);
  }
  const glass = new T.Mesh(new T.BoxGeometry(w + 0.02, h, d + 0.02), new T.MeshPhysicalMaterial({color: '#dff3ef', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false}));
  glass.position.y = h / 2;
  glass.renderOrder = 2;
  g.add(glass);
  return {object: g, yaw: 0.45, pitch: 0.3};
}

function decor(i) {
  const g = new T.Group();
  if (i === 0) {
    for (let k = 0; k < 7; k++) {
      const r = new T.Mesh(reedGeometry(k + 3), vcMaterial('matte'));
      r.scale.setScalar(0.35 + (k % 3) * 0.1);
      r.position.set((k - 3) * 0.12, 0, (k % 2) * 0.1);
      g.add(r);
    }
    g.add(rock(4));
    g.children.at(-1).scale.setScalar(0.25);
  } else if (i === 1) {
    const arch = displace(new T.TorusGeometry(0.5, 0.14, 12, 28, Math.PI), 0.05, 3, 7, 3);
    g.add(new T.Mesh(arch, std('#9aa6a4', {roughness: 0.9})));
    for (const x of [-0.5, 0.5]) {
      g.add(rock(x > 0 ? 2 : 5));
      g.children.at(-1).position.set(x, -0.08, 0);
    }
    g.children.slice(1).forEach(c => c.scale.setScalar(0.22));
  } else {
    const glow = new T.MeshStandardMaterial({color: '#ffd59a', emissive: '#ffb45e', emissiveIntensity: 1.6, transparent: true, opacity: 0.9});
    for (const [x, s] of [
      [-0.25, 1],
      [0.3, 0.75],
    ]) {
      const l = lantern(glow);
      l.position.x = x;
      l.scale.setScalar(s);
      l.rotation.z = x * 0.3;
      g.add(l);
    }
  }
  return {object: g, yaw: 0.3, pitch: 0.2};
}

function filter() {
  const g = new T.Group(),
    body = std('#3c4a48', {metalness: 0.3, roughness: 0.35}),
    chrome = std('#cfd5cf', {metalness: 0.9, roughness: 0.2});
  g.add(new T.Mesh(lathe([[0.001, 0], [0.22, 0], [0.24, 0.05], [0.24, 0.62], [0.2, 0.68], [0.001, 0.7]], 24), body));
  g.add(new T.Mesh(new T.CylinderGeometry(0.245, 0.245, 0.05, 24), chrome));
  g.children.at(-1).position.y = 0.6;
  for (const sx of [-1, 1]) g.add(new T.Mesh(tube([V(sx * 0.08, 0.7, 0), V(sx * 0.1, 0.95, 0), V(sx * 0.3, 1.05, 0), V(sx * 0.45, 0.95, 0)], 0.025, 8, false), std('#a9c7c4', {transparent: true, opacity: 0.7})));
  return {object: g, yaw: 0.4, pitch: 0.25};
}

function boat(i) {
  return {object: boatModel(1, i), yaw: 0.75, pitch: 0.3};
}

// Little island dioramas for each fishing spot.
function waters(i) {
  const g = new T.Group(),
    salt = i >= 3;
  const sea = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 0.12, 40), std(['#3c6f63', '#4b7e6d', '#1f3d4a', '#2f7d8a', '#3fa5a8', '#1f5f86'][i], {roughness: 0.15, metalness: 0.1}));
  sea.position.y = -0.06;
  g.add(sea);
  const land = new T.Mesh(displace(new T.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 3, i + 2, 3), std(salt ? '#d9c79c' : '#6f8456', {roughness: 0.95}));
  land.scale.set(1, 0.4, 0.8);
  land.position.set(-0.3, -0.02, -0.2);
  if (i !== 5) g.add(land);
  const add = (o, x, z, s) => {
    o.position.set(x, 0.12, z);
    o.scale.setScalar(s);
    g.add(o);
    return o;
  };
  if (i === 0) {
    add(broadleaf(2), -0.35, -0.3, 0.12);
    add(broadleaf(5), -0.05, -0.35, 0.09);
    for (let k = 0; k < 4; k++) {
      const pad = new T.Mesh(lilyPadGeometry(k + 1), vcMaterial('lily', {side: T.DoubleSide}));
      pad.position.set(0.35 + (k % 2) * 0.25, 0.005, 0.2 + k * 0.12);
      pad.scale.setScalar(0.5);
      g.add(pad);
    }
  } else if (i === 1) {
    add(pine(3), -0.4, -0.3, 0.1);
    add(pine(6), -0.15, -0.4, 0.08);
    add(rock(3), 0.35, 0.25, 0.14);
    add(rock(6), 0.6, 0.0, 0.1);
  } else if (i === 2) {
    for (let k = 0; k < 4; k++) add(pine(k + 8), -0.55 + k * 0.2, -0.3 + (k % 2) * 0.12, 0.09 + (k % 2) * 0.03);
    const star = new T.MeshStandardMaterial({color: '#bfe8ff', emissive: '#7fd0ff', emissiveIntensity: 2});
    for (let k = 0; k < 9; k++) {
      const s = new T.Mesh(new T.SphereGeometry(0.012, 6, 4), star);
      s.position.set(Math.sin(k * 2.3) * 0.8, 0.01, 0.2 + Math.cos(k * 1.7) * 0.5);
      g.add(s);
    }
  } else if (i === 3) {
    add(harborBuilding(2), -0.35, -0.3, 0.12);
    add(harborBuilding(5), 0.0, -0.4, 0.1);
    add(boatModel(0.1, 0), 0.5, 0.35, 1).rotation.y = 0.6;
  } else if (i === 4) {
    add(palm(2), -0.35, -0.25, 0.09);
    for (let k = 0; k < 4; k++) add(coral(k + 1), 0.25 + (k % 2) * 0.3, 0.2 + k * 0.1, 0.12).position.y = 0.0;
  } else {
    add(boatModel(0.18, 2), 0, 0.1, 1).rotation.y = 0.5;
  }
  return {object: g, yaw: 0.2, pitch: 0.55};
}

export const ITEM_BUILDERS = {rod, line: spool, bait, tank, decor, filter, boat, waters};
