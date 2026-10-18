// Clearwater temporal super resolution: a temporal upscaler in the family of FSR 2/3 and
// the hand-written (pre-neural) DLSS 1.9 / Unreal TSR. It renders the world at a lower internal
// resolution with a different sub-pixel camera offset every frame (Halton 2,3), then
// rebuilds a full-resolution image by reprojecting the previous output and blending in each
// new frame's samples. Over a few frames every output pixel collects many real samples, so
// edges come out cleaner than plain MSAA at a fraction of the shading cost. Then an FSR-style
// RCAS pass restores contrast.
//
// Per frame:
//  1. Jittered internal render (colour + depth), into one of two targets so last frame's depth
//     is still available.
//  2. Motion vectors: camera motion is reconstructed from depth. Every mesh whose transform
//     changed since last frame (fish, boats, the angler and rod, cars) is drawn again into a
//     small velocity target with its previous and current matrices, so things that move on
//     their own reproject exactly too.
//  3. Resolve at output resolution: Lanczos-2 reconstruction with de-ringing, reprojection,
//     depth-based disocclusion detection, YCoCg variance clipping, luma-weighted blending.
//  4. RCAS sharpening to the screen.
// The Auto mode adds dynamic resolution: the render scale moves between 50% and 100% to
// hold the frame-rate target, without resetting the history.
//
// What it is not: DLSS 4/5 and FSR 4 use trained neural networks on dedicated GPU hardware;
// those cannot run in WebGL. Everything here is analytic. Vertex animation done in shaders
// (grass sway, water waves) has no motion vectors and is held in check by clipping alone.
//
// Colour flows through in display space: the internal target is flagged so three applies
// the same ACES tone mapping and sRGB encoding as the screen. Every material, including the
// hand-written sky shaders, therefore looks identical with the upscaler on or off.
import * as T from './assets/three.module.js';

// Internal render scale per mode, matching the published FSR / DLSS ratios. Auto starts at
// Quality and adapts.
export const UPSCALE_MODES = {
  off: 0,
  auto: 1 / 1.5,
  native: 1,
  'ultra-quality': 1 / 1.3,
  quality: 1 / 1.5,
  balanced: 1 / 1.7,
  performance: 1 / 2,
  'ultra-performance': 1 / 3,
};
export const UPSCALE_SHARPNESS = {soft: 0.25, standard: 0.55, crisp: 0.85};
const AUTO_MIN = 0.5,
  AUTO_MAX = 1,
  MAX_MOVING = 160;

const halton = (i, b) => {
  let f = 1,
    r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
};

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Object motion: screen-space offset from this frame's position to last frame's (both
// unjittered), plus this frame's and last frame's view distance for the occlusion tests.
const VELOCITY_VERT = /* glsl */ `
uniform mat4 prevModel;
uniform mat4 prevViewProj;
uniform mat4 curViewProj;
varying vec4 vCur;
varying vec4 vPrev;
varying float vDist;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  gl_Position = projectionMatrix * view;
  vCur = curViewProj * world;
  vPrev = prevViewProj * prevModel * vec4(position, 1.0);
  vDist = -view.z;
}`;
const VELOCITY_FRAG = /* glsl */ `
varying vec4 vCur;
varying vec4 vPrev;
varying float vDist;
void main() {
  vec2 motion = (vPrev.xy / vPrev.w - vCur.xy / vCur.w) * 0.5;
  gl_FragColor = vec4(motion, vDist, max(vPrev.w, 0.001));
}`;

const RESOLVE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tPrevDepth;
uniform sampler2D tVelocity;
uniform sampler2D tHistory;
uniform vec2 inRes;
uniform vec2 outRes;
uniform vec2 jitter;
uniform mat4 reproj;
uniform float reset;
uniform float havePrevDepth;
uniform float maxConf;
uniform float kernelScale;
uniform vec2 clipRange;
varying vec2 vUv;

vec3 toYCoCg(vec3 c) {
  return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25)));
}
vec3 fromYCoCg(vec3 y) {
  return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z);
}
float viewDistance(float z) {
  float n = clipRange.x, f = clipRange.y;
  return 2.0 * n * f / (f + n - (z * 2.0 - 1.0) * (f - n));
}
// FSR 2's polynomial fit to Lanczos-2, taking the squared distance (no square root).
float lanczos2(float x2) {
  if (x2 >= 4.0) return 0.0;
  float a = 0.4 * x2 - 1.0, b = 0.25 * x2 - 1.0;
  return (1.5625 * a * a - 0.5625) * (b * b);
}

