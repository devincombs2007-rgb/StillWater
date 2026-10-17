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
