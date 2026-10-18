# Clearwater temporal super resolution

`dist/upscaler.js` is a temporal upscaler in the same family as AMD FSR 2/3, Unreal's TSR and the hand-tuned DLSS 1.9. The game renders fewer pixels each frame, and the upscaler rebuilds a full-resolution image from several frames.

It is one self-contained file with no imports. Three.js is passed in, so it works with any copy of three r150 or later.

## What it is, and what it is not

DLSS 4/5 and FSR 4 rebuild the image with trained neural networks running on dedicated GPU hardware. A web page cannot reach that hardware, and the networks are not public, so anything in a browser that calls itself DLSS 5 or FSR 4 is a different technique using the name.

The strongest method a browser can run is the analytic temporal upscaler that FSR 2/3 established. This is that, written from the published techniques with no third-party code.

## Drop-in use

```js
import {createUpscaler} from './upscaler.js';
const upscaler = createUpscaler(renderer, THREE); // options: {msaa: 4}

// each frame, instead of drawing straight to the screen:
upscaler.render(() => {
  renderer.clear();
  renderer.render(scene, camera);
}, camera, {mode: 'quality', sharpness: 'standard', fps: 60, scenes: [scene]});

// on a camera cut (teleport, view switch)
upscaler.reset();

// animated transparent surfaces such as water:
waterMaterial.userData.upscaleReactive = 1;
```

Requirements:
- `renderer.autoClear = false` (the draw callback clears).
- Normal three.js tone mapping and output colour space on the renderer. The upscaler reproduces them exactly.

Modes:

| Mode | Render scale | Pixels drawn |
| --- | --- | --- |
| `off` | — | 100% |
| `auto` | 50–100%, dynamic | varies |
| `native` | 100% | 100% |
| `ultra-quality` | 77% | 59% |
| `quality` | 67% | 44% |
| `balanced` | 59% | 35% |
| `performance` | 50% | 25% |
| `ultra-performance` | 33% | 11% |

Sharpening: `soft`, `standard` or `crisp`.

## How it works, per frame

1. **Jittered internal render.**
   - The scene is drawn at the internal scale with 4× MSAA.
   - The camera is shifted by a different sub-pixel offset each frame, from a Halton (2,3) sequence of at least 32 phases (a power of two).
   - The internal target is flagged so three.js applies the same ACES tone mapping and sRGB encoding as the screen, so every material looks identical with the upscaler on or off.
   - Two internal targets alternate, so last frame's depth is still available.
2. **Texture mip bias.** Standard materials are patched once (wrapping any `onBeforeCompile` they already have) to sample textures at `log2(render scale) − 0.5`, so the lower resolution does not blur them.
3. **Motion vectors.**
   - Camera motion is reconstructed exactly from depth.
   - Every mesh whose transform changed since last frame is drawn again, up to 160 of them, into a small velocity target with its previous and current matrices.
   - Reactive surfaces write a flag into the same target.
4. **Resolve, at output resolution:**
   - Each low-resolution sample is weighted by its distance to the output pixel's centre, and the history keeps the running weighted average (sample accumulation, as FSR 2 and DLSS do).
   - History is fetched with a sharpened Keys cubic (a = −0.75), which offsets the softening of resampling every frame during motion.
   - Pixels whose surface was hidden last frame are detected from last frame's depth and restart from the current frame.
   - History is clipped to a YCoCg variance box. The box is wide on still pixels, so thin wires seen by only some frames survive, and tight with min/max limits on moving pixels, so nothing ghosts.
   - Confidence drops with on-screen speed and when history had to be pulled far. Reactive surfaces keep about one frame of history.
   - Blending is luma-weighted, so single-frame sparkles do not flicker.
5. **Sharpening.** AMD's FSR 1 RCAS with its noise guard. Strength rises with the upscale factor.

## Bench