// Bicubic Catmull-Rom history fetch in five bilinear taps: keeps the history sharp as it is
// resampled every frame, where a plain bilinear fetch would blur it a little each time.
vec4 historyCatmullRom(vec2 uv) {
  vec2 pos = uv * outRes;
  vec2 c = floor(pos - 0.5) + 0.5;
  vec2 f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 t0 = (c - 1.0) / outRes;
  vec2 t3 = (c + 2.0) / outRes;
  vec2 t12 = (c + o12) / outRes;
  vec4 r = texture2D(tHistory, vec2(t12.x, t0.y)) * w12.x * w0.y
    + texture2D(tHistory, vec2(t0.x, t12.y)) * w0.x * w12.y
    + texture2D(tHistory, t12) * w12.x * w12.y
    + texture2D(tHistory, vec2(t3.x, t12.y)) * w3.x * w12.y
    + texture2D(tHistory, vec2(t12.x, t3.y)) * w12.x * w3.y;
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / wsum, vec4(0.0));
}

// Pull a history colour toward the box centre until it sits inside the box.
vec3 clipToBox(vec3 h, vec3 lo, vec3 hi) {
  vec3 centre = 0.5 * (hi + lo);
  vec3 extent = 0.5 * (hi - lo) + 1e-5;
  vec3 v = h - centre;
  vec3 a = abs(v / extent);
  float m = max(a.x, max(a.y, a.z));
  return m > 1.0 ? centre + v / m : h;
}

