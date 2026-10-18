import * as T from './assets/three.module.js';
import {surfaceTexture} from './textures.js?v=8';
import {APPAREL} from './economy.js?v=8';
import {lathe, displace, tube, consolidate, loft} from './models.js?v=8';
export const SKINS = ['#edc7a6', '#d3a37e', '#b17f5c', '#875e45', '#624735'],
  HAIRS = ['#302b29', '#65503b', '#a58455', '#352b32'],
  EYES = ['#5a3d2b', '#7a6a3a', '#4f7a4e', '#4c6f8e', '#6d7a80'],
  HAIR_STYLES = ['Soft waves', 'Classic', 'Close cut', 'Long', 'Ponytail', 'Bun'],
  FACIAL_HAIR = ['Clean', 'Stubble', 'Moustache', 'Beard'];
const V = (x, y, z) => new T.Vector3(x, y, z);
const ease = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)),
  easeOut = u => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(1 - u, 3));
// Body proportions follow a real adult (about 7.2 heads tall): legs to 1.1, shoulders at
// 1.95, chin 2.08, crown 2.42. Built facing +z with feet at y = 0.
const SHOULDER_Y = 1.95,
  SHOULDER_X = 0.25,
  UPPER_ARM = 0.45,
  FOREARM = 0.42,
  ROD_LENGTH = 2.47,
  BUTT = 0.32;
// Where the rod hand closes on the rod (hand space): the grip runs along local x.
const GRIP_OFFSET = V(0, -0.105, 0.04),
  WRIST = V(0, 0.03, 0);
