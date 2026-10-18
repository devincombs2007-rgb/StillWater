import * as T from './assets/three.module.js';
import {lathe, displace, paint, place, merge, tube, fbm, rand, vcMaterial} from './models.js?v=7';
// Procedural scenery models. Each factory takes a seed and returns an Object3D built
// mostly from merged, vertex-coloured geometry so a whole prop is one or two draw calls.
const V = (x, y, z) => new T.Vector3(x, y, z);
const C = c => new T.Color(c);
const mix = (a, b, t) => C(a).lerp(C(b), t);

// --- Trees ---------------------------------------------------------------------------
// Broadleaf: a tapering, slightly leaning trunk that forks into branches, under a crown
// of lumpy leaf clusters lit lighter on top and darker underneath.
export function broadleafGeometry(seed = 1) {
  const r = rand(seed * 977 + 13),
    h = 2.1 + r() * 1.0,
    lean = (r() - 0.5) * 0.4,
    parts = [];
  const bark = (x, y, z, out) => out.copy(mix('#5d4b3a', '#7a6650', 0.5 + fbm(x * 3, y * 6, z * 3, seed) * 0.8));
  const trunk = [V(0, 0, 0), V(lean * 0.3, h * 0.35, 0), V(lean * 0.7, h * 0.7, lean * 0.2), V(lean, h, lean * 0.3)];
  parts.push(paint(tube(trunk, u => 0.2 * (1 - u * 0.55) + (u < 0.08 ? (0.08 - u) * 1.5 : 0), 9, false), bark));
  const crown = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + r() * 1.2,
      base = trunk[2].clone().lerp(trunk[3], r() * 0.6),
      tip = base.clone().add(V(Math.cos(a) * (0.9 + r() * 0.6), 1.0 + r() * 0.8, Math.sin(a) * (0.9 + r() * 0.6)));
    parts.push(paint(tube([base, base.clone().lerp(tip, 0.5).add(V(0, 0.15, 0)), tip], u => 0.09 * (1 - u * 0.6), 6), bark));
    crown.push(tip);
  }
  crown.push(trunk[3].clone().add(V(0, 1.3, 0)), trunk[3].clone().add(V(0, 2.1, 0)));
  const lightTop = mix('#5f8a5a', '#77a26a', r()),
    darkUnder = mix('#2c4c3b', '#3a5a44', r());
  for (let k = 0; k < 8; k++) {
    const c = crown[k % crown.length].clone().add(V((r() - 0.5) * 1.2, (r() - 0.3) * 0.8, (r() - 0.5) * 1.2)),
      s = 1.05 + r() * 0.55,
      blob = displace(new T.SphereGeometry(1, 14, 10), 0.28, 1.5, seed * 31 + k, 3);
    place(blob, [c.x, c.y, c.z], [0, r() * 6, 0], [s * 1.1, s * 0.95, s * 1.1]);
    paint(blob, (x, y, z, out) => {
      const t = Math.min(1, Math.max(0, (y - (c.y - s)) / (2 * s)));
      out.copy(darkUnder).lerp(lightTop, t * t * (3 - 2 * t)).multiplyScalar(0.88 + fbm(x * 2.5, y * 2.5, z * 2.5, seed + k) * 0.3 + fbm(x * 9, y * 9, z * 9, seed) * 0.18);
    });
    parts.push(blob);
  }
  return merge(parts);
}
// Conifer: stacked drooping skirts of needles around a thin trunk.
export function pineGeometry(seed = 1) {
  const r = rand(seed * 613 + 7),
    h = 5 + r() * 3,
    parts = [];
  parts.push(paint(lathe([[0.16, 0], [0.12, h * 0.4], [0.05, h * 0.95]], 8), '#5a4a3b'));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const u = i / tiers,
      y = h * (0.22 + u * 0.68),
      rad = (1 - u * 0.75) * (1.5 + r() * 0.3),
      len = h * 0.3 * (1 - u * 0.35);
    const skirt = lathe([[0.05, y + len], [rad * 0.55, y + len * 0.4], [rad, y - len * 0.05], [rad * 0.85, y - len * 0.12], [0.1, y + len * 0.15]], 14);
    const p = skirt.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k),
        z = p.getZ(k),
        a = Math.atan2(z, x),
        jag = 1 + Math.sin(a * 7 + i * 1.3) * 0.08 + fbm(x * 2, i, z * 2, seed) * 0.15;
      p.setX(k, x * jag);
      p.setZ(k, z * jag);
    }
    skirt.computeVertexNormals();
    paint(skirt, (x, yy, z, out) => out.copy(mix('#1f3d33', '#3d6550', Math.min(1, Math.max(0, (yy - y + len * 0.1) / len)))).multiplyScalar(0.9 + u * 0.15));
    parts.push(skirt);
  }
  return merge(parts);
}
export function broadleaf(seed = 1) {
  return new T.Mesh(broadleafGeometry(seed), vcMaterial('foliage'));
}
export function pine(seed = 1) {
  return new T.Mesh(pineGeometry(seed), vcMaterial('foliage'));
}

