import * as T from './assets/three.module.js';
import {fbm, noise3, rand, merge, paint, place, displace, applyRayTracedShading} from './models.js?v=11';
// One continuous landscape per water: shoreline, banks, rolling hills and a ring of distant
// mountains in every direction, so there is no edge to see past, no gap to look under and no
// cut-out scenery. The same height function places trees, rocks, roads and cars, keeps
// distant boats on open water, and tells the water shader where the shallows are.
//
// Regions: 0 Willow Lake, 1 Fernwater Creek, 2 Starlit Cove, 3 Harbor Reach,
// 4 Sunbreak Reef, 5 The Open Blue.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Polynomial smooth minimum: blends two distance fields without a crease.
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const box = (x, z, x0, x1, z0, z1) => {
  const dx = Math.max(x0 - x, 0, x - x1),
    dz = Math.max(z0 - z, 0, z - z1);
  const inside = Math.min(0, Math.max(x0 - x, x - x1, z0 - z, z - z1));
  return Math.hypot(dx, dz) + inside;
};
const ellipse = (x, z, cx, cz, rx, rz) => (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz);
// Ridged fractal: sharp crests and soft valleys, the shape of eroded ranges.
function ridge(x, z, seed) {
  let sum = 0,
    amp = 0.55,
    f = 1;
  for (let o = 0; o < 4; o++, amp *= 0.5, f *= 2.07) {
    const n = 1 - Math.abs(noise3(x * f, 0.5, z * f, seed + o * 13));
    sum += n * n * amp;
  }
  return sum;
}

// A mountain range rather than one cone: several ridged peaks of varying height.
const range = (x, z, seed) => ridge(x * 0.0085, z * 0.0085, seed) * (0.55 + 0.6 * (fbm(x * 0.0035, 7, z * 0.0035, seed + 5, 2) + 0.5));
// Signed distance to open water: negative on water, positive on land.
export function landDistance(region, x, z) {
  if (region < 3) {
    // The lake: the channel the dock sits in, opening into a wide lake under the mountains.
    const channel = box(x, z, -9.66, 11.13, -72, 13.2),
      lake = ellipse(x, z, 0, -116, 82, 64),
      w = smin(channel, lake, 14);
    // A wobble keeps the far shore from reading as a perfect curve.
    // Coves and points along the far shore, so it never reads as a drawn curve.
    return w + (fbm(x * 0.03, 0, z * 0.03, 7, 2) * 9 + fbm(x * 0.09, 2, z * 0.09, 9, 2) * 3) * smooth(25, 60, Math.max(0, -z - 30));
  }
  if (region === 5) return -400;
  let d = ellipse(x, z, -42, -63, 22, 20); // sandy island (Harbor and Reef)
  if (region === 3) {
    // The town coast runs behind the quay and curls round on the right as a headland.
    const coast = box(x, z, -95, 140, -330, -76.5) + fbm(x * 0.05, 1, z * 0.05, 3, 2) * 3 * smooth(16, 40, Math.abs(x + 13.5));
    d = Math.min(d, coast, ellipse(x, z, 44, -86, 24, 18));
    d = Math.min(d, ellipse(x, z, -230, -170, 90, 70), ellipse(x, z, 220, -60, 70, 120));
  } else {
    // Sunbreak Reef: a scatter of low islands far out.
    for (const [cx, cz, rx, rz] of [
      [150, -170, 34, 22],
      [-170, -140, 40, 26],
      [40, -270, 60, 30],
      [-60, -330, 90, 40],
    ])
      d = Math.min(d, ellipse(x, z, cx, cz, rx, rz));
  }
  return -d;
}