export function createAngler(parent, state) {
  const g = new T.Group();
  g.name = 'Angler';
  g.position.set(0, 0.3, 8.8);
  g.rotation.y = Math.PI;
  parent.add(g);
  const std = (color, extra = {}) => new T.MeshStandardMaterial({color, roughness: 0.75, ...extra});
  const skin = std(SKINS[state.character?.skin || 0], {roughness: 0.55}),
    hairMat = std(HAIRS[state.character?.hair || 0], {roughness: 0.62}),
    cloth = std('#c6bda3', {roughness: 0.9, map: surfaceTexture('cloth')}),
    pants = std('#667d79', {roughness: 0.9, map: surfaceTexture('cloth')}),
    shoes = std('#66594b', {roughness: 0.65}),
    sole = std('#33302b', {roughness: 0.9}),
    leather = std('#5a4334', {roughness: 0.55}),
    brass = std('#c9a86a', {metalness: 0.7, roughness: 0.3}),
    eyeWhite = std('#f4efe6', {roughness: 0.2}),
    iris = std(EYES[state.character?.eyes || 0], {roughness: 0.15}),
    pupil = std('#121618', {roughness: 0.08}),
    lips = std('#b0766a', {roughness: 0.45}),
    lash = std('#1d1a18', {roughness: 0.8}),
    button = std('#e6dcc4', {roughness: 0.4}),
    hatMat = std('#bfa27a', {roughness: 0.8, map: surfaceTexture('cloth')}),
    stubbleMat = new T.MeshStandardMaterial({color: HAIRS[state.character?.hair || 0], roughness: 1, transparent: true, opacity: 0.32, depthWrite: false});
  function add(geo, mat, p = [0, 0, 0], s = [1, 1, 1], par = g, r = [0, 0, 0]) {
    const m = new T.Mesh(geo, mat);
    m.position.set(...p);
    m.scale.set(...(Array.isArray(s) ? s : [s, s, s]));
    m.rotation.set(...r);
    par.add(m);
    return m;
  }
  const sphere = new T.SphereGeometry(1, 24, 16);

  // --- Legs, trousers and boots ---------------------------------------------------------
  for (const sx of [-1, 1]) {
    const x = sx * 0.108;
    // Thigh, knee and calf as one shaped loft; slightly toed-in like a relaxed stance.
    add(
      loft(
        [
          [0.14, 0.046, 0.05, 0.0, x + sx * 0.008],
          [0.26, 0.054, 0.058, -0.004, x + sx * 0.008],
          [0.42, 0.067, 0.074, -0.012, x + sx * 0.006],
          [0.56, 0.062, 0.066, 0.012, x + sx * 0.004],
          [0.64, 0.066, 0.07, 0.018, x + sx * 0.002],
          [0.8, 0.08, 0.085, 0.01, x],
          [0.98, 0.096, 0.1, 0.0, x - sx * 0.004],
          [1.14, 0.108, 0.112, 0.0, x - sx * 0.01],
        ],
        20,
        2.2,
        false,
        true,
      ),
      pants,
    );
    add(loft([[0.13, 0.056, 0.062, 0.0, x + sx * 0.008], [0.18, 0.053, 0.059, 0.0, x + sx * 0.008]], 18, 2.2, false, true), pants);
    // Boot: shaped upper over a toe box and welted sole, with laces.
    add(
      loft([[0.02, 0.05, 0.11, 0.05], [0.07, 0.056, 0.12, 0.055], [0.11, 0.05, 0.085, 0.03], [0.18, 0.05, 0.055, 0.0], [0.22, 0.052, 0.056, 0.0]], 20, 2.6),
      shoes,
      [x + sx * 0.008, 0, 0],
    );
    add(loft([[0, 0.054, 0.117, 0.05], [0.028, 0.055, 0.118, 0.05]], 20, 2.6), sole, [x + sx * 0.008, 0, 0]);
    for (let k = 0; k < 3; k++) add(new T.BoxGeometry(0.06, 0.007, 0.01), button, [x + sx * 0.008, 0.16 - k * 0.025, 0.06 + k * 0.022], 1, g, [-0.6, 0, 0]);
  }

  // --- Pelvis, torso and shirt ------------------------------------------------------------
  add(loft([[1.03, 0.15, 0.1], [1.1, 0.2, 0.125], [1.16, 0.21, 0.132], [1.25, 0.205, 0.13], [1.3, 0.2, 0.128, 0.003]], 28, 2.4, false, true), pants);
  const torso = add(
    loft(
      [
        [1.27, 0.193, 0.123, 0.003],
        [1.34, 0.19, 0.124, 0.006],
        [1.44, 0.18, 0.12, 0.012],
        [1.58, 0.196, 0.13, 0.018],
        [1.72, 0.214, 0.138, 0.022],
        [1.84, 0.225, 0.132, 0.014],
        [1.92, 0.218, 0.118, 0.0],
        [1.98, 0.15, 0.095, 0.0],
        [2.0, 0.058, 0.055, 0.005],
      ],
      30,
      2.5,
      true,
      false,
    ),
    cloth,
  );
  torso.name = 'Torso';
  torso.userData.dynamic = true;
  add(loft([[1.235, 0.212, 0.139], [1.285, 0.207, 0.135, 0.003]], 28, 2.4, false, false), leather);
  add(new T.BoxGeometry(0.07, 0.05, 0.02), brass, [0, 1.26, 0.141]);
  for (let i = 0; i < 5; i++) add(sphere, button, [0, 1.34 + i * 0.12, 0.138 + Math.min(i, 3) * 0.006], [0.009, 0.009, 0.005]);
  add(new T.BoxGeometry(0.1, 0.09, 0.01), cloth, [0.1, 1.73, 0.158], 1, g, [-0.08, 0.2, 0]);
  add(new T.BoxGeometry(0.1, 0.022, 0.012), cloth, [0.1, 1.78, 0.16], 1, g, [-0.08, 0.2, 0]);
  // Stand collar hugging the neck.
  add(loft([[1.93, 0.088, 0.082, 0.004], [1.99, 0.073, 0.069, 0.007], [2.03, 0.066, 0.063, 0.009]], 22, 2.1, false, false), cloth);
  // Jacket and long coat layers over the shirt for the apparel tiers.
  const jacket = new T.Group(),
    coat = new T.Group();
  g.add(jacket, coat);
  add(loft([[1.18, 0.218, 0.145], [1.44, 0.193, 0.133, 0.012], [1.72, 0.226, 0.15, 0.022], [1.9, 0.232, 0.132]], 30, 2.5, false, false), cloth, [0, 0, 0], 1, jacket);
  add(new T.BoxGeometry(0.01, 0.7, 0.01), brass, [0, 1.55, 0.168], 1, jacket);
  add(loft([[1.94, 0.12, 0.1], [2.04, 0.085, 0.078]], 20, 2.2, false, false), cloth, [0, 0, 0], 1, jacket);
  add(loft([[0.8, 0.25, 0.17], [1.0, 0.225, 0.15], [1.2, 0.215, 0.145], [1.36, 0.2, 0.136, 0.01]], 30, 2.4, false, false), cloth, [0, 0, 0], 1, coat);
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) add(sphere, brass, [sx * 0.06, 1.3 + i * 0.15, 0.16], 0.012, coat);

  // --- Neck and head ---------------------------------------------------------------------
  // The head is sculpted at a 0.2-unit radius and scaled into adult proportion.
  add(loft([[1.96, 0.066, 0.062], [2.06, 0.058, 0.056, 0.005], [2.14, 0.054, 0.052, 0.01]], 18, 2, false, false), skin);
  const head = new T.Group();
  head.position.set(0, 2.25, 0.012);
  head.scale.setScalar(0.74);
  g.add(head);
  const sculpt = (x, y, z) => {
    if (y < 0) {
      // Jaw narrows to a defined chin that sits slightly forward.
      x *= 1 - 0.25 * -y;
      z *= 1 - 0.08 * -y;
      if (z > 0) z += 0.07 * Math.max(0, -y - 0.45) * z;
      if (y < -0.55 && Math.abs(x) > 0.2) y += 0.04;
    }
    if (z < 0 && y > -0.3) z *= 1.1; // fuller occiput
    if (y > 0.25 && z > 0.4) z *= 0.97; // forehead slopes back
    if (z > 0.5 && Math.abs(x) > 0.35 && Math.abs(x) < 0.75 && y > -0.35 && y < 0.15) z *= 1.04; // cheekbones
    if (z > 0.6 && Math.abs(x) < 0.55 && y > 0.05 && y < 0.25) z *= 0.95; // eye sockets
    if (z > 0.5 && y > 0.22 && y < 0.36 && Math.abs(x) < 0.7) z *= 1.03; // brow ridge
    return [x, y, z];
  };
  const skull = new T.SphereGeometry(1, 48, 36),
    sp = skull.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setXYZ(i, ...sculpt(sp.getX(i), sp.getY(i), sp.getZ(i)));
  skull.computeVertexNormals();
  const skullMesh = add(skull, skin, [0, 0, 0], [0.2, 0.235, 0.205], head);
  skullMesh.name = 'Head';
  skullMesh.userData.dynamic = true;
  // Ears: a shell with a curled rim.
  for (const sx of [-1, 1]) {
    add(sphere, skin, [sx * 0.196, -0.01, -0.015], [0.022, 0.058, 0.04], head, [0, sx * 0.35, 0]);
    add(new T.TorusGeometry(0.034, 0.008, 6, 16, Math.PI * 1.4), skin, [sx * 0.205, -0.005, -0.02], [1, 1.5, 1], head, [0, sx * 1.2, -0.8]);
  }
  const lids = [];
  for (const sx of [-1, 1]) {
    const ex = sx * 0.072;
    // Eyeball with the iris and pupil as caps on its surface, so they stay seated from any angle.
    add(sphere, eyeWhite, [ex, 0.03, 0.168], [0.034, 0.034, 0.03], head);
    add(new T.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, 0.52), iris, [ex, 0.029, 0.168], [0.0343, 0.0343, 0.0303], head, [Math.PI / 2, 0, 0]);
    add(new T.SphereGeometry(1, 14, 3, 0, Math.PI * 2, 0, 0.22), pupil, [ex, 0.029, 0.168], [0.0346, 0.0346, 0.0306], head, [Math.PI / 2, 0, 0]);
    add(sphere, eyeWhite, [ex + 0.008 * sx, 0.038, 0.198], [0.004, 0.005, 0.0015], head);
    // Upper lid with lashes (blinks) and a soft lower lid. At rest the lid rim crosses the top
    // of the iris; rotating the group forward brings it down over the eye.
    const lid = new T.Group();
    lid.position.set(ex, 0.03, 0.168);
    head.add(lid);
    add(new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin, [0, 0, 0], [0.037, 0.037, 0.033], lid, [-0.35, 0, 0]);
    const rim = [];
    for (let k = 0; k <= 6; k++) {
      const f = 0.35 + (k / 6) * (Math.PI - 0.7),
        z = Math.sin(f) * 0.034;
      rim.push(V(Math.cos(f) * 0.038, z * Math.sin(0.35) + 0.0025, z * Math.cos(0.35) + 0.002));
    }
    add(tube(rim, u => 0.0022 + Math.sin(u * Math.PI) * 0.0014, 5, false), lash, [0, 0, 0], 1, lid);
    lid.userData.dynamic = true;
    lids.push(lid);
    add(tube([V(ex - 0.03, 0.01, 0.186), V(ex, 0.0, 0.195), V(ex + 0.03, 0.01, 0.186)], 0.0045, 5), skin, [0, 0, 0], 1, head);
    add(tube([V(ex - 0.038, 0.074, 0.178), V(ex - 0.005 * sx, 0.088, 0.19), V(ex + 0.036 * sx, 0.08, 0.18)], u => 0.009 * (1 - u * 0.45), 6), hairMat, [0, 0, 0], 1, head);
  }
  // Nose: bridge, tip and nostril wings.
  add(loft([[0.06, 0.011, 0.01, 0.184], [0.03, 0.015, 0.014, 0.196], [-0.02, 0.021, 0.022, 0.207], [-0.05, 0.025, 0.022, 0.206], [-0.064, 0.016, 0.014, 0.2]], 16, 2.2), skin, [0, 0, 0], 1, head);
  add(sphere, skin, [0, -0.046, 0.214], [0.021, 0.019, 0.019], head);
  for (const sx of [-1, 1]) add(sphere, skin, [sx * 0.021, -0.052, 0.203], [0.014, 0.011, 0.013], head, [0, 0, sx * 0.3]);
  // Lips: fuller centre, philtrum dip, and a slight smile.
  add(tube([V(-0.04, -0.104, 0.18), V(-0.015, -0.098, 0.194), V(0, -0.1, 0.197), V(0.015, -0.098, 0.194), V(0.04, -0.104, 0.18)], u => 0.006 + Math.sin(u * Math.PI) * 0.005, 6), lips, [0, 0, 0], 1, head);
  add(tube([V(-0.034, -0.11, 0.18), V(0, -0.118, 0.193), V(0.034, -0.11, 0.18)], u => 0.005 + Math.sin(u * Math.PI) * 0.006, 6), lips, [0, 0, 0], 1, head);

  // --- Facial hair -------------------------------------------------------------------------
  const lowerFace = (grow, rough) => {
    const geo = new T.SphereGeometry(1, 40, 18, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.56, Math.PI * 0.4),
      p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = sculpt(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, x, y, z);
    }
    if (rough) displace(geo, rough, 9, 4, 2);
    geo.computeVertexNormals();
    return [geo, [0.2 * grow, 0.235 * grow, 0.205 * grow]];
  };
  const facial = [new T.Group(), new T.Group(), new T.Group(), new T.Group()];
  facial.forEach(f => head.add(f));
  {
    const [geo, s] = lowerFace(1.012, 0);
    add(geo, stubbleMat, [0, 0, 0], s, facial[1]);
    add(tube([V(-0.045, -0.085, 0.188), V(0, -0.078, 0.205), V(0.045, -0.085, 0.188)], u => 0.009 + Math.sin(u * Math.PI) * 0.006, 6), hairMat, [0, 0, 0], 1, facial[2]);
    const [beard, bs] = lowerFace(1.06, 0.06);
    add(beard, hairMat, [0, -0.012, 0.004], bs, facial[3]);
    add(tube([V(-0.045, -0.085, 0.19), V(0, -0.078, 0.207), V(0.045, -0.085, 0.19)], u => 0.009 + Math.sin(u * Math.PI) * 0.006, 6), hairMat, [0, 0, 0], 1, facial[3]);
  }

  // --- Hair ------------------------------------------------------------------------------------
  const capGeo = (seed, wave, cover = 0.46) => {
    const c = new T.SphereGeometry(1, 36, 20, 0, Math.PI * 2, 0, Math.PI * cover);
    displace(c, wave, 4, seed, 3);
    c.scale(1 + wave, 1 + wave, 1 + wave);
    return c;
  };
  const styles = HAIR_STYLES.map(() => new T.Group());
  styles.forEach(s => head.add(s));
  // 0 Soft waves
  add(capGeo(3, 0.05), hairMat, [0, 0.03, -0.02], [0.226, 0.252, 0.236], styles[0], [-0.5, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const x = -0.15 + i * 0.05,
      lock = displace(new T.SphereGeometry(1, 12, 9), 0.18, 3, i + 1, 2);
    add(lock, hairMat, [x, 0.19 - Math.abs(x) * 0.3, 0.13 - Math.abs(x) * 0.3], [0.05, 0.04, 0.055], styles[0], [0.4, 0, -x * 2]);
  }
  for (const sx of [-1, 1]) add(displace(new T.SphereGeometry(1, 12, 9), 0.15, 3, 9 + sx, 2), hairMat, [sx * 0.185, 0.03, -0.04], [0.04, 0.09, 0.07], styles[0]);
  // 1 Classic side part
  add(capGeo(7, 0.025), hairMat, [0, 0.03, -0.02], [0.224, 0.25, 0.234], styles[1], [-0.52, 0, 0]);
  add(displace(new T.SphereGeometry(1, 20, 12), 0.08, 2.5, 5, 2), hairMat, [0.035, 0.175, 0.075], [0.15, 0.058, 0.13], styles[1], [0.45, 0.2, -0.18]);
  for (const sx of [-1, 1]) add(sphere, hairMat, [sx * 0.183, 0.02, -0.035], [0.03, 0.085, 0.07], styles[1]);
  // 2 Close cut
  add(capGeo(11, 0.008), hairMat, [0, 0.015, -0.015], [0.219, 0.246, 0.229], styles[2], [-0.58, 0, 0]);
  // 3 Long: cap, fringe and a fall of hair behind the shoulders.
  add(capGeo(13, 0.03), hairMat, [0, 0.03, -0.02], [0.226, 0.252, 0.236], styles[3], [-0.45, 0, 0]);
  {
    const fall = new T.LatheGeometry([V(0.235, 0.14), V(0.245, 0.0), V(0.235, -0.2), V(0.215, -0.42), V(0.19, -0.62), V(0.17, -0.7)], 28, Math.PI * 0.58, Math.PI * 0.84);
    displace(fall, 0.025, 12, 6, 2);
    fall.scale(1, 1, 0.92);
    add(fall, new T.MeshStandardMaterial({color: '#fff', roughness: 0.62, side: T.DoubleSide}), [0, 0, -0.02], 1, styles[3]).userData.hairShell = true;
    for (let i = 0; i < 5; i++) {
      const x = -0.12 + i * 0.06;
      add(displace(new T.SphereGeometry(1, 12, 9), 0.15, 3, 20 + i, 2), hairMat, [x, 0.19 - Math.abs(x) * 0.4, 0.14 - Math.abs(x) * 0.35], [0.055, 0.035, 0.05], styles[3], [0.5, 0, -x * 2.5]);
    }
  }
  // 4 Ponytail: smooth cap, a tie, and a tapering tail.
  add(capGeo(17, 0.012), hairMat, [0, 0.02, -0.02], [0.223, 0.25, 0.232], styles[4], [-0.5, 0, 0]);
  add(new T.TorusGeometry(0.03, 0.012, 6, 14), leather, [0, 0.03, -0.235], 1, styles[4]);
  add(tube([V(0, 0.03, -0.24), V(0, -0.08, -0.29), V(0, -0.28, -0.28), V(0, -0.46, -0.24)], u => 0.045 * (1 - u * 0.7) + 0.008, 10), hairMat, [0, 0, 0], 1, styles[4]);
  // 5 Bun: smooth cap and a gathered knot at the crown.
  add(capGeo(19, 0.012), hairMat, [0, 0.02, -0.02], [0.223, 0.25, 0.232], styles[5], [-0.5, 0, 0]);
  add(displace(new T.SphereGeometry(1, 18, 14), 0.12, 5, 3, 2), hairMat, [0, 0.19, -0.17], [0.085, 0.075, 0.085], styles[5]);
  add(new T.TorusGeometry(0.06, 0.01, 6, 18), leather, [0, 0.15, -0.15], 1, styles[5], [1.1, 0, 0]);

  // --- Hats ----------------------------------------------------------------------------------------
  const hats = {hat1: new T.Group(), hat2: new T.Group()};
  for (const h of Object.values(hats)) head.add(h);
  add(new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, [0, 0.085, -0.012], [0.252, 0.215, 0.262], hats.hat1, [-0.12, 0, 0]);
  add(new T.CylinderGeometry(0.17, 0.2, 0.012, 24, 1, false, -Math.PI * 0.5, Math.PI), hatMat, [0, 0.088, 0.19], [1.05, 1, 0.85], hats.hat1, [0.2, 0, 0]);
  add(sphere, hatMat, [0, 0.25, -0.035], 0.02, hats.hat1);
  add(lathe([[0.245, 0.0], [0.245, 0.08], [0.22, 0.15], [0.15, 0.19], [0.001, 0.2]], 28), hatMat, [0, 0.1, -0.015], 1, hats.hat2, [-0.08, 0, 0]);
  add(lathe([[0.244, 0.0], [0.29, -0.025], [0.33, -0.065], [0.334, -0.072], [0.29, -0.033], [0.244, -0.008]], 32), hatMat, [0, 0.105, -0.015], 1, hats.hat2, [-0.08, 0, 0]);
  add(new T.TorusGeometry(0.247, 0.012, 6, 32), leather, [0, 0.12, -0.015], 1, hats.hat2, [Math.PI / 2 - 0.08, 0, 0]);

  // --- Glasses --------------------------------------------------------------------------------
  const glasses = new T.Group();
  head.add(glasses);
  const frame = std('#2b3436', {metalness: 0.4, roughness: 0.3}),
    lens = new T.MeshStandardMaterial({color: '#1d3640', metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.78});
  for (const sx of [-1, 1]) {
    add(new T.TorusGeometry(0.047, 0.006, 6, 24), frame, [sx * 0.076, 0.026, 0.21], [1, 0.78, 1], glasses);
    add(new T.CircleGeometry(0.046, 24), lens, [sx * 0.076, 0.026, 0.209], [1, 0.78, 1], glasses);
    add(new T.BoxGeometry(0.006, 0.006, 0.2), frame, [sx * 0.19, 0.038, 0.1], 1, glasses, [0, sx * -0.08, 0]);
  }
  add(new T.TorusGeometry(0.018, 0.005, 5, 12, Math.PI), frame, [0, 0.034, 0.215], 1, glasses);

  // --- Arms: shaped upper arm and forearm (unit length, posed by IK), and jointed hands ------
  const upperGeo = lathe([[0.066, 0], [0.074, 0.12], [0.07, 0.42], [0.058, 0.78], [0.05, 1]], 18),
    foreGeo = lathe([[0.05, 0], [0.054, 0.16], [0.046, 0.5], [0.034, 0.92], [0.03, 1]], 16);
  const arms = [];
  for (const side of [-1, 1]) {
    const upper = add(upperGeo, cloth),
      fore = add(foreGeo, skin),
      shoulder = add(sphere, cloth, [0, 0, 0], [0.068, 0.058, 0.066]),
      elbow = add(sphere, cloth, [0, 0, 0], 0.056),
      hand = new T.Group();
    hand.name = side === -1 ? 'Reeling hand' : 'Rod hand';
    g.add(hand);
    // Palm, four three-jointed fingers curling round a grip along local x, and a thumb.
    add(loft([[0.03, 0.026, 0.02], [-0.02, 0.044, 0.022], [-0.07, 0.048, 0.021], [-0.095, 0.045, 0.018]], 16, 2.6), skin, [0, 0, 0], 1, hand);
    const fist = new T.Group(),
      open = new T.Group();
    hand.add(fist, open);
    for (let i = 0; i < 4; i++) {
      const x = -0.033 + i * 0.022,
        len = i === 0 ? 0.82 : i === 3 ? 0.88 : 1;
      // Relaxed open hand: fingers gently curved, for hanging arms, the counter and waving.
      add(tube([V(x, -0.09, 0.006), V(x, -0.09 - 0.035 * len, 0.012), V(x * 1.1, -0.09 - 0.065 * len, 0.024), V(x * 1.15, -0.09 - 0.085 * len, 0.038)], u => 0.0115 - u * 0.0025, 7), skin, [0, 0, 0], 1, open);
    }
    add(tube([V(side * 0.042, -0.025, 0.012), V(side * 0.058, -0.05, 0.03), V(side * 0.064, -0.075, 0.042)], u => 0.0135 - u * 0.003, 7), skin, [0, 0, 0], 1, open);
    for (let i = 0; i < 4; i++) {
      const x = -0.033 + i * 0.022,
        len = i === 0 ? 0.82 : i === 3 ? 0.88 : 1;
      add(tube([V(x, -0.09, 0.006), V(x, -0.118 * len, 0.016), V(x, -0.128 * len, 0.045), V(x, -0.11 * len, 0.072), V(x, -0.085, 0.074)], u => 0.0115 - u * 0.0025, 7), skin, [0, 0, 0], 1, fist);
    }
    add(tube([V(side * 0.042, -0.025, 0.012), V(side * 0.05, -0.055, 0.045), V(side * 0.028, -0.08, 0.072), V(side * 0.01, -0.09, 0.08)], u => 0.0135 - u * 0.003, 7), skin, [0, 0, 0], 1, fist);
    for (const m of [upper, fore, shoulder, elbow]) m.userData.dynamic = true;
    arms.push({side, upper, fore, hand, fist, open, shoulder, elbow, elbowPos: V(0, 0, 0)});
  }

  // --- Rod: tapered blank, guides, cork grip, reel seat and a spinning reel ----------------
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
  // Guides hang under the blank (local +z of each segment frame points down the rod's belly).
  const guides = Array.from({length: 7}, (_, i) => {
    const gg = new T.Group(),
      ringR = 0.03 - i * 0.0033;
    add(new T.TorusGeometry(ringR, 0.004, 6, 16), chrome, [0, 0, ringR + 0.014], 1, gg, [0, Math.PI / 2, 0]);
    add(new T.CylinderGeometry(0.003, 0.003, ringR + 0.014, 5), chrome, [0, 0, (ringR + 0.014) / 2], 1, gg, [Math.PI / 2, 0, 0]);
    add(new T.CylinderGeometry(0.0185 - i * 0.0011, 0.0185 - i * 0.0011, 0.03, 10), wrap, [0, 0, 0], 1, gg);
    rod.add(gg);
    return gg;
  });
  // Grip frame: origin where the rod hand holds it, local +y along the rod toward the tip,
  // local +z below the rod (where the reel hangs), local -x on the reeling-hand side.
  const grip = new T.Group();
  rod.add(grip);
  add(lathe([[0.02, -0.3], [0.03, -0.29], [0.034, -0.18], [0.03, -0.06], [0.026, -0.03], [0.022, -0.02]], 18), cork, [0, 0, 0], 1, grip);
  add(new T.CylinderGeometry(0.026, 0.026, 0.1, 16), chrome, [0, 0.03, 0], 1, grip);
  add(lathe([[0.022, 0.08], [0.03, 0.1], [0.032, 0.2], [0.02, 0.23]], 16), cork, [0, 0, 0], 1, grip);
  add(new T.CylinderGeometry(0.031, 0.025, 0.04, 16), sole, [0, -0.32, 0], 1, grip);
  // Spinning reel: stem down from the seat, body and spool on an axis parallel to the rod.
  const REEL_DROP = 0.11,
    CRANK_SIDE = -0.062,
    CRANK_R = 0.068;
  add(new T.BoxGeometry(0.016, 0.06, 0.012), chrome, [0, 0.03, 0.03], 1, grip);
  add(new T.CylinderGeometry(0.009, 0.011, REEL_DROP - 0.03, 8), reelBody, [0, 0.03, 0.03 + (REEL_DROP - 0.03) / 2], 1, grip, [Math.PI / 2, 0, 0]);
  add(lathe([[0.001, -0.07], [0.035, -0.06], [0.045, -0.02], [0.042, 0.02], [0.03, 0.04]], 20), reelBody, [0, 0.03, REEL_DROP], 1, grip);
  add(lathe([[0.04, 0.04], [0.04, 0.05], [0.032, 0.055], [0.032, 0.11], [0.042, 0.115], [0.04, 0.125], [0.001, 0.125]], 22), chrome, [0, 0.03, REEL_DROP], 1, grip);
  add(new T.CylinderGeometry(0.034, 0.034, 0.05, 22), lineColor, [0, 0.113, REEL_DROP], 1, grip);
  add(new T.TorusGeometry(0.048, 0.0035, 5, 22, Math.PI), chrome, [0, 0.12, REEL_DROP], 1, grip, [Math.PI / 2, 0, 0]);
  add(new T.CylinderGeometry(0.008, 0.008, Math.abs(CRANK_SIDE), 8), reelBody, [CRANK_SIDE / 2, 0.03, REEL_DROP], 1, grip, [0, 0, Math.PI / 2]);
  const crankArm = add(new T.CylinderGeometry(0.0055, 0.0055, 1, 6), reelBody),
    knob = add(new T.CapsuleGeometry(0.013, 0.03, 4, 10), cork);
  crankArm.userData.dynamic = knob.userData.dynamic = true;

  let rodTip = V(0, 0, 0),
    hangAnchor = V(0, 0, 0),
    reelPhase = 0,
    lastMode = 'idle',
    modeTime = 0,
    chargeBlend = 0,
    lastCharge = 0,
    blinkAt = 2,
    look = 0,
    firstBlend = 0,
    elevation = 0.73,
    twoHand = 0,
    lean = 0;
  const gripPos = V(0.27, 1.52, 0.42),
    up = V(0, 1, 0),
    tmp = V(0, 0, 0),
    tmp2 = V(0, 0, 0),
    basis = new T.Matrix4(),
    quat = new T.Quaternion();
  function segment(m, a, b, r = 1) {
    const delta = tmp.copy(b).sub(a),
      len = delta.length() || 1e-4;
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(up, delta.multiplyScalar(1 / len));
    m.scale.set(r, len, r);
  }
  function segmentCentred(m, a, b) {
    const delta = tmp.copy(b).sub(a),
      len = delta.length() || 1e-4;
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, delta.multiplyScalar(1 / len));
    m.scale.set(1, len, 1);
  }
  // Two-bone IK with fixed bone lengths; the elbow bends toward the pole direction.
  function solveArm(shoulder, wrist, pole, out) {
    const toW = tmp2.copy(wrist).sub(shoulder);
    let d = toW.length();
    const reach = UPPER_ARM + FOREARM - 1e-3;
    if (d > reach) {
      wrist.copy(shoulder).addScaledVector(toW.normalize(), reach);
      toW.copy(wrist).sub(shoulder);
      d = reach;
    }
    d = Math.max(d, Math.abs(UPPER_ARM - FOREARM) + 1e-3);
    const dir = toW.normalize(),
      along = (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - along * along)),
      bend = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0);
    bend.normalize();
    return out.copy(shoulder).addScaledVector(dir, along).addScaledVector(bend, h);
  }
  // Orient a hand so its grip (local x) lies along `axis` and its back of hand faces the elbow.
  function handFrame(axis, towardElbow) {
    const x = axis.clone().normalize(),
      y = towardElbow.clone().addScaledVector(x, -towardElbow.dot(x));
    if (y.lengthSq() < 1e-6) y.set(0, 1, 0);
    y.normalize();
    const z = new T.Vector3().crossVectors(x, y);
    basis.makeBasis(x, y, z);
    return quat.setFromRotationMatrix(basis).clone();
  }
  // Place an arm so its hand holds `gripPoint` with the grip running along `axis`.
  function poseArm(a, gripPoint, axis, pole) {
    // The rod-side shoulder rocks back on the back-cast and drives forward on the stroke.
    const shoulder = V(a.side * SHOULDER_X, SHOULDER_Y - Math.abs(lean) * 0.01, lean * (a.side > 0 ? 0.06 : 0.035));
    let q = handFrame(axis, shoulder.clone().sub(gripPoint));
    for (let k = 0; k < 2; k++) {
      const handPos = gripPoint.clone().sub(GRIP_OFFSET.clone().applyQuaternion(q)),
        wrist = handPos.clone().add(WRIST.clone().applyQuaternion(q));
      solveArm(shoulder, wrist, pole, a.elbowPos);
      q = handFrame(axis, a.elbowPos.clone().sub(wrist));
      if (k === 1) {
        segment(a.upper, shoulder, a.elbowPos);
        segment(a.fore, a.elbowPos, wrist);
        a.hand.position.copy(handPos);
        a.hand.quaternion.copy(q);
        a.shoulder.position.set(shoulder.x, shoulder.y - 0.012, shoulder.z);
        a.elbow.position.copy(a.elbowPos);
      }
    }
  }
  function refresh(character = state.character) {
    skin.color.set(SKINS[character?.skin || 0]);
    hairMat.color.set(HAIRS[character?.hair || 0]);
    stubbleMat.color.set(HAIRS[character?.hair || 0]);
    iris.color.set(EYES[character?.eyes || 0]);
    for (const s of styles) s.traverse(o => o.userData.hairShell && o.material.color.copy(hairMat.color));
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
    const style = Math.min(HAIR_STYLES.length - 1, character?.style || 0);
    styles.forEach((s, i) => (s.visible = i === style));
    facial.forEach((f, i) => (f.visible = i === (character?.facial || 0)));
  }
  const IDLE_GRIP = V(0.27, 1.52, 0.42),
    BACK_GRIP = V(0.32, 2.18, 0.03),
    STROKE_GRIP = V(0.28, 1.74, 0.6),
    HELD_GRIP = V(0.24, 2.12, 0.45),
    FIRST_GRIP = V(0.1, 1.9, 0.8),
    deg = Math.PI / 180;
  function update(dt, t, mode, tension = 0, pull = 0, charge = 0) {
    if (mode !== lastMode) {
      lastMode = mode;
      modeTime = 0;
    } else modeTime += dt;
    if (mode === 'charging') lastCharge = charge;
    const follow = 1 - Math.exp(-dt * 9);
    chargeBlend += ((mode === 'charging' ? charge : 0) - chargeBlend) * (1 - Math.exp(-dt * 14));
    const held = ['catch', 'landing'].includes(mode),
      keeper = mode === 'keeper' || mode === 'wave',
      relaxed = mode === 'create',
      fp = state.cameraMode === 'first' && !held && !['create', 'title'].includes(mode);
    firstBlend += ((fp ? 1 : 0) - firstBlend) * (1 - Math.exp(-dt * 5));
    if (mode === 'reeling' || mode === 'landing') reelPhase += dt * (mode === 'landing' ? 16 : 8);
    const breathe = Math.sin(t * 1.7) * 0.008;
    torso.scale.set(1, 1 + breathe * 0.5, 1 + breathe * 1.4);

    // --- Rod pose: elevation above horizontal and where the rod hand holds it ---------------
    let targetE = 42 * deg,
      target = IDLE_GRIP.clone(),
      targetTwo = 0,
      snap = false;
    if (mode === 'reeling') targetE = 58 * deg;
    else if (mode === 'bite') targetE = 50 * deg;
    else if (held) {
      targetE = 55 * deg;
      target.copy(HELD_GRIP);
    }
    if (mode === 'charging') {
      // Back-cast: the rod swings up and over the shoulder, both hands on the grip.
      const c = Math.pow(chargeBlend, 0.85);
      targetE = (42 + 78 * c) * deg;
      target.lerpVectors(IDLE_GRIP, BACK_GRIP, c);
      targetTwo = 1;
    } else if (mode === 'waiting' && modeTime < 0.85) {
      // Forward stroke driven by time: a fast whip down past the target, then settle.
      const fromE = (42 + 78 * Math.pow(lastCharge, 0.85)) * deg,
        from = IDLE_GRIP.clone().lerp(BACK_GRIP, Math.pow(lastCharge, 0.85));
      snap = true;
      if (modeTime < 0.28) {
        const u = easeOut(modeTime / 0.28);
        elevation = fromE + (10 * deg - fromE) * u;
        gripPos.lerpVectors(from, STROKE_GRIP, u);
        twoHand = 1;
      } else {
        const u = ease((modeTime - 0.28) / 0.57);
        elevation = 10 * deg + (32 * deg) * u;
        gripPos.lerpVectors(STROKE_GRIP, IDLE_GRIP, u);
        twoHand = 1 - u;
      }
    }
    if (firstBlend > 0.001 && !snap) {
      target.lerp(FIRST_GRIP, firstBlend);
      targetE += (32 * deg - targetE) * firstBlend;
    }
    if (!snap) {
      elevation += (targetE - elevation) * (mode === 'charging' ? 1 - Math.exp(-dt * 20) : follow);
      gripPos.lerp(target, mode === 'charging' ? 1 - Math.exp(-dt * 20) : follow);
      twoHand += (targetTwo - twoHand) * (1 - Math.exp(-dt * 10));
    }
    gripPos.y += breathe;
    // First person angles the rod across the view, from the rod hand toward the centre.
    const dir = V(-0.18 * firstBlend, Math.sin(elevation), Math.cos(elevation)).normalize();
    rod.visible = crankArm.visible = knob.visible = !keeper && !relaxed;
    const base = gripPos.clone().addScaledVector(dir, -BUTT),
      end = base.clone().addScaledVector(dir, ROD_LENGTH);
    end.y -= pull * 0.12;
    const points = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14,
        p = base.clone().lerp(end, u),
        bend = Math.pow(u, 1.7);
      // Progressive action: under load the tip bows toward the fish far more than the butt.
      p.y -= bend * tension * 0.62;
      p.z += bend * tension * 0.3;
      points.push(p);
    }
    for (let i = 0; i < 14; i++) segmentCentred(rodSegments[i], points[i], points[i + 1]);
    const below = V(0, -Math.cos(elevation), Math.sin(elevation));
    below.addScaledVector(dir, -below.dot(dir)).normalize();
    for (let i = 0; i < guides.length; i++) {
      const seg = rodSegments[Math.min(13, (i + 1) * 2 - 1)];
      guides[i].position.copy(points[(i + 1) * 2]);
      guides[i].quaternion.copy(seg.quaternion);
    }
    grip.position.copy(gripPos);
    basis.makeBasis(V(0, 0, 0).crossVectors(dir, below), dir, below);
    grip.quaternion.setFromRotationMatrix(basis);
    grip.updateMatrix();
    // Whole-body weight shift: back while loading the rod, forward through the stroke.
    let leanTarget = mode === 'charging' ? -0.7 * chargeBlend : ['bite', 'reeling'].includes(mode) ? 0.25 : 0;
    if (mode === 'waiting' && modeTime < 0.85) leanTarget = Math.sin(Math.min(1, modeTime / 0.85) * Math.PI) * (0.4 + lastCharge * 0.6);
    lean += (leanTarget - lean) * (1 - Math.exp(-dt * 10));

    // --- Arms -----------------------------------------------------------------------------------
    const [reelArm, rodArm] = arms;
    if (relaxed) {
      // Character creation: rod set down, arms hanging naturally with a slow weight shift.
      const sway = Math.sin(t * 0.8) * 0.012;
      poseArm(rodArm, V(0.31, 1.04 + breathe + sway, 0.05), V(-0.1, 0, 1), V(0.2, 0, -1));
      poseArm(reelArm, V(-0.31, 1.04 + breathe - sway, 0.05), V(-0.1, 0, -1), V(-0.2, 0, -1));
    } else if (keeper) {
      // Milo: hands resting on the counter, or a friendly wave.
      poseArm(rodArm, V(0.27, 1.32 + breathe, 0.44), V(-1, 0, 0.2), V(1, -0.6, -0.4));
      if (mode === 'wave') poseArm(reelArm, V(-0.42, 2.3 + Math.sin(t * 9) * 0.03, 0.2 + Math.sin(t * 9) * 0.08), V(0, 0, 1), V(-1, -0.3, -0.5));
      else poseArm(reelArm, V(-0.27, 1.32 + breathe, 0.44), V(1, 0, 0.2), V(-1, -0.6, -0.4));
    } else {
      poseArm(rodArm, gripPos, dir, V(0.7, -0.8, -0.2));
      // Reeling hand: on the crank knob, which turns in a real circle beside the reel;
      // during the cast it moves down to the butt so both hands drive the rod.
      const phase = mode === 'reeling' || mode === 'landing' ? reelPhase : 1.3;
      const crankCentre = V(CRANK_SIDE, 0.03, REEL_DROP).applyMatrix4(grip.matrix),
        knobLocal = V(CRANK_SIDE - 0.012, 0.03 + Math.cos(phase) * CRANK_R, REEL_DROP + Math.sin(phase) * CRANK_R),
        knobPos = knobLocal.applyMatrix4(grip.matrix),
        side = V(-1, 0, 0).applyQuaternion(grip.quaternion);
      segmentCentred(crankArm, crankCentre, knobPos);
      knob.position.copy(knobPos);
      knob.quaternion.setFromUnitVectors(up, side);
      const butt = gripPos.clone().addScaledVector(dir, -0.24),
        handAt = knobPos.clone().addScaledVector(side, 0.02).lerp(butt, twoHand),
        axis = side.clone().lerp(dir, twoHand).normalize();
      poseArm(reelArm, handAt, axis, V(-0.7, -0.8, -0.25));
    }
    for (const a of arms) a.upper.visible = a.shoulder.visible = a.elbow.visible = firstBlend < 0.5;
    for (const a of arms) {
      const openHand = relaxed || keeper;
      a.open.visible = openHand;
      a.fist.visible = !openHand;
    }
    head.visible = firstBlend < 0.5;

    // --- Head: glance at the float while it is out, look up at a landed fish, and blink. ---
    const lookTarget = held ? -0.3 : ['waiting', 'bite', 'reeling'].includes(mode) ? 0.2 : mode === 'charging' ? -0.1 : mode === 'wave' ? -0.05 : 0.05;
    look += (lookTarget - look) * (1 - Math.exp(-dt * 3));
    head.position.z = 0.012 + lean * 0.045;
    head.rotation.set(look + lean * 0.08 + Math.sin(t * 0.6) * 0.02, Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.5) * 0.015);
    blinkAt -= dt;
    const closed = blinkAt < 0.12 && blinkAt > 0 ? 1 : 0;
    if (blinkAt <= 0) blinkAt = 2.5 + Math.random() * 3.5;
    for (const lid of lids) lid.rotation.x = closed * 0.85;
    g.updateMatrixWorld(true);
    rodTip.copy(points.at(-1));
    g.localToWorld(rodTip);
    hangAnchor.set(-0.48, 3.04, 0.85);
    g.localToWorld(hangAnchor);
  }
  // Rigid parts are merged per parent and material to keep draw calls (and shadows) cheap.
  g.traverse(o => {
    if (o.isMesh) o.castShadow = true;
  });
  stubbleMat.userData = {};
  consolidate(g);
  refresh();
  update(0.02, 0, 'idle');
  return {
    group: g,
    update,
    refresh,
    materials: {skin, hair: hairMat, cloth, pants, shoes, hat: hatMat},
    head,
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
