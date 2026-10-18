# Stillwater: immersion, staying power, and where the game stands

Written for Devin, October 2026, during the v1.6 work. It has three parts:

1. What the research says makes a game immersive, and how to keep players coming back without burning them out.
2. An honest list of what I (Claude) am not satisfied with yet.
3. Ideas for you to decide on. None of these are built unless you say so.

---

## 1. What makes a game immersive

"Immersion" is several separate effects. Each one can be designed for, and each one breaks for a different reason.

### Presence: "I am there"

Presence is the feeling that the world exists and you are standing in it. Research on spatial presence (Wirth et al., 2007; Slater's work on presence in VR) says it builds when the senses agree with each other. It collapses the instant something contradicts the illusion.

What breaks presence:
- Seeing under the map.
- A mountain that turns out to be a flat card.
- A car hovering above the road.
- A boat with the sea drawn inside it.

The player may not consciously notice, but the brain files the world as fake. This is why fixing those defects comes before adding features.

What builds presence:

- **Consistent scale.** Every object on one real-world scale. The v1.6 roadside was at half scale, which reads as a toy diorama.
- **A world that continues in every direction.** Land all round, with mountains beyond. Fog and aerial perspective make distance believable without rendering infinity.
- **Things that obey physics.** Boats bob with the actual waves. The float rides the actual water. Cars follow the slope of the road.
- **Sound that matches the place and time.** Research on game audio repeatedly finds sound carries a large share of presence. Water lapping, wind in the trees, and distant traffic that fades in mist all matter.
- **Light that behaves.** Shadows, reflections in water, warm windows at dusk, headlights after dark.

### Flow: "I lost track of time"

Csikszentmihalyi's flow state needs three things:
- clear goals,
- immediate feedback,
- a challenge that matches skill.

Fishing is a natural flow activity. The rhythm runs: cast → wait → bite → fight → result. The design work is to make each step:

- readable: the bobber dips, the rod bends;
- responsive: hands, reel and line react instantly;
- slightly harder as the player improves: rarer fish have tighter timing windows.

### Need satisfaction (Self-Determination Theory)

The PENS research (Rigby & Ryan) found that long-term enjoyment tracks three needs:

- **Competence.** "I'm getting better." Visible mastery: bigger fish, better gear that looks better, records.
- **Autonomy.** "I choose." Where to fish, what bait, keep or release, how to decorate, what to save for.
- **Relatedness.** "I'm connected." Milo, the people on the road, a sense that the world has its own life. Optionally, later, other players.

### Diegetic feedback

Information shown inside the world rather than in a menu keeps attention in the world:
- the bobber dipping,
- the rod bending under tension,
- the line going tight,
- the angler's head turning to the float.

Every number we can move from a panel into the scene is a small immersion win.

### Ambient life: the "Roku City" effect

Roku City works because the background is alive but never asks for attention:
- movement is slow, regular and predictable;
- colours are muted;
- nothing flashes;
- nothing interrupts.

For Stillwater, that means:
- cars on the lakeside road,
- walkers,
- boats at anchor swinging on their moorings,
- birds,
- smoke from a chimney,
- windows lighting up at dusk,
- a lighthouse beam at the harbour,
- a train crossing the far valley.

All of it should stay at the edge of the frame, all of it should be slow, and none of it should be interactive.

---

## 2. Keeping players without burning them out

What makes people return to cozy games (Animal Crossing, Stardew Valley, Dredge) without them feeling used:

| Healthy | Avoid |
| --- | --- |
| Natural stopping points (the day ends; the aquarium keeps growing while you're away) | Punishing absence (wilting, decay, lost streaks) |
| Variety across sessions (weather, time of day, regions, rare spawns) | One grind loop repeated |
| Short, satisfying loops (one cast is a complete story) | Long chores before any reward |
| Open goals the player chooses (collection, decoration, records) | Countdown timers and FOMO |
| Surprise inside a fair system (rare fish are rare, never rigged) | Pay or wait to skip |
| A peak at the end of a session (catch reveal, a fish settling in the tank) | Ending a session on a failure screen |

Specific principles for Stillwater:

- **Peak-end rule.** People remember the best moment and the last moment. Make catches and arrivals in the aquarium feel wonderful. Make leaving gentle: "Your fish will keep growing."
- **Gentle open loops.** A silhouette in the journal or a rare fish seen jumping invites a return visit without nagging. Never use notifications that guilt the player.
- **Sessions of any length.** One cast in 30 seconds or an hour at dusk should both feel complete.
- **Novelty on a slow drip.** New weather, seasons, rare events (a fog morning, a meteor shower) give people a reason to look again.
- **Respect.** No real-money pressure, no dark patterns. That matches the handoff rule of no real-money transactions.

---

## 3. What I am not satisfied with yet

You asked me to be honest. These are the places I know the game falls short of "graphical masterpiece", roughly in order of how much they would improve the game.

1. **Water reflects only the sky, not the world.**
   - Real water mirrors the trees, mountains and boats. A planar reflection would be the single most convincing "ray-traced" effect we could add.
   - It needs care on phones (an extra render of the scene), so it should come with a quality setting.
2. **No ambient occlusion and no bloom.**
   - Objects don't darken where they meet each other or the ground, so they can look pasted on.
   - Bright highlights don't glow.
   - Both can be faked convincingly with baked occlusion in the models, contact shadows and a light bloom pass.
3. **I have never seen the game run at real speed.**
   - My test browser renders in software at about 3 frames per second.
   - I check animation by stepping time frame by frame, which proves the poses are correct, not that the motion feels good.
   - Frame rate, heat and touch feel on an iPhone are untested. Your own play sessions are the only real test of smoothness, so I need your feedback there.
4. **Faces and hair are good for an indie game, not AAA.**
   - They are built from code-generated shapes, with no sculpted meshes or texture maps.
   - Close up in character creation they are clearly stylised.
   - Getting further means either much more sculpting work in code or hand-made art assets.
5. **Fish lack surface detail.**
   - The shapes are anatomically right, but there are no scale textures or iridescence.
   - A procedural scale texture plus a sheen would help a lot.
6. **The sound is all synthesised.**
   - That's clever, but recorded water, birds, reel clicks and wind would be far more convincing.
   - This needs recorded or licensed audio files, which I cannot record myself.
7. **The world is still sparse up close.**
   - The banks have trees, rocks, reeds and grass.
   - They lack small storytelling details: a fence, a bench, a rowing boat pulled up on the shore, a picnic blanket, a fishing-tackle shed.
8. **The aquarium room and the bait shop are small.**
   - The shop is a vignette behind a counter, not a place.
9. **Some code is dense and old.**
   - Parts of the original files are still minified-style one-liners.
   - That makes careful polish slower, and I'd like to tidy them as I touch them.

---

## 4. Ideas for you to decide on

Tell me which of these you like. Each one is a piece of work I would plan properly before building.

**World and atmosphere**

- **Seasons.** Spring blossom, summer haze, autumn colour, winter frost or snow on the mountains. Each season changes which fish are active.
- **Rare world events:**
  - fog mornings,
  - a meteor shower,
  - the northern lights at Starlit Cove,
  - a fish migration that churns the water,
  - fireflies on summer evenings.
- **A lighthouse and harbour lights** that sweep at night at Harbor Reach.
- **A train** crossing a viaduct in the far Willow Lake valley a few times a day: the purest Roku City touch.
- **Photo mode:** free camera, depth of field, hide the UI, save the picture.

**Fishing and progression**

- **Lures you can see on the line in first person**, with each upgrade visibly better. This is in progress now.
- **Fish lore cards**: a short, charming note for each of the 60 species, unlocked on first catch.
- **Records and trophies**: biggest fish per species, mounted on the aquarium room wall.
- **Gentle daily "tides"**: one small optional goal per day ("catch something at dawn") with a small reward. No streak penalty.

**People and life**

- **A dog** that sits on the dock with you, reacts to bites and wags at catches. Companionship without dialogue trees.
- **Other anglers** fishing far down the shore who occasionally land a fish.
- **Milo moments**: he comments on your best catch, and the shop changes with the seasons.

**Settings and reach**

- **Units.** Metric or imperial (kg/lb, cm/in) and °C/°F. In progress now with the weather work.
- **Languages.**
  - Move all text into translation files first; that is technical groundwork I can do safely.
  - Then add languages. I can draft translations (for example Spanish, Portuguese, French, German, Japanese).
  - Machine-drafted translations should be checked by a fluent speaker before release, and I'd mark them as drafts until then.
- **Accessibility:**
  - colour-blind friendly rarity colours,
  - a one-handed mode,
  - adjustable text size,
  - subtitles for Milo.