// --- Rocks ---------------------------------------------------------------------------
// Weathered boulder: flattened, fractured silhouette, darker crevices and moss on top.
export function rockGeometry(seed = 1, mossy = true, palette = ['#7c8679', '#929b8c']) {
  const r = rand(seed * 389 + 3),
    g = new T.IcosahedronGeometry(1, 3);
  displace(g, 0.35, 1.1, seed, 4);
  // Flatten the base and chip a facet or two for a fractured look.
  const p = g.attributes.position,
    cut = V(r() - 0.5, r() * 0.4, r() - 0.5).normalize();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    if (y < -0.35) y = -0.35 + (y + 0.35) * 0.15;
    const d = x * cut.x + y * cut.y + z * cut.z;
    if (d > 0.62) {
      x -= cut.x * (d - 0.62);
      y -= cut.y * (d - 0.62);
      z -= cut.z * (d - 0.62);
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal,
    a = C(palette[0]),
    b = C(palette[1]),
    moss = C('#5f7a4f');
  paint(g, (x, y, z, out) => {
    const k = fbm(x * 3, y * 3, z * 3, seed + 5);
    out.copy(a).lerp(b, 0.5 + k);
    out.multiplyScalar(0.85 + fbm(x * 9, y * 9, z * 9, seed) * 0.3);
  });
  if (mossy) {
    const c = g.attributes.color;
    for (let i = 0; i < c.count; i++) {
      const up = n.getY(i),
        m = Math.max(0, (up - 0.55) / 0.45) * (0.6 + fbm(p.getX(i) * 4, 0, p.getZ(i) * 4, seed) * 0.8);
      if (m > 0) c.setXYZ(i, c.getX(i) + (moss.r - c.getX(i)) * m, c.getY(i) + (moss.g - c.getY(i)) * m, c.getZ(i) + (moss.b - c.getZ(i)) * m);
    }
  }
  return g;
}
export function rock(seed = 1) {
  return new T.Mesh(rockGeometry(seed), vcMaterial('stone', {roughness: 0.95}));
}

// --- Houses --------------------------------------------------------------------------
// Lakeside cottage: plinth, clapboard walls, overhanging gabled roof with fascia,
// chimney, framed windows with sills and shutters, a porch with posts and steps.
export function cottage(seed = 1, glow = null) {
  const w = 3.6,
    d = 3,
    wallH = 2.6,
    roofH = 1.5,
    wall = C(['#c9bea0', '#b9c2b0', '#d3c3a6', '#aebcb5'][seed % 4]),
    trim = C('#ece6d6'),
    roofC = C(['#5c6860', '#6d5650', '#4f5f6b'][seed % 3]),
    parts = [];
  parts.push({geo: place(new T.BoxGeometry(w + 0.2, 0.35, d + 0.2), [0, 0.17, 0]), color: '#6f706a'});
  const walls = place(new T.BoxGeometry(w, wallH, d, 1, 10, 1), [0, 0.35 + wallH / 2, 0]);
  paint(walls, (x, y, z, out) => out.copy(wall).multiplyScalar(0.94 + 0.06 * Math.sign(Math.sin(y * 9.5))));
  parts.push(walls);
  // Gable ends and roof slabs with overhang.
  const top = 0.35 + wallH;
  const gable = new T.BufferGeometry();
  gable.setAttribute('position', new T.Float32BufferAttribute([-w / 2, top, 0, w / 2, top, 0, 0, top + roofH, 0], 3));
  gable.computeVertexNormals();
  for (const z of [d / 2, -d / 2]) {
    const gg = gable.clone();
    // The back gable is turned around so its face points outward too.
    if (z < 0) gg.rotateY(Math.PI);
    gg.translate(0, 0, z);
    parts.push({geo: gg, color: wall});
  }
  const slope = Math.hypot(w / 2 + 0.35, roofH + 0.2),
    angle = Math.atan2(roofH + 0.2, w / 2 + 0.35);
  for (const s of [-1, 1]) {
    parts.push({
      geo: place(new T.BoxGeometry(slope, 0.14, d + 0.7), [s * (w / 4 + 0.08), top + roofH / 2 - 0.02, 0], [0, 0, -s * angle]),
      color: roofC,
    });
    parts.push({geo: place(new T.BoxGeometry(slope, 0.08, 0.08), [s * (w / 4 + 0.08), top + roofH / 2 - 0.12, d / 2 + 0.36], [0, 0, -s * angle]), color: trim});
  }
  parts.push({geo: place(new T.BoxGeometry(0.2, 0.2, d + 0.8), [0, top + roofH + 0.04, 0]), color: roofC.clone().multiplyScalar(0.8)});
  // Chimney.
  parts.push({geo: place(new T.BoxGeometry(0.45, 1.6, 0.45), [w * 0.25, top + roofH * 0.6, -d * 0.2]), color: '#8b6e5c'});
  parts.push({geo: place(new T.BoxGeometry(0.55, 0.12, 0.55), [w * 0.25, top + roofH * 0.6 + 0.85, -d * 0.2]), color: '#6e5a4c'});
  // Door, frame, step and porch.
  parts.push({geo: place(new T.BoxGeometry(0.75, 1.65, 0.06), [0, 0.35 + 0.83, d / 2 + 0.02]), color: ['#5d7464', '#7b5a48', '#56697a'][seed % 3]});
  parts.push({geo: place(new T.BoxGeometry(0.95, 0.1, 0.1), [0, 0.35 + 1.7, d / 2 + 0.04]), color: trim});
  parts.push({geo: place(new T.SphereGeometry(0.035, 6, 4), [0.25, 1.15, d / 2 + 0.07]), color: '#c9a86a'});
  parts.push({geo: place(new T.BoxGeometry(1.6, 0.12, 0.9), [0, 0.3, d / 2 + 0.5]), color: '#8a7a62'});
  parts.push({geo: place(new T.BoxGeometry(1.0, 0.1, 0.35), [0, 0.12, d / 2 + 1.05]), color: '#7d705c'});
  parts.push({geo: place(new T.BoxGeometry(1.8, 0.08, 1.0), [0, 2.25, d / 2 + 0.52], [-0.25, 0, 0]), color: roofC});
  for (const x of [-0.75, 0.75]) parts.push({geo: place(new T.CylinderGeometry(0.05, 0.05, 1.9, 6), [x, 1.3, d / 2 + 0.92]), color: trim});
  // Windows: frames, sills and shutters on the walls; glass goes in a separate glowing mesh.
  const panes = [];
  const windowAt = (x, y, z, rotY) => {
    const n = rotY ? [1, 0, 0] : [0, 0, 1],
      off = (k, s) => [x + n[0] * k * s, y, z + n[2] * k * s];
    parts.push({geo: place(new T.BoxGeometry(0.8, 0.95, 0.06), off(1, 0.03), [0, rotY, 0]), color: trim});
    parts.push({geo: place(new T.BoxGeometry(0.95, 0.07, 0.16), [x + n[0] * 0.07, y - 0.52, z + n[2] * 0.07], [0, rotY, 0]), color: trim});
    for (const s of [-1, 1]) {
      const sx = rotY ? 0 : s * 0.6,
        sz = rotY ? s * 0.6 : 0;
      parts.push({geo: place(new T.BoxGeometry(0.32, 0.95, 0.04), [x + sx + n[0] * 0.04, y, z + sz + n[2] * 0.04], [0, rotY, 0]), color: roofC.clone().lerp(C('#ffffff'), 0.15)});
    }
    const pane = place(new T.BoxGeometry(0.62, 0.78, 0.02), off(1, 0.065), [0, rotY, 0]);
    panes.push(pane);
    parts.push({geo: place(new T.BoxGeometry(0.62, 0.04, 0.03), off(1, 0.075), [0, rotY, 0]), color: trim});
    parts.push({geo: place(new T.BoxGeometry(0.04, 0.78, 0.03), off(1, 0.075), [0, rotY, 0]), color: trim});
  };
  for (const x of [-1.15, 1.15]) windowAt(x, 1.65, d / 2, 0);
  windowAt(w / 2, 1.65, -0.3, Math.PI / 2);
  windowAt(-w / 2, 1.65, -0.3, -Math.PI / 2);
  // A small picket fence and flower boxes for life.
  for (let k = 0; k < 9; k++) parts.push({geo: place(new T.BoxGeometry(0.08, 0.6, 0.04), [-2.2 + k * 0.55, 0.3, d / 2 + 1.6]), color: trim});
  parts.push({geo: place(new T.BoxGeometry(4.6, 0.06, 0.05), [0, 0.45, d / 2 + 1.6]), color: trim});
  for (const x of [-1.15, 1.15]) {
    parts.push({geo: place(new T.BoxGeometry(0.8, 0.18, 0.2), [x, 1.08, d / 2 + 0.14]), color: '#7b5a48'});
    for (let k = 0; k < 4; k++)
      parts.push({geo: place(new T.IcosahedronGeometry(0.09, 0), [x - 0.27 + k * 0.18, 1.22, d / 2 + 0.16]), color: ['#d98b8b', '#f0d38a', '#c9a0d8', '#e9e2cf'][(k + seed) % 4]});
  }
  const group = new T.Group();
  group.add(new T.Mesh(merge(parts), vcMaterial('building', {roughness: 0.85})));
  group.add(new T.Mesh(merge(panes), glow || new T.MeshStandardMaterial({color: '#f7dcad', emissive: '#e8b674', emissiveIntensity: 0.4})));
  return group;
}

// --- Cars ----------------------------------------------------------------------------
// Rounded little hatchback: bevelled body, glasshouse, bumpers, lights, wheels with hubs.
export function car(seed = 1) {
  const paintC = ['#a4b8b0', '#bca187', '#788c9d', '#c8c1ad', '#b07b6e'][seed % 5],
    group = new T.Group(),
    shape = new T.Shape(),
    L = 1.5,
    H = 0.42;
  const rr = 0.12;
  shape.moveTo(-L / 2 + rr, 0);
  shape.lineTo(L / 2 - rr, 0);
  shape.quadraticCurveTo(L / 2, 0, L / 2, rr);
  shape.lineTo(L / 2, H - rr);
  shape.quadraticCurveTo(L / 2, H, L / 2 - rr, H);
  shape.lineTo(-L / 2 + rr, H);
  shape.quadraticCurveTo(-L / 2, H, -L / 2, H - rr);
  shape.lineTo(-L / 2, rr);
  shape.quadraticCurveTo(-L / 2, 0, -L / 2 + rr, 0);
  const body = new T.ExtrudeGeometry(shape, {depth: 0.66, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 6});
  body.translate(0, 0.2, -0.33);
  const cabin = new T.Shape();
  cabin.moveTo(-0.55, 0);
  cabin.lineTo(0.35, 0);
  cabin.quadraticCurveTo(0.3, 0.32, 0.12, 0.36);
  cabin.lineTo(-0.45, 0.36);
  cabin.quadraticCurveTo(-0.56, 0.33, -0.55, 0);
  const cab = new T.ExtrudeGeometry(cabin, {depth: 0.58, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2});
  cab.translate(0, 0.62, -0.29);
  const glass = new T.ExtrudeGeometry(cabin, {depth: 0.6, bevelEnabled: false});
  glass.scale(0.92, 0.82, 1);
  glass.translate(-0.01, 0.67, -0.3);
  const parts = [
    {geo: body, color: paintC},
    {geo: cab, color: C(paintC).multiplyScalar(0.95)},
    {geo: place(new T.BoxGeometry(0.06, 0.12, 0.72), [L / 2 + 0.06, 0.27, 0]), color: '#4a4f4c'},
    {geo: place(new T.BoxGeometry(0.06, 0.12, 0.72), [-L / 2 - 0.06, 0.27, 0]), color: '#4a4f4c'},
  ];
  for (const z of [-0.24, 0.24]) {
    parts.push({geo: place(new T.CylinderGeometry(0.055, 0.055, 0.03, 10), [L / 2 + 0.04, 0.47, z], [0, 0, Math.PI / 2]), color: '#fff3cf'});
    parts.push({geo: place(new T.BoxGeometry(0.03, 0.07, 0.12), [-L / 2 - 0.04, 0.47, z]), color: '#c4463c'});
  }
  group.add(new T.Mesh(merge(parts), vcMaterial('car', {roughness: 0.38, metalness: 0.25})));
  group.add(new T.Mesh(glass, new T.MeshStandardMaterial({color: '#2b3f48', roughness: 0.1, metalness: 0.6})));
  const tyre = new T.TorusGeometry(0.13, 0.065, 8, 18),
    hub = new T.CylinderGeometry(0.09, 0.09, 0.05, 12);
  const wheels = [];
  for (const x of [-0.48, 0.48])
    for (const z of [-0.37, 0.37]) {
      const w = new T.Group();
      w.position.set(x, 0.19, z);
      w.add(new T.Mesh(tyre, vcMaterial('tyre')));
      const h = new T.Mesh(hub, new T.MeshStandardMaterial({color: '#c7cbc4', metalness: 0.7, roughness: 0.3}));
      h.rotation.x = Math.PI / 2;
      w.add(h);
      group.add(w);
      wheels.push(w);
    }
  paint(tyre, '#2a2e2c');
  group.userData.wheels = wheels;
  return group;
}

// --- People --------------------------------------------------------------------------
// A small walker with jointed arms and legs that swing from shoulders and hips.
export function walker(seed = 1) {
  const r = rand(seed * 53 + 1),
    shirt = ['#a58b78', '#9cafa0', '#8f9da9', '#c49a6c', '#7f9a8a'][seed % 5],
    trousers = ['#5d706a', '#4f5a6a', '#6b5f52'][seed % 3],
    skinC = ['#edc7a6', '#d3a37e', '#b17f5c', '#875e45'][seed % 4],
    hairC = ['#302b29', '#65503b', '#a58455'][seed % 3],
    g = new T.Group(),
    mat = vcMaterial('person', {roughness: 0.75});
  const torso = paint(lathe([[0.11, 0.55], [0.13, 0.65], [0.135, 0.85], [0.15, 0.97], [0.09, 1.03], [0.02, 1.05]], 12, 1.1, 0.75), shirt),
    neck = paint(place(new T.CylinderGeometry(0.035, 0.04, 0.08, 8), [0, 1.07, 0]), skinC),
    head = paint(place(new T.SphereGeometry(0.1, 14, 10), [0, 1.2, 0], [0, 0, 0], [1, 1.12, 1]), skinC),
    hair = paint(place(new T.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), [0, 1.215, -0.008], [-0.4, 0, 0]), hairC),
    nose = paint(place(new T.SphereGeometry(0.018, 6, 5), [0, 1.19, 0.1]), skinC);
  const pieces = [torso, neck, head, hair, nose];
  if (r() < 0.4) pieces.push(paint(place(new T.CylinderGeometry(0.13, 0.13, 0.02, 14), [0, 1.29, 0]), '#c1b08a'), paint(place(new T.CylinderGeometry(0.08, 0.09, 0.08, 12), [0, 1.33, 0]), '#c1b08a'));
  g.add(new T.Mesh(merge(pieces), mat));
  const limb = (color, len, radius) => {
    const pivot = new T.Group(),
      m = new T.Mesh(paint(place(new T.CapsuleGeometry(radius, len, 4, 8), [0, -len / 2 - radius, 0]), color), mat);
    pivot.add(m);
    return pivot;
  };
  const legs = [-1, 1].map(s => {
      const l = limb(trousers, 0.42, 0.045);
      l.position.set(s * 0.06, 0.56, 0);
      g.add(l);
      return l;
    }),
    arms = [-1, 1].map(s => {
      const a = limb(shirt, 0.34, 0.035);
      a.position.set(s * 0.16, 0.98, 0);
      a.rotation.z = s * 0.08;
      g.add(a);
      return a;
    });
  g.userData = {legs, arms, pace: 0.8 + r() * 0.5};
  return g;
}

