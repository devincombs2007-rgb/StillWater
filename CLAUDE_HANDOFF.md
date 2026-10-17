# Stillwater — Claude continuation handoff

Prepared for Devin Combs, 17 October 2026. Current development cut: **v1.5.0, “The Living Water”** (Claude, on top of the published v1.4.0 “The Bait Shop”; `SOURCE_COMMIT.txt` still names the v1.4 published commit). v1.5 is in this repository but **has not been published to the live Site**. No work should be inferred from an earlier chat summary when the files disagree.

## Start here

Continue this game from the supplied source; do not replace it with a new prototype. Read this file and `README.md`, run `npm test`, then inspect the actual game in a browser/iPhone if your environment supports it. Serve the `dist` directory over HTTP; opening `index.html` as a file will not load ES modules reliably. For example:

```sh
python3 -m http.server 8000 --directory dist
```

There is no build step and no install is needed to serve the game. Tests require Node.js (Node 24 was used). Three.js is already vendored. Do not remove the existing save key, clear the player’s data, or break installed-home-screen updates.

Live game: https://stillwater-sanctuary-dev.devincombs.chatgpt.site

The live Site is owner-private. Its identity is in `.openai/hosting.json`. This archive does not provide hosting credentials or the player’s save. Claude can edit/run the supplied static source locally; publishing to the existing Site requires an authorized Sites-capable environment. A separate host is possible if Devin chooses one. Do not imply that opening the live URL grants repository or deployment access.

## v1.5 “The Living Water” — what changed

Bugs found by playing the game in headless Chromium and fixed:

- **Float off-screen on phones.** The third-person camera looked across the lake at the left bank, so on portrait screens the cast landed outside the view. The camera now orbits the angler but aims down the cast and follows the float out.
- **Starter gear could not land any uncommon fish.** Rarity added 0.8 power per tier, so every uncommon+ Willow Lake fish (~⅓ of bites) overpowered the willow rod/basic line. Rarity now adds 0.55, the willow rod is 1.8 and basic line 1.9. Overmatched fish are announced the moment they are hooked.
- **Cast button jumped** ~30px when “Let it go” appeared, so a second tap in the same place missed the hook. The link now reserves its row.
- **Aquarium fish balled up mid-tank.** Golden-angle phases × 1.31 ≈ π sent every fish to the same x goal. Fixed with a per-fish offset; `swimming.test.mjs` now asserts idle spread.
- **Boats leaned against the waves** (pitch and roll signs inverted relative to three.js Euler rotations).
- **Catch rig:** the line ran to a point in mid-air and the float covered the angler’s face. The fish now hangs from the real rod tip and the float hides while held. The float also no longer covers the face during character creation.
- Field-notes “new” dot never showed; journal from the aquarium switched to lake ambience; the willow rod could be “repaired” for pearls although it never wears; lines teleported back to the rod after misses/escapes; region sky palettes were overwritten every frame; long panels scrolled past their headings when opened.

Graphics: time-of-day sky with sun halo and drifting clouds driving lights, fog, mountain haze and water; new water shading (sky reflection, Fresnel, sun glints, ripple detail, rain rings, shallows and lapping foam at the banks, distance fog); lofted skiff hull with gunwales, floorboards and boot stripe; two-tone glossy float, sinker and hook; screen-width ribbon fishing line; wind sway on grass, canopies and reeds; spray particles; leaping/rising lake fish; aquarium light shafts.

Physics: spring-buoyant float with waterline, nibbles and bite plunges; hooked fish dragging and thrashing; recall/snap behaviour; damped spring-mass hull dynamics (`createHullMotion` in `surface.js`, tested) with line tug heeling the skiff; pellets and surface-cruising fish ripple the tank.

QoL: tap anywhere on the scene to hook/reel; 1–4 and C shortcuts; aquarium pearls dot; optional vibration (Options; iOS Safari ignores it); larger “Let it go” target; plain hook bite 48% → 56%; journal says “Not yet landed”; Battery mode skips heavy water detail.

