// Upscaler bench: one deterministic scene full of the things upscalers get wrong (sub-pixel
// wires, a fence that moirés, fine texture, a spinning turbine, a fast-moving striped object,
// a bright-on-dark sign), rendered frame by frame with every method and scored against a
// 16-samples-per-pixel supersampled reference of the same frame.
//
// Scores, over the frames after warm-up:
//   PSNR   colour accuracy against the reference (higher is better)
//   SSIM   structural similarity on luma, 8x8 windows (1 = identical)
//   Flicker  how much the frame-to-frame change differs from the reference's own change,
//          i.e. shimmer and crawling edges (lower is better)
// Static frames (camera still) and moving frames (camera panning) are scored separately.
//
// Open with ?run to run everything; ?w=&h=&frames= change the size and length;
// ?only=a,b runs a subset.
import * as T from '../../dist/assets/three.module.js';
import {createUpscaler} from '../../dist/upscaler.js';
import {createGeminiFsr1} from './gemini-fsr1.js';

const q = Object.fromEntries(new URLSearchParams(location.search));
const W = +q.w || 480,
  H = +q.h || 270,
  FRAMES = +q.frames || 56,
  WARM = 16,
  STILL_UNTIL = +q.still || 30,
  SS = 4;
const canvas = document.querySelector('canvas');
const renderer = new T.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
canvas.style.width = '100%';
canvas.style.maxWidth = W * 2 + 'px';
canvas.style.height = 'auto';
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;
renderer.setClearColor('#9cc3d0');
const gl = renderer.getContext();