// --- Palms ---------------------------------------------------------------------------
// Curving ringed trunk, coconuts and arching fronds with individual leaflets.
export function palmGeometry(seed = 1) {
  const r = rand(seed * 89 + 17),
    h = 4 + r() * 2.5,
    bend = 0.6 + r() * 0.9,
    dir = r() * Math.PI * 2,
    parts = [];
  const trunkPts = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6,
      off = bend * u * u;
    trunkPts.push(V(Math.cos(dir) * off, u * h, Math.sin(dir) * off));
  }
  const top = trunkPts[6];
  parts.push(
    paint(tube(trunkPts, u => 0.2 * (1 - u * 0.4) * (1 + 0.08 * Math.max(0, Math.sin(u * 60))), 9), (x, y, z, out) =>
      out.copy(mix('#7d6c52', '#a6936f', 0.5 + 0.5 * Math.sin(y * 10))),
    ),
  );
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    parts.push(paint(place(new T.SphereGeometry(0.13, 8, 6), [top.x + Math.cos(a) * 0.14, top.y - 0.2, top.z + Math.sin(a) * 0.14]), '#5b4a32'));
  }
  const fronds = 9;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + r() * 0.3,
      len = 2.4 + r() * 0.9,
      lift = 0.6 + r() * 0.5,
      pos = [],
      idx = [],
      colors = [],
      steps = 14;
    const green = mix('#557d55', '#7aa266', r()),
      dark = C('#3b5a40');
    for (let i = 0; i <= steps; i++) {
      const u = i / steps,
        // Midrib rises then droops under its own weight.
        x = Math.cos(a) * u * len,
        z = Math.sin(a) * u * len,
        y = top.y + lift * Math.sin(u * Math.PI * 0.7) - u * u * 1.4,
        leaflet = 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - u * 0.3),
        side = V(-Math.sin(a), 0, Math.cos(a));
      const base = pos.length / 3;
      pos.push(top.x + x, y, top.z + z);
      for (const s of [-1, 1]) pos.push(top.x + x + side.x * s * leaflet + Math.cos(a) * 0.15, y - leaflet * 0.55, top.z + z + side.z * s * leaflet + Math.sin(a) * 0.15);
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? dark : green;
        colors.push(c.r, c.g, c.b);
      }
      if (i < steps) idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 4, base, base + 2, base + 3, base + 2, base + 5, base + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return merge(parts);
}
export function palm(seed = 1) {
  return new T.Mesh(palmGeometry(seed), vcMaterial('frond', {side: T.DoubleSide, roughness: 0.8}));
}

