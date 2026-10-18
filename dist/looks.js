// How each tackle tier looks, shared by the rod in the angler's hands, the line on the water
// and the market thumbnails, so what you buy is exactly what you then fish with. Each tier
// is visibly a better piece of kit: plain wood and cork up to a modern carbon blank with an
// EVA grip and a larger, darker reel.
export const ROD_LOOKS = [
  // Willow rod: a split-cane style blank, red silk wraps, cork, a simple alloy reel.
  {blank: '#7c6a4a', metal: 0.05, rough: 0.6, wrap: '#8c3f32', grip: 'cork', reel: '#56605c', reelTrim: '#b9bdb6', guides: '#b9bdb6', reelScale: 0.92},
  // River reed: green fibreglass, gold wraps.
  {blank: '#5f7a4c', metal: 0.15, rough: 0.42, wrap: '#c49a4a', grip: 'cork', reel: '#3a4542', reelTrim: '#d4d7cf', guides: '#d4d7cf', reelScale: 1},
  // Silver birch: pale satin blank with teal wraps and a bright chrome reel.
  {blank: '#c9ccc3', metal: 0.55, rough: 0.3, wrap: '#38606e', grip: 'cork', reel: '#9aa3a0', reelTrim: '#eef1ec', guides: '#eef1ec', reelScale: 1.02},
  // Moonweaver: deep gloss indigo, gold wraps, black-and-gold reel.
  {blank: '#2f3d68', metal: 0.35, rough: 0.16, wrap: '#c9b16a', grip: 'cork', reel: '#1f2427', reelTrim: '#d2b46a', guides: '#d2b46a', reelScale: 1.06},
  // Bluewater carbon: matte carbon, white wraps, black EVA foam grip, big modern reel.
  {blank: '#1b2733', metal: 0.3, rough: 0.22, wrap: '#e2e6e8', grip: 'eva', reel: '#15191c', reelTrim: '#7fb6d6', guides: '#2c3236', reelScale: 1.14},
];
// Line tiers: monofilament through braids to a deep-sea leader, each a distinct colour.
export const LINE_LOOKS = [
  {color: '#ece6c8', opacity: 0.78},
  {color: '#7f9c6b', opacity: 0.9},
  {color: '#d4ecef', opacity: 0.6},
  {color: '#3c80aa', opacity: 0.92},
  {color: '#2d4e66', opacity: 0.95},
];
export const rodLook = i => ROD_LOOKS[Math.max(0, Math.min(ROD_LOOKS.length - 1, i | 0))];
export const lineLook = i => LINE_LOOKS[Math.max(0, Math.min(LINE_LOOKS.length - 1, i | 0))];
