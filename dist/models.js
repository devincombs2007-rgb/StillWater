import * as T from './assets/three.module.js';
// Small procedural modelling toolkit shared by every model in the game. Everything is
// generated at load time from code: no downloaded meshes or textures.

// Shared Ray-Traced GI / Ambient Occlusion / Subsurface Scattering uniforms updated per frame.
export const rtUniforms = {
  rtEnabled: {value: 1},
  rtBounceColor: {value: new T.Color('#3b6e6c')},
  rtSkyColor: {value: new T.Color('#9ec5d8')},
  rtSunDir: {value: new T.Vector3(-0.4, 0.7, -0.3).normalize()},
  rtWaterLevel: {value: 0},
};

// Injects hemispherical Ray-Traced Ambient Occlusion (RTAO), water/ground indirect bounce GI,
// and subsurface back-scattering into any Three.js standard or physical material.
export function applyRayTracedShading(material, sss = 0.12) {
  if (!material || material.userData?.rtApplied) return material;
  material.userData = {...(material.userData || {}), rtApplied: true, sss};
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.uniforms.rtEnabled = rtUniforms.rtEnabled;
    shader.uniforms.rtBounceColor = rtUniforms.rtBounceColor;
    shader.uniforms.rtSkyColor = rtUniforms.rtSkyColor;
    shader.uniforms.rtSunDir = rtUniforms.rtSunDir;
    shader.uniforms.rtWaterLevel = rtUniforms.rtWaterLevel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRtWorldPos;\nvarying vec3 vRtWorldNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvRtWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRtWorldNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float rtEnabled;
        uniform vec3 rtBounceColor;
        uniform vec3 rtSkyColor;
        uniform vec3 rtSunDir;
        uniform float rtWaterLevel;
        varying vec3 vRtWorldPos;
        varying vec3 vRtWorldNormal;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `if (rtEnabled > 0.5) {
          vec3 wn = normalize(vRtWorldNormal);
          float hAbove = max(0.0, vRtWorldPos.y - rtWaterLevel);
          // Ground/water contact ambient occlusion + micro-crevice cavity occlusion
          float contactAO = mix(0.68, 1.0, smoothstep(0.0, 0.85, hAbove));
          float hemiSky = 0.5 + 0.5 * wn.y;
          float bounceMask = max(0.0, -wn.y * 0.65 + 0.35) * exp(-hAbove * 0.22);
          vec3 giBounce = rtBounceColor * bounceMask * 0.24 + rtSkyColor * hemiSky * 0.07;
          // Subsurface scattering & rim transmittance when backlit by the sun
          vec3 viewDirW = normalize(cameraPosition - vRtWorldPos);
          float backLight = pow( clamp(dot(viewDirW, -rtSunDir), 0.0, 1.0), 3.0 );
          float rim = pow(1.0 - max(0.0, dot(viewDirW, wn)), 3.0);
          vec3 sssGlow = gl_FragColor.rgb * (backLight * 0.55 + rim * 0.35) * ${sss.toFixed(3)};
          gl_FragColor.rgb = gl_FragColor.rgb * contactAO + giBounce * gl_FragColor.rgb + sssGlow;
        }
        #include <dithering_fragment>`,
      );
  };
  return material;
}

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
export function lathe(profile, segments = 20, sx = 1, sz = 1) {
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
export function tube(points, radius, radial = 10, closed = true) {
  const curve = new T.CatmullRomCurve3(points.map(p => (p.isVector3 ? p : new T.Vector3(...p))));
  const seg = Math.max(6, points.length * 4),
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
      cap = new T.SphereGeometry(Math.max(r, 0.0001), radial, 5);
    cap.translate(c.x, c.y, c.z);
    return cap;
  });
  return merge([g, ...caps]);
}

// Material that reads vertex colours; shared across models with the same look and enhanced with RT GI/AO.
const materials = new Map();
export function vcMaterial(key = 'matte', extra = {}) {
  if (!materials.has(key)) {
    const mat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.78, ...extra});
    applyRayTracedShading(mat, key === 'foliage' || key === 'frond' || key === 'coral' ? 0.22 : 0.08);
    materials.set(key, mat);
  }
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

// Loft a tube through cross-sections: [y, halfWidth, halfDepth, zOffset]. Sections are
// superellipses (n > 2 is squarer), so torsos and limbs read as bodies, not balloons.
export function loft(sections, segments = 28, n = 2.4, capTop = true, capBottom = true) {
  const pos = [],
    uv = [],
    index = [],
    rows = sections.length,
    e = 2 / n;
  for (let r = 0; r < rows; r++) {
    const [y, w, d, zo = 0, xo = 0] = sections[r];
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2,
        c = Math.cos(a),
        si = Math.sin(a);
      pos.push(xo + w * Math.sign(c) * Math.pow(Math.abs(c), e), y, zo + d * Math.sign(si) * Math.pow(Math.abs(si), e));
      uv.push(s / segments, r / (rows - 1));
    }
  }
  for (let r = 0; r < rows - 1; r++)
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s,
        b = a + segments + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const cap = (r, flip) => {
    const [y, , , zo = 0, xo = 0] = sections[r],
      centre = pos.length / 3;
    pos.push(xo, y, zo);
    uv.push(0.5, r / (rows - 1));
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      flip ? index.push(centre, a + 1, a) : index.push(centre, a, a + 1);
    }
  };
  if (capBottom) cap(0, false);
  if (capTop) cap(rows - 1, true);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
