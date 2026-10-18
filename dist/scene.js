import * as T from './assets/three.module.js';
import {createFish, animateFish, disposeFish} from './fish.js?v=7';
import {makeSwimmer, stepSwimmer} from './swimming.js?v=7';
import {createWater, createEnvironment, addSway} from './environment.js?v=7';
import {createAngler} from './angler.js?v=7';
import {createTackle} from './tackle.js?v=7';
import {surfaceTexture, cloudTexture} from './textures.js?v=7';
import {rockGeometry, dockGeometry, lantern, reedGeometry} from './scenery.js?v=7';
import {place, merge, fbm, paint, tube, displace, lathe} from './models.js?v=7';
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
  // Soft sun shadows ground everything near the angler (and in the tank). Off on Battery.
  renderer.shadowMap.enabled = state.quality !== 'battery';
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const shade = (obj, cast = true, receive = false) => {
    obj.traverse(o => {
      if (o.isMesh) {
        o.castShadow = cast;
        o.receiveShadow = receive;
      }
    });
    return obj;
  };
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
  sun.castShadow = true;
  sun.shadow.mapSize.set(state.quality === 'crisp' ? 2048 : 1024, state.quality === 'crisp' ? 2048 : 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  const sunTarget = new T.Object3D();
  sun.target = sunTarget;
  function aimShadow(x, y, z, extent, distance) {
    sunTarget.position.set(x, y, z);
    sunTarget.updateMatrixWorld();
    const cam = sun.shadow.camera;
    if (cam.right !== extent) {
      cam.left = cam.bottom = -extent;
      cam.right = cam.top = extent;
      cam.near = 1;
      cam.far = distance * 2.2;
      cam.updateProjectionMatrix();
    }
  }
  sun.position.set(-15, 24, 8);
  scene.add(sun, sunTarget);
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
    // Fractal ridge line; the tallest crests carry a little snow via vertex colour.
    const g = new T.BufferGeometry(),
      verts = [],
      colors = [],
      steps = 72,
      seed = x * 0.13 + z * 0.07;
    const ridge = u =>
      Math.max(0.03, Math.pow(Math.sin(u * Math.PI), 0.8)) * (0.72 + fbm(u * 5, seed, 0, 3, 4) * 0.55 + Math.abs(fbm(u * 19, seed, 1, 5, 2)) * 0.18);
    for (let i = 0; i < steps; i++) {
      const u1 = i / steps,
        u2 = (i + 1) / steps,
        x1 = -w / 2 + u1 * w,
        x2 = -w / 2 + u2 * w,
        a = ridge(u1) * h,
        b = ridge(u2) * h;
      verts.push(x1, 0, 0, x2, 0, 0, x1, a, 0, x2, 0, 0, x2, b, 0, x1, a, 0);
      const snow = y => (h > 40 && y > h * 0.82 ? 1.55 : 1),
        foot = 0.82;
      colors.push(foot, foot, foot, foot, foot, foot, snow(a), snow(a), snow(a), foot, foot, foot, snow(b), snow(b), snow(b), snow(a), snow(a), snow(a));
    }
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const m = mesh(g, new T.MeshBasicMaterial({color, side: T.DoubleSide, vertexColors: true}), lake, [x, -0.2, z]);
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
  const treeMat = mat('#183f40');
  // A mossy cascade gives Fernwater its own silhouette and moving current.
  const creek = new T.Group();
  creek.visible = false;
  lake.add(creek);
  const creekStone = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9});
  for (let i = 0; i < 9; i++) {
    const rock = mesh(
      rockGeometry(30 + i, true, ['#55695f', '#718273']),
      creekStone,
      creek,
      [-9 + (i % 3) * 1.15, Math.floor(i / 3) * 1.05, -21 - Math.floor(i / 3) * 0.9],
      [1.35, 1.05, 1.1],
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
    // Glowing crystal clusters: hexagonal prisms with faceted points.
    const shards = [];
    for (let k = 0; k < 5; k++) {
      const hgt = (0.6 + Math.random() * 1.2) * (k ? 0.7 : 1),
        rad = 0.12 + Math.random() * 0.12,
        tilt = k ? [(Math.random() - 0.5) * 0.9, Math.random() * 6, (Math.random() - 0.5) * 0.9] : [0, Math.random(), 0];
      const prism = new T.CylinderGeometry(rad, rad * 1.1, hgt, 6);
      prism.translate(0, hgt / 2, 0);
      const tip = new T.ConeGeometry(rad, rad * 2.2, 6);
      tip.translate(0, hgt + rad * 1.1, 0);
      shards.push(place(merge([prism, tip]), [(Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4], tilt));
    }
    const stone = mesh(merge(shards), mat('#7f99b0', {emissive: '#6783a7', emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.1, flatShading: true}), cove, [x, -0.1, z], [1.2, 1.2, 1.2]);
    stone.rotation.z = (Math.random() - 0.5) * 0.2;
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
  shade(tackle.float);
  const dock = new T.Group();
  lake.add(dock);
  dock.position.set(0, 0, 8);
  // Deck top sits at y 0.3, where the angler's boots stand.
  shade(mesh(dockGeometry(6.7, 3.1, 4), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9, map: surfaceTexture('wood')}), dock, [0, 0.055, 1.42]), true, true);
  const lamp = lantern(mat('#e9c58e', {emissive: '#f3b15d', emissiveIntensity: 1, transparent: true, opacity: 0.7}));
  lamp.position.set(-1, 0.3, 6.6);
  lake.add(shade(lamp));
  const warm = new T.PointLight('#ffd69c', 6, 9);
  warm.position.set(-1, 0.9, 6.6);
  lake.add(warm);
  const reedParts = [];
  for (let i = 0; i < 34; i++) {
    const side = i < 17 ? -1 : 1,
      x = side * (4 + Math.random() * 5),
      z = 4 + Math.random() * 9;
    reedParts.push(place(reedGeometry(i + 1), [x, -0.15, z], [0, Math.random() * 6, side * 0.08]));
  }
  const reeds = mesh(merge(reedParts), addSway(new T.MeshStandardMaterial({vertexColors: true, roughness: 0.85}), 0.07), lake);
  reeds.castShadow = true;
  reeds.userData.freshOnly = true;
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
          jumper = shade(createFish(pool[Math.floor(Math.random() * pool.length)]));
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
  // Furniture-grade stand: a wooden cabinet with panelled doors, plinth and top lip.
  const stand = [];
  const woodTone = (x, y, z, out) => out.set('#5a4231').multiplyScalar(0.85 + fbm(x * 0.8, y * 9, z * 0.8, 3) * 0.35);
  stand.push(paint(place(new T.BoxGeometry(9.7, 2.6, 5.6, 8, 4, 4), [0, -1.25, 0]), woodTone));
  stand.push(paint(place(new T.BoxGeometry(9.95, 0.16, 5.85), [0, 0.0, 0]), '#3f2e22'));
  stand.push(paint(place(new T.BoxGeometry(9.9, 0.22, 5.8), [0, -2.55, 0]), '#33261c'));
  for (let k = 0; k < 4; k++) {
    const x = -3.6 + k * 2.4;
    stand.push(paint(place(new T.BoxGeometry(2.1, 1.9, 0.08), [x, -1.25, 2.82]), (xx, y, z, out) => woodTone(xx, y, z, out).multiplyScalar(1.12)));
    stand.push(paint(place(new T.BoxGeometry(1.7, 1.5, 0.06), [x, -1.25, 2.86]), woodTone));
    stand.push(paint(place(new T.SphereGeometry(0.06, 8, 6), [x + (k % 2 ? -0.75 : 0.75), -1.15, 2.92]), '#c9a86a'));
  }
  shade(mesh(merge(stand), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.55}), tank), false, true);
  // Inner floor slab under the substrate.
  mesh(geoBox, mat('#2e3d38'), tank, [0, 0.12, 0], [9.2, 0.12, 5.2]);
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
  // Brushed metal trim on every edge of the glass box.
  const trim = [];
  for (const top of [0.15, 5.03]) {
    for (const z of [-2.67, 2.67]) trim.push(place(new T.BoxGeometry(9.5, 0.09, 0.09), [0, top, z]));
    for (const x of [-4.71, 4.71]) trim.push(place(new T.BoxGeometry(0.09, 0.09, 5.3), [x, top, 0]));
  }
  for (const x of [-4.71, 4.71]) for (const z of [-2.67, 2.67]) trim.push(place(new T.BoxGeometry(0.09, 4.9, 0.09), [x, 2.59, z]));
  mesh(merge(trim), mat('#3a403c', {metalness: 0.65, roughness: 0.3}), tank);
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
  // Substrate rises toward the back like a planted aquascape, speckled with gravel.
  const sandGeo = new T.PlaneGeometry(9, 5, 46, 26);
  const sa = sandGeo.attributes.position;
  for (let i = 0; i < sa.count; i++) {
    const x = sa.getX(i),
      y = sa.getY(i);
    sa.setZ(i, Math.max(0, (y + 2.5) / 5) * 0.32 + fbm(x * 0.9, y * 0.9, 0, 8) * 0.12 + Math.sin(x * 2) * Math.cos(y * 2) * 0.03);
  }
  sandGeo.computeVertexNormals();
  paint(sandGeo, (x, y, z, out) => out.set('#bfae86').lerp(new T.Color('#8e7f62'), Math.max(0, fbm(x * 3, y * 3, 0, 2) + 0.2)).multiplyScalar(0.9 + Math.random() * 0.12));
  const sand = mesh(sandGeo, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.95}), tank, [0, 0.3, 0]);
  sand.receiveShadow = true;
  sand.rotation.x = -Math.PI / 2;
  const substrate = (x, z) => 0.3 + Math.max(0, (2.5 - z) / 5) * 0.32 + fbm(x * 0.9, -z * 0.9, 0, 8) * 0.12;
  const gravelGeo = new T.IcosahedronGeometry(0.05, 0),
    gravel = new T.InstancedMesh(gravelGeo, new T.MeshStandardMaterial({roughness: 0.8}), 260),
    gm = new T.Object3D();
  for (let i = 0; i < 260; i++) {
    const x = (Math.random() - 0.5) * 8.6,
      z = (Math.random() - 0.5) * 4.6;
    gm.position.set(x, substrate(x, z) + 0.01, z);
    gm.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    gm.scale.set(0.6 + Math.random(), 0.4 + Math.random() * 0.4, 0.6 + Math.random());
    gm.updateMatrix();
    gravel.setMatrixAt(i, gm.matrix);
    gravel.setColorAt(i, new T.Color().setHSL(0.09 + Math.random() * 0.05, 0.15 + Math.random() * 0.15, 0.35 + Math.random() * 0.35));
  }
  tank.add(gravel);
  // The aquarium lives in a cosy lakeside room: plank floor, rug, panelled walls, a
  // bookshelf and lamp, and a window that looks out on the real sky at this hour.
  const FLOOR = -2.66,
    room = new T.Group();
  tank.add(room);
  const planks = new T.PlaneGeometry(44, 34, 44, 1);
  planks.rotateX(-Math.PI / 2);
  paint(planks, (x, y, z, out) => out.set('#6b4c35').multiplyScalar(0.8 + ((Math.floor(x + 22) * 7) % 5) * 0.06 + fbm(x * 0.3, 0, z * 2, 12) * 0.12));
  const floor = mesh(planks, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.7, map: surfaceTexture('wood')}), room, [0, FLOOR, -2]);
  floor.receiveShadow = true;
  const rugGeo = new T.RingGeometry(0.001, 1, 64, 40);
  rugGeo.rotateX(-Math.PI / 2);
  paint(rugGeo, (x, y, z, out) => {
    const r = Math.hypot(x, z);
    // Braided rag rug: alternating coloured rings with a cream border.
    out.set(r > 0.93 ? '#d8c39a' : ['#3f6f6c', '#a65d4b', '#d8c39a', '#2f5a5a', '#8c7a4e'][Math.floor(r * 14) % 5]).multiplyScalar(0.92 + 0.08 * Math.sin(Math.atan2(z, x) * 40 + r * 60));
  });
  mesh(rugGeo, new T.MeshStandardMaterial({vertexColors: true, roughness: 1, map: surfaceTexture('cloth')}), room, [0, FLOOR + 0.02, 1.5], [9, 1, 5.5]).receiveShadow = true;
  // Walls face inward only, so they vanish when the orbit camera swings past them.
  const wallMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9});
  const wall = (w, h, p, rotY) => {
    const g = new T.PlaneGeometry(w, h, 24, 8);
    paint(g, (x, y, z, out) => {
      const v = y + h / 2;
      out.set(v < 3.2 ? '#5c4632' : '#c7b998').multiplyScalar(v < 3.2 ? 0.85 + 0.15 * Math.sign(Math.sin(x * 3)) * 0.4 : 0.92 + 0.08 * Math.sin(x * 9));
      if (Math.abs(v - 3.2) < 0.12) out.set('#3f2e22');
    });
    const m = mesh(g, wallMat, room, p);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    return m;
  };
  wall(44, 16, [0, FLOOR + 8, -12], 0);
  wall(34, 16, [-20, FLOOR + 8, -2], Math.PI / 2);
  wall(34, 16, [20, FLOOR + 8, -2], -Math.PI / 2);
  // Window onto the lake: a framed opening whose glass paints today's sky, hills and water.
  const windowUniforms = {top: {value: new T.Color()}, bottom: {value: new T.Color()}, sunDir: {value: new T.Vector3(0, 1, 0)}, night: {value: 0}, time: {value: 0}};
  mesh(
    new T.PlaneGeometry(7, 5.2),
    new T.ShaderMaterial({
      uniforms: windowUniforms,
      fog: false,
      vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 v;uniform vec3 top;uniform vec3 bottom;uniform vec3 sunDir;uniform float night;uniform float time;' +
        'void main(){float h=v.y;vec3 c=mix(bottom,top,smoothstep(.35,1.,h));' +
        'vec2 sp=vec2(.5+sunDir.x*.45,.4+sunDir.y*.6);c+=vec3(1.,.85,.6)*pow(max(0.,1.-length((v-sp)*vec2(1.4,1.))*3.),3.)*(1.-night);' +
        'float star=step(.997,fract(sin(dot(floor(v*vec2(140.,100.)),vec2(12.9898,78.233)))*43758.5));c+=star*night*smoothstep(.5,.8,h);' +
        'float hill=.42+.06*sin(v.x*7.+1.)+.04*sin(v.x*17.)+.02*sin(v.x*41.);vec3 land=mix(vec3(.12,.2,.17),vec3(.25,.36,.3),1.-night)*mix(1.,.55,night);' +
        'if(h<hill)c=mix(land,bottom,.25);float lakeY=.3;if(h<lakeY){vec3 w=mix(bottom,top,.4)*.75;w+=.04*sin(v.x*90.+time*1.5)*sin(h*120.);c=w;}' +
        'gl_FragColor=vec4(c,1.);}',
    }),
    room,
    [-8, FLOOR + 8.2, -11.95],
  );
  const frameParts = [];
  for (const [w, h, x, y] of [[7.6, 0.3, 0, 2.75], [7.6, 0.45, 0, -2.75], [0.3, 5.8, -3.65, 0], [0.3, 5.8, 3.65, 0], [0.12, 5.2, 0, 0], [7, 0.12, 0, 0.6]])
    frameParts.push(paint(place(new T.BoxGeometry(w, h, 0.2), [x, y, 0]), '#e6dcc4'));
  frameParts.push(paint(place(new T.BoxGeometry(8.2, 0.18, 0.6), [0, -2.95, 0.3]), '#d8ccb0'));
  mesh(merge(frameParts), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.6}), room, [-8, FLOOR + 8.2, -11.85]);
  // Bookshelf, a potted fern and a standing lamp make the room feel lived in.
  const shelf = [];
  shelf.push(paint(place(new T.BoxGeometry(4.4, 7, 1.2), [0, 3.5, 0]), '#4d3828'));
  for (let k = 0; k < 4; k++) {
    shelf.push(paint(place(new T.BoxGeometry(4.0, 0.12, 1.1), [0, 0.9 + k * 1.6, 0.08]), '#3a2a1e'));
    let x = -1.85;
    while (x < 1.7) {
      const w = 0.18 + Math.random() * 0.22,
        h = 0.9 + Math.random() * 0.5;
      shelf.push(paint(place(new T.BoxGeometry(w, h, 0.75), [x + w / 2, 0.96 + k * 1.6 + h / 2, 0.1], [0, 0, Math.random() < 0.12 ? 0.25 : 0]), ['#7a3f36', '#3f5f6a', '#c7a35d', '#506b4c', '#8b6a8f', '#d8cfb7'][Math.floor(Math.random() * 6)]));
      x += w + 0.02;
    }
  }
  mesh(merge(shelf), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.8}), room, [10, FLOOR, -11.2]).castShadow = true;
  const pot = [paint(lathe([[0.5, 0], [0.62, 0.9], [0.66, 1.0], [0.6, 1.05]], 18), '#b06a4c')];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2,
      pts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      pts.push(new T.Vector3(Math.cos(a) * u * 1.3, 1.0 + Math.sin(u * 2.4) * 1.4, Math.sin(a) * u * 1.3));
    }
    pot.push(paint(tube(pts, u => 0.06 * (1 - u * 0.7), 5, false), k % 2 ? '#4d8a55' : '#6aa266'));
  }
  mesh(merge(pot), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.8}), room, [-14, FLOOR, -9]).castShadow = true;
  const lampParts = [
    paint(lathe([[0.55, 0], [0.5, 0.12], [0.08, 0.2]], 18), '#2e2a26'),
    paint(place(new T.CylinderGeometry(0.05, 0.05, 6, 8), [0, 3.1, 0]), '#2e2a26'),
  ];
  mesh(merge(lampParts), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.5, metalness: 0.4}), room, [15, FLOOR, -8]);
  mesh(lathe([[0.95, 0], [0.55, 1.1], [0.5, 1.12]], 24), mat('#f2dfb4', {emissive: '#f0b86a', emissiveIntensity: 0.9, side: T.DoubleSide}), room, [15, FLOOR + 5.6, -8]);
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
  // Hardscape: a few weathered stones grouped off-centre, plus a driftwood branch.
  const stoneMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9});
  const stonePlan = [[-2.6, -1.3, 0.7], [-1.9, -1.6, 0.45], [-3.2, -0.6, 0.38], [2.9, 1.1, 0.32], [0.4, 1.4, 0.25], [3.6, -1.7, 0.5], [-0.6, -1.8, 0.3]];
  stonePlan.forEach(([x, z, sc], i) => {
    const r = mesh(rockGeometry(50 + i, i % 2 === 0, ['#6f7d76', '#8a958c']), stoneMat, tank, [x, substrate(x, z) + sc * 0.25, z], [sc * 1.3, sc * 1.1, sc]);
    r.rotation.y = i * 1.3;
  });
  const drift = [];
  const branch = (pts, r0) => drift.push(paint(tube(pts.map(p => new T.Vector3(...p)), u => r0 * (1 - u * 0.7), 7), (x, y, z, out) => out.set('#5b4636').multiplyScalar(0.8 + fbm(x * 4, y * 4, z * 4, 6) * 0.4)));
  branch([[1.2, 0.5, -1.4], [1.9, 0.9, -1.2], [2.6, 1.6, -1.5], [3.0, 2.4, -1.3]], 0.14);
  branch([[1.9, 0.9, -1.2], [1.6, 1.6, -0.9], [1.3, 2.1, -1.1]], 0.07);
  branch([[2.6, 1.6, -1.5], [3.4, 1.9, -1.9]], 0.06);
  mesh(merge(drift), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.85}), tank);
  const plants = new T.Group(),
    arch = new T.Group(),
    lanterns = new T.Group();
  tank.add(plants, arch, lanterns);
  const leaves = [];
  const plantMat = addSway(new T.MeshStandardMaterial({vertexColors: true, roughness: 0.6, side: T.DoubleSide}), 0.06, 0.4);
  // Ribbon grass (vallisneria): tall flat blades that bend over near the surface.
  function ribbons(x, z, count, h, seed) {
    const parts = [];
    for (let k = 0; k < count; k++) {
      const a = k * 2.4 + seed,
        bladeH = h * (0.7 + ((k * 37) % 10) / 25),
        geo = new T.PlaneGeometry(0.07, bladeH, 1, 10),
        p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = (p.getY(i) + bladeH / 2) / bladeH;
        p.setXYZ(i, p.getX(i) * (1 - u * 0.4) + Math.sin(u * 2.5 + k) * 0.18 * u, u * bladeH, Math.pow(u, 2) * 0.35 * Math.cos(a));
      }
      geo.computeVertexNormals();
      place(geo, [x + Math.cos(a) * 0.18, substrate(x, z) - 0.03, z + Math.sin(a) * 0.12], [0, a, 0]);
      parts.push(paint(geo, (xx, y, zz, out) => out.set(k % 2 ? '#4f8f62' : '#6aa86f').multiplyScalar(0.75 + Math.min(0.4, (y - 0.3) * 0.12))));
    }
    return merge(parts);
  }
  // Amazon sword: rosette of broad leaves with a pale midrib.
  function sword(x, z, h, seed) {
    const parts = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + seed,
        len = h * (0.75 + (k % 3) * 0.12),
        geo = new T.PlaneGeometry(1, 1, 4, 10),
        p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getY(i) + 0.5,
          v = p.getX(i),
          width = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.28 * (u > 0.1 ? 1 : u * 10);
        const out = u * len * 0.8,
          up = Math.sin(u * 1.4) * len * 0.75 - u * u * len * 0.2;
        p.setXYZ(i, v * width, up, out - Math.abs(v) * 0.04);
      }
      geo.computeVertexNormals();
      place(geo, [x, substrate(x, z) - 0.02, z], [0, a, 0]);
      parts.push(paint(geo, (xx, y, zz, out) => out.set('#3f8a5e').lerp(new T.Color('#86c27f'), Math.min(1, (y - 0.3) / (h * 0.8)))));
    }
    return merge(parts);
  }
  // Moss balls nestled between the stones.
  function mossBall(x, z, r) {
    return paint(displace(place(new T.SphereGeometry(r, 14, 10), [0, 0, 0]), r * 0.18, 9 / r, 4, 2), (xx, y, zz, out) => out.set('#3e6e43').multiplyScalar(0.8 + fbm(xx * 20, y * 20, zz * 20, 2) * 0.4)).translate(x, substrate(x, z) + r * 0.8, z);
  }
  const baseGreens = [ribbons(-3.7, -1.9, 9, 3.4, 1), ribbons(3.9, -1.9, 8, 3.0, 2), sword(-3.4, 1.2, 1.1, 0.4), sword(3.4, -0.6, 1.3, 1.1), mossBall(-1.4, -1.0, 0.22), mossBall(-2.2, -0.6, 0.16)];
  for (const g of baseGreens) leaves.push(mesh(g, plantMat, tank));
  // River garden decor: a lush back row of ribbon grass and swords.
  for (let i = 0; i < 6; i++) leaves.push(mesh(i % 2 ? sword(-2.7 + i * 1.1, 1.7, 0.9, i) : ribbons(-2.7 + i * 1.1, -2.0, 7, 2.4, i + 3), plantMat, plants));
  // Moonstone arch: a weathered stone bridge with moss along its crown.
  const archGeo = new T.TorusGeometry(1.1, 0.28, 12, 36, Math.PI);
  displace(archGeo, 0.09, 3, 9, 3);
  const archNormals = archGeo.attributes.normal;
  paint(archGeo, (x, y, z, out) => out.set('#8d998f').multiplyScalar(0.85 + fbm(x * 4, y * 4, z * 4, 1) * 0.3));
  const ac = archGeo.attributes.color;
  for (let i = 0; i < ac.count; i++) if (archNormals.getY(i) > 0.6) ac.setXYZ(i, 0.33, 0.48, 0.3);
  mesh(archGeo, new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9}), arch, [1.2, substrate(1.2, -0.8) - 0.05, -0.8]);
  for (const x of [0.1, 2.3]) mesh(rockGeometry(70 + x, true, ['#7f8b82', '#97a198']), new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9}), arch, [x, substrate(x, -0.8) + 0.12, -0.8], [0.42, 0.35, 0.38]);
  // Sunken lanterns: little glass lanterns glowing on the sand.
  const lanternGlass = mat('#ffd9a0', {emissive: '#eab979', emissiveIntensity: 0.9, transparent: true, opacity: 0.75});
  for (let i = 0; i < 3; i++) {
    const x = -2 + i * 2,
      l = lantern(lanternGlass);
    l.scale.setScalar(0.75);
    l.position.set(x, substrate(x, 0.5) - 0.02, 0.5);
    l.rotation.set((i - 1) * 0.15, i * 0.8, (i - 1) * 0.12);
    lanterns.add(l);
  }
  // Decor, plants and stones cast and catch the light from above; glass and water do not.
  tank.traverse(o => {
    if (o.isMesh && o.material?.isMeshStandardMaterial && !o.material.transparent && o !== sand && !room.children.includes(o)) o.castShadow = o.receiveShadow = true;
  });
  gravel.castShadow = false;
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
      // Only the body casts: fins add many draw calls to the shadow pass for little visible gain.
      model.userData.body.castShadow = true;
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
      // Shadows follow the angler; the lake sun keeps its sky direction.
      aimShadow(0, 1, 7.5, 9, 40);
      sun.position.copy(sunTarget.position).addScaledVector(lightDir, 40);
      sun.color.copy(sky[2]);
      sun.intensity += ((night ? 0.55 : 0.7 + sunUp * 1.9) - sun.intensity) * blend;
      hemi.color.copy(sky[0]).lerp(skyA.set('#ffffff'), 0.45);
      hemi.groundColor.set(region >= 3 ? '#2a4a50' : '#22392f');
      hemi.intensity += ((night ? 0.85 : dusk ? 1.5 : 1.9) - hemi.intensity) * blend;
      fill.intensity = night ? 0.45 : 0.9;
      const rangeLight = night ? 0.3 : dusk ? 0.62 : 0.92;
      // Far out on the Open Blue there is no land in sight.
      for (const r of ranges) r.mesh.visible = titleMode || region !== 5;
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
      {
        const cyc = conditions.cycle ?? 0.3,
          outdoor = skyAt(cyc, Math.min(state.region, 5), skyColors),
          da = (cyc / 0.64) * Math.PI;
        windowUniforms.top.value.copy(outdoor[0]);
        windowUniforms.bottom.value.copy(outdoor[1]);
        windowUniforms.sunDir.value.set(Math.cos(da), cyc < 0.64 ? Math.sin(da) : -1, 0);
        windowUniforms.night.value = conditions.phase === 'night' ? 1 : conditions.phase === 'dusk' ? 0.4 : 0;
        windowUniforms.time.value = clock;
      }
      // Tank light falls from above through the water surface.
      aimShadow(0, 1.5, 0, 6.5, 22);
      sun.position.set(-4, 20, 5);
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
      const shadows = state.quality !== 'battery';
      if (renderer.shadowMap.enabled !== shadows) {
        renderer.shadowMap.enabled = shadows;
        scene.traverse(o => {
          if (o.material) for (const m of [o.material].flat()) m.needsUpdate = true;
        });
      }
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
      heldFish = shade(createFish(SPECIES.find(f => f.id === fish.id)));
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