const FRESH = [
  {hills: 1, peaks: 1},
  {hills: 1.45, peaks: 0.8},
  {hills: 1.9, peaks: 1.25},
];
export function landHeight(region, x, z) {
  const d = landDistance(region, x, z);
  if (d < 0) return Math.max(-5, -0.25 + d * 0.14);
  if (region < 3) {
    const r = FRESH[region],
      // Bank height near the dock: the right bank stands a little taller, the meadow behind lower.
      bankH = (3.4 + 1.1 * smooth(-6, 6, x)) * (1 - smooth(10, 22, z) * 0.12),
      bank = bankH * (1 - Math.exp(-d / 4.2)),
      ripple = (Math.sin(x * 0.25 + z * 0.18) * 0.22 * bankH + Math.sin(z * 0.47) * 0.2) * smooth(0.5, 5, d),
      // Regions differ only beyond the near banks, so bank-side scenery sits right everywhere.
      hills = smooth(12, 70, d) * (5 + 9 * (fbm(x * 0.018, 3, z * 0.018, 11, 3) + 0.5)) * (1 + (r.hills - 1) * smooth(28, 60, d)),
      peaks = smooth(55, 150, d) * range(x, z, 21) * 105 * (1 + (r.peaks - 1) * smooth(28, 60, d));
    return -0.25 + bank + ripple + hills + peaks;
  }
  // Coasts: a beach or quay step at the waterline, dunes or town flats, then hills and peaks.
  const town = region === 3 && z < -74 && x > -42 && x < 15;
  const beach = (town ? 1.45 : 1.7) * smooth(0, town ? 1.2 : 7, d) + (town ? 0 : fbm(x * 0.08, 2, z * 0.08, 4, 2) * 0.5 * smooth(2, 8, d)),
    hills = smooth(14, 60, d) * (6 + 10 * (fbm(x * 0.02, 5, z * 0.02, 13, 3) + 0.5)),
    peaks = smooth(40, 150, d) * range(x, z, 31) * (region === 3 ? 80 : 40);
  return -0.25 + beach + hills + peaks;
}

// Grid spacing: fine across the play area, stretching to hundreds of units at the horizon.
function axis(n, nearMin, nearMax, farMin, farMax) {
  const out = [],
    nearShare = 0.5,
    inner = Math.round(n * nearShare),
    outerL = Math.round((n - inner) * ((nearMin - farMin) / (nearMin - farMin + farMax - nearMax))),
    outerR = n - inner - outerL;
  for (let i = 0; i < outerL; i++) out.push(farMin + (nearMin - farMin) * (1 - Math.pow(1 - i / outerL, 2.2)));
  for (let i = 0; i <= inner; i++) out.push(nearMin + ((nearMax - nearMin) * i) / inner);
  for (let i = 1; i <= outerR; i++) out.push(nearMax + (farMax - nearMax) * Math.pow(i / outerR, 2.2));
  return out;
}

const C = hex => new T.Color(hex);
const PALETTES = {
  fresh: {mud: C('#6c6650'), grass: C('#557a4e'), meadow: C('#6d8a57'), dry: C('#8f9161'), forest: C('#264534'), rock: C('#6f746c'), snow: C('#e4e9e6')},
  creek: {mud: C('#5f604c'), grass: C('#4a7049'), meadow: C('#5c7d51'), dry: C('#7d8459'), forest: C('#1f3f30'), rock: C('#66706a'), snow: C('#dfe6e3')},
  cove: {mud: C('#4f5349'), grass: C('#3c5c46'), meadow: C('#48644c'), dry: C('#5f6a50'), forest: C('#16332c'), rock: C('#4d5652'), snow: C('#cfd8da')},
  coast: {mud: C('#d2c093'), grass: C('#7b8a58'), meadow: C('#8f965c'), dry: C('#a8a26c'), forest: C('#46653f'), rock: C('#8a8578'), snow: C('#eceae2')},
};
// Where stands of trees grow: the same field paints the hills dark and places 3D trees.
const forestAt = (x, z) => smooth(-0.05, 0.22, fbm(x * 0.035, 4, z * 0.035, 19, 3));
function buildGeometry(region, cols) {
  const xs = axis(cols, -70, 70, -560, 560),
    zs = axis(cols, -95, 60, -620, 420),
    nx = xs.length,
    nz = zs.length,
    pos = new Float32Array(nx * nz * 3),
    col = new Float32Array(nx * nz * 3),
    index = [],
    pal = region < 3 ? PALETTES[['fresh', 'creek', 'cove'][region]] : PALETTES.coast,
    c = new T.Color(),
    h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i,
        x = xs[i],
        z = zs[j];
      h[k] = landHeight(region, x, z);
      pos.set([x, h[k], z], k * 3);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i,
        x = xs[i],
        z = zs[j],
        y = h[k],
        // Slope from neighbours: steep ground shows rock.
        dx = (h[j * nx + Math.min(nx - 1, i + 1)] - h[j * nx + Math.max(0, i - 1)]) / Math.max(0.01, xs[Math.min(nx - 1, i + 1)] - xs[Math.max(0, i - 1)]),
        dz = (h[Math.min(nz - 1, j + 1) * nx + i] - h[Math.max(0, j - 1) * nx + i]) / Math.max(0.01, zs[Math.min(nz - 1, j + 1)] - zs[Math.max(0, j - 1)]),
        slope = Math.hypot(dx, dz),
        n = fbm(x * 0.09, 9, z * 0.09, 17, 2),
        macro = fbm(x * 0.012, 6, z * 0.012, 23, 2);
      // Meadow and lush grass in broad patches, drier where the macro noise is high.
      c.copy(pal.meadow).lerp(pal.grass, smooth(-0.3, 0.3, n)).lerp(pal.dry, smooth(0.05, 0.35, macro) * 0.6);
      // Forest cover on the hills, broken up so it reads as stands of trees.
      c.lerp(pal.forest, smooth(2, 9, y) * forestAt(x, z) * (1 - smooth(55, 75, y)));
      c.lerp(pal.rock, Math.max(smooth(0.65, 1.3, slope), smooth(45, 70, y)) * (0.8 + 0.2 * n));
      c.lerp(pal.snow, smooth(region === 4 ? 999 : 78, 98, y + n * 8));
      // Wet mud or sand at the waterline.
      c.lerp(pal.mud, 1 - smooth(0.05, region >= 3 ? 1.1 : 0.55, y));
      // Fine brightness jitter so large slopes are never one flat colour.
      const jitter = 0.93 + 0.14 * (noise3(x * 0.6, 1, z * 0.6, 29) * 0.5 + 0.5);
      col.set([c.r * jitter, c.g * jitter, c.b * jitter], k * 3);
    }
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i,
        b = a + 1,
        d = a + nx,
        e = d + 1;
      // Skip quads entirely under the sea floor fog; keeps triangle counts down.
      if (h[a] < -4.9 && h[b] < -4.9 && h[d] < -4.9 && h[e] < -4.9) continue;
      index.push(a, d, b, b, d, e);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Height of land near the water, baked for the water shader's shallows and shore foam.
