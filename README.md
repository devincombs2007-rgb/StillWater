# Stillwater — The Bait Shop

A touch-friendly 3D fishing and aquarium game. Version 1.4 uses static HTML, CSS, JavaScript, and vendored Three.js, with no build step or external runtime requests.

## Play

Create a permanent angler, then hold and release **Cast a line**. Watch the bobber, tap a bite before it disappears, and time reel pulls inside the glowing window. Common fish have a wide, slow window; the window progressively shrinks and the marker accelerates through legendary. Pulls bring the bobber closer. Poor timing, slack, excessive tension, worn rods, and inadequate tackle can lose a fish or break equipment. Some casts receive no bite. Bait is a permanent reusable lure unlock; it is never consumed. Existing stocks and the currently equipped bait migrate to owned lures. Bait improves bite and rarity chances, and survives rebirth.

Switch between first-person hands and an orbit camera around the stationary angler. Landing moves smoothly to a front view with a swinging catch. Drag to inspect it, review its weight, potential, and discovery status, then release it for pearls or keep it. Keeping transitions to the aquarium, where the fish drops into the water and residents scatter from the splash.

Drag the aquarium to orbit; pinch, scroll, or use + / − to zoom. Residents earn pearls for manual collection and grow naturally. Feeding costs pearls and accelerates growth; individual care upgrades improve income and future release value. There is no starvation penalty. The journal tracks 60 species across freshwater and saltwater regions.

Milo’s Bait Shop offers independently priced rods, lines, permanent bait, tank capacity, decor, regions, apparel, and cosmetic boats. Apparel grants small luck bonuses. Six waters have different species pools; a simulated day, moon, and weather cycle modifies fishing odds. These are game-balance systems, not a real-world forecast. Saltwater boats stay anchored and their upgrades are cosmetic.

Rebirth requires 100 catches in the current journey, Reef access, and 25,000 pearls. A separate confirmation lists what resets and what is kept. Each rebirth retains purchased bait, clothing and character, and adds permanent income and luck bonuses, up to three rebirths for this development chapter.

## Touch, installation, and sound

The game surface disables selection, dragging, and long-press callouts while preserving editable name fields. Pointer releases are handled directly, with synthetic duplicate clicks suppressed. Keyboard: hold Space or Enter to cast, then tap to hook and reel.

The home-screen edition includes standalone Apple metadata, a web app manifest, PNG icons, safe-area layout, and a versioned offline shell. The help panel explains installation and reports offline readiness. Open online after an update, then close and reopen the installed app. Do not clear browser data to update: saves live on the device.

On launch, tap to unlock audio and watch black-screen creator credits transition into a shore-view ocean title scene. Continue, Start new, Options, and Extra are available. Replacing an existing save requires confirmation. Options supports audio, volume, graphics, and save export/import. iPhone autoplay requires this first interaction; audio cannot reliably start before a tap. Sound can also be toggled during play. Procedural water, splashes, reel clicks, tension, snapping, catch and drip sounds pause with rendering in the background. A door bell rings once when entering/leaving the bait shop. Milo’s spoken hello and goodbye use the device’s speech synthesis, with visible text and musical fallbacks. Daytime freshwater ambience includes occasional birds/traffic; coastal ambience includes gulls/ship horns. Recorded voice assets are not included.

## Progress

The existing local storage key is retained. Version-1 and version-2 saves migrate with residents, currency, discoveries, and equipment intact. Character creation runs if no character exists. Unresolved catches are saved, away earnings are capped at eight hours, and JSON export/import in Help supports backups and moving progress between browsers. There are no accounts, real-money purchases, analytics, or remote player-save storage.

## Implementation and validation

The line uses a constrained Verlet rope, ballistic casts, spring-driven retrieval, and a pendulum catch. A damped finite-difference height field propagates aquarium waves and reflects them at the walls. Fresh/ocean waves and splash ripples drive visible water and tackle; boats sample four hull positions for damped heave/pitch/roll. The angler follows the hull. Catch rarity appears as a subtle emissive tint and a translucent halo, preserving body detail. Nearby rod, cork, clothing, dock and boat surfaces use generated detail textures. These are lightweight game simulations rather than a full fluid or hydrodynamics solver. Fish feeding and scattering use acceleration-limited steering instead of position jumps.

`npm test` runs eight test files covering economy and legacy saves; probabilistic encounters and gear failures; DOM-stub touch gameplay, market, and rebirth flows; offline/auth-safe caching; tackle and wave physics; scene construction, camera framing and arrivals with a WebGL renderer stub; animated models plus bounded swimming for all 60 species; and gesture-gated sound graphs, shop greetings, mute and pause behavior. All eight pass. Procedural character poses were additionally inspected using an offline software mesh render.

These checks do not verify actual browser GPU rendering, iPhone touch behavior, audio output, or final on-device layout. Browser QA was unavailable in the build environment. Serve `dist` with a static web server; `.openai/hosting.json` points to this directory.

## Credits

Three.js is copyright 2010–2025 Three.js Authors, MIT license, bundled in `dist/assets`. Fish, angler, scenery, aquarium, shaders, animation, and audio are procedural code created for this game.

## Continuation

Read `CLAUDE_HANDOFF.md` before extending the game. It describes the cut point, source layout, complete brief, remaining art/physics work, and verification limits. Story mode is deferred; the current experience is free fishing with progression.
