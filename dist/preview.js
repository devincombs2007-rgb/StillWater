import * as T from './assets/three.module.js';
import {createFish, animateFish, disposeFish} from './fish.js?v=8';
import {createAngler} from './angler.js?v=8';
import {freshState} from './economy.js?v=8';
import {surfaceTexture} from './textures.js?v=8';
import {loft, tube} from './models.js?v=8';
import {ITEM_BUILDERS} from './items.js?v=8';
let renderer = null,
  scene,
  camera,
  model,
  active = false,
  frameId = 0,
  rotation = -0.12,
  drag = null,
  last = 0,
  clock = 0;
function tick(ms) {
  if (!active) return;
  frameId = requestAnimationFrame(tick);
  if (document.hidden || ms - last < 1000 / 30) return;
  const dt = Math.min(0.04, (ms - last) / 1000);
  last = ms;
  clock += dt;
  if (model) {
    animateFish(model, clock * 4, 0.8);
    model.rotation.y = rotation + Math.sin(clock * 0.35) * 0.08;
    model.position.y = Math.sin(clock * 0.8) * 0.025;
  }
  renderer.render(scene, camera);
}
export function stopPreview() {
  active = false;
  cancelAnimationFrame(frameId);
  if (model) {
    scene.remove(model);
    disposeFish(model);
    model = null;
  }
  if (renderer) renderer.domElement.remove();
}
export function showPreview(container, species) {
  stopPreview();
  try {
    if (!renderer) {
      renderer = new T.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'low-power'});
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.setClearColor(0x000000, 0);
      scene = new T.Scene();
      scene.add(new T.HemisphereLight('#d6ebe1', '#466760', 2.7));
      const key = new T.DirectionalLight('#ffe8bf', 2.5);
      key.position.set(-2, 4, 5);
      scene.add(key);
      const rim = new T.DirectionalLight('#a0d7e8', 2);
      rim.position.set(0, 2, -5);
      scene.add(rim);
      camera = new T.PerspectiveCamera(33, 1, 0.1, 50);
      const canvas = renderer.domElement;
      canvas.setAttribute('aria-label', 'Drag to rotate this fish in three dimensions');
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId);
        drag = e.clientX;
      });
      canvas.addEventListener('pointermove', e => {
        if (drag !== null) {
          rotation += (e.clientX - drag) * 0.009;
          drag = e.clientX;
        }
      });
      canvas.addEventListener('pointerup', () => {
        drag = null;
      });
      canvas.addEventListener('pointercancel', () => {
        drag = null;
      });
    }
    container.replaceChildren(renderer.domElement);
    const width = container.clientWidth || 320,
      height = container.clientHeight || 180;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    model = createFish(species);
    scene.add(model);
    const box = new T.Box3().setFromObject(model),
      size = box.getSize(new T.Vector3()),
      center = box.getCenter(new T.Vector3());
    model.position.sub(center);
    const distance = (Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan((33 * Math.PI) / 360))) * 1.22;
    camera.position.set(0, 0.06, Math.max(2.1, distance));
    camera.lookAt(0, 0, 0);
    rotation = -0.12;
    last = performance.now();
    active = true;
    frameId = requestAnimationFrame(tick);
    return true;
  } catch {
    active = false;
    return false;
  }
}
// Small still renders of the real 3D fish for journal and resident cards. Rendered once
// per species (and once as a silhouette for undiscovered ones), queued so a full journal
// fills in progressively instead of stalling the UI.
let thumbRenderer = null,
  thumbScene,
  thumbCamera,
  silhouette;
const thumbs = new Map(),
  queue = [];