// ---------- the scene ----------
const scene = new T.Scene();
scene.fog = new T.FogExp2('#a9c6cc', 0.012);
const camera = new T.PerspectiveCamera(50, W / H, 0.1, 400);
scene.add(new T.HemisphereLight('#dfeef0', '#3b4a35', 1.6));
const sun = new T.DirectionalLight('#fff1d8', 2.4);
sun.position.set(20, 30, 10);
scene.add(sun);
// Sky: a hand-written shader with no tone mapping, like the game's sky dome.
const sky = new T.Mesh(
  new T.SphereGeometry(300, 32, 16),
  new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(vec3(0.86,0.9,0.88), vec3(0.32,0.55,0.74), h), 1.0); }',
  }),
);
scene.add(sky);
const canvasTexture = (w, h, paint) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};
// Ground: fine grid lines, the classic texture-shimmer test.
const groundTex = canvasTexture(256, 256, (x, w, h) => {
  x.fillStyle = '#5c7a45';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#e8e2c8';
  for (let i = 0; i < 8; i++) {
    x.fillRect(i * 32, 0, 3, h);
    x.fillRect(0, i * 32, w, 3);
  }
});
groundTex.wrapS = groundTex.wrapT = T.RepeatWrapping;
groundTex.repeat.set(60, 60);
const ground = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshStandardMaterial({map: groundTex, roughness: 0.9}));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const mat = c => new T.MeshStandardMaterial({color: c, roughness: 0.6});
// Fence of thin pickets receding into the distance: moiré and crawling edges.
const picket = new T.BoxGeometry(0.05, 1.2, 0.05);
for (let i = 0; i < 90; i++) {
  const m = new T.Mesh(picket, mat('#f2efe6'));
  m.position.set(-3 + i * 0.22, 0.6, -2 - i * 0.35);
  scene.add(m);
}
// Wires of decreasing thickness against the sky (fishing line, power lines).
[0.03, 0.015, 0.008, 0.004].forEach((r, i) => {
  const w = new T.Mesh(new T.CylinderGeometry(r, r, 60, 6), mat('#1d2226'));
  w.rotation.z = Math.PI / 2 - 0.04 * (i + 1);
  w.position.set(2, 4.2 + i * 0.55, -9);
  scene.add(w);
});
// Conifers: jagged silhouettes against the bright sky.
for (let i = 0; i < 26; i++) {
  const t = new T.Mesh(new T.ConeGeometry(0.9, 3.6, 7), mat('#2f5a3a'));
  t.position.set(-16 + (i % 13) * 2.7 + (i > 12 ? 1.3 : 0), 1.8, -22 - (i > 12 ? 6 : 0));
  scene.add(t);
}
// Sign with fine high-contrast text.
const sign = new T.Mesh(
  new T.PlaneGeometry(3.2, 1),
  new T.MeshStandardMaterial({
    map: canvasTexture(512, 160, (x, w, h) => {
      x.fillStyle = '#16232b';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#f4f0e0';
      x.font = 'bold 44px sans-serif';
      x.fillText('STILLWATER 0123', 18, 64);
      x.font = '26px sans-serif';
      x.fillText('Bait · Tackle · Licences · Since 1962', 18, 120);
    }),
    roughness: 0.7,
  }),
);
sign.position.set(-2.2, 1.6, -5);
scene.add(sign);
// Turbine: thin fast blades (object motion with no camera motion).
const turbine = new T.Group();
const tower = new T.Mesh(new T.CylinderGeometry(0.08, 0.14, 7, 10), mat('#e9ecea'));
tower.position.y = 3.5;
turbine.add(tower);
const hub = new T.Group();
hub.position.y = 7;
turbine.add(hub);
for (let i = 0; i < 3; i++) {
  const blade = new T.Mesh(new T.BoxGeometry(0.12, 3, 0.04), mat('#f4f6f4'));
  blade.position.y = 1.5;
  const arm = new T.Group();
  arm.rotation.z = (i * Math.PI * 2) / 3;
  arm.add(blade);
  hub.add(arm);
}
turbine.position.set(6, 0, -16);
scene.add(turbine);
// A striped fish-like body darting across: the ghosting test.
const stripes = canvasTexture(256, 64, (x, w, h) => {
  x.fillStyle = '#e8a33a';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#20262a';
  for (let i = 0; i < 10; i++) x.fillRect(i * 26, 0, 9, h);
});
const fish = new T.Mesh(new T.SphereGeometry(0.5, 24, 16), new T.MeshStandardMaterial({map: stripes, roughness: 0.4}));
fish.scale.set(1.8, 0.7, 0.5);
scene.add(fish);
// A small bright point (sun glint) to test flicker suppression.
const glint = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), new T.MeshBasicMaterial({color: '#ffffff'}));
glint.position.set(0.6, 1.1, -3);
scene.add(glint);