Sources were run through Prettier once (separate commit, no behaviour change) so they are readable; tests were adjusted only for formatting and for the new ribbon line. Save key and payload version 3 are unchanged (new optional `haptics` field). Module URLs, build marker and worker cache are now **v6**.

Verified: all eight test files pass; end-to-end play in headless Chromium/SwiftShader at 390×844 and 1280×800 including lake/creek/cove/ocean regions and dawn/day/dusk/night, catch, aquarium, shop, journal and options with no console errors. **Not verified:** real iPhone Safari, GPU frame rate/thermals with the heavier water shader, touch feel, audio on hardware.

## Vision and tone

A calm, tactile, cartoon-styled fishing and aquarium game with a realistic touch. Minimal composition should feel rich and intentional, with attractive fish, water, convincing weight and movement, and detailed gentle audio. Devin is dissatisfied with bland environments, low-quality models, wonky casting, guaranteed catches, and abrupt swimming. He wants substantial polish and consequential choices, not an inventory of features that exist only as UI text. Preserve cozy pacing and avoid starvation penalties or irritating bait replenishment.

The stationary angler fishes by tapping/holding. There is no character locomotion or boat driving. Players can orbit the character/tank with a finger, fish in first person, land a fish into a front camera inspection, and raise it for income or a better future release value. Purchases compete for earned pearls. There are no real-money transactions.

## What is implemented now

- 60 procedural animated fish species and five rarities. Six regions: Willow Lake, Fernwater Creek, Starlit Cove (fresh), Harbor Reach, Sunbreak Reef, Open Blue (salt). Separate fresh/salt pools.
- Ballistic casting, a visible constrained rope, bobber, leader, hook and bait, bending rod, articulated hands, and spring-driven retrieval. Reel pulls physically flick the bobber closer. Final landing transitions to a front camera; the catch hangs with pendulum motion and can be rotated.
- Actual failure paths: no bite, missed hook, missed reel timing/slack, fish escape, inadequate gear strength, line snap, rod wear/breakage. Upgraded broken rods use a basic loaner until repaired. Rod and line strength are independent.
- **Permanent bait unlocks**, not consumables. Buy once, equip freely, unlimited casts; unlocks survive rebirth. Former bait stock and currently equipped bait migrate to ownership, even if the selected bait’s old stock is zero. New prices reflect permanent utility: worm 180, glow 1,200, silver 6,000, bluewater 22,000 pearls. Existing owners do not pay again.
- Rarity timing: common green window 68%, uncommon 50%, rare 34%, epic 22%, legendary 12%. Marker speeds increase from 0.00105 to 0.0042 radians/ms. UI and mechanical hit detection share the same profile. Reduced motion slows all marker speeds by 30%.
- Cast charging cycles smoothly between 0 and 100%; the rod/arms draw back at high charge and reset as power falls. Release adds a forward stroke. This is procedural posing, not a professional mocap/IK rig.
- Subtle catch rarity tint plus translucent halo. Rare is purple, legendary gold. Opacity/emissive levels are deliberately low so fish markings remain visible.
- Fixed character creation (name, skin, hair/style). Later apparel purchase/equipping covers shirt, hat, glasses, pants, shoes; luck bonuses work. First-person hands and touch orbit cameras.
- Keeping a catch transitions to the aquarium, drops it from above, triggers splash particles/ripples and neighboring fish scatter. Feeding uses limited acceleration/steering; no target teleporting. Fish grow from juveniles, have potential/weight, three care levels, income and age-sensitive release values. Natural growth continues without feeding.
- Damped finite-difference aquarium height field with reflecting walls and volume-neutral impulses. Visible mesh normals update with surface displacement. Freshwater and ocean use different coherent waves; CPU tackle/buoyancy samples match the wave height shader. Boats sample four hull points for damped rise, pitch and roll; the angler follows the anchored hull.
- Layered terrain, rounded tree canopies/grass, road cars, walking people, waterfront buildings, birds, distant boats/sails, palms, daylight/moon and simulated weather. The weather is game simulation, not a real forecast.
- Cosmetic anchored boat tiers, aquarium capacity/filter/decor, apparel, gear, care and region purchases. Rebirth requires 100 catches this journey, Reef access and 25,000 pearls; explicit two-step confirmation; three-rebirth cap. Each adds 25% income and 12% luck. Character, clothing, bait unlocks, journal and records persist.
- **Milo’s Bait Shop** with illustrated friendly keeper, entrance/exit bell, greeting and farewell. Bell/greeting runs once per entry, not per tab redraw. Actual words use device speech synthesis with high-pitched friendly settings; captions and procedural musical cues are fallbacks. There are no recorded voice assets yet.
- Procedural sounds for cast swish, actual bobber water contact, bite/reel/tension, snapping/escape, splash/feed, pearls, UI, and dripping held fish. Occasional freshwater daytime birds/traffic or coastal gulls/horns. Sound pauses in the background and can be muted; Options includes volume presets. Do not claim the sounds have been listened to on hardware.
- Startup: black screen asks for a tap to unlock mobile audio, then ocean ambience, “Created by ChatGPT and Devin Combs,” and a fade to a 3D shore camera looking toward a fisherman/boat. Title menu: Stillwater, Continue, Start new, Options, Extra. Start new asks before replacing an existing character save. Options includes export/import, audio/volume and graphics. Extra credits and future-mode notes. Help can return to the title.
- Generated neutral detail texture maps on rod/grip, clothing, dock and boat wood; added line guides and bobber trim. This is targeted material improvement, **not completion of the request for high-quality art on every model**.
- iPhone standalone/PWA metadata, icons, safe areas, offline shell, input-exempt selection/callout suppression and pointer-based casting. Versioned module URLs and worker cache currently **v6** (v1.5). Do not reuse v6 URLs for a later code change: update URLs, build marker, cache version, and offline tests together.