void main() {
  vec2 texel = 1.0 / inRes;
  vec2 jitterUv = jitter * texel;
  // Where this output pixel lands on the jittered internal grid (texel centres on integers).
  vec2 pos = (vUv + jitterUv) * inRes - 0.5;
  vec2 base = floor(pos + 0.5);

  vec3 sum = vec3(0.0);
  float wsum = 0.0, peak = 0.0;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  vec3 lo = vec3(1e5), hi = vec3(-1e5);
  vec3 rgbLo = vec3(1e5), rgbHi = vec3(-1e5);
  vec3 nearestColour = vec3(0.0);
  float nearestW = -1.0;
  float nearest = 1.0;
  vec2 nearestTexel = base;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 t = base + vec2(float(x), float(y));
      vec2 tuv = (t + 0.5) * texel;
      vec3 c = texture2D(tColor, tuv).rgb;
      vec3 yc = toYCoCg(c);
      // Measured partly in output pixels, so a sample mostly feeds the pixel it landed on and
      // fine detail builds up over frames instead of being smeared across neighbours.
      vec2 d = (t - pos) * kernelScale;
      float d2 = dot(d, d);
      float w = lanczos2(d2);
      sum += c * w;
      wsum += w;
      float g = exp(-2.29 * d2);
      peak = max(peak, g);
      if (g > nearestW) {
        nearestW = g;
        nearestColour = c;
      }
      m1 += yc;
      m2 += yc * yc;
      lo = min(lo, yc);
      hi = max(hi, yc);
      rgbLo = min(rgbLo, c);
      rgbHi = max(rgbHi, c);
      float z = texture2D(tDepth, tuv).r;
      if (z < nearest) {
        nearest = z;
        nearestTexel = t;
      }
    }
  }
  // Lanczos' negative lobes sharpen; clamping to the neighbourhood stops them ringing.
  vec3 current = wsum > 0.05 ? clamp(sum / wsum, rgbLo, rgbHi) : nearestColour;

  // Motion, taken at the nearest neighbour so silhouettes carry the motion of the
  // foreground object rather than the background behind it.
  vec2 nearestUv = (nearestTexel + 0.5) * texel;
  vec2 s = nearestUv - jitterUv;
  float dist = viewDistance(nearest);
  vec4 vel = texture2D(tVelocity, nearestUv);
  vec2 motion;
  float expectedPrev;
  bool behindCamera = false;
  if (vel.a > 0.0 && abs(vel.b - dist) < 0.03 * dist + 0.03) {
    // This pixel belongs to an object that moved on its own: use its true motion.
    motion = vel.rg;
    expectedPrev = vel.a;
  } else {
    vec4 prevClip = reproj * vec4(s * 2.0 - 1.0, nearest * 2.0 - 1.0, 1.0);
    behindCamera = prevClip.w <= 0.0;
    motion = prevClip.xy / prevClip.w * 0.5 + 0.5 - s;
    expectedPrev = prevClip.w;
  }
  vec2 prevUv = vUv + motion;
  bool offscreen = any(lessThan(prevUv, vec2(0.0))) || any(greaterThan(prevUv, vec2(1.0)));

  // Disocclusion: if last frame had something clearly nearer at the spot this surface came
  // from, this surface was hidden then and its history belongs to something else. The
  // farthest of four taps is used so sub-pixel jitter at silhouettes is not mistaken for it.
  bool disoccluded = false;
  if (havePrevDepth > 0.5 && !offscreen && !behindCamera) {
    vec2 h = 0.5 * texel;
    float far = max(
      max(viewDistance(texture2D(tPrevDepth, prevUv + vec2(-h.x, -h.y)).r), viewDistance(texture2D(tPrevDepth, prevUv + vec2(h.x, -h.y)).r)),
      max(viewDistance(texture2D(tPrevDepth, prevUv + vec2(-h.x, h.y)).r), viewDistance(texture2D(tPrevDepth, prevUv + vec2(h.x, h.y)).r)));
    disoccluded = far < expectedPrev * 0.9 - 0.05;
  }

  vec4 hist = historyCatmullRom(prevUv);
  float conf = (reset > 0.5 || offscreen || behindCamera || disoccluded) ? 0.0 : hist.a;

  // Variance clipping box, tighter when the image is moving fast.
  float speed = length(motion * outRes);
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, 0.0));
  float gamma = mix(1.25, 0.85, clamp(speed / 12.0, 0.0, 1.0));
  vec3 boxLo = max(lo, mean - gamma * sigma);
  vec3 boxHi = min(hi, mean + gamma * sigma);
  vec3 hy = toYCoCg(hist.rgb);
  vec3 cy = toYCoCg(current);
  vec3 clipped = conf > 0.0 ? clipToBox(hy, boxLo, boxHi) : cy;
  // History that had to be pulled a long way was stale: trust it less from here on.
  float pulled = length(hy - clipped) / max(clipped.x + 0.05, 0.05);
  conf *= clamp(1.0 - pulled * 1.5, 0.2, 1.0);
  conf *= 1.0 / (1.0 + speed * 0.03);

  // A sample sitting right on this output pixel counts fully; one a texel away counts less.
  float coverage = peak;
  float total = conf + coverage;
  float alpha = coverage / max(total, 1e-4);
  // Luma-weighted blend: bright single-frame sparkles (sun glints) do not flicker.
  float wh = (1.0 - alpha) / (1.0 + clipped.x);
  float wc = alpha / (1.0 + cy.x);
  vec3 outY = (clipped * wh + cy * wc) / max(wh + wc, 1e-5);
  gl_FragColor = vec4(max(fromYCoCg(outY), 0.0), min(total, maxConf));
}`;

// FSR 1 robust contrast-adaptive sharpening (RCAS), with its noise guard, plus the optional
// split-screen comparison against a plain bilinear stretch of the internal frame.
const OUTPUT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform sampler2D tLow;
uniform vec2 outRes;
uniform vec2 lowJitter;
uniform float sharpness;
uniform float split;
varying vec2 vUv;

void main() {
  vec2 px = 1.0 / outRes;
  if (vUv.x < split) {
    vec3 low = texture2D(tLow, vUv + lowJitter).rgb;
    float edge = 1.0 - smoothstep(0.0, 1.5 * px.x, abs(vUv.x - split + px.x));
    gl_FragColor = vec4(mix(low, vec3(1.0), edge * 0.8), 1.0);
    return;
  }
  vec3 b = clamp(texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb, 0.0, 1.0);
  vec3 d = clamp(texture2D(tSrc, vUv - vec2(px.x, 0.0)).rgb, 0.0, 1.0);
  vec3 e = clamp(texture2D(tSrc, vUv).rgb, 0.0, 1.0);
  vec3 f = clamp(texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb, 0.0, 1.0);
  vec3 h = clamp(texture2D(tSrc, vUv - vec2(0.0, px.y)).rgb, 0.0, 1.0);
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = mn4 / (4.0 * mx4 + 1e-5);
  vec3 hitMax = (1.0 - mx4) / (4.0 * mn4 - 4.0 - 1e-5);
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-(0.25 - 1.0 / 16.0), min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * sharpness;
  // Noise guard: soften the lobe where the centre is an isolated outlier, so sharpening
  // does not amplify grain or residual shimmer.
  float bL = b.g + 0.5 * (b.r + b.b), dL = d.g + 0.5 * (d.r + d.b), eL = e.g + 0.5 * (e.r + e.b);
  float fL = f.g + 0.5 * (f.r + f.b), hL = h.g + 0.5 * (h.r + h.b);
  float nz = 0.25 * (bL + dL + fL + hL) - eL;
  float range = max(max(bL, dL), max(fL, hL)) - min(min(bL, dL), min(fL, hL));
  nz = clamp(abs(nz) / max(range, 1e-4), 0.0, 1.0);
  lobe *= 1.0 - 0.5 * nz;
  vec3 c = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
  gl_FragColor = vec4(c, 1.0);
}`;