// --- Harbour buildings -----------------------------------------------------------------
// Waterfront block: base storey with awning, repeated window bays (glowing panes in a
// separate mesh), cornice, rooftop water tank or antenna.
export function harborBuilding(seed = 1, glow = null) {
  const r = rand(seed * 401 + 9),
    floors = 3 + Math.floor(r() * 6),
    w = 2.2 + r() * 0.8,
    d = 2.4 + r() * 0.6,
    fh = 0.95,
    H = floors * fh + 0.4,
    wall = C(['#b5bbaf', '#96aca9', '#c9b9a3', '#a9b5c2', '#d0c6b2'][seed % 5]),
    parts = [],
    panes = [];
  parts.push({geo: place(new T.BoxGeometry(w, H, d), [0, H / 2, 0]), color: wall});
  parts.push({geo: place(new T.BoxGeometry(w + 0.12, 0.5, d + 0.12), [0, 0.25, 0]), color: wall.clone().multiplyScalar(0.75)});
  parts.push({geo: place(new T.BoxGeometry(w + 0.18, 0.14, d + 0.18), [0, H + 0.07, 0]), color: wall.clone().multiplyScalar(0.85)});
  parts.push({geo: place(new T.BoxGeometry(w * 0.9, 0.06, 0.55), [0, 0.95, d / 2 + 0.27], [0.25, 0, 0]), color: ['#b45b4c', '#4f7c79', '#c49a4c'][seed % 3]});
  const bays = Math.max(2, Math.round(w / 0.75));
  for (let f = 1; f < floors; f++)
    for (let b = 0; b < bays; b++) {
      const x = -w / 2 + ((b + 0.5) * w) / bays,
        y = 0.4 + f * fh + fh * 0.45;
      parts.push({geo: place(new T.BoxGeometry(0.5, 0.62, 0.05), [x, y, d / 2 + 0.01]), color: wall.clone().multiplyScalar(0.7)});
      parts.push({geo: place(new T.BoxGeometry(0.58, 0.06, 0.12), [x, y - 0.35, d / 2 + 0.05]), color: '#e8e2d2'});
      panes.push(place(new T.BoxGeometry(0.42, 0.52, 0.02), [x, y, d / 2 + 0.035]));
    }
  if (r() < 0.5) {
    parts.push({geo: place(new T.CylinderGeometry(0.35, 0.35, 0.6, 10), [w * 0.2, H + 0.75, 0]), color: '#7b6a58'});
    parts.push({geo: place(new T.ConeGeometry(0.4, 0.3, 10), [w * 0.2, H + 1.2, 0]), color: '#5f5246'});
    for (let k = 0; k < 3; k++) parts.push({geo: place(new T.CylinderGeometry(0.03, 0.03, 0.5, 4), [w * 0.2 + Math.cos(k * 2.1) * 0.28, H + 0.3, Math.sin(k * 2.1) * 0.28]), color: '#5f5246'});
  } else parts.push({geo: place(new T.CylinderGeometry(0.02, 0.02, 1.4, 4), [-w * 0.3, H + 0.8, 0]), color: '#9aa39e'});
  const group = new T.Group();
  group.add(new T.Mesh(merge(parts), vcMaterial('building', {roughness: 0.85})));
  group.add(new T.Mesh(merge(panes), glow || new T.MeshStandardMaterial({color: '#f7dcad', emissive: '#e8b674', emissiveIntensity: 0.4})));
  return group;
}