let pumping = false;
function setupThumbs() {
  thumbRenderer = new T.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power'});
  thumbRenderer.setPixelRatio(1);
  thumbRenderer.setSize(320, 180);
  thumbRenderer.outputColorSpace = T.SRGBColorSpace;
  thumbRenderer.toneMapping = T.ACESFilmicToneMapping;
  thumbRenderer.setClearColor(0x000000, 0);
  thumbScene = new T.Scene();
  thumbScene.add(new T.HemisphereLight('#d6ebe1', '#466760', 2.6));
  const key = new T.DirectionalLight('#ffe8bf', 2.6);
  key.position.set(-2, 4, 5);
  thumbScene.add(key);
  const rim = new T.DirectionalLight('#a0d7e8', 1.8);
  rim.position.set(1, 2, -5);
  thumbScene.add(rim);
  thumbCamera = new T.PerspectiveCamera(30, 16 / 9, 0.1, 50);
  silhouette = new T.MeshBasicMaterial({color: '#5f7a74', transparent: true, opacity: 0.85});
}
function renderThumb(species, unknown) {
  if (!thumbRenderer) setupThumbs();
  thumbRenderer.setSize(320, 180);
  thumbCamera.aspect = 16 / 9;
  thumbCamera.updateProjectionMatrix();
  const fish = createFish(species);
  fish.rotation.set(0.08, -0.35, 0.04);
  animateFish(fish, 0.8, 0.6);
  thumbScene.add(fish);
  const box = new T.Box3().setFromObject(fish),
    size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3());
  fish.position.sub(center);
  const distance = (Math.max(size.y * 1.15, size.x / thumbCamera.aspect) / (2 * Math.tan((30 * Math.PI) / 360))) * 1.12;
  thumbCamera.position.set(0, 0.05, distance);
  thumbCamera.lookAt(0, 0, 0);
  thumbScene.overrideMaterial = unknown ? silhouette : null;
  thumbRenderer.render(thumbScene, thumbCamera);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  thumbScene.remove(fish);
  disposeFish(fish);
  return url;
}
function pump() {
  pumping = true;
  const job = queue.shift();
  if (!job) {
    pumping = false;
    return;
  }
  try {
    job.resolve(job.item ? renderItem(job.item) : renderThumb(job.species, job.unknown));
  } catch {
    job.resolve(null);
  }
  setTimeout(pump, 0);
}
// Fit a model in a 4:3 frame from a given turn and tilt, optionally around a focus box.
function frameAndRender(object, yaw, pitch, focus = null) {
  thumbRenderer.setSize(200, 150);
  thumbCamera.aspect = 4 / 3;
  thumbCamera.updateProjectionMatrix();
  object.updateMatrixWorld(true);
  const box = focus || new T.Box3().setFromObject(object),
    size = box.getSize(new T.Vector3()),
    center = box.getCenter(new T.Vector3()),
    radius = size.length() / 2,
    distance = radius / Math.sin((30 * Math.PI) / 360) * 0.92;
  const dir = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  thumbCamera.position.copy(center).addScaledVector(dir, distance);
  thumbCamera.lookAt(center);
  thumbCamera.updateMatrixWorld();
  // Tighten the fit to the model's projected extent (long rods would otherwise sit tiny).
  let extent = 0;
  const c = new T.Vector3();
  for (let k = 0; k < 8; k++) {
    c.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).project(thumbCamera);
    extent = Math.max(extent, Math.abs(c.x), Math.abs(c.y));
  }
  thumbCamera.position.copy(center).addScaledVector(dir, distance * Math.max(0.35, extent / 0.86));
  thumbCamera.lookAt(center);
  thumbScene.overrideMaterial = null;
  thumbRenderer.render(thumbScene, thumbCamera);
  return thumbRenderer.domElement.toDataURL('image/png');
}
// Free one-off geometry; shared primitives and materials stay, since the world uses them too.
const disposeTree = o =>
  o.traverse(m => {
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose();
  });
const APPAREL_FOCUS = {hat: [1.95, 2.55], glasses: [2.05, 2.45], shirt: [1.15, 2.1], pants: [0.1, 1.35], shoes: [0, 0.32]};
function renderItem({kind, index, outfit}) {
  if (!thumbRenderer) setupThumbs();
  if (kind === 'apparel') {
    // Apparel is shown worn: the player's own angler, framed on that part of the body.
    const st = freshState();
    st.character = outfit.character || {name: 'Angler', skin: 1, hair: 1, style: 0};
    st.outfit = {...st.outfit, [outfit.slot]: outfit.id};
    const rig = createAngler(thumbScene, st);
    rig.update(1 / 60, 1, 'create');
    rig.group.rotation.y = -0.35;
    rig.group.updateMatrixWorld(true);
    const [y0, y1] = APPAREL_FOCUS[outfit.slot],
      half = (y1 - y0) * 0.55,
      focus = new T.Box3(new T.Vector3(-half, y0, -half * 0.6), new T.Vector3(half, y1, half * 0.6));
    const url = frameAndRender(rig.group, 0.25, 0.08, focus);
    thumbScene.remove(rig.group);
    rig.dispose?.();
    return url;
  }
  const {object, yaw, pitch} = ITEM_BUILDERS[kind](index);
  thumbScene.add(object);
  const url = frameAndRender(object, yaw, pitch);
  thumbScene.remove(object);
  disposeTree(object);
  return url;
}
// Market item thumbnails, cached per item and queued with the fish renders.
export function itemThumbnail(kind, index, outfit = null) {
  const key = 'item:' + kind + ':' + index + (outfit ? ':' + outfit.id + ':' + JSON.stringify(outfit.character || {}) : '');
  if (!thumbs.has(key))
    thumbs.set(
      key,
      new Promise(resolve => {
        queue.push({item: {kind, index, outfit}, resolve});
        if (!pumping) setTimeout(pump, 0);
      }),
    );
  return thumbs.get(key);
}
export function fishThumbnail(species, unknown = false) {
  const key = species.id + (unknown ? ':?' : '');
  if (!thumbs.has(key))
    thumbs.set(
      key,
      new Promise(resolve => {
        queue.push({species, unknown, resolve});
        if (!pumping) setTimeout(pump, 0);
      }),
    );
  return thumbs.get(key);
}

