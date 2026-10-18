import {
  SPECIES,
  RARITIES,
  RARITY_COLORS,
  RODS,
  LINES,
  BAITS,
  TANKS,
  REGIONS,
  DECOR,
  BOATS,
  APPAREL,
  QUESTS,
  COLLECTION_GOALS,
  KEY,
  freshState,
  sanitize,
  income,
  accrue,
  buy,
  keepFish,
  collect,
  recordCatch,
  claimCollection,
  cleanName,
  growth,
  fishWeight,
  releaseValue,
  nurture,
  feedResidents,
  repairCost,
  canRebirth,
  rebirth,
  effectiveRod,
  apparelLuck,
} from './economy.js?v=8';
import {
  worldConditions,
  startEncounter,
  setFishPower,
  stepFight,
  reelPull,
  resolveFailure,
  reelProfile,
  isReelHit,
  WEATHER_NAMES,
} from './fishing.js?v=8';
// The one place the release number lives; shown faintly in a corner like any shipped game.
// BUILD must match index.html's stillwater-build marker (the offline test checks it).
export const VERSION = '1.6.0',
  BUILD = 8;
import {createWorld} from './scene.js?v=8';
import {SKINS, HAIRS, EYES, HAIR_STYLES, FACIAL_HAIR} from './angler.js?v=8';
import {createAudio} from './audio.js?v=8';
import {showPreview, stopPreview} from './preview.js?v=8';
import {fishThumbnail, itemThumbnail, showKeeper, stopKeeper} from './preview.js?v=8';
import {fishSvg} from './art.js?v=8';
const $ = s => document.querySelector(s),
  all = s => [...document.querySelectorAll(s)],
  esc = v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c],
    );
let state;
try {
  state = sanitize(JSON.parse(localStorage.getItem(KEY) || 'null') || freshState());
} catch {
  state = freshState();
}
const away = (Date.now() - state.last) / 1000,
  offline = accrue(state),
  sound = createAudio();
let currentView = 'lake',
  panelType = '',
  shopTab = 'gear',
  journalFilter = 'all',
  selectedUID = null,
  focusBefore,
  toastTimer,
  offlineReady = false,
  stage = 'idle',
  charge = 0.15,
  chargeStart = 0,
  waitUntil = 0,
  hookDeadline = 0,
  reelEpoch = 0,
  cursor = 0.5,
  nextTap = 0,
  pending = state.pending || null,
  encounter = null,
  creation = {name: 'Angler', skin: 0, hair: 0, style: 0, eyes: 0, facial: 0},
  creationTab = 'face',
  confirmRebirth = false,
  lastTick = performance.now(),
  lastSave = lastTick,
  conditions = worldConditions(Date.now(), state.region);
const MOODS = ['Moonlit', 'Sunset', 'Forest'];
let freshDiscovery = false,
  keeperWave = false;
let inTitle = true,
  introStarted = false;
