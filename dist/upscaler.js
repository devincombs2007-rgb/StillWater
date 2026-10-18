// Clearwater temporal super resolution: a temporal upscaler in the family of FSR 2/3 and
// the hand-written (pre-neural) DLSS 1.9 / Unreal TSR. It renders the world at a lower internal
// resolution with a different sub-pixel camera offset every frame (Halton 2,3), then
// rebuilds a full-resolution image by reprojecting the previous output through the camera's
// motion and blending in each new frame's samples. Over a few frames every output pixel
// collects many real samples, so edges come out cleaner than plain MSAA at a fraction of
// the shading cost. Then an FSR-style RCAS pass restores contrast.
//
// What it is not: DLSS 4/5 and FSR 4 use trained neural networks on dedicated GPU hardware;
// those cannot run in WebGL. Everything here is analytic. There are also no per-object
// motion vectors: camera motion is reprojected exactly from depth, and anything that moves
// on its own (fish, waves, boats) is kept honest by neighbourhood clipping, which stops ghosts
// at the cost of a little softness on fast movers.
//
// Colour flows through in display space: the internal target is flagged so three applies
// the same ACES tone mapping and sRGB encoding as the screen. Every material, including the
// hand-written sky shaders, therefore looks identical with the upscaler on or off.
import * as T from './assets/three.module.js';

// Internal render scale per mode, matching the published FSR / DLSS ratios.
export const UPSCALE_MODES = {
  off: 0,
  native: 1,
  quality: 1 / 1.5,
  balanced: 1 / 1.7,
  performance: 1 / 2,
  'ultra-performance': 1 / 3,
};
export const UPSCALE_SHARPNESS = {soft: 0.25, standard: 0.55, crisp: 0.85};

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

// Reconstruct the current frame at the output pixel, reproject and clip history, blend.
const RESOLVE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tHistory;
uniform vec2 inRes;
uniform vec2 outRes;
uniform vec2 jitter;
uniform mat4 reproj;
uniform float reset;
uniform float maxConf;
uniform float kernelScale;
varying vec2 vUv;

vec3 toYCoCg(vec3 c) {
  return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25)));
}
vec3 fromYCoCg(vec3 y) {
  return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z);
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

