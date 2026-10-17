import * as T from './assets/three.module.js';
// Small procedural modelling toolkit shared by every model in the game. Everything is
// generated at load time from code: no downloaded meshes or textures.

// Deterministic smooth 3D value noise in roughly [-1, 1].
function hash3(x, y, z, seed) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return v - Math.floor(v);
}
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z),
    s = t => t * t * (3 - 2 * t),
    u = s(x - xi),
    v = s(y - yi),
    w = s(z - zi);
  let out = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++)
        out +=
          hash3(xi + dx, yi + dy, zi + dz, seed) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  return out * 2 - 1;
}
export function fbm(x, y, z, seed = 0, octaves = 3) {
  let sum = 0,
    amp = 0.5,
    f = 1;
  for (let o = 0; o < octaves; o++, amp *= 0.5, f *= 2.03) sum += noise3(x * f, y * f, z * f, seed + o * 7) * amp;
  return sum;
}
export function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Lathe from [radius, height] pairs, optionally squashed into an ellipse (sx, sz).
export function lathe(profile, segments = 16, sx = 1, sz = 1) {
  const g = new T.LatheGeometry(
    profile.map(([r, y]) => new T.Vector2(Math.max(0.0001, r), y)),
    segments,
  );
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

// Push vertices along their normals with fractal noise: rocks, canopies, hair.
export function displace(geo, amount, frequency = 1, seed = 0, octaves = 3) {
  const p = geo.attributes.position;
  // Weld by position so seams stay closed.
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let d = cache.get(key);
    if (d === undefined) {
      d = fbm(x * frequency, y * frequency, z * frequency, seed, octaves) * amount;
      cache.set(key, d);
    }
    const len = Math.hypot(x, y, z) || 1;
    // Radial push keeps welded seams together (normals differ across a seam).
    p.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

// Per-vertex colour from a constant or a function of (x, y, z, out).
export function paint(geo, color) {
  const p = geo.attributes.position,
    c = new Float32Array(p.count * 3),
    tmp = new T.Color();
  for (let i = 0; i < p.count; i++) {
    if (typeof color === 'function') color(p.getX(i), p.getY(i), p.getZ(i), tmp);
    else tmp.set(color);
    c[i * 3] = tmp.r;
    c[i * 3 + 1] = tmp.g;
    c[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new T.BufferAttribute(c, 3));
  return geo;
}

const _m = new T.Matrix4(),
  _q = new T.Quaternion(),
  _e = new T.Euler(),
  _v = new T.Vector3(),
  _s = new T.Vector3();
// Place a geometry: position, rotation (Euler xyz) and scale, applied in place.
export function place(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...(Array.isArray(s) ? s : [s, s, s])));
  geo.applyMatrix4(_m);
  return geo;
}

// Merge geometries into one indexed geometry with vertex colours (and uvs when present),
// so a whole house or tree is a single draw call.
export function merge(parts) {
  let vertices = 0,
    indices = 0;
  const list = parts.filter(Boolean).map(part => {
    let geo = part.geo ?? part;
    if (part.color !== undefined && !geo.attributes.color) paint(geo, part.color);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    vertices += geo.attributes.position.count;
    indices += geo.index ? geo.index.count : geo.attributes.position.count;
    return geo;
  });
  const pos = new Float32Array(vertices * 3),
    nor = new Float32Array(vertices * 3),
    col = new Float32Array(vertices * 3).fill(1),
    uv = new Float32Array(vertices * 2),
    index = new (vertices > 65535 ? Uint32Array : Uint16Array)(indices);
  let vo = 0,
    io = 0;
  for (const geo of list) {
    const a = geo.attributes,
      count = a.position.count;
    pos.set(toArray(a.position, 3), vo * 3);
    nor.set(toArray(a.normal, 3), vo * 3);
    if (a.color) col.set(toArray(a.color, 3), vo * 3);
    if (a.uv) uv.set(toArray(a.uv, 2), vo * 2);
    if (geo.index) for (let i = 0; i < geo.index.count; i++) index[io++] = geo.index.getX(i) + vo;
    else for (let i = 0; i < count; i++) index[io++] = i + vo;
    vo += count;
    geo.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('color', new T.BufferAttribute(col, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  out.setIndex(new T.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
function toArray(attr, size) {
  if (!attr.isInterleavedBufferAttribute && attr.array.length === attr.count * size) return attr.array;
  const out = new Float32Array(attr.count * size);
  for (let i = 0; i < attr.count; i++)
    for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(i, k);
  return out;
}

// A tube along points with a per-point radius function, capped at both ends.
export function tube(points, radius, radial = 8, closed = true) {
  const curve = new T.CatmullRomCurve3(points.map(p => (p.isVector3 ? p : new T.Vector3(...p))));
  const seg = Math.max(4, points.length * 3),
    g = new T.TubeGeometry(curve, seg, 1, radial, false),
    p = g.attributes.position;
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg),
      r = typeof radius === 'function' ? radius(i / seg) : radius;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      _v.set(p.getX(k), p.getY(k), p.getZ(k)).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, _v.x, _v.y, _v.z);
    }
  }
  g.computeVertexNormals();
  if (!closed) return g;
  const caps = [0, 1].map(end => {
    const c = curve.getPointAt(end),
      r = typeof radius === 'function' ? radius(end) : radius,
      cap = new T.SphereGeometry(Math.max(r, 0.0001), radial, 4);
    cap.translate(c.x, c.y, c.z);
    return cap;
  });
  return merge([g, ...caps]);
}

// Material that reads vertex colours; shared across models with the same look.
const materials = new Map();
export function vcMaterial(key = 'matte', extra = {}) {
  if (!materials.has(key))
    materials.set(key, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.82, ...extra}));
  return materials.get(key);
}

// Collapse static meshes that share a parent and material into one mesh each. Meshes (or
// ancestors) flagged userData.dynamic are left alone so they can still be posed per frame.
export function consolidate(root) {
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.children.length || o.userData.dynamic || !o.parent) return;
    for (let p = o.parent; p && p !== root.parent; p = p.parent) if (p.userData.dynamic) return;
    const key = o.parent.uuid + ':' + o.material.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let removed = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const parent = list[0].parent,
      material = list[0].material;
    const parts = list.map(m => {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      return g;
    });
    for (const m of list) parent.remove(m);
    const merged = new T.Mesh(merge(parts), material);
    merged.name = list.find(m => m.name)?.name || '';
    merged.castShadow = list.some(m => m.castShadow);
    merged.receiveShadow = list.some(m => m.receiveShadow);
    parent.add(merged);
    removed += list.length - 1;
  }
  return removed;
}
