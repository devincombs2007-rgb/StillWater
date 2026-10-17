import * as T from './assets/three.module.js';
import {createFish, animateFish, disposeFish} from './fish.js?v=7';
import {makeSwimmer, stepSwimmer} from './swimming.js?v=7';
import {createWater, createEnvironment, addSway} from './environment.js?v=7';
import {createAngler} from './angler.js?v=7';
import {createTackle} from './tackle.js?v=7';
import {surfaceTexture, cloudTexture} from './textures.js?v=7';
import {createTankSurface} from './surface.js?v=7';
import {SPECIES, BAITS, growth, RARITY_COLORS} from './economy.js?v=7';
import {worldConditions} from './fishing.js?v=7';
const TAU = Math.PI * 2;
// Sky keys across the 20-minute world day: [cycle, zenith, horizon, sun colour].
const SKY = [
  [0.0, '#1c2a46', '#b98473', '#ffb078'],
  [0.06, '#3b6585', '#f0b78c', '#ffc890'],
  [0.15, '#4f8fb6', '#cde2df', '#fff1d6'],
  [0.46, '#4b88ad', '#d9e5d6', '#ffe7c4'],
  [0.56, '#3f4f78', '#f09f72', '#ff9f63'],
  [0.63, '#1f2645', '#6d5a77', '#d47a64'],
  [0.7, '#081124', '#1c3045', '#8aa0c8'],
  [0.97, '#081124', '#1d3146', '#8aa0c8'],
  [1.0, '#1c2a46', '#b98473', '#ffb078'],
];
const REGION_TINT = ['#ffffff', '#e9f6e2', '#d9dcff', '#eef8ff', '#fff6ea', '#e6f1ff'];
const skyA = new T.Color(),
  skyB = new T.Color();