// --- Birds ---------------------------------------------------------------------------
// Gull: tapered body, head and beak, and two jointed wings that flap from the shoulder.
export function gull(seed = 1) {
  const g = new T.Group(),
    mat = vcMaterial('bird', {roughness: 0.7, side: T.DoubleSide});
  const body = paint(lathe([[0.001, -0.32], [0.06, -0.2], [0.085, 0.0], [0.07, 0.14], [0.001, 0.2]], 10), '#eef0ea');
  body.rotateX(Math.PI / 2);
  const head = paint(place(new T.SphereGeometry(0.065, 10, 8), [0, 0.04, 0.22]), '#f4f5f0'),
    beak = paint(place(new T.ConeGeometry(0.018, 0.09, 6), [0, 0.03, 0.31], [Math.PI / 2, 0, 0]), '#e8b54e'),
    tailG = paint(place(new T.ConeGeometry(0.07, 0.14, 4), [0, 0, -0.36], [-Math.PI / 2, 0, 0], [1, 0.25, 1]), '#d7dad3');
  g.add(new T.Mesh(merge([body, head, beak, tailG]), mat));
  const wings = [-1, 1].map(s => {
    const shoulder = new T.Group();
    shoulder.position.set(s * 0.05, 0.03, 0.02);
    const inner = new T.Group(),
      outer = new T.Group();
    const wingShape = (len, root, tip, color, edge) => {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute([0, 0, root / 2, 0, 0, -root / 2, s * len, 0, -tip / 2, s * len, 0, tip / 2], 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.computeVertexNormals();
      return paint(geo, (x, y, z, out) => out.copy(C(Math.abs(x) > len * 0.7 ? edge : color)));
    };
    inner.add(new T.Mesh(wingShape(0.32, 0.2, 0.16, '#c9cec9', '#c9cec9'), mat));
    outer.position.x = s * 0.32;
    outer.add(new T.Mesh(wingShape(0.34, 0.16, 0.06, '#c9cec9', '#2f3436'), mat));
    inner.add(outer);
    shoulder.add(inner);
    g.add(shoulder);
    return {shoulder, outer, side: s};
  });
  g.userData = {wings, phase: seed * 1.7};
  return g;
}
// Flap a gull built by gull(): inner wing from the shoulder, the outer wing lagging.
export function flapGull(bird, t) {
  const {wings, phase} = bird.userData,
    beat = Math.sin(t * 5.5 + phase),
    glide = Math.max(0, Math.sin(t * 0.45 + phase)) > 0.6;
  for (const w of wings) {
    const a = glide ? 0.08 : beat * 0.55;
    w.shoulder.rotation.z = w.side * a;
    w.outer.rotation.z = w.side * (glide ? -0.05 : Math.sin(t * 5.5 + phase - 0.6) * 0.35);
  }
}

// --- Dock pieces and lights ----------------------------------------------------------
// Weathered plank deck on stringers and round piles, with cleats and a coiled rope.
export function dockGeometry(length = 6.7, width = 3.1, seed = 1) {
  const r = rand(seed * 71 + 2),
    parts = [],
    plank = 0.44;
  const n = Math.round(length / (plank + 0.04));
  for (let i = 0; i < n; i++) {
    const z = -length / 2 + (i + 0.5) * (plank + 0.04),
      tone = 0.85 + r() * 0.25,
      board = place(new T.BoxGeometry(width + (r() - 0.5) * 0.08, 0.09, plank, 6, 1, 1), [(r() - 0.5) * 0.05, 0.2, z], [0, (r() - 0.5) * 0.015, (r() - 0.5) * 0.01]);
    paint(board, (x, y, zz, out) => out.copy(mix('#5e5442', '#857a62', 0.5 + fbm(x * 3, i, zz * 12, seed) * 0.9)).multiplyScalar(tone));
    parts.push(board);
    for (const x of [-width * 0.39, width * 0.39]) parts.push({geo: place(new T.CylinderGeometry(0.018, 0.018, 0.02, 6), [x, 0.25, z]), color: '#3a3d38'});
  }
  for (const x of [-width * 0.4, 0, width * 0.4]) parts.push({geo: place(new T.BoxGeometry(0.16, 0.18, length), [x, 0.07, 0]), color: '#4a4436'});
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1])
    for (let k = 0; k <= 2; k++) {
      const z = -length / 2 + 0.25 + (k * (length - 0.5)) / 2,
        pile = place(new T.CylinderGeometry(0.13, 0.15, 2.0, 10), [x, -0.55, z]);
      paint(pile, (xx, y, zz, out) => out.copy(y < -0.25 ? C('#35443b') : C('#5a5343')));
      parts.push(pile);
      parts.push({geo: place(new T.CylinderGeometry(0.135, 0.13, 0.08, 10), [x, 0.48, z]), color: '#4c4637'});
    }
  // Cleat and a coil of rope at the end.
  parts.push({geo: place(new T.BoxGeometry(0.32, 0.05, 0.07), [width / 2 - 0.35, 0.3, -length / 2 + 0.6]), color: '#5a5f5c'});
  parts.push({geo: place(new T.TorusGeometry(0.17, 0.035, 6, 18), [-width / 2 + 0.5, 0.28, -length / 2 + 0.7], [Math.PI / 2, 0, 0]), color: '#c9b78e'});
  parts.push({geo: place(new T.TorusGeometry(0.12, 0.035, 6, 16), [-width / 2 + 0.5, 0.33, -length / 2 + 0.7], [Math.PI / 2, 0, 0]), color: '#bda983'});
  return merge(parts);
}
// Hurricane lantern: base, wire cage around a glass chimney, cap and handle.
export function lantern(glassMat) {
  const g = new T.Group(),
    metal = vcMaterial('metal', {metalness: 0.6, roughness: 0.4});
  const parts = [
    paint(lathe([[0.22, 0], [0.24, 0.05], [0.2, 0.12], [0.12, 0.14]], 16), '#3d4c47'),
    paint(lathe([[0.14, 0.52], [0.2, 0.56], [0.16, 0.66], [0.06, 0.72], [0.03, 0.75]], 16), '#3d4c47'),
    paint(place(new T.TorusGeometry(0.11, 0.008, 5, 16, Math.PI), [0, 0.8, 0]), '#2e3936'),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    parts.push(paint(place(new T.CylinderGeometry(0.008, 0.008, 0.42, 4), [Math.cos(a) * 0.16, 0.34, Math.sin(a) * 0.16]), '#2e3936'));
  }
  g.add(new T.Mesh(merge(parts), metal));
  const glass = new T.Mesh(lathe([[0.1, 0.13], [0.15, 0.25], [0.15, 0.4], [0.1, 0.53]], 16), glassMat);
  g.add(glass);
  return g;
}
// Cattail reed: a bent stem with a brown seed head and a long ribbon leaf.
export function reedGeometry(seed = 1) {
  const r = rand(seed * 37 + 4),
    h = 0.9 + r() * 1.6,
    lean = (r() - 0.5) * 0.4,
    parts = [];
  const stem = [V(0, 0, 0), V(lean * 0.3, h * 0.5, 0), V(lean, h, lean * 0.2)];
  parts.push(paint(tube(stem, u => 0.018 * (1 - u * 0.5), 5), '#6c8d73'));
  if (r() < 0.7) {
    const top = stem[2];
    parts.push(paint(place(new T.CapsuleGeometry(0.035, 0.18, 3, 8), [top.x * 0.96, top.y - 0.12, top.z * 0.96]), '#6a4a33'));
  }
  for (let k = 0; k < 2; k++) {
    const a = r() * Math.PI * 2,
      len = h * (0.6 + r() * 0.4);
    const leaf = [];
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      leaf.push(V(Math.cos(a) * u * 0.35, u * len - u * u * len * 0.25, Math.sin(a) * u * 0.35));
    }
    parts.push(paint(tube(leaf, u => 0.022 * (1 - u), 4, false), '#7a9a73'));
  }
  return merge(parts);
}
export function reed(seed = 1) {
  return new T.Mesh(reedGeometry(seed), vcMaterial('reed', {roughness: 0.85}));
}
export function cottageModel(seed = 1) {
  return cottage(seed);
}

