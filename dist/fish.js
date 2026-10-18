import * as T from './assets/three.module.js';
import {merge, paint, applyRayTracedShading} from './models.js?v=11';
import {normalTexture} from './textures.js?v=11';
const PI = Math.PI,
  TAU = PI * 2;
const white = new T.Color('#f2dfb5'),
  dark = new T.Color('#163b43'),
  pearlTint = new T.Color('#f7f2ff'),
  starTint = new T.Color('#7ce8ff'),
  goldTint = new T.Color('#ffd66b');
// Per body plan: size (h height, w width, len, tail span), the narrow caudal peduncle,
// where the body is deepest, how blunt the head is (higher = rounder), and fin layout.
const ANATOMY = {
  slim: {h: 0.27, w: 0.2, len: 1.84, tail: 0.36, ped: 0.2, deep: 0.58, nose: 2.0, tailType: 'fork', dorsal: 0.2, anal: 0.15},
  round: {h: 0.42, w: 0.23, len: 1.84, tail: 0.38, ped: 0.2, deep: 0.55, nose: 2.6, top: 1.05, bot: 0.95, tailType: 'fork', dorsal: 0.24, anal: 0.17},
  koi: {h: 0.32, w: 0.25, len: 1.84, tail: 0.42, ped: 0.24, deep: 0.62, nose: 2.5, top: 1.08, bot: 0.92, tailType: 'fork', dorsal: 0.16, anal: 0.12, barbels: 2},
  betta: {h: 0.28, w: 0.2, len: 1.7, tail: 0.8, ped: 0.32, deep: 0.55, nose: 2.3, tailType: 'veil', dorsal: 0.45, anal: 0.42, dorsalFrom: 0.15},
  fancy: {h: 0.45, w: 0.34, len: 1.6, tail: 0.7, ped: 0.3, deep: 0.5, nose: 3, top: 1.1, bot: 1.15, tailType: 'double', dorsal: 0.3, anal: 0.1},
  angel: {h: 0.58, w: 0.17, len: 1.7, tail: 0.38, ped: 0.16, deep: 0.55, nose: 2.3, tailType: 'lyre', dorsal: 0.95, anal: 0.85},
  disc: {h: 0.66, w: 0.18, len: 1.7, tail: 0.3, ped: 0.14, deep: 0.5, nose: 3.2, tailType: 'fan', dorsal: 0.2, anal: 0.18, dorsalFrom: 0.12},
  trout: {h: 0.3, w: 0.22, len: 1.95, tail: 0.4, ped: 0.22, deep: 0.58, nose: 1.8, tailType: 'fork', dorsal: 0.2, anal: 0.15, adipose: true},
  catfish: {h: 0.26, w: 0.26, len: 1.84, tail: 0.35, ped: 0.28, deep: 0.64, nose: 3.2, top: 1.15, bot: 0.65, tailType: 'round', dorsal: 0.26, anal: 0.12, barbels: 4, adipose: true},
  eel: {h: 0.16, w: 0.15, len: 2.45, tail: 0.22, ped: 0.55, deep: 0.62, nose: 1.7, tailType: 'round', dorsal: 0.12, anal: 0.1, dorsalFrom: 0.05, dorsalTo: 0.82},
  arowana: {h: 0.3, w: 0.2, len: 2.45, tail: 0.36, ped: 0.26, deep: 0.55, nose: 1.6, top: 0.85, bot: 1.1, tailType: 'round', dorsal: 0.24, anal: 0.3, barbels: 2, dorsalFrom: 0.08, dorsalTo: 0.4},
  guppy: {h: 0.24, w: 0.18, len: 1.5, tail: 0.55, ped: 0.32, deep: 0.6, nose: 2.3, tailType: 'veil', dorsal: 0.2, anal: 0.12},
  sword: {h: 0.27, w: 0.2, len: 1.84, tail: 0.36, ped: 0.2, deep: 0.58, nose: 1.9, tailType: 'fork', dorsal: 0.25, anal: 0.14},
  sail: {h: 0.32, w: 0.21, len: 1.9, tail: 0.4, ped: 0.2, deep: 0.6, nose: 1.9, tailType: 'fork', dorsal: 0.65, anal: 0.18, dorsalFrom: 0.2, dorsalTo: 0.85},
  dragon: {h: 0.3, w: 0.2, len: 2.7, tail: 0.58, ped: 0.3, deep: 0.55, nose: 1.7, tailType: 'veil', dorsal: 0.5, anal: 0.35, dorsalFrom: 0.1, dorsalTo: 0.8},
};
// Fast open-water swimmers get a stiff crescent tail.
const PELAGIC = ['mackerel', 'tuna', 'wahoo', 'mahi', 'sailfish', 'marlin', 'mullet', 'seabass'];
function profile(f) {
  const a = {top: 1, bot: 1, ...(ANATOMY[f.shape] || ANATOMY.slim)};
  if (PELAGIC.includes(f.id)) a.tailType = 'lunate';
  if (f.id === 'clown' || f.id === 'goby' || f.id === 'cory') a.tailType = 'round';
  return a;
}
// Body depth along the length (u: 0 tail .. 1 snout), 0..1.
function thickness(p, u) {
  if (u < 0.05) return p.ped * Math.sqrt(Math.max(0, u) / 0.05);
  if (u < p.deep) return p.ped + (1 - p.ped) * Math.pow(Math.sin(((u - 0.05) / (p.deep - 0.05)) * PI * 0.5), 1.25);
  const s = (u - p.deep) / (1 - p.deep);
  return Math.pow(Math.max(0, 1 - Math.pow(s, p.nose)), 0.5);
}
// The mouth sits a little below the midline, so the head droops slightly.
const midline = (p, u) => -p.h * 0.07 * Math.max(0, (u - p.deep) / (1 - p.deep));
function bodyColor(f, u, a) {
  const c = new T.Color(f.color),
    dorsal = Math.sin(a);
  c.multiplyScalar(0.73 + Math.max(0, dorsal) * 0.16);
  if (dorsal < -0.1) c.lerp(white, Math.min(0.68, (-dorsal - 0.1) * 0.72));
  const id = f.id;
  if (['perch', 'midnight', 'ram', 'peacock', 'molly'].includes(id) && Math.sin(u * 34 + (id === 'ram' ? 1 : 0)) > 0.53)
    c.lerp(dark, 0.48);
  if (['danio', 'cardinal', 'tetra'].includes(id)) {
    if (Math.abs(dorsal - 0.12) < 0.19) c.set(id === 'cardinal' ? '#54d6df' : '#78cbbd');
    if (id === 'cardinal' && dorsal < -0.12) c.set('#d25c68');
    if (id === 'danio' && Math.sin(dorsal * 22) > 0.3) c.lerp(dark, 0.6);
  }
  if (f.shape === 'koi') {
    if (Math.sin(u * 17 + Math.cos(a * 2) * 2) > 0.36 && u > 0.16) c.set(id === 'ribbonkoi' ? '#c75036' : '#bd7753');
    if (Math.sin(u * 30 + a * 4) < -0.82) c.set('#37484a');
  }
  if (
    ['trout', 'char', 'gourami', 'starpearl', 'peacock'].includes(id) &&
    Math.sin(u * 107) * Math.cos(a * 17) > 0.68 &&
    u < 0.78
  ) {
    c.set(id === 'trout' || id === 'char' ? '#846c75' : '#e0e3d0');
  }
  if (['discus', 'mandarin'].includes(id) && Math.sin(u * 45 + Math.sin(a * 6) * 2) > 0.45)
    c.lerp(new T.Color(f.fin), 0.75);
  if (id === 'clown' && (Math.abs(u - 0.25) < 0.055 || Math.abs(u - 0.58) < 0.06 || Math.abs(u - 0.82) < 0.045))
    c.set('#eee5c7');
  if (['moorish', 'banner', 'reefbutter'].includes(id) && Math.sin(u * 18) > 0.55) c.lerp(dark, 0.85);
  if (id === 'tang' && u < 0.25) c.set('#ddc36b');
  if (id === 'mackerel' && dorsal > 0.2 && Math.sin(u * 78) > 0.5) c.lerp(dark, 0.5);
  if (id === 'cory' && (u > 0.73 || u < 0.16)) c.lerp(dark, 0.8);
  // Sanctuary rare morph tints (Pearl, Starlight, Golden)
  if (f.morph === 'pearl') c.lerp(pearlTint, 0.38 + 0.2 * Math.sin(u * 24 + a * 3));
  else if (f.morph === 'starlight') c.lerp(starTint, 0.32 + 0.25 * Math.max(0, Math.sin(u * 38 + a * 5)));
  else if (f.morph === 'golden') c.lerp(goldTint, 0.42 + 0.18 * Math.cos(u * 20));
  // Lateral line and a darker gill cover.
  if (u > 0.08 && u < 0.76 && Math.abs(dorsal - 0.2) < 0.032) c.multiplyScalar(0.84);
  if (u > 0.74 && u < 0.8 && Math.abs(dorsal) < 0.75) c.multiplyScalar(0.88);
  // Subtle offset scale rows catch the light with metallic shimmer.
  const row = Math.floor((a + PI) / 0.2),
    scale = Math.cos(u * 190 + (row % 2) * PI);
  c.multiplyScalar(0.965 + scale * 0.042);
  return c;
}
function gridGeometry(rows, cols, fn) {
  const pos = [],
    colors = [],
    uv = [],
    index = [];
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= cols; j++) {
      const u = i / rows,
        v = j / cols;
      const {p, c} = fn(u, v);
      pos.push(...p);
      colors.push(c.r, c.g, c.b);
      uv.push(u, v);
    }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j,
        b = a + cols + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
