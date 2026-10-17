import * as T from './assets/three.module.js';
const cache = new Map();
// Small deterministic neutral PBR maps retain the soft palette without remote assets.
export function surfaceTexture(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const n = 256,
    data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = x / n,
        v = y / n,
        noise = (((Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1) + 1) % 1;
      let tone = 0.9;
      if (kind === 'wood')
        tone =
          0.79 + 0.09 * Math.sin(u * 48 + Math.sin(v * 13) * 0.55) + 0.035 * Math.sin(u * 151 + v * 10) + noise * 0.055;
      else if (kind === 'cloth')
        tone = 0.85 + 0.07 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2) + noise * 0.05;
      else if (kind === 'cork') tone = 0.74 + noise * 0.19 - (noise > 0.94 ? 0.15 : 0);
      else tone = 0.9 + Math.sin(y * 1.9) * 0.035 + noise * 0.025;
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

// Soft cumulus alpha built from layered value noise, shaped into a flat-bottomed puff.
export function cloudTexture(seed = 1) {
  const key = 'cloud' + seed;
  if (cache.has(key)) return cache.get(key);
  const w = 128,
    h = 64,
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
        amp = 0.5,
        f = 3;
      for (let o = 0; o < 4; o++, amp *= 0.5, f *= 2) n += noise(u * f * 2, v * f) * amp;
      const dx = (u - 0.5) * 2,
        dy = (v - 0.45) * 2.2,
        shape = Math.max(0, 1 - Math.sqrt(dx * dx + Math.max(dy, -0.25 + dy * 0.2) ** 2)),
        alpha = Math.max(0, Math.min(1, (n * 1.3 + shape * 1.2 - 1) * 3.6)) * Math.min(1, shape * 3),
        shade = 0.8 + 0.2 * v;
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
