# Clearwater temporal super resolution

Stillwater v1.9 (build 11) adds a temporal upscaler, `dist/upscaler.js`. It works like AMD FSR 2/3, Unreal's TSR and the hand-tuned DLSS 1.9: the game draws fewer pixels each frame, then rebuilds a full-resolution image from several frames.

## What it is, and what it is not

DLSS 4/5 and FSR 4 rebuild the image with trained neural networks running on dedicated GPU hardware (NVIDIA tensor cores, AMD RDNA 4 matrix units). A web page cannot reach that hardware, and the networks are not public. **Anything in a browser that calls itself "DLSS 5" or "FSR 4" is a different technique using the name.**

The strongest method a browser can run is the analytic temporal upscaler that FSR 2/3 established. That is what this is, built from scratch on the published techniques, with no third-party code.

## How it works, one frame at a time

1. **Jittered low-resolution render.**
   - The world is drawn into an internal target at the chosen scale (table below).
   - Each frame the camera's projection is shifted by a different sub-pixel offset from the Halton (2,3) sequence.
   - The sequence length grows with the upscale factor (8 × ratio²), as FSR 2 does, so every output pixel eventually receives real samples.
2. **Same colours as without it.**
   - The internal target is flagged so three.js applies the same ACES tone mapping and sRGB encoding it uses for the screen.
   - Every material, including the hand-written sky and water shaders, looks identical with the upscaler on or off.
3. **Reconstruction.**
   - For every output pixel, the nine nearest internal samples are weighted with a Gaussian fit to the Blackman-Harris kernel, after undoing that frame's jitter.
   - The kernel is measured partly in output pixels, so fine detail accumulates over frames instead of being smeared.
4. **Reprojection.**
   - Last frame's output is fetched through the camera's motion, reconstructed from the depth buffer: the world position is moved through the previous frame's view-projection.
   - Depth is taken from the nearest of the nine neighbours, so silhouettes move with the foreground object.
   - History is read with a 5-tap bicubic Catmull-Rom filter, so it stays sharp under repeated resampling.
5. **Anti-ghosting.**
   - History is clipped (not clamped) toward the mean of a YCoCg variance box built from the current neighbourhood.
   - The box tightens with on-screen speed.
   - History that had to be pulled far is trusted less from then on.
6. **Accumulation.**
   - A per-pixel confidence value (stored in the history alpha) sets how much of the new frame to blend in.
   - Pixels that just appeared (off-screen last frame, or after a camera cut) restart from the current frame.
   - Camera cuts (region change, lake ↔ aquarium) reset the history.
7. **Sharpening.**
   - AMD's FSR 1 RCAS (robust contrast-adaptive sharpening), including its noise guard, restores contrast lost to accumulation.
   - Strength rises automatically with the upscale factor.

## Modes (Options → Upscaler)

| Mode | Render scale | Pixels drawn | Like |
| --- | --- | --- | --- |
| Off | 100%, no temporal AA | 100% | — |
| Native AA | 100% | 100% | DLAA / FSR Native AA |
| Quality (default) | 67% | 44% | DLSS/FSR Quality |
| Balanced | 59% | 35% | DLSS/FSR Balanced |
| Performance | 50% | 25% | DLSS/FSR Performance |
| Ultra Perf. | 33% | 11% | DLSS/FSR Ultra Performance |

Sharpening can be set to Soft, Standard or Crisp. The Options screen shows the live internal and output resolution.

## How to compare it

- Add `?compare` to the game URL.
  - The left half of the screen shows the same low-resolution frame stretched with plain bilinear filtering.
  - The right half shows the upscaler.
  - A thin line marks the split.
- With `?dev`, the browser console also accepts:
  - `__dev.upscale('performance', 'crisp')`
  - `__dev.split(0.5)` (`__dev.split(null)` hides it)
  - `__dev.upscaleInfo()`
- Fair test points:
  - tree and rooftop silhouettes against the sky (edge quality and stability);
  - the dock planks and rod while the camera orbits (shimmer and ghosting);
  - fish swimming in the aquarium (ghosting on things that move on their own).

## Known limits

- **No per-object motion vectors.**
  - Camera motion is reprojected exactly.
  - Things that move by themselves (fish, waves, boats, the rod) rely on neighbourhood clipping. That prevents ghost trails but leaves fast movers a little softer than static scenery.
  - Full motion vectors would need every material to write a second output, which is a much bigger change.
- **No texture mip bias.** FSR recommends sharpening texture sampling to match the output resolution, but three.js has no global switch for that. Anisotropic filtering covers most of it.
- **Needs WebGL 2 with float render targets.** Without them it switches itself off and the game draws at full resolution as before. The Options screen says so.
- **Untested on real hardware.**
  - Tested only in software-rendered headless Chromium, which runs at about 3 frames per second.
  - Image quality checks there are meaningful; frame rate and heat on an iPhone are not yet measured.
