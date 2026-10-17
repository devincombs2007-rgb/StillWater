import * as T from './assets/three.module.js';
import {surfaceTexture} from './textures.js?v=7';
import {APPAREL} from './economy.js?v=7';
import {lathe, displace, tube, consolidate} from './models.js?v=7';
export const SKINS = ['#edc7a6', '#d3a37e', '#b17f5c', '#875e45', '#624735'],
  HAIRS = ['#302b29', '#65503b', '#a58455', '#352b32'];
const V = (x, y, z) => new T.Vector3(x, y, z);
// Stylised but anatomically ordered angler: shaped torso and limbs, a face that blinks,
// three hairstyles, two hats, framed glasses, jointed arms with curled fingers, and a
// tapered rod with a working spinning reel. Built facing +z with feet at y = 0.
export function createAngler(parent, state) {
  const g = new T.Group();
  g.name = 'Angler';
  g.position.set(0, 0.3, 8.8);
  g.rotation.y = Math.PI;
  parent.add(g);
  const std = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: 0.75, ...extra});
  const skin = std(SKINS[state.character?.skin || 0], {roughness: 0.6}),
    hairMat = std(HAIRS[state.character?.hair || 0], {roughness: 0.7}),
    cloth = std('#c6bda3', {roughness: 0.9, map: surfaceTexture('cloth')}),
    pants = std('#667d79', {roughness: 0.9, map: surfaceTexture('cloth')}),
    shoes = std('#66594b', {roughness: 0.7}),
    sole = std('#33302b', {roughness: 0.9}),
    leather = std('#5a4334', {roughness: 0.55}),
    brass = std('#c9a86a', {metalness: 0.7, roughness: 0.3}),
    eyeWhite = std('#f4efe6', {roughness: 0.25}),
    iris = std('#4c6b6e', {roughness: 0.2}),
    pupil = std('#141a1c', {roughness: 0.1}),
    lips = std('#b0766a', {roughness: 0.5}),
    button = std('#e6dcc4', {roughness: 0.4}),
    hatMat = std('#bfa27a', {roughness: 0.8, map: surfaceTexture('cloth')});
  function add(geo, mat, p = [0, 0, 0], s = [1, 1, 1], par = g, r = [0, 0, 0]) {
    const m = new T.Mesh(geo, mat);
    m.position.set(...p);
    m.scale.set(...(Array.isArray(s) ? s : [s, s, s]));
    m.rotation.set(...r);
    par.add(m);
    return m;
  }
  const sphere = new T.SphereGeometry(1, 24, 16);

  // --- Legs, trousers and boots -------------------------------------------------------
  for (const x of [-0.13, 0.13]) {
    const sx = Math.sign(x);
    add(tube([V(x, 1.02, 0), V(x + sx * 0.02, 0.78, 0.02), V(x + sx * 0.025, 0.55, 0.035)], u => 0.125 - u * 0.025, 14), pants);
    add(tube([V(x + sx * 0.025, 0.55, 0.035), V(x + sx * 0.022, 0.34, 0.01), V(x + sx * 0.02, 0.17, 0)], u => 0.098 - u * 0.018, 14), pants);
    add(new T.TorusGeometry(0.083, 0.018, 8, 20), pants, [x + sx * 0.02, 0.17, 0], 1, g, [Math.PI / 2, 0, 0]);
    // Boot: a rounded toe box over a flat sole, with laces.
    const boot = new T.SphereGeometry(1, 20, 14);
    const bp = boot.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      let y = bp.getY(i);
      if (y < 0) y *= 0.25;
      bp.setY(i, y);
      if (bp.getZ(i) < 0) bp.setZ(i, bp.getZ(i) * 0.75);
    }
    boot.computeVertexNormals();
    add(boot, shoes, [x + sx * 0.02, 0.07, 0.07], [0.105, 0.1, 0.19]);
    add(new T.CylinderGeometry(0.085, 0.092, 0.16, 16), shoes, [x + sx * 0.02, 0.15, 0.0]);
    add(new T.BoxGeometry(0.2, 0.035, 0.36), sole, [x + sx * 0.02, 0.018, 0.06]);
    for (let k = 0; k < 3; k++) add(new T.BoxGeometry(0.07, 0.008, 0.012), button, [x + sx * 0.02, 0.14 - k * 0.025, 0.105 + k * 0.02], 1, g, [-0.5, 0, 0]);
  }

  // --- Torso, belt and shirt details -----------------------------------------------------
  add(lathe([[0.2, 0.92], [0.235, 0.98], [0.245, 1.08]], 22, 1.1, 0.72), pants);
  const torso = add(
    lathe(
      [[0.235, 1.0], [0.248, 1.1], [0.24, 1.24], [0.252, 1.42], [0.285, 1.6], [0.272, 1.72], [0.2, 1.79], [0.09, 1.83], [0.02, 1.84]],
      26,
      1.13,
      0.7,
    ),
    cloth,
  );
  torso.name = 'Torso';
  torso.userData.dynamic = true;
  add(new T.TorusGeometry(0.246, 0.022, 8, 32), leather, [0, 1.03, 0], [1.12, 0.7, 1], g, [Math.PI / 2, 0, 0]);
  add(new T.BoxGeometry(0.08, 0.06, 0.02), brass, [0, 1.03, 0.178]);
  for (let i = 0; i < 4; i++) add(sphere, button, [0, 1.2 + i * 0.13, 0.177 + i * 0.006], [0.011, 0.011, 0.006]);
  add(new T.BoxGeometry(0.11, 0.1, 0.012), cloth, [0.11, 1.52, 0.188], 1, g, [-0.1, 0.25, 0]);
  add(new T.BoxGeometry(0.11, 0.025, 0.014), cloth, [0.11, 1.575, 0.19], 1, g, [-0.1, 0.25, 0]);
  // Collar: two folded wings.
  for (const sx of [-1, 1])
    add(new T.BoxGeometry(0.1, 0.07, 0.018), cloth, [sx * 0.065, 1.77, 0.12], 1, g, [-0.5, sx * 0.45, sx * 0.5]);
  // Jacket (tier 1) and long coat (tier 2) layers.
  const jacket = new T.Group(),
    coat = new T.Group();
  g.add(jacket, coat);
  add(lathe([[0.25, 0.98], [0.262, 1.1], [0.258, 1.3]], 22, 1.13, 0.73), cloth, [0, 0, 0], 1, jacket);
  add(new T.BoxGeometry(0.012, 0.75, 0.01), brass, [0, 1.38, 0.19], 1, jacket);
  add(lathe([[0.12, 1.86], [0.15, 1.8], [0.19, 1.76]], 20, 1.1, 0.8), cloth, [0, 0, 0], 1, jacket);
  add(lathe([[0.31, 0.72], [0.27, 0.9], [0.255, 1.08], [0.262, 1.3]], 24, 1.12, 0.74), cloth, [0, 0, 0], 1, coat);
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) add(sphere, brass, [sx * 0.07, 1.15 + i * 0.16, 0.19], 0.014, coat);

  // --- Neck and head (one group so the head can tilt and look) ----------------------
  add(new T.CylinderGeometry(0.068, 0.078, 0.2, 16), skin, [0, 1.88, 0.0]);
  const head = new T.Group();
  head.position.set(0, 2.14, 0.01);
  g.add(head);
  const skull = new T.SphereGeometry(1, 36, 28),
    sp = skull.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    let x = sp.getX(i),
      y = sp.getY(i),
      z = sp.getZ(i);
    if (y < 0) {
      // Narrower jaw and a soft chin that comes slightly forward.
      x *= 1 - 0.22 * -y;
      z *= 1 - 0.1 * -y;
      if (z > 0) z += 0.06 * Math.max(0, -y - 0.5) * z;
    }
    if (z < 0 && y > -0.3) z *= 1.08; // fuller back of the head
    if (z > 0.3 && Math.abs(x) > 0.45 && y < 0.2 && y > -0.5) z *= 1.04; // cheeks
    sp.setXYZ(i, x, y, z);
  }
  skull.computeVertexNormals();
  const skullMesh = add(skull, skin, [0, 0, 0], [0.2, 0.235, 0.205], head);
  skullMesh.name = 'Head';
  skullMesh.userData.dynamic = true;
  for (const sx of [-1, 1]) {
    add(sphere, skin, [sx * 0.198, -0.01, -0.015], [0.028, 0.058, 0.042], head, [0, sx * 0.3, 0]);
  }
  const eyes = [],
    lids = [];
  for (const sx of [-1, 1]) {
    const ex = sx * 0.074;
    add(sphere, eyeWhite, [ex, 0.025, 0.168], [0.04, 0.045, 0.026], head);
    const ir = add(sphere, iris, [ex, 0.022, 0.188], [0.022, 0.025, 0.008], head);
    add(sphere, pupil, [ex, 0.022, 0.194], [0.011, 0.013, 0.004], head);
    add(sphere, eyeWhite, [ex + 0.008, 0.032, 0.197], [0.005, 0.006, 0.002], head);
    eyes.push(ir);
    const lid = add(new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin, [ex, 0.03, 0.166], [0.044, 0.03, 0.03], head, [0.3, 0, 0]);
    lid.userData.dynamic = true;
    lids.push(lid);
    add(tube([V(ex - 0.035, 0.083, 0.17), V(ex, 0.095, 0.182), V(ex + 0.035, 0.085, 0.172)], 0.0075, 6), hairMat, [0, 0, 0], 1, head);
  }
  add(sphere, skin, [0, -0.03, 0.198], [0.021, 0.034, 0.028], head);
  add(tube([V(-0.036, -0.1, 0.178), V(0, -0.112, 0.19), V(0.036, -0.1, 0.178)], 0.0065, 6), lips, [0, 0, 0], 1, head);

  // --- Hair: soft waves, classic side part, close cut ----------------------------------
  const capGeo = (seed, wave) => {
    const c = new T.SphereGeometry(1, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.46);
    displace(c, wave, 4, seed, 3);
    c.scale(1 + wave, 1 + wave, 1 + wave);
    return c;
  };
  const styles = [new T.Group(), new T.Group(), new T.Group()];
  styles.forEach(s => head.add(s));
  add(capGeo(3, 0.05), hairMat, [0, 0.03, -0.02], [0.226, 0.252, 0.236], styles[0], [-0.5, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const x = -0.15 + i * 0.05,
      lock = displace(new T.SphereGeometry(1, 12, 9), 0.18, 3, i + 1, 2);
    add(lock, hairMat, [x, 0.19 - Math.abs(x) * 0.3, 0.13 - Math.abs(x) * 0.3], [0.05, 0.04, 0.055], styles[0], [0.4, 0, -x * 2]);
  }
  for (const sx of [-1, 1]) add(displace(new T.SphereGeometry(1, 12, 9), 0.15, 3, 9 + sx, 2), hairMat, [sx * 0.185, 0.03, -0.04], [0.04, 0.09, 0.07], styles[0]);
  add(capGeo(7, 0.025), hairMat, [0, 0.03, -0.02], [0.224, 0.25, 0.234], styles[1], [-0.52, 0, 0]);
  add(displace(new T.SphereGeometry(1, 20, 12), 0.08, 2.5, 5, 2), hairMat, [0.035, 0.175, 0.075], [0.15, 0.058, 0.13], styles[1], [0.45, 0.2, -0.18]);
  for (const sx of [-1, 1]) add(sphere, hairMat, [sx * 0.183, 0.02, -0.035], [0.03, 0.085, 0.07], styles[1]);
  add(capGeo(11, 0.008), hairMat, [0, 0.015, -0.015], [0.219, 0.246, 0.229], styles[2], [-0.58, 0, 0]);

  // --- Hats: riverside cap, mariner bucket hat ------------------------------------------
  const hats = {hat1: new T.Group(), hat2: new T.Group()};
  for (const h of Object.values(hats)) head.add(h);
  add(new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, [0, 0.085, -0.012], [0.252, 0.215, 0.262], hats.hat1, [-0.12, 0, 0]);
  add(new T.CylinderGeometry(0.17, 0.2, 0.012, 24, 1, false, -Math.PI * 0.5, Math.PI), hatMat, [0, 0.088, 0.19], [1.05, 1, 0.85], hats.hat1, [0.2, 0, 0]);
  add(sphere, hatMat, [0, 0.25, -0.035], 0.02, hats.hat1);
  add(lathe([[0.245, 0.0], [0.245, 0.08], [0.22, 0.15], [0.15, 0.19], [0.001, 0.2]], 28), hatMat, [0, 0.1, -0.015], 1, hats.hat2, [-0.08, 0, 0]);
  add(lathe([[0.244, 0.0], [0.29, -0.025], [0.33, -0.065], [0.334, -0.072], [0.29, -0.033], [0.244, -0.008]], 32), hatMat, [0, 0.105, -0.015], 1, hats.hat2, [-0.08, 0, 0]);
  add(new T.TorusGeometry(0.247, 0.012, 6, 32), leather, [0, 0.12, -0.015], 1, hats.hat2, [Math.PI / 2 - 0.08, 0, 0]);

  // --- Glasses -------------------------------------------------------------------------
  const glasses = new T.Group();
  head.add(glasses);
  const frame = std('#2b3436', {metalness: 0.4, roughness: 0.3}),
    lens = new T.MeshStandardMaterial({color: '#1d3640', metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.78});
  for (const sx of [-1, 1]) {
    add(new T.TorusGeometry(0.047, 0.006, 6, 24), frame, [sx * 0.076, 0.022, 0.205], [1, 0.78, 1], glasses);
    add(new T.CircleGeometry(0.046, 24), lens, [sx * 0.076, 0.022, 0.204], [1, 0.78, 1], glasses);
    add(new T.BoxGeometry(0.006, 0.006, 0.2), frame, [sx * 0.19, 0.035, 0.1], 1, glasses, [0, sx * -0.08, 0]);
  }
  add(new T.TorusGeometry(0.018, 0.005, 5, 12, Math.PI), frame, [0, 0.03, 0.21], 1, glasses);

  // --- Arms and hands -------------------------------------------------------------------
  const arms = [];
  for (const side of [-1, 1]) {
    const upper = add(new T.CylinderGeometry(0.066, 0.086, 1, 16), cloth),
      fore = add(new T.CylinderGeometry(0.044, 0.06, 1, 14), skin),
      shoulder = add(sphere, cloth, [0, 0, 0], 0.092),
      elbow = add(new T.TorusGeometry(0.066, 0.022, 8, 18), cloth),
      hand = new T.Group();
    hand.name = side === -1 ? 'Reeling hand' : 'Rod hand';
    g.add(hand);
    // Palm, four curled fingers wrapped round a grip on local +z, and a thumb across.
    add(sphere, skin, [0, -0.01, 0], [0.048, 0.06, 0.03], hand);
    for (let i = 0; i < 4; i++) {
      const x = -0.033 + i * 0.022,
        len = i === 0 || i === 3 ? 0.85 : 1;
      add(tube([V(x, -0.055, 0.01), V(x, -0.085 * len, 0.03), V(x, -0.078 * len, 0.06), V(x, -0.055, 0.07)], 0.0125, 7), skin, [0, 0, 0], 1, hand);
    }
    add(tube([V(side * 0.04, -0.02, 0.02), V(side * 0.05, -0.04, 0.055), V(side * 0.02, -0.05, 0.075)], 0.013, 7), skin, [0, 0, 0], 1, hand);
    for (const m of [upper, fore, shoulder, elbow]) m.userData.dynamic = true;
    arms.push({side, upper, fore, hand, shoulder, elbow});
  }

  // --- Rod: tapered blank, guides, cork grip, reel seat and a spinning reel --------------
  const rod = new T.Group();
  rod.name = 'Bending rod';
  g.add(rod);
  const blank = std('#5d6b5e', {metalness: 0.25, roughness: 0.35, map: surfaceTexture('metal')}),
    wrap = std('#8c3f32', {roughness: 0.5}),
    chrome = std('#d4d7cf', {metalness: 0.9, roughness: 0.18}),
    cork = std('#b4956f', {map: surfaceTexture('cork'), roughness: 0.95}),
    reelBody = std('#2f3a38', {metalness: 0.5, roughness: 0.35}),
    lineColor = std('#e9e3c2', {roughness: 0.6});
  const rodSegments = Array.from({length: 14}, (_, i) => {
    const r0 = 0.017 - i * 0.00085,
      r1 = 0.017 - (i + 1) * 0.00085;
    const m = new T.Mesh(new T.CylinderGeometry(r1, r0, 1, 10), blank);
    m.userData.dynamic = true;
    rod.add(m);
    return m;
  });
  const guides = Array.from({length: 7}, (_, i) => {
    const gg = new T.Group(),
      ringR = 0.03 - i * 0.0033;
    add(new T.TorusGeometry(ringR, 0.004, 6, 16), chrome, [0, 0, ringR + 0.012], 1, gg, [0, Math.PI / 2, 0]);
    add(new T.CylinderGeometry(0.003, 0.003, ringR + 0.012, 5), chrome, [0, 0, (ringR + 0.012) / 2], 1, gg, [Math.PI / 2, 0, 0]);
    add(new T.CylinderGeometry(0.0185 - i * 0.0011, 0.0185 - i * 0.0011, 0.03, 10), wrap, [0, 0, 0], 1, gg);
    rod.add(gg);
    return gg;
  });
  const grip = new T.Group();
  rod.add(grip);
  add(lathe([[0.02, -0.25], [0.03, -0.24], [0.034, -0.15], [0.03, -0.04], [0.026, 0.02], [0.022, 0.03]], 18), cork, [0, 0, 0], 1, grip);
  add(new T.CylinderGeometry(0.027, 0.027, 0.11, 16), chrome, [0, 0.085, 0], 1, grip);
  add(lathe([[0.022, 0.14], [0.03, 0.16], [0.032, 0.24], [0.02, 0.27]], 16), cork, [0, 0, 0], 1, grip);
  add(new T.CylinderGeometry(0.031, 0.025, 0.04, 16), sole, [0, -0.27, 0], 1, grip);
  const reel = new T.Group();
  grip.add(reel);
  reel.position.set(0, 0.085, 0);
  add(new T.BoxGeometry(0.018, 0.02, 0.09), chrome, [0, 0, -0.03], 1, reel);
  add(new T.CylinderGeometry(0.01, 0.012, 0.09, 8), reelBody, [0, 0, -0.08], 1, reel, [Math.PI / 2, 0, 0]);
  const reelHousing = new T.Group();
  reelHousing.position.set(0, 0.0, -0.14);
  reel.add(reelHousing);
  add(lathe([[0.001, -0.07], [0.035, -0.06], [0.045, -0.02], [0.042, 0.02], [0.03, 0.04]], 20), reelBody, [0, 0, 0], 1, reelHousing);
  add(lathe([[0.04, 0.04], [0.04, 0.05], [0.032, 0.055], [0.032, 0.11], [0.042, 0.115], [0.04, 0.125], [0.001, 0.125]], 22), chrome, [0, 0, 0], 1, reelHousing);
  add(new T.CylinderGeometry(0.034, 0.034, 0.05, 22), lineColor, [0, 0.083, 0], 1, reelHousing);
  add(new T.TorusGeometry(0.048, 0.0035, 5, 22, Math.PI), chrome, [0, 0.09, 0], 1, reelHousing, [0, 0, Math.PI / 2]);
  const crankArm = add(new T.CylinderGeometry(0.006, 0.006, 1, 6), reelBody),
    knob = add(new T.CapsuleGeometry(0.014, 0.03, 4, 10), cork);
  crankArm.userData.dynamic = knob.userData.dynamic = true;
  reelHousing.rotation.set(-Math.PI / 2, 0, 0);

  let rodTip = new T.Vector3(),
    hangAnchor = new T.Vector3(),
    reelPhase = 0,
    pose = 0,
    firstBlend = 0,
    lastMode = 'idle',
    modeTime = 0,
    chargeBlend = 0,
    lastCharge = 0,
    blinkAt = 2,
    look = 0;
  const up = V(0, 1, 0),
    tmp = V(0, 0, 0),
    reelSide = V(0, 0, 0);
  function segment(m, a, b, r = 1) {
    const delta = tmp.copy(b).sub(a),
      len = delta.length() || 1e-4;
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, delta.multiplyScalar(1 / len));
    m.scale.set(r, len, r);
  }
  function refresh(character = state.character) {
    skin.color.set(SKINS[character?.skin || 0]);
    hairMat.color.set(HAIRS[character?.hair || 0]);
    const shirt = state.outfit.shirt;
    cloth.color.set(APPAREL.find(a => a.id === shirt)?.color || '#c6bda3');
    pants.color.set(APPAREL.find(a => a.id === state.outfit.pants)?.color || '#667d79');
    shoes.color.set(APPAREL.find(a => a.id === state.outfit.shoes)?.color || '#66594b');
    jacket.visible = shirt === 'shirt1' || shirt === 'shirt2';
    coat.visible = shirt === 'shirt2';
    const hatId = state.outfit.hat;
    for (const [id, h] of Object.entries(hats)) h.visible = id === hatId;
    hatMat.color.set(APPAREL.find(a => a.id === hatId)?.color || '#bfa27a');
    glasses.visible = state.outfit.glasses !== 'glasses0';
    const style = character?.style || 0;
    styles.forEach((s, i) => (s.visible = i === style));
  }
  function update(dt, t, mode, tension = 0, pull = 0, charge = 0) {
    if (mode !== lastMode) {
      lastMode = mode;
      modeTime = 0;
    } else modeTime += dt;
    if (mode === 'charging') lastCharge = charge;
    chargeBlend +=
      ((mode === 'charging' ? charge : mode === 'waiting' ? lastCharge * (1 - Math.min(1, modeTime / 0.55)) : 0) -
        chargeBlend) *
      (1 - Math.exp(-dt * 14));
    const held = ['catch', 'landing'].includes(mode);
    firstBlend +=
      ((state.cameraMode === 'first' && !held && mode !== 'create' && mode !== 'title' ? 1 : 0) - firstBlend) *
      (1 - Math.exp(-dt * 5));
    pose += (Number(held) - pose) * (1 - Math.exp(-dt * 5));
    if (mode === 'reeling' || mode === 'landing') reelPhase += dt * (mode === 'landing' ? 18 : 9);
    const breathe = Math.sin(t * 1.7) * 0.01;
    // First person brings both hands up in front of the chest, just below the eye line.
    const left = V(
        0.4 - firstBlend * 0.2,
        1.57 + pose * 0.9 + breathe + firstBlend * 0.58,
        0.46 - pose * 0.05 + firstBlend * 0.59,
      ),
      right = V(
        -0.05 + firstBlend * 0.05,
        1.43 + pose * 0.52 + Math.sin(reelPhase) * 0.075 + firstBlend * 0.67,
        0.47 + Math.cos(reelPhase) * 0.08 + firstBlend * 0.53,
      );
    left.y += chargeBlend * 0.26;
    left.z -= chargeBlend * 0.7;
    right.y += chargeBlend * 0.18;
    right.z -= chargeBlend * 0.66;
    torso.scale.set(1, 1 + breathe * 0.6, 1 + breathe * 1.5);
    const hands = [right, left];
    for (let i = 0; i < 2; i++) {
      const a = arms[i],
        shoulder = V(a.side * 0.33, 1.7, 0),
        hand = hands[i],
        elbow = shoulder
          .clone()
          .lerp(hand, 0.5)
          .add(V(a.side * 0.1, -0.16, -0.02));
      segment(a.upper, shoulder, elbow);
      segment(a.fore, elbow, hand);
      a.shoulder.position.copy(shoulder);
      a.elbow.position.copy(elbow);
      a.elbow.quaternion.copy(a.fore.quaternion).multiply(new T.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
      // The upper arm passes right by the first-person camera: only the forearm is shown.
      a.upper.visible = a.shoulder.visible = a.elbow.visible = firstBlend < 0.5;
      a.hand.position.copy(hand);
      a.hand.quaternion.copy(a.fore.quaternion);
      a.hand.rotateX(-0.25);
    }
    const base = left.clone().add(V(0, -0.15, 0)),
      end = left.clone().add(V(0, 1.8 - pose * 0.4, 1.7 - pose * 1.2));
    const releasePhase = Math.min(1, modeTime / 0.55);
    const castSwing =
      mode === 'charging'
        ? -chargeBlend * 2.3
        : mode === 'waiting'
          ? -chargeBlend * 2.3 + Math.sin(releasePhase * Math.PI) * 0.45
          : 0;
    end.z += castSwing;
    end.y -= tension * 0.85 + pull * 0.16;
    const points = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const p = base.clone().lerp(end, u);
      // Progressive action: the tip bends far more than the butt.
      const bend = Math.pow(u, 1.6);
      p.z += bend * tension * 0.55;
      p.y -= bend * tension * 0.42;
      points.push(p);
    }
    for (let i = 0; i < 14; i++) segment(rodSegments[i], points[i], points[i + 1]);
    for (let i = 0; i < guides.length; i++) {
      guides[i].position.copy(points[(i + 1) * 2]);
      guides[i].quaternion.copy(rodSegments[Math.min(13, (i + 1) * 2 - 1)].quaternion);
    }
    grip.position.copy(base).lerp(left, 0.55);
    grip.quaternion.copy(rodSegments[0].quaternion);
    // The crank arm runs from the reel side to the reeling hand, so the hand visibly turns it.
    g.updateMatrixWorld(true);
    reelSide.set(0.045, 0.06, -0.14);
    reel.localToWorld(reelSide);
    g.worldToLocal(reelSide);
    const knobAt = right.clone().add(V(0, -0.05, 0.03)),
      arm = knobAt.clone().sub(reelSide);
    if (arm.length() > 0.14) knobAt.copy(reelSide).addScaledVector(arm.normalize(), 0.14);
    segment(crankArm, reelSide, knobAt);
    knob.position.copy(knobAt);
    // Head: glance down at the float while it is out, look up at a landed fish, and blink.
    const lookTarget = held ? -0.35 : ['waiting', 'bite', 'reeling'].includes(mode) ? 0.22 : 0.05;
    look += (lookTarget - look) * (1 - Math.exp(-dt * 3));
    head.rotation.set(look + Math.sin(t * 0.6) * 0.02, Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.5) * 0.015);
    blinkAt -= dt;
    const closed = blinkAt < 0.12 && blinkAt > 0 ? 1 : 0;
    if (blinkAt <= 0) blinkAt = 2.5 + Math.random() * 3.5;
    for (const lid of lids) {
      lid.scale.y = 0.03 + closed * 0.022;
      lid.rotation.x = 0.3 - closed * 0.9;
    }
    g.updateMatrixWorld(true);
    rodTip.copy(points.at(-1));
    g.localToWorld(rodTip);
    hangAnchor.set(-0.48, 3.04, 0.85);
    g.localToWorld(hangAnchor);
  }
  // Everything else is rigid relative to its parent: merge it to keep draw calls (and the
  // shadow pass) cheap.
  g.traverse(o => {
    if (o.isMesh) o.castShadow = true;
  });
  consolidate(g);
  refresh();
  update(0.02, 0, 'idle');
  return {
    group: g,
    update,
    refresh,
    get tip() {
      return rodTip;
    },
    get hang() {
      return hangAnchor;
    },
    setOcean(on) {
      g.position.y = on ? 0.72 : 0.3;
    },
    dispose() {
      g.traverse(o => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      parent.remove(g);
    },
  };
}