`tools/upscale-bench/` renders one deterministic scene of hard cases with every method and scores each frame against a 16-samples-per-pixel reference:
- PSNR (accuracy);
- SSIM (structure);
- flicker (frame-to-frame change against the reference's own change);
- PSNR on the animated water alone.

The hard cases are sub-pixel wires, a picket fence, a fine ground grid, small text, a spinning turbine, a fast striped fish, a sun glint and animated transparent water.

Serve the repository root and open `tools/upscale-bench/`, then press **Score every method**, or add `?run`. `?tune={…}` overrides any tuning value (see `TUNE` in `upscaler.js`). `tune.debug = 'confidence'` and `tune.debug = 'motion'` show the history confidence and the motion field.

The bench also runs Gemini's v1.8.1 FSR 1 port (`gemini-fsr1.js`, copied verbatim from its `scene.js`). It runs twice:
- **as shipped:** its render target skips tone mapping and sRGB encoding, so the game comes out much darker;
- **colour fixed:** with the one-line fix, so its algorithm gets a fair test.

### Results, 640×360, 64 frames (headless Chromium, SwiftShader)

| Method | Pixels | Still PSNR | Still SSIM | Moving PSNR | Moving SSIM | Moving flicker | Water PSNR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Native, no AA | 100% | 25.22 | 0.916 | 25.44 | 0.923 | 5.47 | 32.45 |
| Native, 4× MSAA | 100% | 27.43 | 0.948 | 27.97 | 0.955 | 3.96 | 32.64 |
| Gemini FSR 1 Quality, as shipped | 44% | 13.57 | 0.702 | 13.48 | 0.710 | 10.91 | 17.73 |
| Gemini FSR 1 Quality, colour fixed | 44% | 22.18 | 0.819 | 22.33 | 0.831 | 8.03 | 27.09 |
| Gemini FSR 1 Performance, colour fixed | 25% | 21.90 | 0.808 | 21.71 | 0.805 | 8.64 | 26.86 |
| Clearwater Native AA | 100% | 30.37 | 0.965 | 28.33 | 0.943 | 4.18 | 36.71 |
| Clearwater Ultra Quality | 59% | 28.42 | 0.945 | 26.98 | 0.924 | 4.97 | 34.58 |
| Clearwater Quality | 44% | 27.76 | 0.933 | 26.50 | 0.914 | 5.29 | 34.93 |
| Clearwater Balanced | 35% | 26.58 | 0.913 | 25.51 | 0.893 | 6.05 | 31.90 |
| Clearwater Performance | 25% | 25.46 | 0.884 | 24.29 | 0.859 | 6.93 | 30.65 |
| Clearwater Ultra Performance | 11% | 22.29 | 0.769 | 21.70 | 0.750 | 9.88 | 26.39 |

These tables are run with the bench's `?run`. Timings from the software renderer are not meaningful, so they are left out.

### What the bench changed

Each of these was found by the bench and fixed:

- **Thin features were clipped away.** Wires and turbine blades broke up. Fixed by the motion-aware clip box and 4× MSAA on the internal frame.
- **Uneven jitter coverage.** An 18-phase jitter sequence covered the pixel unevenly; power-of-two phase counts fixed it.
- **Disocclusion detection did nothing.** The reprojected depth was missing a w divide.
- **Static objects took moving objects' motion.** The velocity depth match was too loose: fence pickets just in front of the moving fish took on its motion.
- **Shader compile failures.** Two upscalers on one page patched materials twice.
- **Tuning, chosen by measurement:**
  - history cubic sharpness;
  - confidence drop with speed;
  - clip-box widths;
  - reactive history length.

## Known limits

- **No motion vectors for shader animation.** Vertex animation done inside shaders (grass sway, wave displacement) relies on clipping alone, so it comes out a little softer.
- **Phone performance unmeasured.** Frame rate, heat and battery on an iPhone have not been measured. The costs:
  - one extra draw per moving object (capped at 160);
  - a resolve pass of about 30 texture reads per output pixel;
  - 4× MSAA on the internal frame, which is cheap on tile-based phone GPUs.
- **WebGL 2 with float render targets required.** Without them the upscaler switches itself off and the game draws normally. The Options screen says so.
- **Synthetic bench.** It covers the cases that usually break upscalers, but it is not the game. In-game checks so far are screenshots in the same software renderer.