// Milo behind his counter: the angler rig dressed as the shopkeeper, in a little shop
// set with shelves of bait jars, a rod rack, a bell and warm light. Waves on arrival.
let keeperRenderer = null,
  keeperScene,
  keeperCamera,
  milo = null,
  keeperFrame = 0,
  keeperActive = false,
  waveUntil = 0,
  keeperLast = 0,
  keeperClock = 0;
function buildShop() {
  keeperScene = new T.Scene();
  keeperScene.background = new T.Color('#2b241d');
  keeperScene.fog = new T.Fog('#2b241d', 6, 12);
  keeperScene.add(new T.HemisphereLight('#ffe7c2', '#3a2c20', 1.6));
  const key = new T.DirectionalLight('#ffe0b0', 2.4);
  key.position.set(2, 4, 4);
  keeperScene.add(key);
  const lamp = new T.PointLight('#ffb867', 6, 6);
  lamp.position.set(-0.9, 2.6, 0.6);
  keeperScene.add(lamp);
  const wood = (c, extra = {}) => new T.MeshStandardMaterial({color: c, roughness: 0.75, map: surfaceTexture('wood'), ...extra});
  const box = (w, h, d, m, x, y, z) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    keeperScene.add(o);
    return o;
  };
  // Back wall, shelves and jars of bait.
  box(6, 4, 0.1, wood('#5b4330'), 0, 2, -1.3);
  const glass = new T.MeshStandardMaterial({color: '#cfe3dc', transparent: true, opacity: 0.35, roughness: 0.1});
  for (const y of [1.55, 2.35]) {
    box(3.4, 0.06, 0.4, wood('#3f2e22'), 0, y, -1.05);
    for (let k = 0; k < 7; k++) {
      const x = -1.5 + k * 0.5,
        h = 0.26 + ((k * 7) % 3) * 0.06,
        fill = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, h * 0.7, 12), new T.MeshStandardMaterial({color: ['#c6968b', '#c5dfa0', '#d7e4d6', '#91c8d4', '#d8ab58'][(k + (y > 2 ? 2 : 0)) % 5], roughness: 0.6}));
      fill.position.set(x, y + 0.03 + h * 0.35, -1.05);
      keeperScene.add(fill);
      const jar = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, h, 14), glass);
      jar.position.set(x, y + 0.03 + h / 2, -1.05);
      keeperScene.add(jar);
      const lid = new T.Mesh(new T.CylinderGeometry(0.105, 0.105, 0.04, 14), new T.MeshStandardMaterial({color: '#b39a62', metalness: 0.6, roughness: 0.35}));
      lid.position.set(x, y + 0.05 + h, -1.05);
      keeperScene.add(lid);
    }
  }
  // Rod rack on the right.
  for (let k = 0; k < 3; k++) {
    const r = new T.Mesh(new T.CylinderGeometry(0.012, 0.022, 2.6, 6), new T.MeshStandardMaterial({color: ['#5d6b5e', '#7a5a3c', '#3f5560'][k], roughness: 0.4}));
    r.position.set(1.7 + k * 0.18, 1.6, -1.1);
    r.rotation.z = 0.08;
    keeperScene.add(r);
  }
  // Counter with a brass bell and a little sign.
  box(3.2, 1.2, 0.8, wood('#7a5a3e'), 0, 0.6, 0.55);
  box(3.4, 0.08, 0.95, wood('#9b7a55'), 0, 1.24, 0.55);
  const bell = new T.Mesh(new T.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({color: '#d4b46a', metalness: 0.85, roughness: 0.25}));
  bell.position.set(0.95, 1.28, 0.65);
  keeperScene.add(bell);
  const sign = box(0.7, 0.28, 0.04, new T.MeshStandardMaterial({color: '#e8dcc0', roughness: 0.8}), -0.9, 1.42, 0.62);
  sign.rotation.x = -0.25;
  // Milo himself.
  const st = freshState();
  st.character = {name: 'Milo', skin: 1, hair: 2, style: 1, eyes: 1, facial: 2};
  st.outfit.hat = 'hat1';
  const rig = createAngler(keeperScene, st);
  rig.group.position.set(0, 0, -0.45);
  rig.group.rotation.y = 0;
  rig.group.getObjectByName('Bending rod').visible = false;
  rig.materials.hair.color.set('#a39b8c');
  rig.materials.cloth.color.set('#e7ce9e');
  rig.materials.hat.color.set('#6f8f78');
  // Work apron shaped to his body: a wrap skirt, a bib following the chest, and straps.
  const apronMat = new T.MeshStandardMaterial({color: '#527a6d', roughness: 0.85, map: surfaceTexture('cloth')});
  rig.group.add(new T.Mesh(loft([[0.74, 0.238, 0.162, 0.004], [1.0, 0.229, 0.153, 0.004], [1.3, 0.214, 0.146, 0.006]], 28, 2.4, false, false), apronMat));
  const bib = new T.Mesh(new T.BoxGeometry(0.26, 0.34, 0.012), apronMat);
  bib.position.set(0, 1.58, 0.158);
  bib.rotation.x = 0.1;
  rig.group.add(bib);
  for (const sx of [-1, 1])
    rig.group.add(new T.Mesh(tube([[sx * 0.115, 1.74, 0.162], [sx * 0.15, 1.93, 0.1], [sx * 0.155, 1.97, -0.04], [sx * 0.13, 1.72, -0.14]], 0.011, 6, false), apronMat));
  const pocket = new T.Mesh(new T.BoxGeometry(0.19, 0.11, 0.012), new T.MeshStandardMaterial({color: '#416959', roughness: 0.9}));
  pocket.position.set(0, 1.5, 0.167);
  pocket.rotation.x = 0.1;
  rig.group.add(pocket);
  milo = rig;
  keeperCamera = new T.PerspectiveCamera(32, 1.3, 0.1, 30);
}
function keeperTick(ms) {
  if (!keeperActive) return;
  keeperFrame = requestAnimationFrame(keeperTick);
  if (document.hidden || ms - keeperLast < 1000 / 30) return;
  const dt = Math.min(0.05, (ms - keeperLast) / 1000);
  keeperLast = ms;
  keeperClock += dt;
  milo.update(dt, keeperClock, keeperClock < waveUntil ? 'wave' : 'keeper');
  keeperRenderer.render(keeperScene, keeperCamera);
}
export function showKeeper(container, wave = false) {
  keeperActive = false;
  try {
    cancelAnimationFrame(keeperFrame);
    if (!keeperRenderer) {
      keeperRenderer = new T.WebGLRenderer({antialias: true, powerPreference: 'low-power'});
      keeperRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      keeperRenderer.outputColorSpace = T.SRGBColorSpace;
      keeperRenderer.toneMapping = T.ACESFilmicToneMapping;
      buildShop();
    }
    container.replaceChildren(keeperRenderer.domElement);
    const w = container.clientWidth || 190,
      h = container.clientHeight || 150;
    keeperRenderer.setSize(w, h);
    keeperCamera.aspect = w / h;
    keeperCamera.position.set(0.45, 1.98, 2.6);
    keeperCamera.lookAt(0, 1.8, 0);
    keeperCamera.updateProjectionMatrix();
    if (wave) waveUntil = keeperClock + 2.4;
    keeperLast = performance.now();
    keeperActive = true;
    keeperFrame = requestAnimationFrame(keeperTick);
    return true;
  } catch {
    keeperActive = false;
    return false;
  }
}
export function stopKeeper() {
  keeperActive = false;
  if (!keeperRenderer) return;
  cancelAnimationFrame(keeperFrame);
  keeperRenderer.domElement.remove();
}