// Pull a history colour toward the neighbourhood mean until it sits inside the box.
vec3 clipToBox(vec3 h, vec3 lo, vec3 hi, vec3 mean) {
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
  float nearest = 1.0;
  vec2 nearestTexel = base;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 t = base + vec2(float(x), float(y));
      vec2 tuv = (t + 0.5) * texel;
      vec3 c = texture2D(tColor, tuv).rgb;
      vec3 yc = toYCoCg(c);
      // Gaussian fit to Blackman-Harris, the reconstruction kernel FSR 2 and TSR approximate.
      // Measured partly in output pixels, so a sample mostly feeds the pixel it landed on and
      // fine detail builds up over frames instead of being smeared across neighbours.
      vec2 d = (t - pos) * kernelScale;
      float w = exp(-2.29 * dot(d, d));
      sum += c * w;
      wsum += w;
      peak = max(peak, w);
      m1 += yc;
      m2 += yc * yc;
      lo = min(lo, yc);
      hi = max(hi, yc);
      float z = texture2D(tDepth, tuv).r;
      if (z < nearest) {
        nearest = z;
        nearestTexel = t;
      }
    }
  }
  vec3 current = sum / max(wsum, 1e-5);

  // Camera motion from depth, taken at the nearest neighbour so silhouettes carry the
  // motion of the foreground object rather than the background behind it.
  vec2 s = (nearestTexel + 0.5) * texel - jitterUv;
  vec4 prevClip = reproj * vec4(s * 2.0 - 1.0, nearest * 2.0 - 1.0, 1.0);
  vec2 motion = prevClip.xy / prevClip.w * 0.5 + 0.5 - s;
  vec2 prevUv = vUv + motion;
  bool offscreen = any(lessThan(prevUv, vec2(0.0))) || any(greaterThan(prevUv, vec2(1.0)));

  vec4 hist = historyCatmullRom(prevUv);
  float conf = (reset > 0.5 || offscreen || prevClip.w <= 0.0) ? 0.0 : hist.a;

  // Variance clipping box, tighter when the image is moving fast.
  float speed = length(motion * outRes);
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(max(m2 / 9.0 - mean * mean, 0.0));
  float gamma = mix(1.25, 0.85, clamp(speed / 12.0, 0.0, 1.0));
  vec3 boxLo = max(lo, mean - gamma * sigma);
  vec3 boxHi = min(hi, mean + gamma * sigma);
  vec3 hy = toYCoCg(hist.rgb);
  vec3 clipped = conf > 0.0 ? clipToBox(hy, boxLo, boxHi, mean) : toYCoCg(current);
  // History that had to be pulled a long way was stale: trust it less from here on.
  float pulled = length(hy - clipped) / max(clipped.x + 0.05, 0.05);
  conf *= clamp(1.0 - pulled * 1.5, 0.2, 1.0);
  conf *= 1.0 / (1.0 + speed * 0.03);

  // A sample sitting right on this output pixel counts fully; one a texel away counts less.
  float coverage = peak;
  float total = conf + coverage;
  float alpha = coverage / max(total, 1e-4);
  vec3 outY = mix(clipped, toYCoCg(current), alpha);
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
  vec3 b = texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb;
  vec3 d = texture2D(tSrc, vUv - vec2(px.x, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb;
  vec3 h = texture2D(tSrc, vUv - vec2(0.0, px.y)).rgb;
  b = clamp(b, 0.0, 1.0); d = clamp(d, 0.0, 1.0); e = clamp(e, 0.0, 1.0);
  f = clamp(f, 0.0, 1.0); h = clamp(h, 0.0, 1.0);
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
    tHistory: {value: null},
    inRes: {value: new T.Vector2(1, 1)},
    outRes: {value: new T.Vector2(1, 1)},
    jitter: {value: new T.Vector2()},
    reproj: {value: new T.Matrix4()},
    reset: {value: 1},
    maxConf: {value: 10},
    kernelScale: {value: 1},
  });
  const output = quadPass(OUTPUT_FRAG, {
    tSrc: {value: null},
    tLow: {value: null},
    outRes: {value: new T.Vector2(1, 1)},
    lowJitter: {value: new T.Vector2()},
    sharpness: {value: 0.55},
    split: {value: -1},
  });
  let internal = null,
    history = [null, null],
    ping = 0,
    frameIndex = 0,
    needsReset = true,
    hasPrev = false;
  const outSize = new T.Vector2(),
    inSize = new T.Vector2(),
    savedProj = new T.Matrix4(),
    savedProjInv = new T.Matrix4(),
    curViewProj = new T.Matrix4(),
    prevViewProj = new T.Matrix4(),
    invViewProj = new T.Matrix4(),
    prevCamPos = new T.Vector3();

  function dispose() {
    internal?.depthTexture?.dispose();
    internal?.dispose();
    history.forEach(h => h?.dispose());
    internal = null;
    history = [null, null];
  }
  function ensureTargets(scale) {
    renderer.getDrawingBufferSize(outSize);
    const w = Math.max(1, Math.round(outSize.x * scale)),
      h = Math.max(1, Math.round(outSize.y * scale));
    if (internal && internal.width === w && internal.height === h && history[0].width === outSize.x && history[0].height === outSize.y)
      return;
    dispose();
    internal = new T.WebGLRenderTarget(w, h, {
      type: T.UnsignedByteType,
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      depthTexture: new T.DepthTexture(w, h, T.UnsignedIntType),
    });
    // Ask three to tone map and sRGB-encode into this target exactly as it does for the
    // screen (the same path WebXR layers use), so colours match with the upscaler off.
    internal.isXRRenderTarget = true;
    internal.texture.colorSpace = T.SRGBColorSpace;
    internal.depthTexture.minFilter = internal.depthTexture.magFilter = T.NearestFilter;
    for (let i = 0; i < 2; i++)
      history[i] = new T.WebGLRenderTarget(outSize.x, outSize.y, {
        type: T.HalfFloatType,
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        depthBuffer: false,
      });
    inSize.set(w, h);
    needsReset = true;
  }

  // draw() renders the frame (sky, clear depth, world) with the given camera; it is called
  // once with the internal target bound and a jittered projection.
  function render(draw, camera, mode = 'quality', sharpness = 'standard') {
    const scale = UPSCALE_MODES[mode];
    if (!supported || !scale) {
      if (internal) dispose();
      hasPrev = false;
      draw();
      return false;
    }
    ensureTargets(scale);
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
    camera.projectionMatrix.copy(savedProj);
    camera.projectionMatrixInverse.copy(savedProjInv);

    invViewProj.copy(curViewProj).invert();
    const u = resolve.material.uniforms;
    u.tColor.value = internal.texture;
    u.tDepth.value = internal.depthTexture;
    u.tHistory.value = history[ping].texture;
    u.inRes.value.copy(inSize);
    u.outRes.value.copy(outSize);
    u.jitter.value.set(jx, jy);
    u.reproj.value.multiplyMatrices(hasPrev ? prevViewProj : curViewProj, invViewProj);
    u.reset.value = needsReset ? 1 : 0;
    u.maxConf.value = 8 + 4 * (ratio - 1);
    u.kernelScale.value = Math.sqrt(ratio);
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
    needsReset = false;
    return true;
  }
  return {
    supported,
    render,
    reset: () => (needsReset = true),
    // Left part of the screen shows the raw internal frame stretched bilinearly, for comparison.
    setSplit: x => (output.material.uniforms.split.value = x == null ? -1 : x),
    info: () => ({input: [inSize.x, inSize.y], output: [outSize.x, outSize.y], active: !!internal}),
    dispose,
  };
}