function skyAt(cycle, region, out) {
  let k = 0;
  while (k < SKY.length - 2 && SKY[k + 1][0] <= cycle) k++;
  const [c0, ...a] = SKY[k],
    [c1, ...b] = SKY[k + 1],
    u = Math.min(1, Math.max(0, (cycle - c0) / (c1 - c0 || 1)));
  const tint = skyB.set(REGION_TINT[region] || '#ffffff');
  for (let i = 0; i < 3; i++) out[i].set(a[i]).lerp(skyA.set(b[i]), u).multiply(tint);
  // Starlit Cove is a deep, dim forest pool whatever the hour.
  if (region === 2) out[0].multiplyScalar(0.7), out[1].multiplyScalar(0.8);
  return out;
}
export function createWorld(canvas, state, onError) {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: devicePixelRatio < 2,
      powerPreference: 'low-power',
      alpha: false,
    });
  } catch (e) {
    onError(e);
    return null;
  }
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, state.quality === 'battery' ? 1 : state.quality === 'crisp' ? 2 : 1.5),
  );
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new T.Scene();
  scene.background = new T.Color('#18363e');
  scene.fog = new T.FogExp2('#35575b', 0.0065);
  const camera = new T.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 240);
  const lake = new T.Group(),
    tank = new T.Group();
  scene.add(lake, tank);
  tank.visible = false;
  const hemi = new T.HemisphereLight('#c6e2de', '#163b3b', 2);
  scene.add(hemi);
  const sun = new T.DirectionalLight('#ffdfb8', 2.1);
  sun.position.set(-15, 24, 8);
  scene.add(sun);
  const fill = new T.DirectionalLight('#79b9d7', 1);
  fill.position.set(12, 8, -12);
  scene.add(fill);
  const mat = (color, extras = {}) => new T.MeshStandardMaterial({color, roughness: 0.68, ...extras});
  const geoSphere = new T.SphereGeometry(1, 20, 14),
    geoBox = new T.BoxGeometry(1, 1, 1),
    geoCylinder = new T.CylinderGeometry(1, 1, 1, 20);
  function mesh(g, m, parent, p = [0, 0, 0], s = [1, 1, 1]) {
    const o = new T.Mesh(g, m);
    o.position.set(...p);
    o.scale.set(...s);
    parent.add(o);
    return o;
  }
  const gradient = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: {value: new T.Color('#102c3c')},
      bottom: {value: new T.Color('#8caaa0')},
      sunDir: {value: new T.Vector3(0, 0.3, -1).normalize()},
      sunColor: {value: new T.Color('#ffd9a0')},
      glow: {value: 0},
    },
    vertexShader:
      'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    // Zenith-to-horizon gradient with a warm halo around the sun and haze at the horizon.
    fragmentShader:
      'varying vec3 v;uniform vec3 top;uniform vec3 bottom;uniform vec3 sunDir;uniform vec3 sunColor;uniform float glow;void main(){vec3 d=normalize(v);float h=d.y;vec3 c=mix(bottom,top,smoothstep(-.04,.6,h));float s=max(0.,dot(d,sunDir));c+=sunColor*(pow(s,6.)*.35+pow(s,90.)*.8)*glow;c=mix(c,bottom*1.06,(1.-smoothstep(0.,.12,abs(h)))*.35);c*=1.-smoothstep(-.02,-.3,h)*.45;gl_FragColor=vec4(c,1.);}',
  });
  mesh(new T.SphereGeometry(180, 24, 16), gradient, scene);
  const starPos = [];
  for (let i = 0; i < 150; i++) {
    const a = Math.random() * TAU,
      r = 135;
    const y = 25 + Math.random() * 110;
    starPos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  const stars = new T.Points(
    starGeo,
    new T.PointsMaterial({color: '#fff0ce', size: 0.27, transparent: true, opacity: 0.7, sizeAttenuation: true}),
  );
  scene.add(stars);
  // A loose ring of drifting clouds, lit by the same sky palette as everything else.
  const clouds = [],
    cloudGeo = new T.PlaneGeometry(1, 0.5);
  for (let i = 0; i < 11; i++) {
    const m = new T.Mesh(
      cloudGeo,
      new T.MeshBasicMaterial({map: cloudTexture((i % 4) + 1), transparent: true, depthWrite: false, fog: false, opacity: 0.85}),
    );
    const size = 38 + ((i * 37) % 30);
    m.scale.set(size, size, 1);
    m.userData = {angle: -2.6 + i * 0.48 + Math.sin(i * 3.1) * 0.15, height: 34 + ((i * 13) % 22), dist: 150 + ((i * 17) % 18)};
    m.renderOrder = -1;
    lake.add(m);
    clouds.push(m);
  }
  const moon = mesh(geoSphere, new T.MeshBasicMaterial({color: '#fff1ce'}), lake, [-23, 29, -88], [3, 3, 3]);
  const moonHalo = mesh(
    new T.CircleGeometry(5.2, 48),
    new T.MeshBasicMaterial({color: '#efd6ad', transparent: true, opacity: 0.07, depthWrite: false}),
    lake,
    [-23, 29, -87.8],
  );
  function mountain(x, z, w, h, color) {
    const g = new T.BufferGeometry();
    const verts = [];
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const x1 = -w / 2 + (i * w) / steps,
        x2 = x1 + w / steps;
      const a = Math.max(0.03, Math.sin((i / steps) * Math.PI)) * (0.78 + Math.sin(i * 1.8) * 0.15);
      const b = Math.max(0.03, Math.sin(((i + 1) / steps) * Math.PI)) * (0.78 + Math.sin((i + 1) * 1.8) * 0.15);
      verts.push(x1, 0, 0, x2, 0, 0, x1, a * h, 0, x2, 0, 0, x2, b * h, 0, x1, a * h, 0);
    }
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    const m = mesh(g, new T.MeshBasicMaterial({color, side: T.DoubleSide}), lake, [x, -0.2, z]);
    // Distant ranges take their colour from the sky (aerial perspective) instead of glowing at night.
    ranges.push({mesh: m, base: new T.Color(color), haze: Math.min(0.75, Math.max(0.2, (-z - 50) / 120))});
    return m;
  }
  const ranges = [];
  mountain(-70, -135, 140, 50, '#6b8d8c');
  mountain(44, -135, 160, 49, '#6b8d8c');
  mountain(-30, -100, 130, 35, '#4b7375');
  mountain(80, -99, 130, 39, '#4b7375');
  mountain(-95, -65, 140, 35, '#31595d');
  mountain(65, -65, 100, 29, '#345d60');
  const treeMat = mat('#183f40'),
    trunkMat = mat('#3a4c44');
  const cone = new T.ConeGeometry(1, 1, 7);
  function pine(x, z, h, scale = 1) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.visible = false;
    lake.add(g);
    mesh(geoCylinder, trunkMat, g, [0, h * 0.28, 0], [0.11 * scale, h * 0.6, 0.11 * scale]);
    for (let j = 0; j < 3; j++)
      mesh(
        cone,
        treeMat,
        g,
        [0, h * (0.42 + j * 0.2), 0],
        [(1.35 - j * 0.28) * scale, h * 0.63, (1.35 - j * 0.28) * scale],
      );
  }
  for (let i = 0; i < 35; i++) {
    const x = -75 + i * 4.3;
    pine(x, -52 - Math.sin(i) * 4, 5 + Math.sin(i * 2.5) * 2.5, 1.3);
  }
  for (let i = 0; i < 12; i++) {
    pine(-22 - i * 2, -15 - i * 3, 7 + Math.random() * 4, 1.2);
    pine(26 + i * 2, -17 - i * 3, 7 + Math.random() * 5, 1.3);
  }
  // A mossy cascade gives Fernwater its own silhouette and moving current.
  const creek = new T.Group();
  creek.visible = false;
  lake.add(creek);
  for (let i = 0; i < 9; i++) {
    const rock = mesh(
      new T.DodecahedronGeometry(1, 0),
      mat(i % 2 ? '#536f64' : '#6e8170'),
      creek,
      [-9 + (i % 3) * 1.15, Math.floor(i / 3) * 1.05, -21 - Math.floor(i / 3) * 0.9],
      [1.3, 1, 1],
    );
    rock.rotation.y = i;
  }
  const streamUniform = {time: {value: 0}};
  const streamMat = new T.ShaderMaterial({
    uniforms: streamUniform,
    transparent: true,
    side: T.DoubleSide,
    depthWrite: false,
    vertexShader:
      'varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec2 uvv;uniform float time;void main(){float line=pow(.5+.5*sin(uvv.x*48.+sin(uvv.y*14.-time*3.)),5.);float foam=pow(.5+.5*sin(uvv.y*34.+time*5.),10.);gl_FragColor=vec4(.56+line*.2,.77+line*.1,.73+line*.12,.34+line*.35+foam*.18);}',
  });
  const cascade = mesh(new T.PlaneGeometry(2.2, 3.5), streamMat, creek, [-7.9, 1.6, -20.8]);
  cascade.rotation.x = -0.16;
  const cove = new T.Group();
  cove.visible = false;
  lake.add(cove);
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (13 + Math.random() * 9),
      z = -10 - Math.random() * 27;
    const stone = mesh(
      new T.OctahedronGeometry(0.5 + Math.random() * 0.7),
      mat('#758fa0', {emissive: '#6783a7', emissiveIntensity: 0.45, roughness: 0.4}),
      cove,
      [x, 0.4, z],
      [0.7, 1.5, 0.7],
    );
    stone.rotation.z = (Math.random() - 0.5) * 0.4;
  }
  const waterSystem = createWater(lake);
  const surroundings = createEnvironment(lake, state, waterSystem);
  const angler = createAngler(lake, state);
  let soundCallback = () => {};
  const tackle = createTackle(lake, waterSystem.height, (x, z, t, impact, kind = 'land') => {
    const y = waterSystem.height(x, z, t);
    if (kind === 'nibble') {
      waterSystem.impulse(x, z, t, 0.06);
      soundCallback('nibble');
    } else if (kind === 'thrash') {
      waterSystem.impulse(x, z, t, Math.min(0.3, 0.06 + impact * 0.03));
      sprayAt(x, y, z, 10 + Math.round(impact * 2), 0.55 + impact * 0.08);
      soundCallback('thrash');
    } else {
      waterSystem.impulse(x, z, t, Math.min(0.32, 0.08 + impact * 0.025));
      sprayAt(x, y, z, 16, 0.35 + Math.min(1, impact * 0.08));
      soundCallback('bobber');
    }
  });
  const woodA = mat('#6f6954', {map: surfaceTexture('wood')}),
    woodB = mat('#77705a', {map: surfaceTexture('wood')}),
    woodDark = mat('#3c483d');
  const dock = new T.Group();
  lake.add(dock);
  dock.position.set(0, 0, 8);
  for (let i = 0; i < 14; i++) {
    const b = mesh(geoBox, i % 2 ? woodA : woodB, dock, [0, 0.11, i * 0.48 - 1.7], [3.1, 0.19, 0.455]);
    b.rotation.y = Math.sin(i) * 0.004;
    for (const x of [-1.2, 1.2])
      mesh(geoSphere, mat('#3e453c'), dock, [x, 0.212, i * 0.48 - 1.7], [0.022, 0.01, 0.022]);
  }
  for (const x of [-1.4, 1.4])
    for (const z of [-1.5, 4.3]) mesh(geoCylinder, woodDark, dock, [x, -0.18, z], [0.13, 1.2, 0.13]);
  const rod = new T.Group();
  rod.visible = false;
  dock.add(rod);
  rod.position.set(1, 0.5, -1);
  rod.rotation.z = -0.6;
  rod.rotation.x = -0.55;
  mesh(new T.CylinderGeometry(0.022, 0.045, 4.5, 8), mat('#a6a584'), rod, [0, 2.2, 0]);
  mesh(geoCylinder, mat('#6d4d37'), rod, [0, 0.25, 0], [0.065, 0.6, 0.065]);
  mesh(new T.TorusGeometry(0.12, 0.025, 8, 18), mat('#b8b9a3', {metalness: 0.6}), rod, [0.07, 0.6, 0.05]);
  const lamp = new T.Group();
  lamp.position.set(-1, 0.45, 6.6);
  lake.add(lamp);
  mesh(geoCylinder, mat('#394e48'), lamp, [0, 0, 0], [0.22, 0.12, 0.22]);
  mesh(
    geoCylinder,
    mat('#e9c58e', {emissive: '#f3b15d', emissiveIntensity: 1, transparent: true, opacity: 0.65}),
    lamp,
    [0, 0.3, 0],
    [0.16, 0.55, 0.16],
  );
  mesh(new T.ConeGeometry(0.25, 0.18, 8), mat('#48564a'), lamp, [0, 0.63, 0]);
  const warm = new T.PointLight('#ffd69c', 6, 9);
  warm.position.set(-1, 0.9, 6.6);
  lake.add(warm);
  const reedMat = addSway(mat('#6c8d73'), 0.07);
  for (let i = 0; i < 28; i++) {
    const side = i < 14 ? -1 : 1;
    const x = side * (4 + Math.random() * 5),
      z = 4 + Math.random() * 9;
    const h = 0.9 + Math.random() * 1.6;
    const r = mesh(new T.CylinderGeometry(0.018, 0.027, h, 4), reedMat, lake, [x, h * 0.45, z]);
    r.rotation.z = side * 0.15;
    r.userData.freshOnly = true;
    const leaf = mesh(cone, reedMat, lake, [x + side * 0.2, h * 0.55, z], [0.1, h * 0.65, 0.06]);
    leaf.rotation.z = -side * 0.5;
    leaf.userData.freshOnly = true;
  }
  const rippleMeshes = [];
  for (let i = 0; i < 3; i++) {
    const r = mesh(
      new T.RingGeometry(0.96, 1, 70),
      new T.MeshBasicMaterial({
        color: '#d4e5cf',
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
      lake,
      [0, 0.015, -4],
    );
    r.rotation.x = -Math.PI / 2;
    r.visible = false;
    rippleMeshes.push(r);
  }
  // Spray thrown up by a landing float or a thrashing fish.
  const spraySize = 48,
    sprayGeo = new T.BufferGeometry(),
    sprayData = new Float32Array(spraySize * 3).fill(-100),
    sprayVelocity = Array.from({length: spraySize}, () => new T.Vector3()),
    sprayAge = new Float32Array(spraySize).fill(10);
  sprayGeo.setAttribute('position', new T.BufferAttribute(sprayData, 3));
  const spray = new T.Points(
    sprayGeo,
    new T.PointsMaterial({color: '#e3f0e6', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false}),
  );
  spray.frustumCulled = false;
  lake.add(spray);
  let sprayNext = 0;
  // Ambient life: fish rising to the surface and the occasional leap, so the water feels inhabited.
  let riseWait = 2.5,
    jumper = null,
    jumperRegion = -1,
    jump = null;
  function lakeLife(dt) {
    riseWait -= dt;
    const ocean = region >= 3;
    if (riseWait <= 0) {
      riseWait = 3.5 + Math.random() * 7;
      const x = (Math.random() - 0.5) * (ocean ? 30 : 14),
        z = -3 - Math.random() * (ocean ? 40 : 24),
        y = waterSystem.height(x, z, clock);
      if (Math.random() < 0.3 && !jump) {
        if (!jumper || jumperRegion !== region) {
          if (jumper) {
            lake.remove(jumper);
            disposeFish(jumper);
          }
          const pool = SPECIES.filter(f => (ocean ? f.region >= 3 : f.region < 3) && f.rarity < 2);
          jumper = createFish(pool[Math.floor(Math.random() * pool.length)]);
          jumper.scale.multiplyScalar(0.8);
          jumperRegion = region;
          lake.add(jumper);
        }
        const yaw = Math.random() * TAU,
          span = 1.2 + Math.random() * 1.4;
        jump = {t: 0, dur: 0.75 + span * 0.12, x, z, dx: Math.cos(yaw) * span, dz: -Math.sin(yaw) * span, h: 0.5 + span * 0.25, yaw};
        waterSystem.impulse(x, z, clock, 0.12);
        sprayAt(x, y, z, 8, 0.45);
        soundCallback('rise');
      } else {
        waterSystem.impulse(x, z, clock, 0.05 + Math.random() * 0.04);
        sprayAt(x, y, z, 3, 0.2);
      }
    }
    if (jumper) jumper.visible = !!jump;
    if (jump) {
      jump.t += dt;
      const u = jump.t / jump.dur;
      if (u >= 1) {
        const ex = jump.x + jump.dx,
          ez = jump.z + jump.dz;
        waterSystem.impulse(ex, ez, clock, 0.16);
        sprayAt(ex, waterSystem.height(ex, ez, clock), ez, 12, 0.55);
        soundCallback('rise');
        jump = null;
      } else {
        const px = jump.x + jump.dx * u,
          pz = jump.z + jump.dz * u,
          arc = 4 * jump.h * u * (1 - u);
        jumper.position.set(px, waterSystem.height(px, pz, clock) + arc - 0.15, pz);
        jumper.rotation.set(0, jump.yaw, Math.atan2(4 * jump.h * (1 - 2 * u), Math.hypot(jump.dx, jump.dz)) * 0.8, 'YXZ');
        animateFish(jumper, clock * 9, 1.2);
      }
    }
  }
  function sprayAt(x, y, z, count, power) {
    for (let k = 0; k < count; k++) {
      const i = sprayNext++ % spraySize,
        angle = Math.random() * TAU,
        out = (0.4 + Math.random()) * power;
      sprayAge[i] = 0;
      sprayData.set([x, y, z], i * 3);
      sprayVelocity[i].set(Math.cos(angle) * out, (1.2 + Math.random() * 1.6) * power + 0.6, Math.sin(angle) * out);
    }
  }
  // An actual three-dimensional glass aquarium, with mesh fish and orbit controls.
  const tankBase = mat('#193c3e', {metalness: 0.3, roughness: 0.4});
  mesh(geoCylinder, tankBase, tank, [0, -0.52, 0], [7, 0.6, 5.5]);
  mesh(geoCylinder, mat('#45605a', {metalness: 0.6}), tank, [0, -0.18, 0], [6.7, 0.08, 5.2]);
  mesh(geoBox, mat('#394c45'), tank, [0, 0.02, 0], [9.4, 0.3, 5.4]);
  mesh(geoBox, mat('#b9aa84'), tank, [0, 0.22, 0], [8.98, 0.22, 4.98]);
  const glassMat = new T.MeshPhysicalMaterial({
    color: '#a5e3da',
    transparent: true,
    opacity: 0.07,
    roughness: 0.08,
    metalness: 0,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const glass = mesh(new T.BoxGeometry(9.3, 4.9, 5.3), glassMat, tank, [0, 2.57, 0]);
  const edges = new T.LineSegments(
    new T.EdgesGeometry(glass.geometry),
    new T.LineBasicMaterial({color: '#a3cebd', transparent: true, opacity: 0.4}),
  );
  edges.position.copy(glass.position);
  tank.add(edges);
  for (let top of [0.18, 5.03]) {
    for (let z of [-2.67, 2.67])
      mesh(geoBox, mat('#adba9e', {metalness: 0.5, roughness: 0.35}), tank, [0, top, z], [9.5, 0.07, 0.07]);
    for (let x of [-4.71, 4.71])
      mesh(geoBox, mat('#adba9e', {metalness: 0.5, roughness: 0.35}), tank, [x, top, 0], [0.07, 0.07, 5.3]);
  }
  const tankWater = mesh(
    new T.PlaneGeometry(9.15, 5.15, 46, 28),
    new T.MeshPhysicalMaterial({
      clearcoat: 1,
      color: '#63bdb4',
      transparent: true,
      opacity: 0.25,
      roughness: 0.13,
      metalness: 0.18,
      side: T.DoubleSide,
      depthWrite: false,
    }),
    tank,
    [0, 4.78, 0],
  );
  tankWater.name = 'Tank water';
  tankWater.rotation.x = -Math.PI / 2;
  const tankSurface = createTankSurface();
  const tankGlow = new T.PointLight('#a0efdc', 20, 14);
  tankGlow.position.set(0, 5.5, 0);
  tank.add(tankGlow);
  // Soft shafts of light falling through the surface, tinted by the tank mood.
  const shaftUniforms = {time: {value: 0}, tint: {value: new T.Color('#a0efdc')}};
  const shaftMat = new T.ShaderMaterial({
    uniforms: shaftUniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'varying vec2 v;uniform float time;uniform vec3 tint;void main(){float edge=pow(sin(v.x*3.14159),2.);float fall=pow(v.y,1.6);float ripple=.7+.3*sin(v.x*9.+time*.8)*sin(v.y*4.-time*.5);gl_FragColor=vec4(tint,edge*fall*ripple*.07);}',
  });
  const shafts = [];
  for (let i = 0; i < 6; i++) {
    const shaft = mesh(new T.PlaneGeometry(0.9 + (i % 3) * 0.35, 4.4), shaftMat, tank, [-3.2 + i * 1.3, 2.55, -0.6 + (i % 2) * 1.1]);
    shaft.rotation.set(0, 0.5 + i * 0.6, 0.12 - (i % 3) * 0.08);
    shaft.userData.phase = i * 1.7;
    shafts.push(shaft);
  }
  const sandGeo = new T.PlaneGeometry(9, 5, 28, 18);
  const sa = sandGeo.attributes.position;
  for (let i = 0; i < sa.count; i++) sa.setZ(i, Math.sin(sa.getX(i) * 2) * Math.cos(sa.getY(i) * 2) * 0.045);
  sandGeo.computeVertexNormals();
  const sand = mesh(sandGeo, mat('#b7aa81'), tank, [0, 0.35, 0]);
  sand.rotation.x = -Math.PI / 2;
  const causticUniform = {time: {value: 0}};
  const causticMat = new T.ShaderMaterial({
    uniforms: causticUniform,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    vertexShader:
      'varying vec2 p;void main(){p=uv*12.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:
      'uniform float time;varying vec2 p;void main(){float a=sin(p.x+sin(p.y*1.2+time*.3))+sin(p.y+sin(p.x*.8-time*.2));float c=pow(max(0.,1.-abs(a)*1.8),8.);gl_FragColor=vec4(.42,.67,.55,c*.12);}',
  });
  const caustic = mesh(new T.PlaneGeometry(8.9, 4.9), causticMat, tank, [0, 0.42, 0]);
  caustic.rotation.x = -Math.PI / 2;
  const rocks = [];
  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 8.4,
      z = (Math.random() - 0.5) * 4.3;
    const r = mesh(
      new T.DodecahedronGeometry(0.15 + Math.random() * 0.3, 0),
      mat(['#7f9483', '#8d9684', '#6b8276'][i % 3]),
      tank,
      [x, 0.45, z],
      [1.4, 0.7, 1],
    );
    r.rotation.set(Math.random() * 2, Math.random() * 3, Math.random());
    rocks.push(r);
  }
  const plants = new T.Group(),
    arch = new T.Group(),
    lanterns = new T.Group();
  tank.add(plants, arch, lanterns);
  const leaves = [];
  function plant(x, z, h, parent) {
    for (let j = 0; j < 5; j++) {
      const curve = new T.CatmullRomCurve3([
        new T.Vector3(x, 0.4, z),
        new T.Vector3(x + (j - 2) * 0.16, h * 0.5, z + 0.1),
        new T.Vector3(x + (j - 2) * 0.24, h, z),
      ]);
      const l = mesh(new T.TubeGeometry(curve, 10, 0.045, 4, false), mat(j % 2 ? '#508f75' : '#397a64'), parent);
      leaves.push(l);
    }
  }
  const broadLeaves = new T.Group();
  tank.add(broadLeaves);
  for (let i = 0; i < 12; i++) {
    const x = i < 6 ? -3.8 : 3.6,
      z = -1.4 + (i % 3) * 0.5,
      h = 0.7 + (i % 4) * 0.28;
    const shape = new T.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(-0.24, h * 0.45, -0.22, h * 0.85, 0.02, h);
    shape.bezierCurveTo(0.27, h * 0.8, 0.22, h * 0.32, 0, 0);
    const leaf = mesh(
      new T.ShapeGeometry(shape, 14),
      mat(i % 2 ? '#418c6e' : '#6eaa7a', {side: T.DoubleSide}),
      broadLeaves,
      [x, 0.39, z],
    );
    leaf.rotation.y = i * 0.93;
    leaf.rotation.z = ((i % 3) - 1) * 0.3;
  }
  plant(-3.5, -1.6, 1.8, tank);
  plant(3.5, -1.5, 1.4, tank);
  plant(-3.6, 1.4, 0.9, tank);
  for (let i = 0; i < 7; i++) plant(-3 + i, 1.8, 1.3 + Math.sin(i) * 0.4, plants);
  const arc = mesh(new T.TorusGeometry(1.12, 0.25, 9, 30, Math.PI), mat('#91a095'), arch, [1.2, 0.55, -0.8]);
  mesh(new T.DodecahedronGeometry(0.35), mat('#91a095'), arch, [0.1, 0.47, -0.8]);
  mesh(new T.DodecahedronGeometry(0.35), mat('#91a095'), arch, [2.3, 0.47, -0.8]);
  for (let i = 0; i < 3; i++) {
    const x = -2 + i * 2;
    mesh(
      geoCylinder,
      mat('#ccb48b', {emissive: '#eab979', emissiveIntensity: 0.8}),
      lanterns,
      [x, 0.65, 0.5],
      [0.12, 0.4, 0.12],
    );
    mesh(geoCylinder, mat('#3d5e50'), lanterns, [x, 0.88, 0.5], [0.17, 0.06, 0.17]);
  }
  const bubblesGeo = new T.BufferGeometry();
  const bubbleCoords = [];
  for (let i = 0; i < 45; i++)
    bubbleCoords.push((Math.random() - 0.5) * 8, Math.random() * 4.4 + 0.4, (Math.random() - 0.5) * 4);
  bubblesGeo.setAttribute('position', new T.Float32BufferAttribute(bubbleCoords, 3));
  const bubbles = new T.Points(
    bubblesGeo,
    new T.PointsMaterial({color: '#c6eade', size: 0.035, transparent: true, opacity: 0.55}),
  );
  tank.add(bubbles);
  const firePos = [];
  for (let i = 0; i < 50; i++)
    firePos.push((Math.random() - 0.5) * 40, Math.random() * 7 + 0.5, (Math.random() - 0.5) * 30);
  const fireGeo = new T.BufferGeometry();
  fireGeo.setAttribute('position', new T.Float32BufferAttribute(firePos, 3));
  const fireflies = new T.Points(
    fireGeo,
    new T.PointsMaterial({color: '#f6dca4', size: 0.045, transparent: true, opacity: 0.6}),
  );
  lake.add(fireflies);
  const fishGroup = new T.Group();
  tank.add(fishGroup);
  let chargePose = 0,
    titleMode = false,
    lastDrip = 0;
  let swimmers = [],
    view = 'lake',
    theta = 0.56,
    phi = 1.22,
    radius = 15.5,
    targetRadius = 15.5,
    drag = null,
    pointers = new Map(),
    pinchDist = 0,
    clock = 0,
    castState = 'idle',
    castStart = -10,
    previous = 0,
    lastRender = 0,
    region = state.region || 0,
    feedStart = -20,
    feedUntil = -20,
    feedBlend = 0,
    selectedUID = null,
    pickCallback = () => {},
    tapStart = null,
    hasOrbited = false,
    immersive = false,
    lookY = 2.5,
    lakeTheta = 0.4,
    lakePhi = 1.2,
    lakeRadius = 7.2,
    lookAhead = 5,
    lineLost = false,
    catchTwist = 0,
    heldFish = null,
    fightTension = 0,
    pullFlash = 0,
    conditions = worldConditions(Date.now(), region),
    arrival = null,
    splashAt = -20,
    splashOrigin = {x: 0, z: 0},
    splashCallback = () => {};
  const cameraLook = new T.Vector3(0, 1.7, 6.8);
  camera.position.set(5, 4, 17);

  const rarityHalo = mesh(
    new T.PlaneGeometry(2.5, 2.5),
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {tint: {value: new T.Color('#f1ca82')}},
      vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 v;uniform vec3 tint;void main(){float r=length(v-.5);float a=smoothstep(.1,.29,r)*(1.-smoothstep(.29,.5,r))*.24;gl_FragColor=vec4(tint,a);}',
    }),
    lake,
  );
  rarityHalo.name = 'Catch rarity halo';
  rarityHalo.visible = false;
  const dripGeo = new T.BufferGeometry(),
    dripPosition = new Float32Array(18 * 3),
    dripAge = Array(18).fill(10),
    dripVelocity = Array.from({length: 18}, () => new T.Vector3());
  dripGeo.setAttribute('position', new T.Float32BufferAttribute(dripPosition, 3));
  const drips = new T.Points(
    dripGeo,
    new T.PointsMaterial({color: '#d5e7dd', transparent: true, opacity: 0.7, size: 0.028}),
  );
  lake.add(drips);
  let dripSpawn = 0,
    dripIndex = 0;
  const skyColors = [new T.Color(), new T.Color(), new T.Color()],
    lightDir = new T.Vector3(0, 1, 0);
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  const feedTarget = new T.Vector3(0, 3.7, 0);
  const pelletGeo = new T.BufferGeometry();
  const pelletCoords = [];
  const pelletOffsets = [];
  for (let i = 0; i < 24; i++) {
    const x = (Math.random() - 0.5) * 1.8,
      z = (Math.random() - 0.5) * 1.5;
    pelletOffsets.push([x, z, Math.random()]);
    pelletCoords.push(x, 4.7, z);
  }
  pelletGeo.setAttribute('position', new T.Float32BufferAttribute(pelletCoords, 3));
  const pellets = new T.Points(
    pelletGeo,
    new T.PointsMaterial({color: '#e7c384', size: 0.065, transparent: true, opacity: 0.85}),
  );
  tank.add(pellets);
  pellets.visible = false;
  const selectedRing = mesh(
    new T.TorusGeometry(0.68, 0.018, 5, 40),
    new T.MeshBasicMaterial({color: '#f4d09b', transparent: true, opacity: 0.75, depthWrite: false}),
    tank,
  );
  selectedRing.rotation.x = Math.PI / 2;
  selectedRing.visible = false;
  function refreshFish(species) {
    const keep = new Set(state.fish.map(f => f.uid));
    for (const s of swimmers)
      if (!keep.has(s.uid)) {
        fishGroup.remove(s.mesh);
        disposeFish(s.mesh);
      }
    const existing = new Map(swimmers.filter(s => keep.has(s.uid)).map(s => [s.uid, s]));
    swimmers = state.fish.map((resident, i) => {
      if (existing.has(resident.uid) && existing.get(resident.uid).species === resident.id)
        return existing.get(resident.uid);
      if (existing.has(resident.uid)) {
        const old = existing.get(resident.uid);
        fishGroup.remove(old.mesh);
        disposeFish(old.mesh);
      }
      const f = species.find(x => x.id === resident.id);
      const model = createFish(f);
      fishGroup.add(model);
      model.userData.uid = resident.uid;
      const motion = makeSwimmer(i, state.fish.length);
      model.position.set(motion.p.x, motion.p.y, motion.p.z);
      return {
        uid: resident.uid,
        species: resident.id,
        mesh: model,
        baseScale: model.scale.x,
        motion,
        bottom: ['catfish', 'eel'].includes(f.shape),
      };
    });
    plants.visible = state.decor.includes('plants');
    arch.visible = state.decor.includes('arch');
    lanterns.visible = state.decor.includes('lanterns');
  }
  function applyPalette() {
    const palettes = [
      {top: '#102c3c', bottom: '#8caaa0', fog: '#35575b', tree: '#183f40', water: '#235e63', light: '#ffdfb8'},
      {top: '#163a3b', bottom: '#9db7a0', fog: '#577b6a', tree: '#244e3c', water: '#285f58', light: '#dbebc8'},
      {top: '#101a36', bottom: '#4d6681', fog: '#2b425c', tree: '#203149', water: '#25495f', light: '#c8cdff'},
    ];
    if (view === 'lake') {
      const p = palettes[Math.min(2, region)];
      treeMat.color.set(p.tree);
      creek.visible = region === 1;
      cove.visible = region === 2;
    } else {
      const m = [
        {top: '#101f31', bottom: '#38555f', glow: '#a0dfed', light: '#c8def5'},
        {top: '#242b30', bottom: '#6a6857', glow: '#e7ce95', light: '#ffe2b0'},
        {top: '#112c2d', bottom: '#3f7165', glow: '#a2e6c4', light: '#c9ecd7'},
      ][state.mood || 0];
      gradient.uniforms.top.value.set(m.top);
      gradient.uniforms.bottom.value.set(m.bottom);
      scene.fog.color.set(m.top);
      tankGlow.color.set(m.glow);
      shaftUniforms.tint.value.set(m.glow);
      sun.color.set(m.light);
      stars.material.opacity = 0.65;
    }
  }
  function setView(v) {
    view = v;
    lake.visible = v === 'lake';
    tank.visible = v === 'tank';
    scene.fog.density = v === 'lake' ? 0.0065 : 0.012;
    pointers.clear();
    tapStart = null;
    drag = null;
    pinchDist = 0;
    if (v === 'tank' && !hasOrbited) {
      radius = targetRadius = innerWidth < 700 ? Math.max(20, 14.3 / camera.aspect) : 15.5;
      hasOrbited = true;
    }
    applyPalette();
  }
  function orbitMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pointers.size === 2) {
      const p = [...pointers.values()],
        dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDist && dist > 0) {
        if (view === 'lake') lakeRadius = Math.max(4, Math.min(16, (lakeRadius * pinchDist) / dist));
        else targetRadius = Math.max(10, Math.min(46, (targetRadius * pinchDist) / dist));
      }
      pinchDist = dist;
      drag = null;
      tapStart = null;
    } else if (drag) {
      if (view === 'lake') {
        if (castState === 'catch') catchTwist += (e.clientX - drag.x) * 0.012;
        else if (state.cameraMode === 'third') {
          lakeTheta -= (e.clientX - drag.x) * 0.006;
          lakePhi = Math.max(0.55, Math.min(1.5, lakePhi + (e.clientY - drag.y) * 0.004));
        }
        drag = {x: e.clientX, y: e.clientY};
        tapStart = null;
        return;
      }
      theta -= (e.clientX - drag.x) * 0.006;
      phi = Math.max(0.45, Math.min(1.7, phi + (e.clientY - drag.y) * 0.004));
      drag = {x: e.clientX, y: e.clientY};
      if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 8) tapStart = null;
    }
  }
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    drag = {x: e.clientX, y: e.clientY};
    tapStart = pointers.size === 1 ? {x: e.clientX, y: e.clientY} : null;
  });
  canvas.addEventListener('pointermove', orbitMove);
  function up(e) {
    if (view === 'tank' && tapStart && pointers.size === 1 && e.type !== 'pointercancel') {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, (-(e.clientY - rect.top) / rect.height) * 2 + 1);
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(fishGroup.children, true);
      if (hits.length) {
        let o = hits[0].object;
        while (o && !o.userData.uid) o = o.parent;
        if (o) {
          selectedUID = o.userData.uid;
          pickCallback(selectedUID);
        }
      }
    }
    pointers.delete(e.pointerId);
    const remaining = [...pointers.values()][0];
    drag = remaining ? {x: remaining.x, y: remaining.y} : null;
    pinchDist = 0;
    tapStart = null;
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      if (view === 'tank') targetRadius = Math.max(10, Math.min(46, targetRadius + e.deltaY * 0.01));
      else lakeRadius = Math.max(4, Math.min(16, lakeRadius + e.deltaY * 0.006));
    },
    {passive: false},
  );
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (view === 'tank') targetRadius = innerWidth < 700 ? Math.max(20, 14.3 / camera.aspect) : 15.5;
    renderer.setSize(innerWidth, innerHeight);
  });
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    onError(new Error('Graphics paused. Reload to return to your sanctuary.'));
  });
  const splashGeo = new T.BufferGeometry(),
    splashData = new Float32Array(36 * 3),
    splashVelocity = Array.from({length: 36}, () => new T.Vector3());
  splashGeo.setAttribute('position', new T.Float32BufferAttribute(splashData, 3));
  const splash = new T.Points(
    splashGeo,
    new T.PointsMaterial({color: '#d3e9d8', size: 0.055, transparent: true, opacity: 0.8}),
  );
  tank.add(splash);
  splash.visible = false;
  function splashTank(x, z) {
    splashAt = clock;
    splashOrigin = {x, z};
    tankSurface.impulse(x, z, 1.8, 0.42);
    splashCallback();
    const a = splashGeo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      a.setXYZ(i, x, 4.78, z);
      const angle = (i / 36) * TAU;
      splashVelocity[i].set(
        Math.sin(angle) * (1 + Math.random()),
        1.3 + Math.random() * 1.8,
        Math.cos(angle) * (1 + Math.random()),
      );
    }
    a.needsUpdate = true;
    for (const s of swimmers) {
      s.motion.panicUntil = clock + 2;
      s.motion.scatter = {x, z};
      s.motion.decision = 0;
    }
  }
  function frame(ms) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const fps = state.quality === 'battery' ? 30 : state.quality === 'crisp' ? 60 : 45,
      interval = 1000 / fps;
    if (ms - lastRender < interval - 0.1) return;
    lastRender = ms - ((ms - lastRender) % interval);
    const dt = Math.min((ms - previous) / 1000, 0.05);
    previous = ms;
    clock += dt;
    streamUniform.time.value = clock;
    causticUniform.time.value = clock;
    shaftUniforms.time.value = clock;
    pullFlash *= Math.exp(-dt * 6);
    const mobile = innerWidth < 700;
    if (view === 'lake') {
      waterSystem.update(clock, region, conditions);
      surroundings.update(dt, clock, region, conditions);
      if (region >= 3 && castState === 'reeling') surroundings.tug(fightTension * 0.08 * dt);
      dock.visible = region < 3;
      lamp.visible = region < 3;
      for (const o of lake.children) if (o.userData.freshOnly) o.visible = region < 3;
      angler.setOcean(region >= 3);
      if (region >= 3) {
        const boat = surroundings.anchored;
        angler.group.position.set(0, boat.position.y + 0.44, 8.8);
        angler.group.quaternion
          .copy(boat.quaternion)
          .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI));
      } else angler.group.rotation.set(0, Math.PI, 0);
      angler.update(dt, clock, castState, fightTension, pullFlash, chargePose);
      const isCatch = ['landing', 'catch', 'create', 'travel'].includes(castState);
      const desired = new T.Vector3(),
        target = new T.Vector3();
      if (titleMode) {
        // Portrait phones put the boat below the title copy instead of behind the menu.
        const tall = camera.aspect < 0.8;
        desired.set(13 + Math.sin(clock * 0.04) * 0.5, tall ? 4.4 : 3.4, tall ? 21 : 18);
        target.set(tall ? -1.2 : 0, tall ? 3.3 : 1.35, 6.8);
      } else if (isCatch) {
        desired.set(mobile ? 3.9 : 4.5, 3.0, 3.2);
        // Desktop keeps the dangling catch left of the stats panel.
        target.set(mobile ? 0 : -0.7, mobile ? 1.3 : 2.1, mobile ? 8.35 : 7.7);
      } else if (state.cameraMode === 'first') {
        desired.set(-0.08, 2.45 + angler.group.position.y, 8.48);
        target.set(-0.08, 0.1, -13);
      } else {
        // Orbit around the angler, but aim down the cast so the float stays framed,
        // including on narrow portrait screens.
        const out = ['waiting', 'bite', 'reeling'].includes(castState) && tackle.mode !== 'ready',
          floatAhead = out ? Math.max(0, 8.8 - tackle.end.z) : 0,
          behind = Math.max(0, Math.cos(lakeTheta));
        lookAhead += ((out ? Math.min(15, Math.max(5, floatAhead * 0.62)) : 5) - lookAhead) * (1 - Math.exp(-dt * 1.4));
        const radius = lakeRadius * (camera.aspect < 0.8 ? 1.12 : 1) + (out ? floatAhead * 0.06 : 0);
        desired.set(
          Math.sin(lakeTheta) * Math.sin(lakePhi) * radius,
          1.6 + angler.group.position.y + Math.cos(lakePhi) * radius,
          8.8 + Math.cos(lakeTheta) * Math.sin(lakePhi) * radius,
        );
        target.set(out ? tackle.end.x * 0.35 : 0, 1.3, 8.8 - lookAhead * behind);
      }
      camera.position.lerp(desired, 1 - Math.exp(-dt * 3.6));
      cameraLook.lerp(target, 1 - Math.exp(-dt * 3.6));
      camera.lookAt(cameraLook);
      lakeLife(dt);
      if (castState === 'reeling') tackle.fight(fightTension);
      tackle.update(dt, clock, angler.tip, camera);
      // Keep the float away from the face while the player designs their angler.
      if (castState === 'create') tackle.root.visible = false;
      for (const r of rippleMeshes) r.visible = false;
      if (['water', 'hooked'].includes(tackle.mode)) {
        const hooked = tackle.mode === 'hooked';
        for (let i = 0; i < 3; i++) {
          const r = rippleMeshes[i],
            u = (clock * (hooked ? 1.3 : castState === 'bite' ? 1.1 : 0.6) + i / 3) % 1;
          r.visible = true;
          r.position.set(tackle.end.x, waterSystem.height(tackle.end.x, tackle.end.z, clock) + 0.025, tackle.end.z);
          r.scale.setScalar(0.2 + u * (hooked ? 1.3 : 0.7));
          r.material.opacity = (1 - u) * (hooked ? 0.22 : castState === 'bite' ? 0.2 : 0.12);
        }
      }
      if (sprayAge.some(a => a < 1.5)) {
        for (let i = 0; i < spraySize; i++) {
          sprayAge[i] += dt;
          if (sprayAge[i] > 1.5) {
            sprayData[i * 3 + 1] = -100;
            continue;
          }
          const v = sprayVelocity[i];
          v.y -= 9.8 * dt;
          sprayData[i * 3] += v.x * dt;
          sprayData[i * 3 + 1] += v.y * dt;
          sprayData[i * 3 + 2] += v.z * dt;
          if (sprayData[i * 3 + 1] < waterSystem.height(sprayData[i * 3], sprayData[i * 3 + 2], clock)) sprayAge[i] = 10;
        }
        sprayGeo.attributes.position.needsUpdate = true;
      }
      if (heldFish) {
        const ext = heldFish.userData.profile.len * 0.52 * heldFish.scale.x;
        heldFish.position.set(tackle.end.x, tackle.end.y - 0.17 - ext, tackle.end.z);
        heldFish.rotation.set(0, catchTwist, Math.PI / 2 + Math.sin(clock * 3) * 0.04);
        animateFish(heldFish, clock * 5, 0.5);
      }
      rarityHalo.visible = !!heldFish;
      if (heldFish) {
        rarityHalo.position.copy(heldFish.position);
        rarityHalo.position.y -= 0.05;
        rarityHalo.quaternion.copy(camera.quaternion);
        dripSpawn += dt;
        if (dripSpawn > 0.16) {
          dripSpawn = 0;
          const i = dripIndex++ % 18;
          dripAge[i] = 0;
          dripGeo.attributes.position.setXYZ(
            i,
            heldFish.position.x + (Math.random() - 0.5) * 0.16,
            heldFish.position.y - 0.18,
            heldFish.position.z,
          );
          dripVelocity[i].set((Math.random() - 0.5) * 0.1, -0.1, (Math.random() - 0.5) * 0.1);
        }
      }
      drips.visible = !!heldFish;
      const da = dripGeo.attributes.position;
      for (let i = 0; i < 18; i++) {
        dripAge[i] += dt;
        if (dripAge[i] > 2) {
          da.setXYZ(i, 0, -100, 0);
          continue;
        }
        dripVelocity[i].y -= dt * 9.8;
        const y = da.getY(i) + dripVelocity[i].y * dt;
        da.setXYZ(i, da.getX(i) + dripVelocity[i].x * dt, y, da.getZ(i) + dripVelocity[i].z * dt);
        const floor = region < 3 ? 0.25 : waterSystem.height(da.getX(i), da.getZ(i), clock);
        if (y < floor) {
          dripAge[i] = 10;
          if (clock - lastDrip > 0.7) {
            lastDrip = clock;
            soundCallback('drip');
          }
          if (region >= 3) waterSystem.impulse(da.getX(i), da.getZ(i), clock, 0.025);
        }
      }
      da.needsUpdate = true;
      const night = conditions.phase === 'night';
      const dusk = conditions.phase === 'dusk' || conditions.phase === 'dawn';
      const cycle = conditions.cycle ?? 0.3,
        sky = skyAt(cycle, titleMode ? 3 : region, skyColors),
        blend = 1 - Math.exp(-dt * 2),
        daylightAngle = (cycle / 0.64) * Math.PI,
        day = cycle < 0.64,
        moonAngle = cycle * TAU;
      gradient.uniforms.top.value.lerp(sky[0], blend);
      gradient.uniforms.bottom.value.lerp(sky[1], blend);
      moon.position.set(Math.cos(moonAngle) * 75, 30 + Math.sin(moonAngle) * 20, -100);
      if (day) lightDir.set(Math.cos(daylightAngle) * 65, Math.sin(daylightAngle) * 55 + 8, -95).normalize();
      else lightDir.copy(moon.position).normalize();
      const sunUp = day ? Math.min(1, Math.max(0, Math.sin(daylightAngle) * 2.2)) : 0;
      gradient.uniforms.sunDir.value.copy(lightDir);
      gradient.uniforms.sunColor.value.copy(sky[2]);
      gradient.uniforms.glow.value += ((day ? 0.55 + sunUp * 0.45 : 0.18) - gradient.uniforms.glow.value) * blend;
      sun.position.copy(lightDir).multiplyScalar(50);
      sun.color.copy(sky[2]);
      sun.intensity += ((night ? 0.55 : 0.7 + sunUp * 1.9) - sun.intensity) * blend;
      hemi.color.copy(sky[0]).lerp(skyA.set('#ffffff'), 0.45);
      hemi.groundColor.set(region >= 3 ? '#2a4a50' : '#22392f');
      hemi.intensity += ((night ? 0.85 : dusk ? 1.5 : 1.9) - hemi.intensity) * blend;
      fill.intensity = night ? 0.45 : 0.9;
      const rangeLight = night ? 0.3 : dusk ? 0.62 : 0.92;
      for (const r of ranges)
        r.mesh.material.color.copy(r.base).multiplyScalar(rangeLight).lerp(gradient.uniforms.bottom.value, r.haze);
      scene.fog.color.copy(gradient.uniforms.bottom.value).multiplyScalar(0.78);
      const wu = waterSystem.uniforms;
      wu.detail.value = state.quality === 'battery' ? 0 : 1;
      wu.skyTop.value.copy(gradient.uniforms.top.value);
      wu.skyHorizon.value.copy(gradient.uniforms.bottom.value);
      wu.sunDir.value.copy(lightDir);
      wu.sunColor.value.copy(sky[2]).multiplyScalar(day ? 1 : 0.45);
      wu.fogColor.value.copy(scene.fog.color);
      wu.fogDensity.value = scene.fog.density;
      wu.light.value += ((night ? 0.42 : dusk ? 0.78 : 1) - wu.light.value) * blend;
      stars.material.opacity += ((night ? 0.95 : dusk ? 0.3 : 0.03) * (region === 2 ? 1.2 : 1) - stars.material.opacity) * blend;
      moon.visible = night || dusk;
      moonHalo.visible = moon.visible;
      moonHalo.position.copy(moon.position);
      moonHalo.position.z += 0.2;
      fireflies.visible = night || dusk;
      // Clouds: white by day, sun-washed at dawn/dusk, faint blue silhouettes at night.
      const cloudTint = skyA.copy(sky[1]).lerp(skyB.set('#ffffff'), night ? 0.05 : dusk ? 0.35 : 0.75);
      if (dusk) cloudTint.lerp(sky[2], 0.25);
      if (night) cloudTint.multiplyScalar(0.55);
      const overcast = conditions.weather === 'rain' ? 1 : conditions.weather === 'mist' ? 0.5 : 0;
      for (const c of clouds) {
        const u = c.userData,
          a = u.angle + clock * 0.0016;
        c.visible = true;
        c.position.set(Math.sin(a) * u.dist, u.height, 8 - Math.cos(a) * u.dist);
        c.lookAt(camera.position.x, u.height * 0.6, camera.position.z);
        c.material.color.copy(cloudTint).multiplyScalar(1 - overcast * 0.28);
        c.material.opacity = (night ? 0.4 : 0.95) * (0.8 + overcast * 0.2);
      }
    } else {
      radius += (targetRadius - radius) * 0.07;
      const centerY = mobile ? 2.5 : 2.2;
      camera.position.set(
        Math.sin(theta) * Math.sin(phi) * radius,
        centerY + Math.cos(phi) * radius,
        Math.cos(theta) * Math.sin(phi) * radius,
      );
      lookY += (centerY + (mobile && !immersive ? -2.7 : 0) - lookY) * (1 - Math.exp(-dt * 4));
      camera.lookAt(0, lookY, 0);
      const feeding = clock < feedUntil;
      if (feeding) feedTarget.y = 4.15 - (clock - feedStart) * 0.13;
      const neighbors = swimmers.map(s => s.motion);
      for (const s of swimmers) {
        const resident = state.fish.find(f => f.uid === s.uid);
        s.mesh.scale.setScalar(s.baseScale * (0.6 + 0.4 * growth(resident || {})));
        if (arrival && arrival.uid === s.uid) {
          arrival.v -= dt * (arrival.entered ? 1.2 : 8);
          arrival.y += arrival.v * dt;
          if (!arrival.entered && arrival.y <= 4.78) {
            arrival.entered = true;
            arrival.v = -0.4;
            splashTank(arrival.x, arrival.z);
          }
          s.mesh.position.set(arrival.x, arrival.y, arrival.z);
          s.mesh.rotation.z = Math.sin(clock * 4) * 0.12;
          animateFish(s.mesh, clock * 5);
          if (arrival.entered && arrival.y <= 4.24) {
            s.motion.p = {x: arrival.x, y: 4.24, z: arrival.z};
            s.motion.v = {x: 0.15, y: -0.1, z: 0};
            arrival = null;
          }
          continue;
        }
        stepSwimmer(s.motion, dt, clock, feeding, feedTarget, neighbors, s.bottom);
        const m = s.motion;
        s.mesh.position.set(m.p.x, m.p.y, m.p.z);
        s.mesh.rotation.y = m.yaw;
        s.mesh.rotation.z = m.pitch;
        // Fish cruising just under the surface dimple it as they pass.
        if (m.p.y > 3.95 && Math.random() < dt * 1.2)
          tankSurface.impulse(m.p.x, m.p.z, 0.05 + Math.hypot(m.v.x, m.v.z) * 0.08, 0.22);
        animateFish(s.mesh, m.tail, 0.7 + Math.hypot(m.v.x, m.v.z) * 0.7);
      }
      selectedRing.visible = false;
      const selected = swimmers.find(s => s.uid === selectedUID);
      if (selected) {
        selectedRing.visible = true;
        selectedRing.position.copy(selected.mesh.position);
        selectedRing.position.y -= 0.35;
      }
      pellets.visible = clock < feedUntil;
      const pa = pelletGeo.attributes.position;
      if (pellets.visible) {
        for (let i = 0; i < pa.count; i++) {
          const o = pelletOffsets[i];
          pa.setXYZ(i, feedTarget.x + o[0], 4.65 - ((clock - feedStart) * 0.13 + o[2] * 0.24), feedTarget.z + o[1]);
        }
        pa.needsUpdate = true;
      }
      for (const l of leaves) l.rotation.z = Math.sin(clock * 0.65 + l.id) * 0.008;
      for (const sh of shafts) sh.rotation.z = 0.12 - (sh.userData.phase % 3) * 0.03 + Math.sin(clock * 0.21 + sh.userData.phase) * 0.05;
      const ba = bubblesGeo.attributes.position;
      for (let i = 0; i < ba.count; i++) {
        let y = ba.getY(i) + dt * (0.14 + (i % 5) * 0.025);
        if (y > 4.7) y = 0.45;
        ba.setY(i, y);
      }
      ba.needsUpdate = true;
      const age = clock - splashAt,
        a = tankWater.geometry.attributes.position;
      tankSurface.update(dt);
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i),
          z = -a.getY(i);
        a.setZ(i, tankSurface.sample(x, z) + Math.sin(x * 1.1 + clock * 0.7) * 0.006);
      }
      a.needsUpdate = true;
      if (Math.floor(clock * 20) % 4 === 0) tankWater.geometry.computeVertexNormals();
      splash.visible = age >= 0 && age < 1.8;
      if (splash.visible) {
        const a = splashGeo.attributes.position;
        for (let i = 0; i < a.count; i++) {
          splashVelocity[i].y -= dt * 5;
          a.setXYZ(
            i,
            a.getX(i) + splashVelocity[i].x * dt,
            a.getY(i) + splashVelocity[i].y * dt,
            a.getZ(i) + splashVelocity[i].z * dt,
          );
        }
        a.needsUpdate = true;
        splash.material.opacity = Math.max(0, 1 - age / 1.8) * 0.8;
      }
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return {
    setTitle: on => {
      titleMode = on;
      castState = on ? 'title' : 'idle';
      surroundings.setTitle(on);
      region = on ? 3 : state.region;
      conditions = on
        ? {...worldConditions(), phase: 'dawn', weather: 'clear', cycle: 0.08}
        : worldConditions(Date.now(), region);
      setView('lake');
    },
    setCharge: value => {
      chargePose = value;
    },
    onSound: callback => {
      soundCallback = callback;
    },
    setView,
    refreshFish,
    setCast: s => {
      const previousState = castState;
      castState = s;
      castStart = clock;
      if (s === 'bite') tackle.bite(true);
      if (s === 'reeling') tackle.hookSet(1 + fightTension);
      if (s === 'idle') {
        // A line that was out is wound back in (or lost) rather than teleporting home.
        if (['waiting', 'bite', 'reeling'].includes(previousState)) tackle.recall(lineLost);
        else tackle.reset();
        lineLost = false;
        fightTension = 0;
        if (heldFish) {
          lake.remove(heldFish);
          disposeFish(heldFish);
          heldFish = null;
          rarityHalo.visible = false;
          drips.visible = false;
        }
      }
      if (s === 'catch') tackle.hang();
    },
    zoom: n => {
      targetRadius = Math.max(10, Math.min(46, targetRadius + n));
    },
    setRegion: n => {
      region = n;
      conditions = worldConditions(Date.now(), region);
      applyPalette();
    },
    setQuality: () => {
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, state.quality === 'battery' ? 1 : state.quality === 'crisp' ? 2 : 1.5),
      );
      renderer.setSize(innerWidth, innerHeight);
    },
    setConditions: c => {
      if (!titleMode) conditions = c;
    },
    setCamera: () => {},
    refreshCharacter: () => angler.refresh(),
    previewCharacter: c => angler.refresh(c),
    cast: power => {
      const bait = BAITS[state.bait] || BAITS[0];
      tackle.cast(power, angler.tip, bait.color);
      waterSystem.impulse(tackle.end.x, tackle.end.z, clock, 0.15);
    },
    reel: (tension, progress) => {
      fightTension = tension;
      pullFlash = 1;
      tackle.pull(0.15);
      if (region >= 3) surroundings.tug(0.025 + tension * 0.03);
      waterSystem.impulse(tackle.end.x, tackle.end.z, clock, 0.18);
    },
    setTension: n => {
      fightTension = n;
    },
    loseLine: () => {
      lineLost = true;
    },
    showCatch: fish => {
      if (heldFish) {
        lake.remove(heldFish);
        disposeFish(heldFish);
      }
      heldFish = createFish(SPECIES.find(f => f.id === fish.id));
      const maxLength = heldFish.userData.profile.len * heldFish.scale.x;
      if (maxLength > 1.5) heldFish.scale.multiplyScalar(1.5 / maxLength);
      const color = RARITY_COLORS[SPECIES.find(f => f.id === fish.id).rarity];
      rarityHalo.material.uniforms.tint.value.set(color);
      heldFish.traverse(o => {
        if (o.isMesh && o.material.emissive) {
          o.material.emissive.set(color);
          o.material.emissiveIntensity = 0.055;
        }
      });
      lake.add(heldFish);
      tackle.land();
      catchTwist = 0;
    },
    arrive: uid => {
      arrival = {uid, x: (Math.random() - 0.5) * 2, y: 7.7, z: 0, v: 0, entered: false};
    },
    setMood: () => applyPalette(),
    setFocus: on => {
      immersive = on;
    },
    onSplash: callback => {
      splashCallback = callback;
    },
    onPick: callback => {
      pickCallback = callback;
    },
    select: uid => {
      selectedUID = uid;
    },
    feed: () => {
      if (!swimmers.length) return false;
      feedStart = clock;
      feedUntil = clock + 12;
      feedTarget.set((Math.random() - 0.5) * 2.5, 4.15, Math.random() - 0.5);
      // Pellets patter onto the surface where they land, not at the tank centre.
      for (let k = 0; k < 5; k++)
        tankSurface.impulse(feedTarget.x + (Math.random() - 0.5) * 1.6, feedTarget.z + (Math.random() - 0.5) * 1.3, 0.12, 0.2);
      return true;
    },
    renderer,
  };
}