// --- Reef corals -----------------------------------------------------------------------
// Three growth forms: branching staghorn, a grooved brain coral dome and a flat sea fan.
export function coralGeometry(seed = 1) {
  const r = rand(seed * 157 + 11),
    kind = seed % 3,
    palette = [['#e58a7c', '#f3b9a5'], ['#c98fd6', '#e8c3ef'], ['#e9b45a', '#f6d79a'], ['#6fc2b0', '#b5e6d8'], ['#e27aa0', '#f6b6cb']][seed % 5],
    parts = [];
  const tint = (a, b) => (x, y, z, out) => out.set(a).lerp(new T.Color(b), Math.min(1, Math.max(0, y / 1.4)));
  if (kind === 0) {
    const grow = (from, dir, len, rad, depth) => {
      const to = from.clone().addScaledVector(dir, len),
        mid = from.clone().lerp(to, 0.5).add(V((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.1));
      parts.push(paint(tube([from, mid, to], u => rad * (1 - u * 0.45), 6), tint(...palette)));
      if (depth > 0)
        for (let k = 0; k < 2; k++) {
          const nd = dir.clone().add(V((r() - 0.5) * 1.2, 0.35, (r() - 0.5) * 1.2)).normalize();
          grow(to, nd, len * 0.72, rad * 0.7, depth - 1);
        }
    };
    for (let k = 0; k < 3; k++) grow(V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize(), 0.45, 0.08, 3);
  } else if (kind === 1) {
    const dome = displace(new T.SphereGeometry(0.75, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 3, seed, 2);
    paint(dome, (x, y, z, out) => out.set(palette[0]).lerp(new T.Color(palette[1]), 0.5 + 0.5 * Math.sin(x * 26 + Math.sin(z * 9) * 3)));
    parts.push(dome);
  } else {
    const fan = new T.PlaneGeometry(1.4, 1.2, 14, 12),
      p = fan.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i) + 0.6;
      p.setXYZ(i, x * (0.3 + y * 0.6), y, Math.sin(x * 3) * 0.08);
    }
    fan.computeVertexNormals();
    paint(fan, (x, y, z, out) => out.set(palette[0]).multiplyScalar(0.8 + 0.4 * Math.abs(Math.sin(x * 30) * Math.sin(y * 26))));
    parts.push(fan);
    parts.push(paint(tube([V(0, 0, 0), V(0, 0.3, 0)], 0.04, 5), palette[0]));
  }
  return merge(parts);
}
export function coral(seed = 1) {
  return new T.Mesh(coralGeometry(seed), vcMaterial('coral', {roughness: 0.7, side: T.DoubleSide}));
}