export function createFish(f) {
  const g = new T.Group(),
    p = profile(f),
    tailX = -p.len * 0.48,
    headX = p.len * 0.52;
  g.name = f.name;
  const xAt = u => tailX + u * p.len,
    widthAt = u => p.w * thickness(p, u) * (f.shape === 'catfish' ? 1 + 0.3 * Math.max(0, (u - 0.55) / 0.45) : 1),
    topAt = u => midline(p, u) + p.h * thickness(p, u) * p.top,
    botAt = u => midline(p, u) - p.h * thickness(p, u) * p.bot;
  // High-resolution 64x36 anatomical body mesh with dorsal/ventral muscle contour and gill operculum relief.
  const bodyGeo = gridGeometry(64, 36, (u, v) => {
    const a = v * TAU,
      t = thickness(p, u),
      sa = Math.sin(a),
      ca = Math.cos(a),
      operculum = u > 0.74 && u < 0.81 && Math.abs(sa) < 0.72 ? 1.038 : 1,
      flankMuscle = u > 0.15 && u < 0.7 && Math.abs(sa) < 0.55 ? 1 + 0.025 * Math.sin((u - 0.15) * 5.5) : 1;
    const y = midline(p, u) + sa * p.h * t * (sa > 0 ? p.top : p.bot);
    return {p: [xAt(u), y, ca * widthAt(u) * operculum * flankMuscle], c: bodyColor(f, u, a)};
  });
  const skin = new T.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.24,
    metalness: f.morph ? 0.38 : 0.24,
    clearcoat: 0.92,
    clearcoatRoughness: 0.12,
    iridescence: 0.28 + (f.rarity || 0) * 0.14 + (f.morph ? 0.3 : 0),
    iridescenceIOR: 1.38,
    sheen: 0.35,
    sheenRoughness: 0.35,
    normalMap: normalTexture('scales'),
    normalScale: new T.Vector2(0.16, 0.16),
    transparent: f.id === 'glasscat',
    opacity: f.id === 'glasscat' ? 0.64 : 1,
  });
  if (f.morph) {
    skin.emissive = new T.Color(f.morph === 'starlight' ? '#3aa8d8' : f.morph === 'golden' ? '#d49b35' : '#b8a8d8');
    skin.emissiveIntensity = 0.14;
  }
  applyRayTracedShading(skin, 0.26);
  const body = new T.Mesh(bodyGeo, skin);
  g.add(body);
  const finMaterial = new T.MeshPhysicalMaterial({
    vertexColors: true,
    side: T.DoubleSide,
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
    sheen: 0.35,
    transparent: true,
    opacity: f.shape === 'betta' || f.shape === 'dragon' ? 0.82 : 0.9,
    depthWrite: false,
  });
  applyRayTracedShading(finMaterial, 0.42);
  // Each fin keeps a per-vertex weight (0 at the root, 1 at the edge) for animation.
  const fins = [];
  function addFin(geometry, parent = g, weight = (u, v) => u) {
    const m = new T.Mesh(geometry, finMaterial);
    parent.add(m);
    const w = new Float32Array(geometry.attributes.position.count),
      uv = geometry.attributes.uv;
    for (let i = 0; i < w.length; i++) w[i] = weight(uv.getX(i), uv.getY(i));
    fins.push({mesh: m, base: geometry.attributes.position.array.slice(), weight: w});
    return m;
  }
  const finC = new T.Color(f.fin),
    edge = new T.Color(f.color).lerp(white, 0.34);
  if (f.morph === 'pearl') finC.lerp(pearlTint, 0.45);
  else if (f.morph === 'starlight') finC.lerp(starTint, 0.45);
  else if (f.morph === 'golden') finC.lerp(goldTint, 0.45);
  // Rays: darker lines radiating through the membrane, lighter toward the edge.
  function finColor(u, v, rays = 36) {
    const c = finC.clone().lerp(edge, u * 0.65);
    if (Math.cos(v * PI * rays) > 0.72) c.multiplyScalar(0.74);
    return c;
  }
  const ray = (v, rays, amp) => Math.sin(v * PI * rays) * amp;

  // Tail (caudal fin) in its own group so it can sweep from the peduncle.
  const tail = new T.Group();
  tail.position.x = tailX + 0.02;
  g.add(tail);
  const lobe = (type, span) => {
    const s = Math.abs(span);
    if (type === 'fork') return 0.3 + 0.17 * Math.pow(s, 1.5) - 0.07 * (1 - s);
    if (type === 'lunate') return 0.17 + 0.33 * Math.pow(s, 1.2);
    if (type === 'round') return 0.42 * (1 - 0.35 * span * span);
    if (type === 'lyre') return 0.3 + 0.3 * Math.pow(s, 3);
    if (type === 'fan') return 0.3 * (1 - 0.3 * span * span);
    return 0.62 + 0.08 * Math.sin(span * 6);
  };
  const makeTail = (type, spread = 1) =>
    gridGeometry(18, 36, (u, v) => {
      const span = v * 2 - 1,
        L = lobe(type, span) * (type === 'veil' || type === 'double' ? p.tail / 0.6 : 1),
        flow = type === 'veil' || type === 'double' ? Math.sin(v * PI * 7) * 0.035 * u : 0,
        root = Math.min(0.6, (p.ped * p.h) / p.tail),
        height = (type === 'lunate' ? 1.25 : 1) * p.tail * spread * (root + (1 - root) * Math.pow(u, 0.85));
      return {
        p: [-u * L - (type === 'lunate' ? Math.abs(span) * 0.1 * u : 0), span * height + flow, ray(v, 22, 0.007) * u],
        c: finColor(u, v, 22),
      };
    });
  if (p.tailType === 'double') {
    for (const side of [-1, 1]) {
      const t = addFin(makeTail('veil', 0.85), tail);
      t.rotation.y = side * 0.32;
    }
  } else addFin(makeTail(p.tailType), tail);

  // Dorsal and anal fins rise from the actual body outline.
  const dorsalFrom = p.dorsalFrom ?? 0.3,
    dorsalTo = p.dorsalTo ?? 0.7;
  addFin(
    gridGeometry(32, 8, (u, v) => {
      const bu = dorsalFrom + u * (dorsalTo - dorsalFrom),
        env =
          f.shape === 'angel'
            ? Math.pow(u < 0.62 ? u / 0.62 : (1 - u) / 0.38, 0.8)
            : f.shape === 'sail' || f.shape === 'eel'
              ? Math.pow(Math.sin(PI * Math.min(1, u * 1.15)), 0.5)
              : Math.pow(Math.sin(PI * u), 0.65) * (1 - 0.35 * u);
      // Lionfish carry a crown of separate spines rather than a smooth sail.
      const spines = f.id === 'lion' ? 0.45 + 0.55 * Math.abs(Math.sin(u * PI * 9)) : 1;
      return {p: [xAt(bu) - v * 0.08 * env, topAt(bu) * 0.96 + env * spines * p.dorsal * v, ray(u, 8, 0.012) * v], c: finColor(v, u, 16)};
    }),
    g,
    (u, v) => v,
  );
  const analFrom = f.shape === 'angel' ? 0.22 : f.shape === 'eel' || f.shape === 'dragon' ? 0.08 : 0.2,
    analTo = f.shape === 'angel' ? 0.55 : f.shape === 'eel' ? 0.5 : 0.42;
  addFin(
    gridGeometry(22, 6, (u, v) => {
      const bu = analFrom + u * (analTo - analFrom),
        env = f.shape === 'angel' ? Math.pow(u < 0.6 ? u / 0.6 : (1 - u) / 0.4, 0.8) : Math.pow(Math.sin(PI * u), 0.7);
      return {p: [xAt(bu) - v * 0.06 * env, botAt(bu) * 0.96 - env * p.anal * v, ray(u, 6, 0.01) * v], c: finColor(v, u, 12)};
    }),
    g,
    (u, v) => v,
  );
  if (p.adipose)
    addFin(
      gridGeometry(8, 4, (u, v) => {
        const bu = 0.14 + u * 0.08;
        return {p: [xAt(bu), topAt(bu) * 0.95 + Math.sin(PI * u) * 0.05 * v, 0], c: finColor(v, u, 4)};
      }),
      g,
      (u, v) => v,
    );
  if (f.id === 'sword')
    addFin(
      gridGeometry(10, 5, (u, v) => ({p: [-u * 0.6, -0.1 - u * 0.12 + v * 0.045, 0.01], c: finColor(u, v, 5).lerp(dark, u * 0.5)})),
      tail,
    );

  // Paired fins: pectorals behind the gill cover, pelvics under the belly. Built around
  // their root so they can flap.
  const pectorals = [],
    details = [],
    lodParts = [];
  // Small parts the tank skips for distant fish (level of detail).
  g.userData.lodParts = lodParts;
  const pecU = 0.73,
    pelU = 0.56;
  for (const side of [-1, 1]) {
    const root = new T.Group();
    root.position.set(xAt(pecU), midline(p, pecU) - p.h * thickness(p, pecU) * 0.3, side * widthAt(pecU) * 0.88);
    g.add(root);
    const span = f.id === 'lion' ? 0.5 : f.shape === 'catfish' ? 0.34 : f.shape === 'disc' || f.shape === 'angel' ? 0.22 : 0.27;
    addFin(
      gridGeometry(12, 14, (u, v) => {
        const fan = (v - 0.5) * 1.2,
          len = span * (1 - 0.35 * fan * fan);
        return {p: [-u * len * Math.cos(fan * 0.5), -u * len * Math.sin(fan * 0.5) * 0.9 - u * 0.04, side * (u * 0.07)], c: finColor(u, v, 14)};
      }),
      root,
    );
    pectorals.push(root);
    const pelvic = new T.Group();
    lodParts.push(pelvic);
    pelvic.position.set(xAt(pelU), botAt(pelU) * 0.92, side * widthAt(pelU) * 0.45);
    g.add(pelvic);
    addFin(
      gridGeometry(8, 8, (u, v) => ({p: [-u * 0.16 - v * 0.05, -u * 0.08 * (0.6 + v * 0.4), side * u * 0.05], c: finColor(u, v, 8)})),
      pelvic,
    );

    // Eye in a sculpted orbital socket, with metallic iris ring, pupil, cornea dome and specular catchlight.
    const eyeU = f.shape === 'catfish' ? 0.87 : 0.85,
      eyeY = midline(p, eyeU) + p.h * thickness(p, eyeU) * 0.3,
      eyeZ = widthAt(eyeU) * Math.sqrt(1 - 0.09) + 0.004,
      eyeX = xAt(eyeU),
      er = 0.05 * Math.min(1.2, Math.max(0.8, p.h / 0.3));
    const sphereAt = (pos, scale, color) => {
      const geo = new T.SphereGeometry(1, 16, 12);
      geo.scale(...scale);
      geo.translate(...pos);
      details.push(paint(geo, color));
    };
    sphereAt([eyeX, eyeY, side * (eyeZ - 0.006)], [er * 1.28, er * 1.28, er * 0.48], new T.Color(f.color).multiplyScalar(0.76));
    sphereAt([eyeX, eyeY, side * eyeZ], [er, er * 1.05, er * 0.52], '#0b1416');
    const iris = new T.TorusGeometry(er * 0.82, er * 0.22, 8, 24);
    iris.translate(eyeX, eyeY, side * (eyeZ + er * 0.32));
    details.push(paint(iris, f.rarity > 2 ? '#f0d493' : '#ccb982'));
    sphereAt([eyeX + er * 0.3, eyeY + er * 0.35, side * (eyeZ + er * 0.47)], [er * 0.25, er * 0.27, er * 0.14], '#ffffff');
    sphereAt([eyeX - er * 0.22, eyeY - er * 0.2, side * (eyeZ + er * 0.44)], [er * 0.12, er * 0.12, er * 0.08], '#d8eef2');

    // Nostril pit ahead of the eye.
    const narU = 0.92,
      narY = midline(p, narU) + p.h * thickness(p, narU) * 0.25,
      narZ = widthAt(narU) * 0.88;
    sphereAt([xAt(narU), narY, side * narZ], [er * 0.2, er * 0.14, er * 0.14], new T.Color(f.color).multiplyScalar(0.55));

    // Gill cover (operculum) double-ridge following the body surface.
    for (const [gu, rad, shade] of [
      [0.77, 0.0065, 1],
      [0.752, 0.004, 0.75],
    ]) {
      const points = [];
      for (let i = 0; i <= 16; i++) {
        const a = -1.1 + (i / 16) * 2.2,
          y = midline(p, gu) + Math.sin(a) * p.h * thickness(p, gu) * (a > 0 ? p.top : p.bot) * 0.85;
        points.push(new T.Vector3(xAt(gu) - Math.cos(a) * 0.05, y, side * (Math.cos(a) * widthAt(gu) * 0.97 + 0.004)));
      }
      details.push(paint(new T.TubeGeometry(new T.CatmullRomCurve3(points), 16, rad, 5, false), new T.Color(f.fin).multiplyScalar(shade)));
    }
  }
  // Mouth: sculpted upper and lower lips at the snout.
  const lips = new T.TorusGeometry(0.031 * Math.min(1.3, p.h / 0.28), 0.012, 8, 20);
  lips.scale(1, 0.72, 1);
  lips.rotateY(PI / 2);
  lips.translate(headX - 0.012, midline(p, 0.99) - p.h * 0.04, 0);
  details.push(paint(lips, new T.Color(f.fin).multiplyScalar(0.72)));
  // Barbels: koi have a short pair, catfish four long ones, arowana a chin pair.
  const feelers = p.barbels || 0;
  for (let j = 0; j < feelers; j++) {
    const side = j % 2 ? 1 : -1,
      long = f.shape === 'catfish' && j < 2,
      len = long ? 0.45 : f.shape === 'arowana' ? 0.2 : 0.12,
      x0 = headX - 0.03,
      y0 = midline(p, 0.98) - p.h * (f.shape === 'arowana' ? 0.12 : 0.05),
      forward = f.shape === 'arowana' ? 1 : 0;
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(x0, y0, side * 0.03),
      new T.Vector3(x0 + len * (0.25 + forward * 0.4) - len * 0.2, y0 - len * 0.4, side * (0.06 + len * 0.3)),
      new T.Vector3(x0 + len * forward * 0.6 - len * 0.5, y0 - len * 0.75, side * (0.08 + len * 0.45)),
    ]);
    details.push(paint(new T.TubeGeometry(curve, 14, long ? 0.009 : 0.007, 6, false), f.fin));
  }
  if (['marlin', 'sailfish'].includes(f.id)) {
    const bill = new T.ConeGeometry(0.028, 0.72, 14);
    bill.rotateZ(-Math.PI / 2);
    bill.translate(headX + 0.33, midline(p, 1) + 0.01, 0);
    details.push(paint(bill, f.fin));
  }
  // Eyes, gill covers, lips, barbels and bill never deform, so they share one draw call.
  const detailMat = new T.MeshPhysicalMaterial({vertexColors: true, roughness: 0.18, metalness: 0.28, clearcoat: 0.95, clearcoatRoughness: 0.08});
  applyRayTracedShading(detailMat, 0.1);
  const detailMesh = new T.Mesh(merge(details), detailMat);
  detailMesh.name = 'Fish details';
  g.add(detailMesh);
  g.scale.setScalar(0.59 + (f.size - 1) * 0.16);
  g.userData = {tail, pectorals, fins, body, bodyBase: bodyGeo.attributes.position.array.slice(), profile: p, uid: null, morph: f.morph || null};
  return g;
}
export function animateFish(g, time, speed = 1) {
  const d = g.userData,
    p = d.profile,
    body = d.body.geometry.attributes.position,
    base = d.bodyBase;
  for (let i = 0; i < body.count; i++) {
    const x = base[i * 3],
      u = (x + p.len * 0.48) / p.len,
      rear = Math.pow(1 - u, 2);
    body.setZ(i, base[i * 3 + 2] + Math.sin(time * 1.2 - u * 5) * 0.065 * rear * speed);
  }
  body.needsUpdate = true;
  d.tail.rotation.y = Math.sin(time * 1.2) * 0.19 * speed;
  d.tail.position.z = Math.sin(time * 1.2) * 0.06 * speed;
  for (let f = 0; f < d.fins.length; f++) {
    const {mesh, base} = d.fins[f],
      a = mesh.geometry.attributes.position;
    const weight = d.fins[f].weight;
    for (let i = 0; i < a.count; i++) {
      const x = base[i * 3];
      a.setZ(i, base[i * 3 + 2] + Math.sin(time * 1.15 + x * 4 + f * 0.7) * 0.035 * weight[i]);
    }
    a.needsUpdate = true;
  }
  for (let i = 0; i < d.pectorals.length; i++) d.pectorals[i].rotation.y = (i ? -1 : 1) * (0.25 + Math.sin(time * 0.75 + i * PI) * 0.18);
}
export function disposeFish(g) {
  const geos = new Set(),
    mats = new Set();
  g.traverse(o => {
    if (o.isMesh) {
      geos.add(o.geometry);
      mats.add(o.material);
    }
  });
  for (const geo of geos) geo.dispose();
  for (const material of mats) material.dispose();
}
