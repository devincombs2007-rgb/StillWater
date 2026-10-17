import * as T from './assets/three.module.js';
import {surfaceTexture} from './textures.js?v=6';
import {APPAREL, BAITS} from './economy.js?v=6';
export const SKINS = ['#edc7a6', '#d3a37e', '#b17f5c', '#875e45', '#624735'],
  HAIRS = ['#302b29', '#65503b', '#a58455', '#352b32'];
export function createAngler(parent, state) {
  const g = new T.Group();
  g.name = 'Angler';
  g.position.set(0, 0.3, 8.8);
  g.rotation.y = Math.PI;
  parent.add(g);
  const skin = new T.MeshStandardMaterial({color: SKINS[state.character?.skin || 0], roughness: 0.65}),
    hairMat = new T.MeshStandardMaterial({color: HAIRS[state.character?.hair || 0], roughness: 0.8});
  const cloth = new T.MeshStandardMaterial({color: '#c6bda3', roughness: 0.9, map: surfaceTexture('cloth')}),
    pants = new T.MeshStandardMaterial({color: '#667d79', roughness: 0.9, map: surfaceTexture('cloth')}),
    shoes = new T.MeshStandardMaterial({color: '#66594b', roughness: 0.8});
  const sphere = new T.SphereGeometry(1, 22, 16),
    cylinder = new T.CylinderGeometry(1, 1, 1, 16);
  function add(geo, mat, p, s, par = g) {
    const m = new T.Mesh(geo, mat);
    m.position.set(...p);
    m.scale.set(...s);
    par.add(m);
    return m;
  }
  add(sphere, cloth, [0, 1.4, 0], [0.37, 0.46, 0.23]);
  add(cylinder, cloth, [0, 1.24, 0], [0.31, 0.47, 0.2]);
  add(sphere, cloth, [0, 1.72, 0], [0.37, 0.11, 0.23]);
  const shirtSeam = new T.MeshStandardMaterial({color: '#ded4b8', roughness: 0.8});
  for (let i = 0; i < 4; i++) add(sphere, shirtSeam, [0, 1.32 + i * 0.12, 0.225], [0.014, 0.014, 0.009]);
  for (const x of [-0.17, 0.17]) {
    add(new T.CapsuleGeometry(0.135, 0.68, 6, 16), pants, [x, 0.63, 0], [1, 1, 1]);
    add(sphere, pants, [x, 1.04, 0], [0.16, 0.16, 0.17]);
    add(sphere, shoes, [x, 0.13, 0.09], [0.16, 0.13, 0.29]);
    add(cylinder, new T.MeshStandardMaterial({color: '#3e4540'}), [x, 0.06, 0.1], [0.17, 0.06, 0.29]);
  }
  add(cylinder, skin, [0, 1.92, 0], [0.105, 0.25, 0.1]);
  const head = add(sphere, skin, [0, 2.16, 0.01], [0.24, 0.31, 0.225]);
  const hairTufts = [];
  const hair = add(
    new T.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMat,
    [0, 2.27, -0.025],
    [0.255, 0.24, 0.235],
  );
  for (let i = 0; i < 9; i++) {
    const x = -0.2 + i * 0.05;
    const tuft = add(sphere, hairMat, [x, 2.4 - Math.abs(x) * 0.25, 0.12], [0.065, 0.1, 0.09]);
    tuft.rotation.z = -x * 1.5;
    hairTufts.push(tuft);
  }
  for (const x of [-0.085, 0.085]) {
    add(sphere, new T.MeshStandardMaterial({color: '#f1e5d1'}), [x, 2.18, 0.207], [0.046, 0.028, 0.022]);
    add(sphere, new T.MeshStandardMaterial({color: '#2e454a'}), [x, 2.179, 0.227], [0.018, 0.021, 0.009]);
    add(sphere, skin, [Math.sign(x) * 0.24, 2.15, 0], [0.035, 0.075, 0.045]);
  }
  add(sphere, skin, [0, 2.12, 0.235], [0.035, 0.055, 0.047]);
  add(sphere, new T.MeshStandardMaterial({color: '#a77767'}), [0, 2.025, 0.213], [0.065, 0.009, 0.01]);
  const hat = new T.Group();
  g.add(hat);
  add(
    new T.CylinderGeometry(0.27, 0.27, 0.17, 30),
    new T.MeshStandardMaterial({color: '#bfa27a'}),
    [0, 2.46, 0],
    [1, 1, 1],
    hat,
  );
  add(
    new T.CylinderGeometry(0.36, 0.36, 0.035, 32),
    new T.MeshStandardMaterial({color: '#bfa27a'}),
    [0, 2.39, 0.035],
    [1, 1, 1],
    hat,
  );
  const glasses = new T.Group();
  g.add(glasses);
  for (const x of [-0.09, 0.09])
    add(
      sphere,
      new T.MeshStandardMaterial({color: '#263c45', metalness: 0.5, roughness: 0.15}),
      [x, 2.19, 0.23],
      [0.079, 0.046, 0.016],
      glasses,
    );
  add(
    cylinder,
    new T.MeshStandardMaterial({color: '#39494a'}),
    [0, 2.19, 0.237],
    [0.008, 0.12, 0.008],
    glasses,
  ).rotation.z = Math.PI / 2;
  function bone(mat, r) {
    return add(cylinder, mat, [0, 0, 0], [r, 1, r]);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const upper = bone(cloth, 0.105),
      fore = bone(skin, 0.079),
      hand = new T.Group();
    hand.name = side === -1 ? 'Reeling hand' : 'Rod hand';
    g.add(hand);
    add(sphere, skin, [0, 0, 0], [0.08, 0.11, 0.045], hand);
    for (let i = 0; i < 4; i++) {
      const finger = add(sphere, skin, [-0.047 + i * 0.031, -0.09, 0.025], [0.016, 0.055, 0.017], hand);
      finger.rotation.x = 0.6;
    }
    add(sphere, skin, [0.085, -0.02, 0.03], [0.026, 0.055, 0.023], hand).rotation.z = -0.6;
    arms.push({side, upper, fore, hand});
  }
  const rod = new T.Group();
  rod.name = 'Bending rod';
  g.add(rod);
  const rodMat = new T.MeshStandardMaterial({
      color: '#879383',
      map: surfaceTexture('metal'),
      metalness: 0.35,
      roughness: 0.4,
    }),
    rodSegments = Array.from({length: 14}, () => {
      const m = new T.Mesh(new T.CylinderGeometry(0.014, 0.019, 1, 8), rodMat);
      rod.add(m);
      return m;
    });
  const guides = Array.from({length: 7}, (_, i) => {
    const m = add(
      new T.TorusGeometry(0.033 - i * 0.0028, 0.006, 6, 14),
      new T.MeshStandardMaterial({color: '#d8d4bc', metalness: 0.8, roughness: 0.2}),
      [0, 0, 0],
      [1, 1, 1],
      rod,
    );
    return m;
  });
  const grip = add(
    cylinder,
    new T.MeshStandardMaterial({color: '#b4956f', map: surfaceTexture('cork'), roughness: 0.9}),
    [0, 0, 0],
    [0.039, 0.4, 0.039],
    rod,
  );
  const spool = add(
    new T.TorusGeometry(0.1, 0.025, 8, 20),
    new T.MeshStandardMaterial({color: '#a8b8ad', metalness: 0.7, roughness: 0.25}),
    [0, 0, 0],
    [1, 1, 1],
    rod,
  );
  const crank = add(
    cylinder,
    new T.MeshStandardMaterial({color: '#a6b5aa', metalness: 0.6}),
    [0, 0, 0],
    [0.014, 0.18, 0.014],
    rod,
  );
  let rodTip = new T.Vector3(),
    hangAnchor = new T.Vector3(),
    reelPhase = 0,
    pose = 0,
    firstBlend = 0,
    lastMode = 'idle',
    modeTime = 0,
    chargeBlend = 0,
    lastCharge = 0;
  const up = new T.Vector3(0, 1, 0);
  function segment(m, a, b, r) {
    const delta = b.clone().sub(a);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, delta.clone().normalize());
    m.scale.set(r, delta.length(), r);
  }
  function refresh(character = state.character) {
    skin.color.set(SKINS[character?.skin || 0]);
    hairMat.color.set(HAIRS[character?.hair || 0]);
    cloth.color.set(APPAREL.find(a => a.id === state.outfit.shirt)?.color || '#c6bda3');
    pants.color.set(APPAREL.find(a => a.id === state.outfit.pants)?.color || '#667d79');
    shoes.color.set(APPAREL.find(a => a.id === state.outfit.shoes)?.color || '#66594b');
    hat.visible = state.outfit.hat !== 'hat0';
    for (const o of hat.children)
      o.material.color.set(APPAREL.find(a => a.id === state.outfit.hat)?.color || '#bfa27a');
    glasses.visible = state.outfit.glasses !== 'glasses0';
    hair.scale.y = character?.style === 2 ? 0.16 : 0.24;
    hair.rotation.z = character?.style === 1 ? 0.08 : 0;
    for (const tuft of hairTufts) {
      tuft.visible = character?.style !== 2;
      tuft.scale.y = character?.style === 1 ? 0.065 : 0.1;
      tuft.rotation.z = character?.style === 1 ? 0.45 : -tuft.position.x * 1.5;
    }
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
    const left = new T.Vector3(
        0.4 - firstBlend * 0.24,
        1.57 + pose * 0.9 + breathe + firstBlend * 0.9,
        0.46 - pose * 0.05 + firstBlend * 0.75,
      ),
      right = new T.Vector3(
        -0.05 + firstBlend * 0.1,
        1.43 + pose * 0.52 + Math.sin(reelPhase) * 0.075 + firstBlend * 1.0,
        0.47 + Math.cos(reelPhase) * 0.08 + firstBlend * 0.75,
      );
    left.y += chargeBlend * 0.26;
    left.z -= chargeBlend * 0.7;
    right.y += chargeBlend * 0.18;
    right.z -= chargeBlend * 0.66;
    const hands = [right, left];
    for (let i = 0; i < 2; i++) {
      const a = arms[i],
        shoulder = new T.Vector3(a.side * 0.35, 1.72, 0),
        hand = hands[i],
        elbow = shoulder
          .clone()
          .lerp(hand, 0.52)
          .add(new T.Vector3(a.side * 0.1, -0.15, 0.08));
      segment(a.upper, shoulder, elbow, 0.105);
      segment(a.fore, elbow, hand, 0.075);
      a.hand.position.copy(hand);
      a.hand.rotation.x = -0.4;
    }
    const base = left.clone().add(new T.Vector3(0, -0.15, 0)),
      end = left.clone().add(new T.Vector3(0, 1.8 - pose * 0.4, 1.7 - pose * 1.2));
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
      p.z += Math.sin(u * Math.PI) * tension * 0.45;
      p.y -= Math.sin(u * Math.PI) * tension * 0.3;
      points.push(p);
    }
    for (let i = 0; i < 14; i++) {
      segment(rodSegments[i], points[i], points[i + 1], 1);
    }
    for (let i = 0; i < guides.length; i++) {
      guides[i].position.copy(points[(i + 1) * 2]).add(new T.Vector3(0, 0, 0.035));
      guides[i].quaternion.copy(rodSegments[Math.min(13, (i + 1) * 2 - 1)].quaternion);
    }
    grip.position.copy(base).lerp(left, 0.55);
    grip.quaternion.copy(rodSegments[0].quaternion);
    spool.position.copy(left).add(new T.Vector3(-0.08, -0.11, 0.02));
    spool.rotation.z = reelPhase;
    crank.position
      .copy(spool.position)
      .add(new T.Vector3(-0.08, Math.sin(reelPhase) * 0.07, Math.cos(reelPhase) * 0.07));
    crank.rotation.x = reelPhase;
    g.updateMatrixWorld(true);
    rodTip.copy(points.at(-1));
    g.localToWorld(rodTip);
    hangAnchor.set(-0.48, 3.04, 0.85);
    g.localToWorld(hangAnchor);
  }
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