const hasExisting = !!state.character;
sound.setVolume?.(state.volume);
const interrupted = !!state.activeCast;
state.activeCast = false;
let world = createWorld($('#world'), state, e =>
  toast(e.message || 'Graphics could not start. Open this page in Safari.'),
);
world?.refreshFish(SPECIES);
world?.setRegion(state.region);
world?.onSplash?.(() => sound.play('splash'));
world?.onSound?.(type => sound.play(type));
world?.onPick?.(uid => {
  if (!panelType && currentView === 'tank') inspect(uid);
});
function save() {
  accrue(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Progress cannot be saved in this browser. Export it from Help.');
  }
}
function fmt(n) {
  return n < 10000
    ? Math.floor(n).toLocaleString()
    : n < 1e6
      ? (n / 1000).toFixed(1) + 'k'
      : (n / 1e6).toFixed(1) + 'm';
}
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3600);
}
function hud() {
  const rod = effectiveRod(state),
    bait = BAITS[state.bait];
  $('#balance').textContent = fmt(state.pearls);
  // Small nudges: pearls waiting in the aquarium, and an unread discovery in the field notes.
  $('#bank-dot').hidden = currentView === 'tank' || state.bank < 5;
  $('#new-dot').hidden = !freshDiscovery;
  $('#banked').textContent = fmt(state.bank);
  $('#collect').disabled = state.bank < 1;
  $('#tank-count').textContent = `${state.fish.length} / ${TANKS[state.tank].capacity} residents`;
  $('#income-rate').textContent = income(state).toFixed(2) + ' pearls / sec';
  $('#rod-name').textContent = (state.rodBroken ? 'Loaner · ' : rod.name + ' · ') + rod.power.toFixed(1) + ' power';
  $('#catch-count').textContent = 'Line ' + LINES[state.line].power.toFixed(1) + ' · ' + state.total + ' landed';
  $('#tank-name').textContent = TANKS[state.tank].name;
  $('#mood-name').textContent = MOODS[state.mood];
  $('#bait-select').textContent = bait.name + ' ⌄';
  $('#camera-mode').textContent = state.cameraMode === 'third' ? '3D orbit ↻' : 'First person ↻';
  $('#location-name').textContent = currentView === 'lake' ? REGIONS[state.region].name : 'Your sanctuary';
  $('#location-detail').textContent =
    currentView === 'lake' ? REGIONS[state.region].habitat + ' water' : 'Living collection';
  $('#conditions').textContent = [
    conditions.phase,
    WEATHER_NAMES[conditions.weather] || conditions.weather,
    conditions.tempC === undefined ? '' : fmtTemp(conditions.tempC),
    conditions.windKmh === undefined ? '' : 'wind ' + fmtWind(conditions.windKmh),
    'feeding odds ×' + conditions.rarity.toFixed(2),
  ]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
  const q = QUESTS[state.quest];
  $('#quest-title').textContent = q?.name || 'Keeper of the water';
  $('#quest-count').textContent = q ? `${Math.min(state.total, q.target)} / ${q.target}` : 'All milestones complete';
  $('#quest-fill').style.width = q ? Math.min(100, (state.total / q.target) * 100) + '%' : '100%';
  const ready = q && state.total >= q.target;
  $('#quest-claim').hidden = !ready;
  $('#quest-reward').hidden = !!ready || !q;
  $('#quest-claim').textContent = 'Claim ' + (q?.reward || 0) + ' ◇';
  $('#quest-reward').textContent = '+' + (q?.reward || 0) + ' pearls';
}
function setView(v) {
  if (v === 'shop' || v === 'journal') {
    if (stage !== 'idle') return toast('Bring this line in first.');
    openPanel(v);
    return;
  }
  if (stage !== 'idle' && v !== currentView) return toast('Your line is still out.');
  currentView = v;
  sound.setPlace?.(v === 'tank' ? 'tank' : state.region >= 3 ? 'ocean' : 'lake');
  world?.setView(v);
  all('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  for (const id of ['fishing-controls', 'progress-card', 'choose-location', 'conditions'])
    $('#' + id).hidden = v !== 'lake';
  for (const id of ['tank-controls', 'aquarium-info', 'orbit-tools', 'tank-actions']) $('#' + id).hidden = v !== 'tank';
  $('#scene-eyebrow').textContent = v === 'lake' ? 'THE ANGLER’S CHAPTER' : 'A WORLD YOU HAVE RAISED';
  $('#scene-title').textContent = v === 'lake' ? 'Read the water.' : 'A little life, well kept.';
  $('#scene-subtitle').textContent =
    v === 'lake' ? 'Choose your tackle. Earn your catch.' : 'Growing fish. Growing possibilities.';
  hud();
}
// Units follow the player's choice in Options (metric or imperial).
const imperial = () => state.units === 'imperial';
const fmtWeight = kg => (imperial() ? (kg < 0.4536 ? (kg * 35.274).toFixed(1) + ' oz' : (kg * 2.20462).toFixed(2) + ' lb') : kg.toFixed(2) + ' kg');
const fmtLength = cm => (imperial() ? (cm / 2.54).toFixed(1) + ' in' : cm.toFixed(1) + ' cm');
const fmtTemp = c => (imperial() ? Math.round((c * 9) / 5 + 32) + '°F' : Math.round(c) + '°C');
const fmtWind = k => (imperial() ? Math.round(k * 0.621) + ' mph' : Math.round(k) + ' km/h');
// Gentle haptics where the device supports them (Android; iOS Safari ignores this).
const buzz = pattern => {
  try {
    if (state.haptics !== false) navigator.vibrate?.(pattern);
  } catch {}
};
function setStage(s) {
  if (s === 'bite') buzz(70);
  stage = s;
  if (s !== 'reeling') sound.tension?.(0);
  world?.setCast(s);
  document.body.classList.toggle('is-fishing', s !== 'idle');
  document.body.classList.toggle('catch-mode', ['catch', 'landing', 'travel'].includes(s));
  $('#cast').classList.toggle('charging', s === 'charging');
  $('#cast').classList.toggle('bite', s === 'bite');
  $('#cast').disabled = ['waiting', 'landing', 'catch', 'create', 'travel'].includes(s);
  $('#charge-meter').hidden = s !== 'charging';
  $('#reel-meter').hidden = s !== 'reeling';
  $('#tension-panel').hidden = s !== 'reeling';
  $('#reel-progress').hidden = true;
  $('#let-go').hidden = !['waiting', 'bite', 'reeling'].includes(s);
  const labels = {
    idle: 'Cast your line',
    charging: 'Feel the cast…',
    waiting: 'Watch your line…',
    bite: 'A bite! Set the hook',
    reeling: 'Reel steadily',
    landing: 'Lifting your catch…',
    catch: 'A catch, earned.',
    create: 'Your story begins',
    travel: 'Finding a home…',
  };
  $('#cast-label').textContent = labels[s] || labels.idle;
  $('#cast-hint').textContent =
    s === 'idle' ? 'HOLD & RELEASE' : s === 'bite' ? 'HOOK NOW' : s === 'reeling' ? 'WATCH TENSION' : '';
  $('#cast-icon').textContent = s === 'bite' ? '!' : s === 'reeling' ? '≈' : '↗';
  $('#fishing-status').textContent =
    {
      idle: 'Every cast is a choice.',
      charging: 'Release when the cast feels right.',
      waiting: 'The bobber follows the water.',
      bite: 'A short window. A steady hand.',
      reeling: 'Reel in the glow. Let high tension ease.',
      landing: 'Up from the water.',
      catch: 'Drag the scene to turn your fish.',
    }[s] || '';
}
function startCharge() {
  if (inTitle || stage !== 'idle' || panelType || currentView !== 'lake') return;
  charge = 0;
  world?.setCharge?.(0);
  chargeStart = performance.now();
  sound.resume();
  setStage('charging');
}
function cast() {
  if (stage !== 'charging') return;
  conditions = worldConditions(Date.now(), state.region);
  encounter = startEncounter(state, conditions);
  setFishPower(encounter, SPECIES.find(f => f.id === encounter.fish.id).rarity);
  save();
  setStage('waiting');
  world?.cast?.(charge);
  sound.play('cast');
  waitUntil = performance.now() + 4300 + Math.random() * 3500 - charge * 1100;
  hud();
}
function fail(reason) {
  resolveFailure(state, reason);
  encounter = null;
  if (reason.includes('snap')) {
    world?.loseLine?.();
    buzz([50, 40, 90]);
  }
  setStage('idle');
  save();
  hud();
  sound.play(reason.includes('snap') ? reason : 'escape');
  toast(
    {
      'no-bite': 'No bite this time. Different bait can help.',
      'missed-hook': 'The fish slipped the hook.',
      'line-snap': 'Your line snapped. Check your leader and rod strength.',
      'rod-snap': 'Your rod snapped. A basic loaner is equipped; repair at the market.',
      escaped: 'The fish got away. Read the tension and try again.',
      released: 'You let the fish go and saved your tackle.',
    }[reason] || 'The water keeps this one.',
  );
}
function action() {
  if (panelType) return;
  if (stage === 'idle') {
    startCharge();
    cast();
    return;
  }
  if (stage === 'bite') {
    if (performance.now() > hookDeadline) return fail('missed-hook');
    reelEpoch = performance.now();
    nextTap = 0;
    world?.setTension?.(encounter.tension);
    setStage('reeling');
    const profile = reelProfile(encounter.rarity);
    $('#sweet-zone').style.left = (0.5 - profile.width / 2) * 100 + '%';
    $('#sweet-zone').style.width = profile.width * 100 + '%';
    // Say straight away when the hooked fish is beyond this tackle, so letting go is a real choice.
    $('#fishing-status').textContent =
      encounter.power > Math.min(effectiveRod(state).power, LINES[state.line].power) * 1.1
        ? 'Heavy! This fish outmatches your tackle. Let it go or risk a break.'
        : 'Hooked! Tap while the marker is in the glow.';
    sound.play('reel');
    return;
  }
  if (stage !== 'reeling' || !encounter || performance.now() < nextTap) return;
  nextTap = performance.now() + 330;
  const outcome = reelPull(encounter, state, cursor);
  world?.reel?.(encounter.tension, encounter.progress);
  sound.play('reel');
  $('#cast').classList.remove('reel-hit');
  void $('#cast').offsetWidth;
  $('#cast').classList.add('reel-hit');
  if (outcome === 'caught') land();
  else if (outcome) fail(outcome);
  else
    $('#fishing-status').textContent =
      encounter.power > Math.min(effectiveRod(state).power, LINES[state.line].power) * 1.1
        ? 'This fish overpowers your tackle. Let go or risk a break.'
        : isReelHit(encounter, cursor)
          ? 'A firm pull. The bobber comes closer.'
          : 'Too much pressure. Ease off before the next pull.';
}
function land() {
  const fish = encounter.fish,
    sp = SPECIES.find(f => f.id === fish.id),
    isNew = !state.found.includes(fish.id),
    newRecord = fish.length > (state.records[fish.id]?.best || 0);
  state.total++;
  state.activeCast = false;
  recordCatch(state, fish);
  if (isNew) {
    state.found.push(fish.id);
    freshDiscovery = true;
  }
  pending = {...fish, isNew, newRecord};
  state.pending = pending;
  encounter = null;
  save();
  setStage('landing');
  world?.showCatch?.(pending);
  waitUntil = performance.now() + 1450;
  sound.play('catch');
  hud();
}
function finishCatch(keep) {
  if (!pending) return;
  const value = releaseValue(pending),
    uid = pending.uid;
  if (keep && !keepFish(state, pending)) return toast('The aquarium is full. Release this catch or expand your tank.');
  if (!keep) {
    state.pearls += value;
    state.lifetimeEarned += value;
  }
  pending = null;
  delete state.pending;
  closePanel(true);
  if (!keep) {
    world?.releaseCatch?.();
    setStage('idle');
  }
  save();
  hud();
  if (keep) {
    world?.refreshFish(SPECIES);
    setStage('travel');
    document.body.classList.add('scene-travel');
    setTimeout(() => {
      setStage('idle');
      setView('tank');
      world?.arrive?.(uid);
    }, 180);
    setTimeout(() => document.body.classList.remove('scene-travel'), 750);
    toast('A new arrival. Watch the water and the residents.');
  } else {
    sound.play('coin');
    toast('Released to the wild · +' + value + ' pearls.');
  }
  if (!state.character) setTimeout(() => openPanel('character'), 700);
}
let pointerId = null,
  suppressClick = -1;
$('#cast').addEventListener('pointerdown', e => {
  if (e.isPrimary === false || pointerId !== null || panelType) return;
  e.preventDefault();
  pointerId = e.pointerId;
  $('#cast').setPointerCapture(e.pointerId);
  if (stage === 'idle') startCharge();
});
$('#cast').addEventListener('pointerup', e => {
  if (pointerId !== e.pointerId) return;
  e.preventDefault();
  pointerId = null;
  suppressClick = performance.now() + 550;
  if (stage === 'charging') cast();
  else action();
});
$('#cast').addEventListener('pointercancel', () => {
  pointerId = null;
  if (stage === 'charging') setStage('idle');
});
$('#cast').addEventListener('lostpointercapture', () => (pointerId = null));
$('#cast').addEventListener('click', e => {
  e.preventDefault();
  if (performance.now() >= suppressClick) action();
});
for (const type of ['touchstart', 'touchmove'])
  $('#cast').addEventListener(type, e => e.preventDefault(), {passive: false});
for (const type of ['selectstart', 'contextmenu', 'dragstart'])
  document.addEventListener(type, e => {
    if (!e.target.closest('input,textarea,[contenteditable=true]')) e.preventDefault();
  });
// Once a fish is on (or biting), a tap anywhere on the scene counts, not just the button.
let sceneTap = null;
$('#world').addEventListener('pointerdown', e => {
  sceneTap = ['bite', 'reeling'].includes(stage) ? {x: e.clientX, y: e.clientY} : null;
});
$('#world').addEventListener('pointerup', e => {
  if (!sceneTap || panelType || Math.hypot(e.clientX - sceneTap.x, e.clientY - sceneTap.y) > 14) return;
  sceneTap = null;
  action();
});
document.addEventListener('keydown', e => {
  // Shortcuts: 1-4 switch places, C toggles the camera.
  if (!inTitle && !panelType && !e.repeat && e.target.tagName !== 'INPUT' && !e.metaKey && !e.ctrlKey) {
    const views = {Digit1: 'lake', Digit2: 'tank', Digit3: 'shop', Digit4: 'journal'};
    if (views[e.code]) return setView(views[e.code]);
    if (e.code === 'KeyC' && currentView === 'lake') return $('#camera-mode').onclick();
  }
  if (
    inTitle ||
    !['Space', 'Enter'].includes(e.code) ||
    e.repeat ||
    panelType ||
    currentView !== 'lake' ||
    e.target.tagName === 'INPUT' ||
    (e.target.closest('button') && e.target !== $('#cast'))
  )
    return;
  e.preventDefault();
  if (stage === 'idle') startCharge();
  else action();
});
document.addEventListener('keyup', e => {
  if (!inTitle && ['Space', 'Enter'].includes(e.code) && stage === 'charging') {
    e.preventDefault();
    cast();
  }
});
// Dip the world to deep water-blue and back so view and place changes never hard-cut.
function dip(change) {
  const veil = $('#veil');
  if (reduced || !veil?.classList) return change();
  veil.classList.add('on');
  setTimeout(() => {
    change();
    setTimeout(() => veil.classList.remove('on'), 160);
  }, 320);
}
all('nav button').forEach(
  b =>
    (b.onclick = () => {
      const v = b.dataset.view;
      if (v === currentView || !['lake', 'tank'].includes(v) || stage !== 'idle') setView(v);
      else dip(() => setView(v));
    }),
);
$('.brand').onclick = e => {
  e.preventDefault();
  if (stage === 'idle') setView('lake');
};
$('#let-go').onclick = () => fail('released');
$('#bait-select').onclick = () => {
  if (stage === 'idle') {
    shopTab = 'bait';
    openPanel('shop');
  }
};
$('#camera-mode').onclick = () => {
  state.cameraMode = state.cameraMode === 'third' ? 'first' : 'third';
  save();
  hud();
  toast(
    state.cameraMode === 'third'
      ? 'Drag the scene to orbit your fixed angler.'
      : 'First-person view. Your hands stay on the reel.',
  );
};
$('#choose-location').onclick = () => {
  if (stage !== 'idle') return toast('Bring this line in first.');
  shopTab = 'places';
  openPanel('shop');
};
$('#zoom-in').onclick = () => world?.zoom(-1.7);
$('#zoom-out').onclick = () => world?.zoom(1.7);
$('#residents').onclick = () => openPanel('residents');
$('#feed-fish').onclick = () => {
  if (!feedResidents(state)) return toast('Nurturing costs 8 pearls. Your fish still grow naturally.');
  world?.feed?.();
  save();
  hud();
  sound.play('feed');
  toast('Two minutes of growth, a little food, and a gentle gathering.');
};
$('#tank-mood').onclick = () => {
  state.mood = (state.mood + 1) % 3;
  world?.setMood?.();
  save();
  hud();
};
$('#collect').onclick = () => {
  const n = collect(state);
  save();
  hud();
  sound.play('coin');
  toast('Collected ' + fmt(n) + ' pearls.');
};
$('#quest-claim').onclick = () => {
  const q = QUESTS[state.quest];
  if (q && state.total >= q.target) {
    state.pearls += q.reward;
    state.quest++;
    save();
    hud();
    sound.play('coin');
  }
};
$('#sound').onclick = async () => {
  const on = await sound.toggle();
  state.audioOn = on;
  save();
  document.body.classList.toggle('sound-on', on);
  $('#sound').setAttribute('aria-label', on ? 'Mute water sounds' : 'Enable water sounds');
};
function focus(on) {
  world?.setFocus?.(on);
  document.body.classList.toggle('focus-mode', on);
  $('#leave-focus').hidden = !on;
}
$('#focus-mode').onclick = () => {
  if (stage === 'idle') focus(true);
};
$('#leave-focus').onclick = () => focus(false);
$('#help').onclick = () => {
  if (stage === 'idle') openPanel('help');
};
function row(icon, name, description, label, enabled, action, thumb = '') {
  return `<div class="shop-item"><span class="shop-icon${thumb ? ' item-art' : ''}"${thumb ? ` data-item="${thumb}"` : ''}>${icon}</span><div class="shop-copy"><h3>${name}</h3><p>${description}</p></div><button class="buy-button" data-buy="${action}" ${enabled ? '' : 'disabled'}>${typeof label === 'number' ? fmt(label) + ' ◇' : label}</button></div>`;
}
function shop() {
  const tabs = [
    ['gear', 'Tackle'],
    ['bait', 'Bait'],
    ['places', 'Waters'],
    ['outfit', 'Apparel'],
    ['tank', 'Aquarium'],
    ['boats', 'Boats'],
    ['rebirth', 'Rebirth'],
  ];
  let list = '';
  if (shopTab === 'gear') {
    list = row(
      '⌁',
      'Workshop',
      state.rod === 0
        ? 'The willow rod is simple and never wears out · upgraded rods need care'
        : `Condition ${Math.round(state.rodCondition)}% · ${state.rodBroken ? 'broken rod, basic loaner active' : 'rod in use'} · no repair replaces your upgrades`,
      state.rod === 0 ? 'No wear' : state.rodBroken || state.rodCondition < 99 ? repairCost(state) : 'Good as new',
      state.rod > 0 && state.pearls >= repairCost(state) && (state.rodBroken || state.rodCondition < 99),
      'repair:0',
    );
    for (const [kind, table] of [
      ['rod', RODS],
      ['line', LINES],
    ]) {
      list += `<div class="eyebrow section-space">${kind === 'rod' ? 'RODS · POWER MATTERS' : 'LEADERS · THE WEAKEST PART CAN BREAK'}</div>`;
      list += table
        .map((r, i) =>
          row(
            kind === 'rod' ? '↗' : '⌁',
            r.name,
            `Power ${r.power.toFixed(1)}${kind === 'rod' ? ' · luck +' + Math.round(r.luck * 100) + '%' : ''} · ${i > state[kind] + 1 ? 'buy the previous tier first' : 'permanent upgrade; repairs cost extra'}`,
            state[kind] >= i ? 'Owned' : i === state[kind] + 1 ? r.cost : 'Locked',
            i === state[kind] + 1 && state.pearls >= r.cost,
            kind + ':' + i,
            kind + ':' + i,
          ),
        )
        .join('');
    }
  } else if (shopTab === 'bait') {
    list = BAITS.map((b, i) => {
      const owned = state.ownedBaits.includes(b.id);
      return row(
        '∴',
        b.name,
        `${i === 0 ? 'Plain hook' : 'Permanent reusable lure'} · bite base ${Math.round(b.bite * 100)}% · luck +${Math.round(b.luck * 100)}%${owned ? ' · yours forever' : ''}`,
        owned ? (state.bait === i ? 'Equipped' : 'Equip') : b.cost,
        owned ? state.bait !== i : state.pearls >= b.cost,
        (owned ? 'bait-equip' : 'bait') + ':' + i,
        'bait:' + i,
      );
    }).join('');
    list +=
      '<p class="bait-note">Buy it once. Every owned lure has unlimited casts, and your lure collection carries through rebirth.</p>';
  } else if (shopTab === 'places') {
    list = REGIONS.map((r, i) =>
      row(
        i >= 3 ? '⛵' : '⌁',
        r.name,
        `${r.detail} · ${SPECIES.filter(f => (r.habitat === 'salt' ? f.region >= 3 && f.region <= i : f.region < 3 && f.region <= i)).length} species · ${i >= 3 ? 'distinct ocean swell and anchored boats' : 'sheltered freshwater and moving shore life'}`,
        state.regions.includes(i)
          ? state.region === i
            ? 'Here'
            : 'Visit'
          : state.regions.includes(i - 1)
            ? r.cost
            : 'Locked',
        state.regions.includes(i) ? state.region !== i : state.regions.includes(i - 1) && state.pearls >= r.cost,
        (state.regions.includes(i) ? 'visit' : 'region') + ':' + i,
        'waters:' + i,
      ),
    ).join('');
  } else if (shopTab === 'outfit') {
    list = APPAREL.map((a, i) =>
      row(
        '♧',
        a.name,
        `${a.slot} · permanent luck +${Math.round(a.luck * 100)}% when equipped`,
        state.ownedClothes.includes(a.id) ? (state.outfit[a.slot] === a.id ? 'Equipped' : 'Equip') : a.cost,
        state.ownedClothes.includes(a.id) ? state.outfit[a.slot] !== a.id : state.pearls >= a.cost,
        (state.ownedClothes.includes(a.id) ? 'equip' : 'apparel') + ':' + i,
        'apparel:' + i,
      ),
    ).join('');
  } else if (shopTab === 'tank') {
    list = TANKS.map((t, i) =>
      row(
        '▱',
        t.name,
        `${t.capacity} residents · long-term income and growth space`,
        state.tank >= i ? 'Owned' : i === state.tank + 1 ? t.cost : 'Locked',
        i === state.tank + 1 && state.pearls >= t.cost,
        'tank:' + i,
        'tank:' + i,
      ),
    ).join('');
    list += DECOR.map((d, i) =>
      row(
        d.icon,
        d.name,
        d.description,
        state.decor.includes(d.id) ? 'Placed' : d.cost,
        !state.decor.includes(d.id) && state.pearls >= d.cost,
        'decor:' + i,
        'decor:' + i,
      ),
    ).join('');
    list += row(
      '≈',
      'Filter & circulation',
      `Level ${state.filter}/3 · +15% income each level`,
      state.filter === 3 ? 'Complete' : [480, 2400, 11000][state.filter],
      state.filter < 3 && state.pearls >= [480, 2400, 11000][state.filter],
      'filter:0',
      'filter:0',
    );
  } else if (shopTab === 'boats') {
    list = BOATS.map((b, i) =>
      row(
        '⛵',
        b.name,
        'Cosmetic anchored vessel · no catch, distance, or rarity advantage',
        state.boat >= i ? 'Owned' : state.regions.includes(3) && i === state.boat + 1 ? b.cost : 'Locked',
        state.regions.includes(3) && i === state.boat + 1 && state.pearls >= b.cost,
        'boat:' + i,
        'boat:' + i,
      ),
    ).join('');
  } else {
    list = `<div class="rebirth-card"><span class="eyebrow">JOURNEY ${state.rebirth} / 3</span><h3>${state.rebirth === 3 ? 'Chapter complete.' : 'Begin again, with the tide.'}</h3><p>${state.rebirth === 3 ? 'You have reached the current development endpoint. Keep collecting and growing your sanctuary; a fourth rebirth is not available.' : 'Rebirth resets pearls, rods, lines, boats, aquarium upgrades, residents, and unlocked waters. Your character, clothing, bait unlocks, field notes, and catch records remain.'}</p><p>Each rebirth permanently adds 25% aquarium income and 12% fishing luck. Current bonus: +${state.rebirth * 25}% income · +${state.rebirth * 12}% luck.</p><ul><li>${state.total >= 100 ? '✓' : '○'} Land 100 fish in this journey</li><li>${state.regions.includes(4) ? '✓' : '○'} Unlock Sunbreak Reef</li><li>${state.pearls >= 25000 ? '✓' : '○'} Hold 25,000 pearls</li></ul><button class="primary-button" id="rebirth-now" ${canRebirth(state) ? '' : 'disabled'}>${confirmRebirth ? 'Confirm reset · keep permanent progress' : 'Rebirth with the tide'}</button></div>`;
  }
  return `${keeper()}<span class="eyebrow">MILO’S BAIT SHOP</span><h2 id="panel-title">Good tackle. Good company.</h2><p class="intro">${fmt(state.pearls)} pearls available. Rods, permanent lures, apparel, and your growing aquarium compete for the same pearls.</p><div class="tabs market-tabs">${tabs.map(([id, name]) => `<button data-tab="${id}" class="${shopTab === id ? 'selected' : ''}">${name}</button>`).join('')}</div><div class="shop-list">${list}</div>`;
}
function keeper() {
  return `<div class="keeper-welcome"><div class="keeper-portrait keeper-stage" id="keeper-stage"><svg viewBox="0 0 160 150" aria-label="Milo, the smiling bait shop keeper" role="img"><defs><linearGradient id="apron" x2="0" y2="1"><stop stop-color="#9ab49e"/><stop offset="1" stop-color="#527a6d"/></linearGradient></defs><circle cx="80" cy="76" r="65" fill="#c1ae8120"/><path d="M33 140V111Q40 86 80 86Q120 86 127 111V140" fill="#e7ce9e"/><path d="M57 93L47 139H113L103 93L92 108H68Z" fill="url(#apron)"/><rect x="64" y="116" width="32" height="18" rx="5" fill="#416959"/><path d="M69 123q11-12 22 0q-11 12-22 0" fill="#dfd8b5"/><ellipse cx="80" cy="64" rx="35" ry="37" fill="#d9ad85"/><ellipse cx="46" cy="64" rx="6" ry="10" fill="#d9ad85"/><ellipse cx="114" cy="64" rx="6" ry="10" fill="#d9ad85"/><path d="M45 53Q44 22 80 21Q113 20 116 54Q97 47 80 46Q61 47 45 53" fill="#a4936b"/><path d="M39 49Q80 31 121 49L126 57Q81 47 35 58Z" fill="#c9b98a"/><path d="M59 65q5-5 10 0M91 65q5-5 10 0" fill="none" stroke="#4d5045" stroke-width="3" stroke-linecap="round"/><ellipse cx="59" cy="75" rx="7" ry="4" fill="#c98776" opacity=".5"/><ellipse cx="101" cy="75" rx="7" ry="4" fill="#c98776" opacity=".5"/><path d="M68 81q12 12 24 0" fill="none" stroke="#825b4c" stroke-width="2.5" stroke-linecap="round"/><path d="M4 139H156V150H4Z" fill="#7d6a4f"/><path d="M8 143h144" stroke="#aa9470"/><path d="M123 119q12-19 19-4q5 9-6 18" fill="#d9ad85"/></svg></div><div><span class="eyebrow">MILO · YOUR BAIT KEEPER</span><p>“Hello! Welcome to the bait shop.”</p><small>A little patience. A lure you love.</small></div></div>`;
}
function extrasView() {
  return `<span class="eyebrow">LITTLE DETAILS, LONG TIDES</span><h2 id="panel-title">Extra</h2><p>Created by ChatGPT and Devin Combs.</p><p><b>Free fishing</b> is the current game: build your collection, raise your fish, and decide where your pearls go.</p><p><b>Story mode</b> is a future idea. It has not been implemented. A story-led journey and a separate ongoing free-fishing mode are recorded in the development handoff.</p><p>Version 1.5 · The Living Water. All purchases use earned in-game pearls.</p><button class="secondary-button" id="extra-back">Back</button>`;
}
function newGameView() {
  return `<span class="eyebrow">A FRESH BEGINNING</span><h2 id="panel-title">Start a new sanctuary?</h2><p>This replaces the progress saved on this device. Use Options to export your current save first.</p><button class="primary-button" id="confirm-new">Replace my save & start new</button><button class="secondary-button" id="cancel-new">Keep my sanctuary</button>`;
}
function modelMarkup(f) {
  return `<div class="fish-preview" id="model-preview">${fishSvg(f)}</div><span class="model-hint">DRAG TO TURN</span>`;
}
function catchView() {
  const f = SPECIES.find(x => x.id === pending.id),
    value = releaseValue(pending),
    full = state.fish.length >= TANKS[state.tank].capacity;
  return `<div class="catch-stats" style="--rarity:${RARITY_COLORS[f.rarity]}"><span class="eyebrow">A CATCH, EARNED</span><h2 id="panel-title">${f.name}</h2><div class="rarity">${RARITIES[f.rarity]} · ${pending.isNew ? 'NEW DISCOVERY' : 'RETURNING SPECIES'}</div><p class="catch-instruction">Your angler holds the line. Drag the scene to rotate the dangling fish.</p><div class="profile-stats"><div><strong>${fmtWeight(fishWeight(pending))}</strong><span>Weight now</span></div><div><strong>${fmtLength(pending.length)}</strong><span>Adult length</span></div><div><strong>${pending.potential.toFixed(2)}×</strong><span>Growth potential</span></div></div><p>${growth(pending) < 1 ? 'Juvenile · raise it for more income and a higher release value.' : 'Adult · ready for your sanctuary or the wild.'}${pending.newRecord ? ' A new length record.' : ''}</p><button class="primary-button" id="keep-catch" ${full ? 'disabled' : ''}>${full ? 'Aquarium full' : 'Welcome to the aquarium'} ↗</button><button class="secondary-button" id="release-catch">Release now · +${value} ◇</button></div>`;
}
function collectionView() {
  const g = COLLECTION_GOALS[state.collectionClaimed];
  return g
    ? `<div class="collection-goal"><span>✧</span><p>${g.name}<small>${Math.min(state.found.length, g.target)} / ${g.target} discoveries</small></p><button class="secondary-button" id="claim-collection" ${state.found.length >= g.target ? '' : 'disabled'}>Claim ${g.reward} ◇</button></div>`
    : '<p>All current species discovered. An ocean of stories.</p>';
}
function journal(residents = false) {
  const list = residents
    ? state.fish.map(r => ({f: SPECIES.find(f => f.id === r.id), r}))
    : SPECIES.filter(
        f =>
          journalFilter === 'all' ||
          (journalFilter === 'found' && state.found.includes(f.id)) ||
          (journalFilter === 'missing' && !state.found.includes(f.id)) ||
          (journalFilter === 'salt' && f.region >= 3),
      ).map(f => ({f}));
  return `<span class="eyebrow">${residents ? 'LITTLE LIVES, GROWING' : 'YOUR FIELD NOTES'}</span><h2 id="panel-title">${residents ? 'A home worth growing.' : 'Sixty stories in the water.'}</h2><p class="intro">${residents ? `${state.fish.length} residents · ${income(state).toFixed(2)} pearls / sec. Baby fish grow naturally; care upgrades improve income and future release value.` : `${state.found.length} / ${SPECIES.length} species discovered. Bait, tackle, time, weather, and apparel all matter. There are no guaranteed rare encounters.`}</p>${
    residents
      ? ''
      : collectionView() +
        `<div class="journal-filters">${[
          ['all', 'All waters'],
          ['found', 'Found'],
          ['missing', 'Still to find'],
          ['salt', 'Saltwater'],
        ]
          .map(
            ([id, name]) =>
              `<button data-filter="${id}" class="${journalFilter === id ? 'selected' : ''}">${name}</button>`,
          )
          .join('')}</div>`
  }<div class="journal-grid">${list
    .map(({f, r}) => {
      const known = !!r || state.found.includes(f.id),
        age = r ? growth(r) : 1;
      return `<article class="fish-card ${known ? '' : 'unknown'}" style="--rarity:${RARITY_COLORS[f.rarity]}"><div class="fish-thumb" data-thumb="${f.id}" data-unknown="${known ? 0 : 1}">${fishSvg(f, !known)}</div><h3>${r?.nickname ? esc(r.nickname) : known ? f.name : 'Unwritten story'}</h3><div class="rarity">${RARITIES[f.rarity]}</div><div class="fish-stats">${r ? `${Math.round(age * 100)}% mature · care ${r.care}/3<br>Release ${releaseValue(r)} ◇` : REGIONS[f.region].name}${!r && known ? (state.records[f.id]?.best ? '<br>Best ' + fmtLength(state.records[f.id].best) : '<br>Not yet landed') : ''}</div>${r ? `<button class="secondary-button" data-inspect="${r.uid}">Meet & nurture ↗</button><button class="secondary-button" data-release="${r.uid}">Release · +${releaseValue(r)} ◇</button>` : ''}</article>`;
    })
    .join('')}</div>`;
}
function inspect(uid) {
  selectedUID = uid;
  world?.select?.(uid);
  openPanel('fish');
}
function inspectView() {
  const r = state.fish.find(f => f.uid === selectedUID),
    f = SPECIES.find(f => f.id === r.id),
    age = growth(r),
    cost = Math.ceil(f.value * (r.care + 1) * 2.3);
  return `<div class="fish-profile" style="--rarity:${RARITY_COLORS[f.rarity]}"><span class="eyebrow">A LIFE YOU CAN INVEST IN</span><h2 id="panel-title">${esc(r.nickname || f.name)}</h2><div class="rarity">${RARITIES[f.rarity]} · ${f.name}</div>${modelMarkup(f)}<div class="profile-stats"><div><strong>${fmtWeight(fishWeight(r))}</strong><span>Weight now</span></div><div><strong>${Math.round(age * 100)}%</strong><span>Mature</span></div><div><strong>${r.potential.toFixed(2)}×</strong><span>Potential</span></div></div><div class="collection-meter"><span style="width:${age * 100}%"></span></div><p>Care ${r.care}/3 · release value ${releaseValue(r)} pearls. Natural growth takes up to 45 minutes, modified by potential. Nurture sessions add two minutes of growth.</p><button class="secondary-button" id="upgrade-fish" ${r.care >= 3 || state.pearls < cost ? 'disabled' : ''}>${r.care >= 3 ? 'Care complete' : 'Care upgrade · ' + cost + ' ◇'}</button><label class="name-label" for="fish-nickname">A NAME, JUST FOR THEM</label><div class="name-row"><input id="fish-nickname" maxlength="24" value="${esc(r.nickname || '')}" placeholder="${f.name}"><button class="secondary-button" id="save-nickname">Save name</button></div><button class="text-button" id="back-residents">Meet the rest of your fish ↗</button></div>`;
}
function characterView() {
  const swatch = (attr, colors, label) =>
    `<div class="swatches">${colors.map((c, i) => `<button data-${attr}="${i}" aria-label="${label} ${i + 1}" style="background:${c}" class="${creation[attr] === i ? 'chosen' : ''}"></button>`).join('')}</div>`;
  const chips = (attr, names) =>
    `<div class="quality-options look-chips">${names.map((n, i) => `<button class="secondary-button" data-${attr}="${i}" aria-pressed="${creation[attr] === i}" ${creation[attr] === i ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
  const tabs = [
    ['face', 'Face'],
    ['hair', 'Hair'],
  ];
  const body =
    creationTab === 'hair'
      ? `<div class="eyebrow section-space">HAIR COLOUR</div>${swatch('hair', HAIRS, 'Hair colour')}<div class="eyebrow section-space">STYLE</div>${chips('style', HAIR_STYLES)}`
      : `<div class="eyebrow section-space">SKIN TONE</div>${swatch('skin', SKINS, 'Skin tone')}<div class="eyebrow section-space">EYES</div>${swatch('eyes', EYES, 'Eye colour')}<div class="eyebrow section-space">FACIAL HAIR</div>${chips('facial', FACIAL_HAIR)}`;
  return `<span class="eyebrow">YOUR ANGLER · A PERMANENT FIRST CHOICE</span><h2 id="panel-title">Meet the person by the water.</h2><p>Drag to turn them around. Shirts, hats, sunglasses, trousers, and shoes can be changed later at the market.</p><label class="name-label" for="character-name">NAME</label><input class="character-name" id="character-name" maxlength="24" value="${esc(creation.name)}"><div class="look-tabs" role="tablist">${tabs.map(([id, n]) => `<button role="tab" class="look-tab${creationTab === id ? ' chosen' : ''}" data-look-tab="${id}" aria-selected="${creationTab === id}">${n}</button>`).join('')}<button class="look-tab" id="random-look" aria-label="Random look">⟳ Surprise me</button></div>${body}<button class="primary-button" id="create-character">Begin my angler’s story ↗</button>`;
}
function helpView() {
  return `<span class="eyebrow">THE LIVING WATER UPDATE · 1.5</span><h2 id="panel-title">Read the water. Earn the catch.</h2><div class="help-steps"><p><b>Cast & hook.</b> Hold and release to cast. Watch the float: small twitches are curious fish, a hard plunge is a bite. Not every cast gets a bite. Set the hook within the short bite window. Once a line is out, you can tap anywhere on the scene to hook and reel.</p><p><b>Fight & tension.</b> Common fish have a wide, slow timing window. Rarer fish have a narrower window and faster marker. Tap inside the glowing zone to reel; each pull brings the bobber closer. Misses raise tension and slack. Wait to lower tension, but take too long and the fish escapes. Overpowered tackle can snap. Let go to protect your rod. Stronger rods and lines are separate purchases.</p><p><b>Raise & invest.</b> Keeping a catch drops it into the aquarium. Baby fish grow, care upgrades improve income and value, and feeding costs 8 pearls for a small growth boost. There is no hunger penalty. Market purchases compete for your pearls. Buy bait once for unlimited casts; bait unlocks survive rebirth.</p><p><b>Your fixed angler.</b> Drag in 3D mode to orbit; switch to first person to see your hands. A landed fish moves to the front camera and hangs from the hook. Drag the scene to turn it.</p><p><b>Shortcuts.</b> Space or Enter casts and reels. 1–4 switch between the lake, aquarium, bait shop and field notes. C swaps the camera.</p><p><b>World conditions.</b> A 20-minute world day and changing simulated weather affect odds. Catfish and some deep-water fish favor night; trout favor dawn. These are game-balance rules, not a real-world forecast.</p></div><div class="audio-options"><button class="secondary-button" id="options-sound">${state.audioOn ? 'Sound on · tap to mute' : 'Sound off · tap to enable'}</button><div class="quality-options">${[
    [0.15, 'Quiet'],
    [0.3, 'Balanced'],
    [0.5, 'Full'],
  ]
    .map(
      ([v, n]) =>
        `<button class="secondary-button" data-volume="${v}" ${state.volume === v ? 'disabled' : ''}>${n} sound</button>`,
    )
    .join('')}</div><button class="secondary-button" id="options-units">${imperial() ? 'Imperial · lb, in, °F · tap for metric' : 'Metric · kg, cm, °C · tap for imperial'}</button><button class="secondary-button" id="options-haptics">${state.haptics === false ? 'Vibration off · tap to enable' : 'Vibration on · tap to turn off'}</button></div><div class="quality-options">${[
    ['battery', 'Battery · 30 fps'],
    ['balanced', 'Balanced · 45 fps'],
    ['crisp', 'Crisp · 60 fps'],
    ['ultra', 'Ultra · full detail'],
  ]
    .map(
      ([id, name]) =>
        `<button class="secondary-button" data-quality="${id}" ${state.quality === id ? 'disabled' : ''}>${name}</button>`,
    )
    .join(
      '',
    )}</div><div class="install-note"><strong>Your pocket sanctuary.</strong><p>Add this link to your iPhone home screen in Safari. <span id="offline-state">${offlineReady ? 'Ready for offline play.' : 'Offline preparation runs when supported.'}</span> Progress saves on this device; export a backup before moving devices.</p></div><div class="help-footer"><button class="secondary-button" id="start-playing">Back to the water ↗</button><button class="text-button" id="return-title">Title screen</button><button class="text-button" id="export-save">Export progress</button><label class="text-button">Import progress<input id="import-save" type="file" accept="application/json,.json" hidden></label></div>`;
}
function openPanel(type) {
  if (type === 'journal') freshDiscovery = false;
  const enteringShop = type === 'shop' && panelType !== 'shop';
  if (enteringShop) keeperWave = true;
  if (type !== 'shop') stopKeeper();
  if (panelType === 'shop' && type !== 'shop') leaveShop();
  stopPreview();
  if (!panelType) focusBefore = document.activeElement;
  panelType = type;
  if (enteringShop) {
    sound.setPlace?.('shop');
    sound.play('shop-enter');
    setTimeout(() => {
      if (panelType === 'shop') sound.play('hello');
    }, 300);
  }
  document.body.classList.toggle('setup-mode', type === 'character');
  $('#overlay').hidden = false;
  $('#overlay').classList.toggle('catch-overlay', type === 'catch' || type === 'character');
  $('#close-panel').hidden = ['catch', 'character'].includes(type);
  if (type === 'character') {
    setStage('create');
    world?.previewCharacter?.(creation);
  }
  $('#panel-content').innerHTML =
    type === 'shop'
      ? shop()
      : type === 'catch'
        ? catchView()
        : type === 'fish'
          ? inspectView()
          : type === 'character'
            ? characterView()
            : type === 'help'
              ? helpView()
              : type === 'extras'
                ? extrasView()
                : type === 'newgame'
                  ? newGameView()
                  : journal(type === 'residents');
  bindPanel();
  if (type === 'fish')
    showPreview(
      $('#model-preview'),
      SPECIES.find(f => f.id === state.fish.find(x => x.uid === selectedUID).id),
    );
  const first = $('#panel-content button:not(:disabled)') || $('#close-panel');
  // Focus for keyboard users without scrolling long panels away from their heading.
  setTimeout(() => first?.focus({preventScroll: true}), 20);
}
function leaveShop() {
  sound.play('shop-leave');
  sound.play('goodbye');
  sound.setPlace?.(currentView === 'tank' ? 'tank' : state.region >= 3 ? 'ocean' : 'lake');
  toast('Milo: Have a good day!');
}
function closePanel(force = false) {
  if (['catch', 'character'].includes(panelType) && !force) return;
  if (panelType === 'shop') leaveShop();
  stopPreview();
  stopKeeper();
  $('#overlay').hidden = true;
  $('#overlay').classList.remove('catch-overlay');
  panelType = '';
  document.body.classList.remove('setup-mode');
  world?.select?.(null);
  focusBefore?.focus?.({preventScroll: true});
}
// Swap each card's drawing for a still render of the real 3D fish once it is ready.
function hydrateThumbs() {
  for (const el of all('[data-thumb]')) {
    const species = SPECIES.find(f => f.id === el.dataset.thumb);
    if (!species) continue;
    fishThumbnail(species, el.dataset.unknown === '1')
      .then(url => {
        if (url && el.isConnected !== false) el.innerHTML = `<img class="fish-art" alt="" src="${url}">`;
      })
      .catch(() => {});
  }
}
// Shop rows swap their glyph for a rendered 3D model of the item once it is ready.
function hydrateItems() {
  for (const el of all('[data-item]')) {
    const [kind, n] = el.dataset.item.split(':'),
      i = Number(n),
      a = kind === 'apparel' ? APPAREL[i] : null;
    // "No hat" and "No sunglasses" keep their glyph: there is nothing to show.
    if (a && /0$/.test(a.id) && (a.slot === 'hat' || a.slot === 'glasses')) continue;
    itemThumbnail(kind === 'apparel' ? 'apparel' : kind, i, a ? {id: a.id, slot: a.slot, character: state.character} : null)
      .then(url => {
        if (url && el.isConnected !== false) el.innerHTML = `<img alt="" src="${url}">`;
      })
      .catch(() => {});
  }
}
function bindPanel() {
  if (panelType === 'journal' || panelType === 'residents') hydrateThumbs();
  // Milo is rendered live in 3D; he waves when you walk in.
  if (panelType === 'shop') hydrateItems();
  if (panelType === 'shop' && $('#keeper-stage')) {
    showKeeper($('#keeper-stage'), keeperWave);
    keeperWave = false;
  }
  if (panelType === 'extras') $('#extra-back').onclick = () => closePanel();
  if (panelType === 'newgame') {
    $('#cancel-new').onclick = () => closePanel();
    $('#confirm-new').onclick = () => {
      closePanel(true);
      const clean = {
        ...freshState(),
        quality: state.quality,
        audioOn: state.audioOn,
        volume: state.volume,
        haptics: state.haptics,
      };
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, clean);
      pending = null;
      encounter = null;
      world?.refreshFish(SPECIES);
      world?.refreshCharacter?.();
      save();
      enterGame();
    };
  }
  if (panelType === 'character') {
    const keepName = () => (creation.name = cleanName($('#character-name').value) || 'Angler');
    for (const key of ['skin', 'hair', 'style', 'eyes', 'facial'])
      all('[data-' + key + ']').forEach(
        b =>
          (b.onclick = () => {
            keepName();
            creation[key] = Number(b.dataset[key]);
            world?.previewCharacter?.(creation, key === 'skin' ? 'body' : 'face');
            openPanel('character');
          }),
      );
    all('[data-look-tab]').forEach(
      b =>
        (b.onclick = () => {
          keepName();
          creationTab = b.dataset.lookTab;
          openPanel('character');
        }),
    );
    $('#random-look').onclick = () => {
      keepName();
      const pick = n => Math.floor(Math.random() * n);
      Object.assign(creation, {skin: pick(SKINS.length), hair: pick(HAIRS.length), style: pick(HAIR_STYLES.length), eyes: pick(EYES.length), facial: pick(FACIAL_HAIR.length)});
      world?.previewCharacter?.(creation, 'face');
      openPanel('character');
    };
    $('#create-character').onclick = () => {
      creation.name = cleanName($('#character-name').value) || 'Angler';
      state.character = {...creation};
      world?.refreshCharacter?.();
      save();
      closePanel(true);
      if (pending) {
        world?.showCatch?.(pending);
        setStage('catch');
        openPanel('catch');
      } else setStage('idle');
      toast('Your angler is set. Apparel can change at the market.');
    };
  }
  if (panelType === 'catch') {
    $('#keep-catch').onclick = () => finishCatch(true);
    $('#release-catch').onclick = () => finishCatch(false);
  }
  if (panelType === 'shop') {
    all('[data-tab]').forEach(
      b =>
        (b.onclick = () => {
          shopTab = b.dataset.tab;
          confirmRebirth = false;
          openPanel('shop');
        }),
    );
    all('[data-buy]').forEach(
      b =>
        (b.onclick = () => {
          const [kind, n] = b.dataset.buy.split(':'),
            i = Number(n);
          if (kind === 'visit') {
            state.region = i;
            save();
            closePanel();
            dip(() => {
              world?.setRegion(i);
              conditions = worldConditions(Date.now(), i);
              setView('lake');
            });
            return;
          }
          if (kind === 'bait-equip') {
            if (!state.ownedBaits.includes(BAITS[i].id)) return;
            state.bait = i;
            save();
            hud();
            openPanel('shop');
            return;
          }
          if (kind === 'equip') {
            const a = APPAREL[i];
            if (!state.ownedClothes.includes(a.id)) return;
            state.outfit[a.slot] = a.id;
            world?.refreshCharacter?.();
            save();
            openPanel('shop');
            return;
          }
          if (buy(state, kind, i)) {
            world?.refreshCharacter?.();
            world?.refreshFish(SPECIES);
            save();
            hud();
            sound.play('coin');
            openPanel('shop');
            toast('A purchase for the next part of your story.');
          }
        }),
    );
    const r = $('#rebirth-now');
    if (r)
      r.onclick = () => {
        if (!canRebirth(state)) return;
        if (!confirmRebirth) {
          confirmRebirth = true;
          openPanel('shop');
          return;
        }
        if (rebirth(state)) {
          save();
          world?.refreshFish(SPECIES);
          world?.setRegion(0);
          world?.refreshCharacter?.();
          closePanel();
          setView('lake');
          toast(
            state.rebirth === 3
              ? 'Third rebirth complete. You reached the current chapter endpoint.'
              : 'A new tide. Permanent bonuses carried forward.',
          );
        }
      };
  }
  if (panelType === 'journal') {
    all('[data-filter]').forEach(
      b =>
        (b.onclick = () => {
          journalFilter = b.dataset.filter;
          openPanel('journal');
        }),
    );
    const c = $('#claim-collection');
    if (c)
      c.onclick = () => {
        if (claimCollection(state)) {
          save();
          hud();
          openPanel('journal');
          sound.play('coin');
        }
      };
  }
  if (panelType === 'residents') {
    all('[data-inspect]').forEach(b => (b.onclick = () => inspect(b.dataset.inspect)));
    all('[data-release]').forEach(
      b =>
        (b.onclick = () => {
          if (b.dataset.confirm !== 'yes') {
            b.dataset.confirm = 'yes';
            b.textContent = 'Confirm release?';
            return;
          }
          const i = state.fish.findIndex(f => f.uid === b.dataset.release);
          if (i < 0) return;
          accrue(state);
          state.pearls += releaseValue(state.fish[i]);
          state.fish.splice(i, 1);
          save();
          hud();
          world?.refreshFish(SPECIES);
          openPanel('residents');
          sound.play('coin');
        }),
    );
  }
  if (panelType === 'fish') {
    $('#save-nickname').onclick = () => {
      const f = state.fish.find(f => f.uid === selectedUID);
      f.nickname = cleanName($('#fish-nickname').value);
      save();
      openPanel('fish');
    };
    $('#back-residents').onclick = () => openPanel('residents');
    $('#upgrade-fish').onclick = () => {
      if (nurture(state, selectedUID)) {
        save();
        hud();
        openPanel('fish');
        sound.play('coin');
      }
    };
  }
  if (panelType === 'help') {
    $('#options-sound').onclick = async () => {
      state.audioOn = await sound.toggle();
      updateSoundButton(state.audioOn);
      save();
      openPanel('help');
    };
    $('#options-units').onclick = () => {
      state.units = imperial() ? 'metric' : 'imperial';
      save();
      hud();
      openPanel('help');
    };
    $('#options-haptics').onclick = () => {
      state.haptics = state.haptics === false;
      if (state.haptics) buzz(40);
      save();
      openPanel('help');
    };
    all('[data-volume]').forEach(
      b =>
        (b.onclick = () => {
          state.volume = Number(b.dataset.volume);
          sound.setVolume?.(state.volume);
          save();
          openPanel('help');
        }),
    );
    $('#return-title').onclick = () => {
      closePanel();
      inTitle = true;
      $('#title-screen').hidden = false;
      $('#continue-game').disabled = !state.character;
      $('#continue-game').textContent = state.character ? 'Continue' : 'Continue · no saved angler';
      document.body.classList.add('title-mode');
      world?.setTitle?.(true);
      sound.setPlace?.('ocean');
    };
    all('[data-quality]').forEach(
      b =>
        (b.onclick = () => {
          state.quality = b.dataset.quality;
          world?.setQuality?.();
          save();
          openPanel('help');
        }),
    );
    $('#start-playing').onclick = () => closePanel();
    $('#export-save').onclick = () => {
      save();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'}));
      a.download = 'stillwater-progress.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import-save').onchange = async e => {
      try {
        const file = e.target.files[0];
        if (!file || file.size > 300000) throw Error();
        const raw = JSON.parse(await file.text());
        if (![1, 2, 3].includes(raw.version) || !Array.isArray(raw.fish)) throw Error();
        const restored = sanitize(raw);
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, restored);
        pending = state.pending || null;
        state.activeCast = false;
        save();
        world?.refreshFish(SPECIES);
        world?.refreshCharacter?.();
        world?.setRegion(state.region);
        world?.setQuality?.();
        closePanel();
        setStage('idle');
        setView('lake');
        if (inTitle) {
          $('#continue-game').disabled = !state.character;
          $('#continue-game').textContent = state.character ? 'Continue' : 'Continue · no saved angler';
          world?.setTitle?.(true);
        } else if (!state.character) openPanel('character');
        else if (pending) {
          world?.showCatch?.(pending);
          setStage('catch');
          openPanel('catch');
        }
        toast('Your sanctuary has returned.');
      } catch {
        toast('That is not a valid Stillwater progress file.');
      }
    };
  }
}
$('#close-panel').onclick = () => closePanel();
$('#overlay').addEventListener('click', e => {
  if (e.target === $('#overlay')) closePanel();
});
$('#overlay').addEventListener('keydown', e => {
  if (e.key === 'Escape') return closePanel();
  if (e.key !== 'Tab') return;
  const a = all('#overlay button:not(:disabled),#overlay input:not([hidden])').filter(
      e => !e.hidden && e.offsetParent !== null,
    ),
    first = a[0],
    last = a.at(-1);
  if (!first) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
let lastFrame = performance.now();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (document.hidden) return;
  sound.ambience?.(dt, inTitle ? 3 : state.region, conditions.phase);
  if (stage === 'charging') {
    charge = 0.5 - 0.5 * Math.cos((now - chargeStart) * 0.0024);
    world?.setCharge?.(charge);
    $('#charge-meter span').style.width = charge * 100 + '%';
  }
  if (stage === 'waiting' && now >= waitUntil) {
    if (!encounter.bites) fail('no-bite');
    else {
      setStage('bite');
      hookDeadline = now + 2800;
      sound.play('bite');
    }
  }
  if (stage === 'bite' && now > hookDeadline) fail('missed-hook');
  if (stage === 'reeling' && encounter) {
    cursor = 0.5 + Math.sin((now - reelEpoch) * reelProfile(encounter.rarity).speed * (reduced ? 0.7 : 1)) * 0.47;
    $('#reel-cursor').style.left = cursor * 100 + '%';
    const outcome = stepFight(encounter, state, dt);
    world?.setTension?.(encounter.tension);
    sound.tension?.(encounter.tension);
    $('#tension-fill').style.width = Math.min(100, encounter.tension * 100) + '%';
    $('#tension-fill').style.background =
      encounter.tension > 0.8 ? '#d48c78' : encounter.tension > 0.58 ? '#d4b77d' : '#87b6a0';
    $('#distance-fill').style.width = Math.max(0, (1 - encounter.progress) * 100) + '%';
    $('#fight-distance').textContent = Math.round((1 - encounter.progress) * 100) + '% distance';
    if (outcome) fail(outcome);
  }
  if (stage === 'landing' && now >= waitUntil) {
    setStage('catch');
    openPanel('catch');
  }
  if (now - lastTick > 500) {
    accrue(state);
    conditions = worldConditions(Date.now(), state.region);
    world?.setConditions?.(conditions);
    hud();
    lastTick = now;
  }
  if (now - lastSave > 10000) {
    save();
    lastSave = now;
  }
}
requestAnimationFrame(tick);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (stage === 'reeling' || stage === 'bite') fail('escaped');
    sound.pause();
  } else {
    sound.resume();
    hud();
  }
  save();
});
window.addEventListener('pagehide', save);
$('#build-label').textContent = 'Stillwater v' + VERSION + ' · build ' + BUILD;
hud();
setStage('idle');
setView('lake');
world?.setTitle?.(true);
sound.setPlace?.('ocean');
document.body.classList.add('title-mode');
$('#continue-game').disabled = !hasExisting;
$('#continue-game').textContent = hasExisting ? 'Continue' : 'Continue · no saved angler';
function updateSoundButton(on) {
  document.body.classList.toggle('sound-on', on);
  $('#sound').setAttribute('aria-label', on ? 'Mute water sounds' : 'Enable water sounds');
}
let titleShown = false;
function showTitle() {
  if (titleShown) return;
  titleShown = true;
  if (!reduced) world?.startIntro?.();
  document.body.classList.add('intro-done');
  $('#loading').style.opacity = '0';
  setTimeout(() => {
    $('#loading').hidden = true;
    $('#continue-game').focus();
  }, 800);
}
$('#begin-intro').onclick = async () => {
  if (introStarted) return;
  introStarted = true;
  try {
    updateSoundButton(await sound.enable?.(state.audioOn !== false));
  } catch {}
  $('#begin-intro').hidden = true;
  $('#opening-credits').hidden = false;
  $('#skip-intro').hidden = false;
  setTimeout(() => $('#opening-credits').classList.add('reveal'), 80);
  setTimeout(showTitle, reduced ? 1400 : 4100);
};
$('#skip-intro').onclick = showTitle;
function enterGame() {
  inTitle = false;
  document.body.classList.remove('title-mode');
  // The title copy fades away while the camera glides from the boat to the angler.
  setTimeout(() => {
    if (!inTitle) $('#title-screen').hidden = true;
  }, 900);
  world?.setTitle?.(false);
  setStage('idle');
  setView('lake');
  hud();
  if (!state.character) openPanel('character');
  else if (pending) {
    world?.showCatch?.(pending);
    setStage('catch');
    openPanel('catch');
  } else if (interrupted) toast('Your previous line was retrieved. Your lures are still yours.');
  else if (away > 60 && offline >= 1) toast('Your growing fish made ' + fmt(offline) + ' pearls while you were away.');
}
$('#continue-game').onclick = enterGame;
$('#new-game').onclick = () => {
  if (state.character) openPanel('newgame');
  else enterGame();
};
$('#title-options').onclick = () => openPanel('help');
$('#title-extra').onclick = () => openPanel('extras');
document.addEventListener('click', e => {
  if (e.target.closest('button') && e.target !== $('#cast')) sound.play('ui');
});

if ('serviceWorker' in navigator)
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('./sw.js', {scope: './', updateViaCache: 'none'})
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        offlineReady = true;
        if (panelType === 'help' && $('#offline-state')) $('#offline-state').textContent = 'Ready for offline play.';
      })
      .catch(() => {}),
  );