const SHORE = {x0: -130, x1: 130, z0: -180, z1: 50, size: 192};
function bakeShore(region, tex) {
  const {x0, x1, z0, z1, size} = SHORE,
    data = tex.image.data;
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const x = x0 + ((i + 0.5) / size) * (x1 - x0),
        z = z0 + ((j + 0.5) / size) * (z1 - z0),
        y = landHeight(region, x, z);
      data[j * size + i] = Math.round(Math.min(1, Math.max(0, (y + 4) / 8)) * 255);
    }
  tex.needsUpdate = true;
}

// Distant hill trees: multi-tier pines and clustered broadleaf crowns.
function hillTreeGeometries() {
  const pine = merge([
    paint(place(new T.CylinderGeometry(0.12, 0.22, 1.7, 6), [0, 0.85, 0]), '#4a3a2c'),
    paint(place(new T.ConeGeometry(1.55, 2.5, 9), [0, 2.3, 0]), '#264736'),
    paint(place(new T.ConeGeometry(1.22, 2.3, 9), [0, 3.6, 0]), '#2b4d3a'),
    paint(place(new T.ConeGeometry(0.85, 2.0, 9), [0, 4.7, 0]), '#335d45'),
  ]);
  const leaf = merge([
    paint(place(new T.CylinderGeometry(0.14, 0.25, 2.1, 6), [0, 1.05, 0]), '#4d3d2d'),
    paint(place(displace(new T.IcosahedronGeometry(1.65, 2), 0.3, 1.2, 3, 2), [0, 3.15, 0], [0, 0, 0], [1.05, 0.88, 1.05]), '#385e3e'),
    paint(place(displace(new T.IcosahedronGeometry(1.15, 1), 0.22, 1.4, 7, 2), [0.45, 3.85, 0.2], [0, 1.1, 0], [1, 0.85, 1]), '#466f4a'),
  ]);
  return [pine, leaf];
}
const TREE_MAX = 4200;
function placeTrees(region, count) {
  const r = rand(region * 7919 + 17),
    out = [[], []];
  if (region === 5) return out;
  for (let k = 0; k < count * 16 && out[0].length + out[1].length < count; k++) {
    // Denser sampling near the play area, thinning toward the horizon.
    const a = r() * Math.PI * 2,
      rad = 20 + Math.pow(r(), 1.6) * 330,
      x = Math.sin(a) * rad,
      z = -40 + Math.cos(a) * rad,
      d = landDistance(region, x, z);
    // The tree line starts at a ragged distance from the water, never a hard edge.
    if (d < (region < 3 ? 17 : 9) + fbm(x * 0.05, 8, z * 0.05, 31, 2) * 18 + r() * 6 || d > 190) continue;
    const y = landHeight(region, x, z);
    if (y > 52 || y < 0.6 || r() > forestAt(x, z) * 1.25) continue;
    const slope = Math.abs(landHeight(region, x + 2, z) - landHeight(region, x - 2, z)) + Math.abs(landHeight(region, x, z + 2) - landHeight(region, x, z - 2));
    if (slope > 3.2) continue;
    const kind = region === 2 || y > 20 || (region < 3 && r() < 0.45) ? 0 : 1;
    out[kind].push([x, y - 0.35, z, 1.6 + r() * 1.5, r() * Math.PI * 2, 0.82 + r() * 0.3]);
  }
  return out;
}

