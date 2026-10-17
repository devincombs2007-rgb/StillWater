import * as T from './assets/three.module.js';
const PI = Math.PI,
  TAU = PI * 2;
const eyeGeo = new T.SphereGeometry(1, 12, 9);
const white = new T.Color('#f2dfb5'),
  dark = new T.Color('#163b43');
function profile(f) {
  const type = f.shape;
  return {
    h:
      type === 'disc'
        ? 0.67
        : type === 'angel'
          ? 0.58
          : type === 'fancy'
            ? 0.43
            : type === 'round'
              ? 0.42
              : type === 'catfish'
                ? 0.28
                : type === 'eel'
                  ? 0.16
                  : 0.29,
    w: type === 'disc' || type === 'angel' ? 0.19 : type === 'fancy' ? 0.32 : type === 'eel' ? 0.15 : 0.23,
    len: type === 'arowana' ? 2.45 : type === 'dragon' ? 2.7 : type === 'eel' ? 2.45 : 1.84,
    tail: type === 'betta' ? 0.8 : type === 'fancy' ? 0.7 : type === 'guppy' ? 0.55 : type === 'dragon' ? 0.58 : 0.38,
  };
}
function bodyColor(f, u, a) {
  const c = new T.Color(f.color),
    dorsal = Math.sin(a);
  c.multiplyScalar(0.73 + Math.max(0, dorsal) * 0.15);
  if (dorsal < -0.1) c.lerp(white, Math.min(0.65, (-dorsal - 0.1) * 0.7));
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
  // Subtle offset scale rows catch the light without separate meshes.
  const row = Math.floor((a + PI) / 0.24),
    scale = Math.cos(u * 160 + (row % 2) * PI);
  c.multiplyScalar(0.97 + scale * 0.035);
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
  const bodyGeo = gridGeometry(40, 24, (u, v) => {
    const a = v * TAU,
      round = Math.pow(Math.sin(PI * u), 0.69),
      shoulder = 1.04 - 0.13 * u;
    return {
      p: [tailX + u * p.len, Math.sin(a) * p.h * round * shoulder, Math.cos(a) * p.w * round],
      c: bodyColor(f, u, a),
    };
  });
  const skin = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.36,
    metalness: 0.22,
    transparent: f.id === 'glasscat',
    opacity: f.id === 'glasscat' ? 0.64 : 1,
  });
  const body = new T.Mesh(bodyGeo, skin);
  g.add(body);
  const finMaterial = new T.MeshStandardMaterial({
    vertexColors: true,
    side: T.DoubleSide,
    roughness: 0.44,
    metalness: 0.12,
    transparent: true,
    opacity: f.shape === 'betta' ? 0.82 : 0.9,
    depthWrite: false,
  });
  const fins = [];
  function addFin(geometry, parent = g) {
    const m = new T.Mesh(geometry, finMaterial);
    parent.add(m);
    fins.push({mesh: m, base: geometry.attributes.position.array.slice()});
    return m;
  }
  const finC = new T.Color(f.fin),
    edge = new T.Color(f.color).lerp(white, 0.32);
  function finColor(u, v) {
    const c = finC.clone().lerp(edge, u * 0.65);
    if (Math.cos(v * PI * 36) > 0.75) c.multiplyScalar(0.77);
    return c;
  }
  const tail = new T.Group();
  tail.position.x = tailX + 0.06;
  g.add(tail);
  addFin(
    gridGeometry(14, 28, (u, v) => {
      const span = v * 2 - 1,
        big = ['betta', 'fancy', 'guppy'].includes(f.shape),
        length = big ? 0.7 : 0.58;
      const fork = big ? -Math.sqrt(Math.max(0, 1 - span * span)) * 0.2 : Math.abs(span) * 0.19;
      const curl = big ? Math.sin(v * PI * 8) * 0.035 * u : 0;
      return {
        p: [-u * length + fork * u, span * p.tail * u + curl, Math.sin(v * PI * 3) * 0.035 * u],
        c: finColor(u, v),
      };
    }),
    tail,
  );
  const dorsalHigh =
    f.shape === 'angel'
      ? 0.95
      : f.shape === 'sail'
        ? 0.65
        : f.shape === 'betta'
          ? 0.45
          : f.shape === 'dragon'
            ? 0.5
            : f.shape === 'koi'
              ? 0.16
              : 0.2;
  const analHigh = f.shape === 'angel' ? 0.85 : f.shape === 'betta' ? 0.36 : f.shape === 'koi' ? 0.12 : 0.16;
  for (const [sign, height] of [
    [1, dorsalHigh],
    [-1, analHigh],
  ]) {
    addFin(
      gridGeometry(22, 6, (u, v) => {
        const x = tailX + 0.21 + u * p.len * 0.68,
          bodyU = (x - tailX) / p.len;
        const root = Math.pow(Math.sin(PI * bodyU), 0.69) * p.h * 0.91;
        const envelope =
          f.shape === 'angel' ? Math.pow(u < 0.68 ? u / 0.68 : (1 - u) / 0.32, 0.8) : Math.pow(Math.sin(PI * u), 0.65);
        const sail = envelope * height;
        return {p: [x, sign * (root + sail * v), Math.sin(u * PI * 4) * 0.024 * v], c: finColor(v, u)};
      }),
    );
  }
  const pectorals = [];
  for (const side of [-1, 1]) {
    const fin = addFin(
      gridGeometry(9, 10, (u, v) => ({
        p: [0.18 - u * 0.38, -0.06 - u * 0.13 + (v - 0.5) * u * 0.27, side * (p.w * 0.8 + u * 0.27)],
        c: finColor(u, v),
      })),
    );
    pectorals.push(fin);
    const eyeX = headX - p.len * 0.17,
      bodyU = (eyeX - tailX) / p.len,
      wide = p.w * Math.pow(Math.sin(PI * bodyU), 0.69);
    const eye = new T.Mesh(eyeGeo, new T.MeshStandardMaterial({color: '#101c20', roughness: 0.12, metalness: 0.2}));
    eye.position.set(eyeX, p.h * 0.19, side * (wide + 0.007));
    eye.scale.set(0.047, 0.05, 0.024);
    g.add(eye);
    const iris = new T.Mesh(
      new T.TorusGeometry(0.048, 0.009, 5, 18),
      new T.MeshStandardMaterial({
        color: f.rarity > 2 ? '#e9cf8f' : '#c5b783',
        side: T.DoubleSide,
        metalness: 0.45,
        roughness: 0.3,
      }),
    );
    iris.position.copy(eye.position);
    iris.position.z += side * 0.008;
    g.add(iris);
    const glint = new T.Mesh(eyeGeo, new T.MeshBasicMaterial({color: '#f8f6dc'}));
    glint.scale.set(0.012, 0.013, 0.008);
    glint.position.copy(eye.position);
    glint.position.y += 0.018;
    glint.position.x += 0.012;
    glint.position.z += side * 0.02;
    g.add(glint);
    const points = [];
    for (let i = 0; i <= 14; i++) {
      const a = -1.05 + (i / 14) * 2.1;
      points.push(
        new T.Vector3(
          headX - p.len * 0.28 - Math.cos(a) * 0.055,
          Math.sin(a) * p.h * 0.78,
          side * (p.w * 0.89 + Math.cos(a) * 0.012),
        ),
      );
    }
    const gill = new T.Mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 14, 0.006, 4, false),
      new T.MeshStandardMaterial({color: f.fin, roughness: 0.55}),
    );
    g.add(gill);
  }
  if (['catfish', 'round', 'arowana'].includes(f.shape)) {
    const feelers = f.shape === 'catfish' ? 4 : 2;
    for (let j = 0; j < feelers; j++) {
      const side = j % 2 ? 1 : -1,
        x = f.shape === 'round' ? 0.12 : headX - 0.07;
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(x, -p.h * 0.25, side * 0.06),
        new T.Vector3(x + 0.12, -p.h * 0.6, side * 0.17),
        new T.Vector3(x + 0.2, -p.h * (f.shape === 'round' ? 2.5 : 1), side * 0.24),
      ]);
      g.add(
        new T.Mesh(
          new T.TubeGeometry(curve, 14, 0.008, 4, false),
          new T.MeshStandardMaterial({color: f.fin, roughness: 0.5}),
        ),
      );
    }
  }
  if (f.shape === 'sword') {
    addFin(
      gridGeometry(8, 4, (u, v) => ({
        p: [tailX - 0.25 - u * 0.55, -0.12 - u * 0.18 + v * 0.04, 0.01],
        c: finColor(u, v),
      })),
    );
  }
  if (f.shape === 'fancy') {
    const second = addFin(
      gridGeometry(10, 18, (u, v) => ({
        p: [tailX - u * 0.6, (v * 2 - 1) * 0.46 * u, Math.sin(v * PI) * 0.2 * u],
        c: finColor(u, v),
      })),
    );
    second.rotation.y = 0.28;
  }
  if (['marlin', 'sailfish'].includes(f.id)) {
    const bill = new T.Mesh(
      new T.ConeGeometry(0.025, 0.65, 10),
      new T.MeshStandardMaterial({color: f.fin, roughness: 0.4}),
    );
    bill.rotation.z = -Math.PI / 2;
    bill.position.set(headX + 0.24, 0.01, 0);
    g.add(bill);
  }
  g.scale.setScalar(0.59 + (f.size - 1) * 0.16);
  g.userData = {
    tail,
    pectorals,
    fins,
    body,
    bodyBase: bodyGeo.attributes.position.array.slice(),
    profile: p,
    uid: null,
  };
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
    for (let i = 0; i < a.count; i++) {
      const x = base[i * 3],
        y = base[i * 3 + 1];
      const flex = Math.min(1, Math.abs(y) / Math.max(0.3, p.h));
      a.setZ(i, base[i * 3 + 2] + Math.sin(time * 1.15 + x * 4 + f * 0.7) * 0.035 * flex);
    }
    a.needsUpdate = true;
  }
  for (let i = 0; i < d.pectorals.length; i++) d.pectorals[i].rotation.x = Math.sin(time * 0.75 + i * PI) * 0.12;
}
export function disposeFish(g) {
  const geos = new Set(),
    mats = new Set();
  g.traverse(o => {
    if (o.isMesh) {
      if (o.geometry !== eyeGeo) geos.add(o.geometry);
      mats.add(o.material);
    }
  });
  for (const geo of geos) geo.dispose();
  for (const material of mats) material.dispose();
}