// Animated transparent water with drifting sun sparkles, written in display space like the
// game's water shader: colour changes every frame while the geometry stays put, the case
// that smears in temporal upscalers unless it is marked reactive. ?reactive=0 leaves it unmarked.
const waterTime = {value: 0};
const water = new T.Mesh(
  new T.PlaneGeometry(6, 4),
  new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {time: waterTime},
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; varying vec2 vP;
      void main(){
        float w = sin(vP.x * 9.0 + time * 3.1) * sin(vP.y * 13.0 - time * 2.3) + 0.5 * sin((vP.x + vP.y) * 21.0 + time * 4.7);
        float spark = pow(clamp(w * 0.6, 0.0, 1.0), 6.0);
        gl_FragColor = vec4(mix(vec3(0.12, 0.36, 0.42), vec3(1.0, 0.97, 0.88), spark), 0.88);
      }`,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.set(-2.2, 0.03, 1.2);
water.material.userData.upscaleReactive = q.reactive === '0' ? 0 : 1;
scene.add(water);

// Deterministic animation by frame number at 30 fps.
function pose(f) {
  const t = f / 30;
  waterTime.value = t;
  hub.rotation.z = t * 2.4;
  fish.position.set(Math.sin(t * 2.1) * 3.2, 0.9 + Math.sin(t * 3.3) * 0.15, -4.2);
  fish.rotation.y = Math.cos(t * 2.1) > 0 ? 0 : Math.PI;
  // Still camera with a tiny breathing sway, then a steady pan.
  const pan = f < STILL_UNTIL ? 0 : (f - STILL_UNTIL) * 0.012;
  camera.position.set(0.4 + pan * 2.5, 1.7 + Math.sin(t * 0.7) * 0.003, 4);
  camera.lookAt(0.4 + pan * 2.5 + Math.sin(pan) * 3, 1.5, -6);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld();
}
const draw = () => {
  renderer.clear();
  renderer.render(scene, camera);
};

// ---------- methods ----------
const quadScene = new T.Scene(),
  quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const blitMat = new T.ShaderMaterial({
  uniforms: {src: {value: null}, ss: {value: 1}, texel: {value: new T.Vector2()}},
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }',
  // Box-filter resolve of an SSxSS supersampled image (display space).
  fragmentShader: `uniform sampler2D src; uniform float ss; uniform vec2 texel; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.0); float n = 0.0;
      for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) { if (float(x) >= ss || float(y) >= ss) continue;
        c += texture2D(src, vUv + (vec2(float(x), float(y)) - 0.5 * (ss - 1.0)) * texel).rgb; n += 1.0; }
      gl_FragColor = vec4(c / n, 1.0); }`,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
quadScene.add(Object.assign(new T.Mesh(new T.PlaneGeometry(2, 2), blitMat), {frustumCulled: false}));
const displayTarget = (w, h, samples = 0) => {
  const t = new T.WebGLRenderTarget(w, h, {samples, minFilter: T.NearestFilter, magFilter: T.NearestFilter});
  t.isXRRenderTarget = true;
  t.texture.colorSpace = T.SRGBColorSpace;
  t.texture.internalFormat = 'RGBA8';
  return t;
};
const refTarget = displayTarget(W * SS, H * SS),
  msaaTarget = displayTarget(W, H, 4);
const blit = (target, ss) => {
  renderer.setRenderTarget(null);
  blitMat.uniforms.src.value = target.texture;
  blitMat.uniforms.ss.value = ss;
  blitMat.uniforms.texel.value.set(1 / target.width, 1 / target.height);
  renderer.render(quadScene, quadCam);
};
const methods = {
  reference: () => f => {
    renderer.setRenderTarget(refTarget);
    draw();
    blit(refTarget, SS);
  },
  'native (no AA)': () => () => {
    renderer.setRenderTarget(null);
    draw();
  },
  'native 4x MSAA': () => () => {
    renderer.setRenderTarget(msaaTarget);
    draw();
    blit(msaaTarget, 1);
  },
};
const gemini = (scale, fixColour) => () => {
  const g = createGeminiFsr1(renderer, T, {fixColour});
  return () => g.render(draw, camera, {scale, sharpness: 0.75});
};
// ?tune={"gammaStill":3} overrides Clearwater tuning; ?msaa=0 turns its multisampling off.
const tune = q.tune ? JSON.parse(q.tune) : {};
const clearwater = mode => () => {
  const u = createUpscaler(renderer, T, {msaa: q.msaa === undefined ? 4 : +q.msaa});
  Object.assign(u.tune, tune);
  if (q.split) u.setSplit(+q.split);
  return () => u.render(draw, camera, {mode, sharpness: q.sharp || 'standard', scenes: [scene]});
};
methods['Gemini FSR1 Quality 67% (as shipped)'] = gemini(0.67, false);
methods['Gemini FSR1 Quality 67% (colour fixed)'] = gemini(0.67, true);
methods['Gemini FSR1 Performance 50% (colour fixed)'] = gemini(0.5, true);
methods['Clearwater Native AA 100%'] = clearwater('native');
methods['Clearwater Ultra Quality 77%'] = clearwater('ultra-quality');
methods['Clearwater Quality 67%'] = clearwater('quality');
methods['Clearwater Balanced 59%'] = clearwater('balanced');
methods['Clearwater Performance 50%'] = clearwater('performance');
methods['Clearwater Ultra Perf. 33%'] = clearwater('ultra-performance');
// Auto adapts to this machine's speed, so its scores are not comparable between machines.
if ('auto' in q) methods['Clearwater Auto (dynamic)'] = clearwater('auto');

// ---------- scoring ----------
const read = () => {
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
};
const luma = px => {
  const l = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) l[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
  return l;
};
function ssim(a, b) {
  const C1 = (0.01 * 255) ** 2,
    C2 = (0.03 * 255) ** 2;
  let sum = 0,
    n = 0;
  for (let y = 0; y + 8 <= H; y += 4)
    for (let x = 0; x + 8 <= W; x += 4) {
      let ma = 0,
        mb = 0;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) (ma += a[(y + j) * W + x + i]), (mb += b[(y + j) * W + x + i]);
      ma /= 64;
      mb /= 64;
      let va = 0,
        vb = 0,
        cov = 0;
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 8; i++) {
          const da = a[(y + j) * W + x + i] - ma,
            db = b[(y + j) * W + x + i] - mb;
          va += da * da;
          vb += db * db;
          cov += da * db;
        }
      va /= 63;
      vb /= 63;
      cov /= 63;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  return sum / n;
}
// Screen rectangle covered by the water this frame (readPixels rows run bottom-up).
const corner = new T.Vector3();
function waterRect() {
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (const [x, z] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) {
    corner.set(x, z, 0).applyMatrix4(water.matrixWorld).project(camera);
    x0 = Math.min(x0, (corner.x * 0.5 + 0.5) * W);
    x1 = Math.max(x1, (corner.x * 0.5 + 0.5) * W);
    y0 = Math.min(y0, (corner.y * 0.5 + 0.5) * H);
    y1 = Math.max(y1, (corner.y * 0.5 + 0.5) * H);
  }
  // Inset so the water's edges (geometry, not shading) are left out.
  return [Math.max(0, Math.ceil(x0) + 4), Math.min(W, Math.floor(x1) - 4), Math.max(0, Math.ceil(y0) + 4), Math.min(H, Math.floor(y1) - 4)];
}
const mseRect = (a, b, [x0, x1, y0, y1]) => {
  let s = 0,
    n = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      for (let c = 0; c < 3; c++) {
        const i = (y * W + x) * 4 + c;
        s += (a[i] - b[i]) ** 2;
        n++;
      }
  return n ? s / n : 0;
};
const mse = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) if ((i & 3) !== 3) s += (a[i] - b[i]) ** 2;
  return s / ((a.length / 4) * 3);
};
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

async function run() {
  const only = q.only ? q.only.split(',') : null;
  const log = document.querySelector('#log');
  const results = [],
    shots = {};
  const ref = [];
  for (const name of Object.keys(methods)) {
    if (only && name !== 'reference' && !only.some(o => name.toLowerCase().includes(o.toLowerCase()))) continue;
    log.textContent = `Rendering ${name}…`;
    await nextFrame();
    const frame = methods[name]();
    const acc = {still: {mse: 0, ssim: 0, flick: 0, n: 0}, moving: {mse: 0, ssim: 0, flick: 0, n: 0}};
    let waterMse = 0,
      waterN = 0;
    let prevL = null;
    const heat = new Float32Array(W * H);
    const t0 = performance.now();
    for (let f = 0; f < FRAMES; f++) {
      pose(f);
      frame(f);
      const px = read();
      if (name === 'reference') {
        ref[f] = {px, l: luma(px)};
      } else if (f >= WARM) {
        const r = ref[f],
          l = luma(px),
          seg = f < STILL_UNTIL ? acc.still : acc.moving;
        seg.mse += mse(px, r.px);
        waterMse += mseRect(px, r.px, waterRect());
        waterN++;
        seg.ssim += ssim(l, r.l);
        if (prevL && f - 1 >= WARM) {
          let fl = 0;
          const rp = ref[f - 1].l;
          for (let i = 0; i < l.length; i++) {
            const e = Math.abs(l[i] - prevL[i] - (r.l[i] - rp[i]));
            fl += e;
            if (f < STILL_UNTIL) heat[i] += e;
          }
          seg.flick += fl / l.length;
        }
        seg.n++;
        prevL = l;
      } else prevL = luma(px);
      if (f === STILL_UNTIL - 1 || f === FRAMES - 1) (shots[name] ||= []).push(canvas.toDataURL('image/png'));
      if (f % 8 === 0) await nextFrame();
    }
    if (name === 'reference') continue;
    // Where the still-camera flicker comes from, as a picture (white = most).
    {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d'),
        img = x.createImageData(W, H);
      for (let yy = 0; yy < H; yy++)
        for (let xx = 0; xx < W; xx++) {
          const v = Math.min(255, heat[(H - 1 - yy) * W + xx] * 2);
          img.data.set([v, v, v, 255], (yy * W + xx) * 4);
        }
      x.putImageData(img, 0, 0);
      (shots[name] ||= []).push(c.toDataURL('image/png'));
    }
    const fin = s => ({
      psnr: +(10 * Math.log10(255 ** 2 / (s.mse / s.n))).toFixed(2),
      ssim: +(s.ssim / s.n).toFixed(4),
      flicker: +(s.flick / Math.max(1, s.n - 1)).toFixed(3),
    });
    results.push({
      name,
      still: fin(acc.still),
      moving: fin(acc.moving),
      waterPsnr: +(10 * Math.log10(255 ** 2 / (waterMse / waterN))).toFixed(2),
      ms: Math.round((performance.now() - t0) / FRAMES),
    });
  }
  const table = document.querySelector('#results');
  table.innerHTML =
    '<tr><th>Method</th><th>Still PSNR</th><th>Still SSIM</th><th>Still flicker</th><th>Moving PSNR</th><th>Moving SSIM</th><th>Moving flicker</th><th>Water PSNR</th></tr>' +
    results
      .map(
        r =>
          `<tr><td>${r.name}</td><td>${r.still.psnr}</td><td>${r.still.ssim}</td><td>${r.still.flicker}</td><td>${r.moving.psnr}</td><td>${r.moving.ssim}</td><td>${r.moving.flicker}</td><td>${r.waterPsnr}</td></tr>`,
      )
      .join('');
  log.textContent = `Done: ${W}×${H}, ${FRAMES} frames (${WARM} warm-up), reference ${SS * SS} samples per pixel.`;
  window.benchResults = {size: [W, H], frames: FRAMES, results};
  window.benchShots = shots;
}
// Live view of one method, cycling the animation; ?view=<name fragment> or the #view picker.
let live = null;
function startLive(name) {
  const frame = methods[name]();
  let f = 0,
    running = true;
  document.querySelector('#log').textContent = `Live: ${name}`;
  const loop = () => {
    if (!running) return;
    pose(f % 240);
    frame(f++);
    requestAnimationFrame(loop);
  };
  loop();
  return () => (running = false);
}
const names = Object.keys(methods);
const pick = document.querySelector('#view'),
  runButton = document.querySelector('#run');
const firstLive = names.find(n => n.toLowerCase().includes((q.view || 'clearwater quality').toLowerCase()));
if ('run' in q) run();
else {
  if (pick) {
    pick.innerHTML = names.map(n => `<option${n === firstLive ? ' selected' : ''}>${n}</option>`).join('');
    pick.onchange = () => {
      live?.();
      live = startLive(pick.value);
    };
  }
  if (runButton)
    runButton.onclick = () => {
      live?.();
      runButton.disabled = true;
      if (pick) pick.disabled = true;
      run();
    };
  live = startLive(firstLive);
}