export function createLand(parent, initialRegion = 0, detail = 'medium') {
  const material = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.94, metalness: 0});
  // Distant land never fogs out completely: silhouettes stay, tinted toward the horizon
  // (aerial perspective), which is what sells the distance.
  const applyAerialFog = mat => {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
          float fogFactor = (1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth)) * 0.86;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif`,
      );
    };
  };
  applyRayTracedShading(material, 0.08);
  applyAerialFog(material);
  const mesh = new T.Mesh(new T.BufferGeometry(), material);
  const treeMaterial = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.88});
  applyRayTracedShading(treeMaterial, 0.28);
  applyAerialFog(treeMaterial);
  const trees = hillTreeGeometries().map(g => {
    const m = new T.InstancedMesh(g, treeMaterial, TREE_MAX);
    m.name = 'Hill trees';
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = false;
    parent.add(m);
    return m;
  });
  const treeCache = new Map(),
    obj = new T.Object3D(),
    tint = new T.Color();
  const treesFor = q =>
    ({
      'ultra-low': 350,
      low: 750,
      medium: 1600,
      high: 2400,
      'very-high': 3200,
      ultra: TREE_MAX,
      battery: 700,
      balanced: 1600,
      crisp: 2400,
    })[q] || 1600;
  let treeQuality = detail;
  function plantTrees(r) {
    const key = r + ':' + treeQuality;
    if (!treeCache.has(key)) treeCache.set(key, placeTrees(r, treesFor(treeQuality)));
    treeCache.get(key).forEach((list, kind) => {
      list.forEach(([x, y, z, sc, rot, shade], i) => {
        obj.position.set(x, y, z);
        obj.rotation.set(0, rot, 0);
        obj.scale.set(sc, sc * (0.9 + (shade - 0.82) * 0.6), sc);
        obj.updateMatrix();
        trees[kind].setMatrixAt(i, obj.matrix);
        trees[kind].setColorAt(i, tint.setScalar(shade));
      });
      trees[kind].count = list.length;
      trees[kind].instanceMatrix.needsUpdate = true;
      if (trees[kind].instanceColor) trees[kind].instanceColor.needsUpdate = true;
    });
  }
  mesh.name = 'Land';
  mesh.receiveShadow = true;
  parent.add(mesh);
  const shoreTexture = new T.DataTexture(new Uint8Array(SHORE.size * SHORE.size), SHORE.size, SHORE.size, T.RedFormat);
  shoreTexture.magFilter = shoreTexture.minFilter = T.LinearFilter;
  const cache = new Map();
  let region = -1,
    cols = 0;
  const colsFor = q =>
    ({
      'ultra-low': 115,
      low: 150,
      medium: 210,
      high: 250,
      'very-high': 290,
      ultra: 340,
      battery: 150,
      balanced: 210,
      crisp: 250,
    })[q] || 210;
  function setRegion(r, quality = treeQuality) {
    const want = colsFor(quality);
    if (r === region && want === cols && quality === treeQuality) return;
    treeQuality = quality;
    if (want !== cols) {
      for (const g of cache.values()) g.dispose();
      cache.clear();
      cols = want;
    }
    region = r;
    const key = r;
    if (!cache.has(key)) cache.set(key, buildGeometry(r, cols));
    mesh.geometry = cache.get(key);
    mesh.visible = r !== 5;
    bakeShore(r, shoreTexture);
    plantTrees(r);
  }
  setRegion(initialRegion);
  return {
    mesh,
    shoreTexture,
    shoreBounds: SHORE,
    setRegion,
    setDetail: q => setRegion(region, q),
    height: (x, z) => landHeight(region, x, z),
    distance: (x, z) => landDistance(region, x, z),
    get region() {
      return region;
    },
  };
}