## Source map

| File | Owns |
| --- | --- |
| `dist/game.js` | Saved state, startup/menu and panels, input, shop/UI, cast/fight/catch state machine |
| `dist/economy.js` | Species, rarity colors, prices, purchases, growth, migration, rebirth |
| `dist/fishing.js` | Conditions, encounters, rarity timing profile, fight progress/failure |
| `dist/scene.js` | WebGL scene, cameras, aquarium, arrival/drop, halo, held-fish drips, orchestration |
| `dist/angler.js` | Procedural character, outfit, arm/hand/rod poses |
| `dist/tackle.js` | Rope, bobber/hook/bait, flight, surface impact, retrieval and hanging |
| `dist/environment.js` | Water shader/height model, scenery, ambient actors, boats, shore title scene |
| `dist/surface.js` | Pure damped tank wave solver and hull sampling helper |
| `dist/textures.js` | Locally generated deterministic DataTexture material maps |
| `dist/fish.js`, `dist/swimming.js` | Fish mesh construction and limited-acceleration motion |
| `dist/audio.js` | Web Audio synthesis, device voice, ambience scheduling, mute/pause |
| `dist/preview.js`, `dist/art.js` | Resident rotatable model preview and illustrative fallback |
| `dist/style.css`, `dist/index.html` | Responsive UI, title, shop, touch constraints |
| `dist/sw.js`, `dist/manifest.webmanifest` | Offline shell and home-screen installation |
| `checks/*.test.mjs` | Eight Node regression files, no real-browser tests |

Code is intentionally buildless but several files retain dense/minified-style lines. Refactor incrementally if helpful; avoid broad rewrites that erase behavior.

## Saves and update rules

Storage key stays `stillwater.sanctuary.v1`; the current payload version is **3**. `sanitize` migrates versions 1/2. Import accepts versions 1/2/3. Residents, upgrades, records and pending catches survive migration. Player data is browser-local; the source package contains no save. Offline income is capped at eight hours. Export a save through Options before device moves or destructive testing. Rebirth deliberately resets equipment/regions/boats/residents; its confirmation names retained data.

