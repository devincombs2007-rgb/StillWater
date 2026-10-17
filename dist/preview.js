import * as T from './assets/three.module.js';
import {createFish, animateFish, disposeFish} from './fish.js?v=7';
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
    job.resolve(renderThumb(job.species, job.unknown));
  } catch {
    job.resolve(null);
  }
  setTimeout(pump, 0);
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
