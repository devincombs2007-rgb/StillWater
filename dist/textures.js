import * as T from './assets/three.module.js';
const cache = new Map();

function heightSample(kind, u, v) {
  const x = u * 512,
    y = v * 512,
    noise = (((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1) + 1) % 1;
  if (kind === 'wood') {
    const grain = Math.sin(u * 54 + Math.sin(v * 14) * 0.62) * 0.5 + 0.5,
      fine = Math.sin(u * 180 + v * 12) * 0.25,
      plank = Math.pow(Math.abs(Math.sin(u * Math.PI * 4)), 0.18);
    return (0.74 + 0.14 * grain + 0.04 * fine + noise * 0.05) * (0.88 + 0.12 * plank);
  }
  if (kind === 'cloth') {
    const warp = Math.sin(u * Math.PI * 128),
      weft = Math.sin(v * Math.PI * 128);
    return 0.84 + 0.08 * warp * weft + 0.03 * Math.sin((u + v) * 40) + noise * 0.04;
  }
  if (kind === 'cork') {
    const cell = (((Math.sin(Math.floor(x * 0.35) * 91.7 + Math.floor(y * 0.35) * 211.3) * 43758.5453) % 1) + 1) % 1;
    return 0.75 + noise * 0.16 - (cell > 0.88 ? 0.18 : 0) + (cell < 0.15 ? 0.06 : 0);
  }
  if (kind === 'scales') {
    const row = Math.floor(v * 28),
      su = (u * 18 + (row % 2) * 0.5) % 1,
      sv = (v * 28) % 1,
      dx = su - 0.5,
      dy = sv - 0.35,
      arch = Math.max(0, 1 - Math.hypot(dx * 1.4, dy * 1.6));
    return 0.72 + arch * 0.26;
  }
  if (kind === 'stone') {
    const c1 = Math.sin(u * 19 + Math.cos(v * 17) * 1.4),
      c2 = Math.cos(v * 37 - Math.sin(u * 29) * 1.1);
    return 0.76 + c1 * 0.09 + c2 * 0.06 + noise * 0.09;
  }
  // Brushed anisotropic metal
  return 0.9 + Math.sin(v * 340) * 0.04 + Math.sin(v * 95 + u * 8) * 0.025 + noise * 0.02;
}

// High-resolution 512x512 deterministic PBR surface maps.
export function surfaceTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const n = 512,
    data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const tone = Math.max(0, Math.min(1, heightSample(kind, x / n, y / n)));
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(tone * 255);
      data[i + 3] = 255;
    }
  const t = new T.DataTexture(data, n, n, T.RGBAFormat);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.repeat.set(kind === 'wood' ? 2 : 3, kind === 'wood' ? 4 : 3);
  t.needsUpdate = true;
  cache.set(kind, t);
  return t;
}

// Tangent-space normal map synthesized from finite differences of heightSample(kind).
export function normalTexture(kind, strength = 1.8) {
  const key = 'norm:' + kind;
  if (cache.has(key)) return cache.get(key);
  const n = 256,
    data = new Uint8Array(n * n * 4),
    step = 1 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = x / n,
        v = y / n,
        hL = heightSample(kind, (u - step + 1) % 1, v),
        hR = heightSample(kind, (u + step) % 1, v),
        hD = heightSample(kind, u, (v - step + 1) % 1),
        hU = heightSample(kind, u, (v + step) % 1),
        dx = (hL - hR) * strength,
        dy = (hD - hU) * strength,
        dz = 1 / Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      data[i] = Math.round((dx * dz * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((dy * dz * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((dz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  const t = new T.DataTexture(data, n, n, T.RGBAFormat);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.repeat.set(kind === 'wood' ? 2 : kind === 'scales' ? 4 : 3, kind === 'wood' ? 4 : kind === 'scales' ? 3 : 3);
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

// High-resolution volumetric cumulus alpha built from 5-octave layered value noise.
export function cloudTexture(seed = 1) {
  const key = 'cloud' + seed;
  if (cache.has(key)) return cache.get(key);
  const w = 256,
    h = 128,
    data = new Uint8Array(w * h * 4),
    hash = (x, y) => {
      const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
      return v - Math.floor(v);
    },
    smooth = t => t * t * (3 - 2 * t),
    noise = (x, y) => {
      const xi = Math.floor(x),
        yi = Math.floor(y),
        u = smooth(x - xi),
        v = smooth(y - yi);
      const a = hash(xi, yi),
        b = hash(xi + 1, yi),
        c = hash(xi, yi + 1),
        d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / w,
        v = y / h;
      let n = 0,
        amp = 0.52,
        f = 3;
      for (let o = 0; o < 5; o++, amp *= 0.5, f *= 2) n += noise(u * f * 2, v * f) * amp;
      const dx = (u - 0.5) * 2,
        dy = (v - 0.45) * 2.2,
        shape = Math.max(0, 1 - Math.sqrt(dx * dx + Math.max(dy, -0.25 + dy * 0.2) ** 2)),
        alpha = Math.max(0, Math.min(1, (n * 1.32 + shape * 1.22 - 1) * 3.7)) * Math.min(1, shape * 3),
        // Ray-marched self-shadowing gradient from sunlit crown to shaded base
        shade = 0.74 + 0.26 * Math.pow(v, 0.85);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(shade * 255);
      const border = Math.min(1, u * 5, (1 - u) * 5, v * 7, (1 - v) * 5);
      data[i + 3] = Math.round(alpha * border * border * 255);
    }
  const t = new T.DataTexture(data, w, h, T.RGBAFormat);
  t.colorSpace = T.SRGBColorSpace;
  t.magFilter = T.LinearFilter;
  t.minFilter = T.LinearFilter;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

// Sharper surface textures at grazing angles on the higher graphics settings.
export function setAnisotropy(n) {
  for (const t of cache.values()) {
    if (t.anisotropy === n) continue;
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}