// --- Lily pads -----------------------------------------------------------------------
// A notched floating leaf with radiating veins and a lifted rim; some carry a flower.
export function lilyPadGeometry(seed = 1) {
  const r = rand(seed * 29 + 3),
    leaf = new T.CircleGeometry(0.45 + r() * 0.25, 28, 0.25, Math.PI * 2 - 0.5),
    p = leaf.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      d = Math.hypot(x, y);
    p.setZ(i, Math.pow(d / 0.7, 4) * 0.05);
  }
  leaf.rotateX(-Math.PI / 2);
  leaf.computeVertexNormals();
  paint(leaf, (x, y, z, out) => {
    const a = Math.atan2(z, x),
      d = Math.hypot(x, z);
    out.set('#4f7f45').multiplyScalar(0.85 + 0.15 * Math.cos(a * 14) * Math.min(1, d * 3) + (d > 0.4 ? 0.12 : 0));
  });
  const parts = [leaf];
  if (r() < 0.45) {
    const petals = ['#f3d7e0', '#fff4e6', '#f6c3d2'][seed % 3];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      parts.push(paint(place(new T.SphereGeometry(0.07, 8, 6), [Math.cos(a) * 0.07, 0.07, Math.sin(a) * 0.07], [0.5, a, 0], [0.6, 0.35, 1.4]), petals));
    }
    parts.push(paint(place(new T.SphereGeometry(0.035, 8, 6), [0, 0.1, 0]), '#e8c04f'));
  }
  return merge(parts);
}