function quadPass(fragmentShader, uniforms) {
  const material = new T.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new T.Scene();
  scene.add(mesh);
  return {scene, material};
}

export function createUpscaler(renderer) {
  const gl = renderer.getContext?.();
  const isWebGL2 = !!renderer.capabilities?.isWebGL2 || (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
  const halfFloat = isWebGL2 && !!(renderer.extensions?.has?.('EXT_color_buffer_float') || renderer.extensions?.has?.('EXT_color_buffer_half_float'));
  const supported = !!(gl && isWebGL2 && halfFloat && renderer.setRenderTarget);
  const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const resolve = quadPass(RESOLVE_FRAG, {
    tColor: {value: null},
    tDepth: {value: null},
    tPrevDepth: {value: null},
    tVelocity: {value: null},
    tHistory: {value: null},
    inRes: {value: new T.Vector2(1, 1)},
    outRes: {value: new T.Vector2(1, 1)},
    jitter: {value: new T.Vector2()},
    reproj: {value: new T.Matrix4()},
    reset: {value: 1},
    havePrevDepth: {value: 0},
    maxConf: {value: 10},
    kernelScale: {value: 1},
    clipRange: {value: new T.Vector2(0.1, 1000)},
  });
  const output = quadPass(OUTPUT_FRAG, {
    tSrc: {value: null},
    tLow: {value: null},
    outRes: {value: new T.Vector2(1, 1)},
    lowJitter: {value: new T.Vector2()},
    sharpness: {value: 0.55},
    split: {value: -1},
  });

  // Moving meshes are redrawn through proxies that share their geometry, inside a scene of
  // their own; the shared velocity material reads each proxy's previous matrix just before
  // its draw.
  const velocityMat = new T.ShaderMaterial({
    vertexShader: VELOCITY_VERT,
    fragmentShader: VELOCITY_FRAG,
    uniforms: {
      prevModel: {value: new T.Matrix4()},
      prevViewProj: {value: new T.Matrix4()},
      curViewProj: {value: new T.Matrix4()},
    },
    side: T.DoubleSide,
    toneMapped: false,
  });
  velocityMat.onBeforeRender = (r, s, c, g, object) => {
    velocityMat.uniforms.prevModel.value.fromArray(object.userData.prev);
    velocityMat.uniformsNeedUpdate = true;
  };
  const velocityScene = new T.Scene(),
    proxies = [];
  const proxyAt = i => {
    if (!proxies[i]) {
      const p = new T.Mesh(undefined, velocityMat);
      p.matrixAutoUpdate = false;
      p.matrixWorldAutoUpdate = false;
      velocityScene.add(p);
      proxies[i] = p;
    }
    return proxies[i];
  };

  let internals = [null, null],
    velocity = null,
    history = [null, null],
    ping = 0,
    frameIndex = 0,
    needsReset = true,
    hasPrev = false,
    havePrevDepth = false,
    autoScale = UPSCALE_MODES.auto,
    frameTimes = [],
    lastStamp = 0,
    lastAdjust = 0,
    movingCount = 0;
  const outSize = new T.Vector2(),
    inSize = new T.Vector2(),
    savedProj = new T.Matrix4(),
    savedProjInv = new T.Matrix4(),
    curViewProj = new T.Matrix4(),
    prevViewProj = new T.Matrix4(),
    invViewProj = new T.Matrix4(),
    prevCamPos = new T.Vector3(),
    clearColour = new T.Color(),
    prevMatrices = new WeakMap(),
    moving = [];

  function disposeInternal() {
    for (const t of internals) {
      t?.depthTexture?.dispose();
      t?.dispose();
    }
    velocity?.dispose();
    internals = [null, null];
    velocity = null;
    havePrevDepth = false;
  }
  function dispose() {
    disposeInternal();
    history.forEach(h => h?.dispose());
    history = [null, null];
  }
  function ensureTargets(scale) {
    renderer.getDrawingBufferSize(outSize);
    if (!history[0] || history[0].width !== outSize.x || history[0].height !== outSize.y) {
      history.forEach(h => h?.dispose());
      for (let i = 0; i < 2; i++)
        history[i] = new T.WebGLRenderTarget(outSize.x, outSize.y, {
          type: T.HalfFloatType,
          minFilter: T.LinearFilter,
          magFilter: T.LinearFilter,
          depthBuffer: false,
        });
      needsReset = true;
    }
    const w = Math.max(1, Math.round(outSize.x * scale)),
      h = Math.max(1, Math.round(outSize.y * scale));
    if (internals[0] && internals[0].width === w && internals[0].height === h) return;
    // A new internal size (resize or dynamic resolution) keeps the output-resolution history:
    // only last frame's depth is lost, for one frame.
    disposeInternal();
    for (let i = 0; i < 2; i++) {
      const t = new T.WebGLRenderTarget(w, h, {
        type: T.UnsignedByteType,
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        depthTexture: new T.DepthTexture(w, h, T.UnsignedIntType),
      });
      // Ask three to tone map and sRGB-encode into this target exactly as it does for the
      // screen (the same path WebXR layers use), so colours match with the upscaler off.
      t.isXRRenderTarget = true;
      t.texture.colorSpace = T.SRGBColorSpace;
      t.depthTexture.minFilter = t.depthTexture.magFilter = T.NearestFilter;
      internals[i] = t;
    }
    velocity = new T.WebGLRenderTarget(w, h, {
      type: T.HalfFloatType,
      minFilter: T.NearestFilter,
      magFilter: T.NearestFilter,
    });
    inSize.set(w, h);
  }

  // Dynamic resolution: watch the time between frames against the target and nudge the scale.
  function adaptScale(fps) {
    const now = performance.now(),
      gap = now - lastStamp;
    lastStamp = now;
    if (gap > 0 && gap < 250) frameTimes.push(gap);
    if (frameTimes.length > 40) frameTimes.shift();
    if (frameTimes.length < 20 || now - lastAdjust < 700) return;
    const sorted = [...frameTimes].sort((a, b) => a - b),
      typical = sorted[Math.floor(sorted.length * 0.6)],
      target = 1000 / fps;
    let next = autoScale;
    if (typical > target * 1.2) next -= 0.08;
    else if (typical > target * 1.08) next -= 0.03;
    else if (typical < target * 1.03) next += 0.02;
    next = Math.round(Math.min(AUTO_MAX, Math.max(AUTO_MIN, next)) * 40) / 40;
    if (next !== autoScale) {
      autoScale = next;
      lastAdjust = now;
      frameTimes = [];
    }
  }

  // Find the meshes whose world transform changed since last frame. Others just keep their
  // stored matrix up to date.
  function collectMoving(scenes, camera) {
    moving.length = 0;
    for (const scene of scenes)
      scene.traverseVisible(o => {
        if (!o.isMesh || o.isInstancedMesh || !o.layers.test(camera.layers)) return;
        const e = o.matrixWorld.elements,
          prev = prevMatrices.get(o);
        if (!prev) {
          prevMatrices.set(o, Float32Array.from(e));
          return;
        }
        let changed = false;
        for (let i = 0; i < 16; i++)
          if (Math.abs(prev[i] - e[i]) > 1e-6) {
            changed = true;
            break;
          }
        if (!changed) return;
        const m = o.material;
        // Capped so a busy frame cannot double the draw count; the rest fall back to camera
        // reprojection plus clipping.
        if (moving.length < MAX_MOVING && m && !Array.isArray(m) && m.visible !== false && !m.transparent && m.depthWrite !== false)
          moving.push(o);
        else prev.set(e);
      });
    movingCount = moving.length;
  }
  function drawVelocity(camera) {
    renderer.getClearColor(clearColour);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(velocity);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setClearColor(clearColour, clearAlpha);
    if (!moving.length) return;
    velocityMat.uniforms.prevViewProj.value.copy(hasPrev ? prevViewProj : curViewProj);
    velocityMat.uniforms.curViewProj.value.copy(curViewProj);
    let i = 0;
    for (; i < moving.length; i++) {
      const o = moving[i],
        p = proxyAt(i);
      p.geometry = o.geometry;
      p.matrixWorld.copy(o.matrixWorld);
      p.frustumCulled = o.frustumCulled;
      p.userData.prev = prevMatrices.get(o);
      p.visible = true;
    }
    for (; i < proxies.length; i++) proxies[i].visible = false;
    renderer.render(velocityScene, camera);
    for (const o of moving) prevMatrices.get(o).set(o.matrixWorld.elements);
  }

  // draw() renders the frame (sky, clear depth, world) with the given camera; it is called
  // once with the internal target bound and a jittered projection. scenes are searched for
  // moving meshes.
  function render(draw, camera, {mode = 'quality', sharpness = 'standard', fps = 60, scenes = []} = {}) {
    let scale = UPSCALE_MODES[mode];
    if (!supported || !scale) {
      if (internals[0] || history[0]) dispose();
      hasPrev = false;
      draw();
      return false;
    }
    if (mode === 'auto') {
      adaptScale(fps);
      scale = autoScale;
    }
    ensureTargets(scale);
    const internal = internals[ping],
      prevInternal = internals[1 - ping];
    // Halton phase count grows with the upscale factor so every output pixel is visited.
    const ratio = outSize.x / inSize.x;
    const phases = Math.max(8, Math.ceil(8 * ratio * ratio));
    frameIndex = (frameIndex % phases) + 1;
    const jx = halton(frameIndex, 2) - 0.5,
      jy = halton(frameIndex, 3) - 0.5;

    camera.updateMatrixWorld();
    curViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // A cut (region change, view switch, teleport) starts the history again.
    if (!hasPrev || camera.position.distanceTo(prevCamPos) > 6) needsReset = true;

    savedProj.copy(camera.projectionMatrix);
    savedProjInv.copy(camera.projectionMatrixInverse);
    camera.projectionMatrix.elements[8] -= (2 * jx) / inSize.x;
    camera.projectionMatrix.elements[9] -= (2 * jy) / inSize.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(internal);
    draw();
    // World matrices are current for this frame now that the scene has rendered.
    collectMoving(scenes, camera);
    drawVelocity(camera);
    camera.projectionMatrix.copy(savedProj);
    camera.projectionMatrixInverse.copy(savedProjInv);

    invViewProj.copy(curViewProj).invert();
    const u = resolve.material.uniforms;
    u.tColor.value = internal.texture;
    u.tDepth.value = internal.depthTexture;
    u.tPrevDepth.value = prevInternal.depthTexture;
    u.tVelocity.value = velocity.texture;
    u.tHistory.value = history[ping].texture;
    u.inRes.value.copy(inSize);
    u.outRes.value.copy(outSize);
    u.jitter.value.set(jx, jy);
    u.reproj.value.multiplyMatrices(hasPrev ? prevViewProj : curViewProj, invViewProj);
    u.reset.value = needsReset ? 1 : 0;
    u.havePrevDepth.value = havePrevDepth && !needsReset ? 1 : 0;
    u.maxConf.value = 8 + 4 * (ratio - 1);
    u.kernelScale.value = Math.sqrt(ratio);
    u.clipRange.value.set(camera.near, camera.far);
    const dst = history[1 - ping];
    renderer.setRenderTarget(dst);
    renderer.render(resolve.scene, quadCam);

    const o = output.material.uniforms;
    o.tSrc.value = dst.texture;
    o.tLow.value = internal.texture;
    o.outRes.value.copy(outSize);
    o.lowJitter.value.set(jx / inSize.x, jy / inSize.y);
    // FSR's RCAS strength is exp2(-stops); stronger by default the further it upscales.
    const base = UPSCALE_SHARPNESS[sharpness] ?? UPSCALE_SHARPNESS.standard;
    o.sharpness.value = Math.min(1, base + 0.12 * (ratio - 1));
    renderer.setRenderTarget(prevTarget);
    renderer.render(output.scene, quadCam);

    ping = 1 - ping;
    prevViewProj.copy(curViewProj);
    prevCamPos.copy(camera.position);
    hasPrev = true;
    havePrevDepth = true;
    needsReset = false;
    return true;
  }
  return {
    supported,
    render,
    reset: () => (needsReset = true),
    // Left part of the screen shows the raw internal frame stretched bilinearly, for comparison.
    setSplit: x => (output.material.uniforms.split.value = x == null ? -1 : x),
    info: () => ({
      input: [inSize.x, inSize.y],
      output: [outSize.x, outSize.y],
      active: !!internals[0],
      scale: outSize.x ? Math.round((inSize.x / outSize.x) * 100) : 0,
      moving: movingCount,
    }),
    dispose,
  };
}