When adding an asset/module, include it in the service worker ASSETS list and run offline tests. Never cache authentication redirects/login HTML. Preserve private hosting access. Never put tokens/API keys in source or handoff files.

## Verification at the cut point

Eight Node test files pass: audio scheduling/gating/voice fallback; economy/migration/ownership/rebirth; fight outcomes/rarity timing; fake-DOM startup/touch/market/import flows; offline/cache/auth exclusions; wave/tackle/charge mechanics; scene construction/camera/drop/selection; all 60 fish and bounded swimming.

`scene.test.mjs` replaces WebGLRenderer with a stub; `flow.test.mjs` uses a fake DOM, and audio tests mock AudioContext/speech. They test state transitions, geometry and scheduling, **not final browser rendering, actual iPhone interaction, voice availability, layout or audio quality**. No browser-control skill was available in the managed build environment, so real-browser QA was skipped as required by the environment workflow. Earlier character poses were reviewed only with a software mesh render.

## What to do next, in order

1. **Real iPhone Safari and installed-app QA.** Confirm first-tap audio/credits, title framing, Continue/new-game confirmation/import, shop bell/voice exactly once, mute/volume, no long-press selection, charging pose syncing, all rarity windows, catch and portrait stats not overlapping, touch orbit, actual aquarium waves/drop/scatter, GPU stability, battery/thermal behavior, background/resume and cache update. Also test desktop and reduced motion. Fix observed problems before expanding scope.
2. **Art/animation polish.** Devin explicitly requested high-quality models and textures everywhere. Current characters/fish/boats/trees are procedural stylized meshes, and the shopkeeper is an SVG portrait in a panel, not a fully modeled 3D shop. Improve close-range silhouettes, face/hands, fish species anatomy/markings, rod/reel crank/line guides, bobber wetness, shoreline detail and shop interior. Preserve readable calm cartoon styling. Add a proper rig/IK where it materially improves believable reeling. Do not claim all models are production-quality yet.
3. **Water/physics polish.** Current water is lightweight height-field/shader simulation, not volumetric fluid, displacement by every fish/hull, fluid pressure, true refractive caustics, shoreline collision solver, or physically complete buoyancy. Improve wind coherence, wakes, foam/shore interaction, surface impact timing, fish-water interaction and waterline/contact. Watch mobile performance. Hull response currently samples local slopes and interpolates motion; it is not a rigid-body simulation with torque/mass/inertia.
4. **Sound direction.** Audition/rebalance on actual hardware; refine ASMR layers and spatial attenuation, gulls/horns/traffic timing, repeated UI sounds, and drip synchronization. Consider bundled licensed/original recorded keeper vocals for consistency; device speech synthesis varies by OS and installed voices. No remote AI voice or paid service is wired up.
5. **Economy playtesting.** Confirm meaningful saving decisions without excessive early grind; permanent lure prices replace the old small consumable packs. Rarity/gear failures should be legible and fair. No guaranteed catches/rare pity has been added.
6. **Story mode later.** Devin proposed a generated story mode and a separate non-story/free-fishing mode. This is deliberately **deferred**, with no implemented story generator, API backend, provider, key, mission graph or story save. Do not label a fake story menu playable. First discuss the narrative structure when that work is authorized; keep the existing ongoing progression game available. The three-rebirth endpoint is the current chapter limit.

## Prompt Devin can paste into Claude

“Continue Stillwater from this source archive. Read CLAUDE_HANDOFF.md and README.md first. Keep the existing game, saves and cozy cartoon direction. We stopped at the published v1.4 Bait Shop update. Start with real browser/iPhone QA and art/animation/water polish, using the listed priorities and acknowledging what is still simulated. Bait is now purchased once forever. Story mode is a later idea. Do not rebuild from scratch or claim untested features are verified.”
