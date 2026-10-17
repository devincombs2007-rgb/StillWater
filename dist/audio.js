export function createAudio() {
  let ctx,
    master,
    water,
    enabled = false,
    noiseBuffer,
    volume = 0.3,
    whine,
    whineGain,
    place = 'lake',
    ambienceWait = 12;
  function setup() {
    if (ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 6;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.018;
      data[i] = brown * 4;
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 680;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 95;
    water = ctx.createGain();
    water.gain.value = 0.22;
    source.connect(filter);
    filter.connect(high);
    high.connect(water);
    water.connect(master);
    source.start();
    const lfo = ctx.createOscillator(),
      depth = ctx.createGain();
    lfo.frequency.value = 0.09;
    depth.gain.value = 0.035;
    lfo.connect(depth);
    depth.connect(water.gain);
    lfo.start();
    whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 220;
    whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    whine.connect(whineGain);
    whineGain.connect(master);
    whine.start();
  }
  function note(freq, time, duration = 0.5, level = 0.12, pan = 0, type = 'sine', end = 0.92) {
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    o.frequency.exponentialRampToValueAtTime(freq * end, time + duration);
    g.gain.setValueAtTime(0.001, time);
    g.gain.exponentialRampToValueAtTime(level, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);
    o.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(master);
    } else g.connect(master);
    o.start(time);
    o.stop(time + duration + 0.02);
  }
  function splash(time, strength = 0.3, duration = 0.7) {
    if (!enabled || !ctx) return;
    const src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1050, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(strength, time + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(time);
    src.stop(time + duration + 0.05);
  }
  function speak(text) {
    if (!enabled || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice =
      voices.find(v => /^en/.test(v.lang) && /samantha|ava|sandy|karen|female/i.test(v.name)) ||
      voices.find(v => /^en/.test(v.lang)) ||
      null;
    u.lang = 'en-US';
    u.pitch = 1.35;
    u.rate = 1.06;
    u.volume = Math.min(1, volume * 2);
    window.speechSynthesis.speak(u);
  }
  async function enable(on = true) {
    setup();
    if (!ctx) return false;
    enabled = on;
    if (on) {
      await ctx.resume();
      master.gain.setTargetAtTime(volume, ctx.currentTime, 0.15);
    } else {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      window.speechSynthesis?.cancel();
    }
    return enabled;
  }
  function play(type) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    if (type === 'cast') {
      splash(t, 0.11, 0.22);
      note(170, t, 0.3, 0.05, -0.2, 'sine', 2.3);
    } else if (type === 'bobber') {
      splash(t, 0.28, 0.45);
      note(390, t, 0.12, 0.025);
    } else if (type === 'nibble') {
      // A small hollow 'plip' as the float is tugged under.
      note(520 + Math.random() * 80, t, 0.09, 0.03, 0.1, 'sine', 0.55);
      splash(t, 0.07, 0.16);
    } else if (type === 'thrash') {
      splash(t, 0.22 + Math.random() * 0.08, 0.38);
      splash(t + 0.09, 0.12, 0.25);
    } else if (type === 'drip') {
      note(750 + Math.random() * 300, t, 0.075, 0.018, (Math.random() - 0.5) * 0.7, 'sine', 0.45);
      splash(t, 0.025, 0.09);
    } else if (type === 'bite') {
      note(640, t, 0.25, 0.13, 0.15);
      note(830, t + 0.14, 0.35, 0.09, -0.15);
    } else if (type === 'catch') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, t + 0.08 + i * 0.11, 1, 0.09, (i - 1.5) * 0.15));
    } else if (type === 'coin') {
      [659, 988, 1318].forEach((f, i) => note(f, t + i * 0.07, 0.45, 0.055, (i - 1) * 0.2));
    } else if (type === 'shop-enter' || type === 'shop-leave') {
      for (const [i, f] of [1760, 2350, 3136].entries()) {
        note(f, t + i * 0.045, 1.3, 0.07, -0.25);
        note(f * 2.01, t + i * 0.045, 0.65, 0.018, 0.25);
      }
    } else if (type === 'hello') {
      [660, 830, 990].forEach((f, i) => note(f, t + i * 0.09, 0.16, 0.035));
      speak('Hello! Welcome to the bait shop!');
    } else if (type === 'goodbye') {
      note(830, t, 0.2, 0.04);
      note(660, t + 0.13, 0.3, 0.04);
      speak('Have a good day!');
    } else if (type === 'bird') {
      for (let i = 0; i < 3; i++) note(1850 + i * 160, t + i * 0.15, 0.12, 0.035, -0.55, 'sine', 1.5);
    } else if (type === 'gull') {
      note(960, t, 0.65, 0.045, 0.5, 'sine', 0.5);
      note(1070, t + 0.8, 0.45, 0.03, 0.5, 'sine', 0.65);
    } else if (type === 'car') {
      note(415, t, 0.18, 0.025, -0.6, 'triangle', 1);
      note(523, t, 0.18, 0.02, -0.6, 'triangle', 1);
    } else if (type === 'horn') {
      note(110, t, 2.2, 0.05, 0.6, 'triangle', 0.98);
      note(165, t, 2.2, 0.025, 0.6, 'sine', 0.98);
    } else if (type === 'line-snap' || type === 'snap') {
      splash(t, 0.28, 0.3);
      note(1150, t, 0.08, 0.16);
      note(170, t + 0.025, 0.18, 0.12);
    } else if (type === 'rod-snap') {
      splash(t, 0.25, 0.3);
      note(125, t, 0.12, 0.2, 0, 'triangle');
      note(270, t + 0.03, 0.12, 0.1);
    } else if (type === 'escape') splash(t, 0.28);
    else if (type === 'splash') splash(t, 0.6);
    else if (type === 'feed') {
      for (let i = 0; i < 4; i++)
        note(950 + Math.random() * 450, t + i * 0.08, 0.16, 0.035, (Math.random() - 0.5) * 0.8);
    } else if (type === 'reel') {
      for (let i = 0; i < 4; i++) note(240 + i * 35, t + i * 0.035, 0.05, 0.035);
    } else if (type === 'ui') note(650, t, 0.055, 0.018, 0, 'sine', 1.25);
    else note(430, t, 0.3, 0.04);
  }
  return {
    enable,
    toggle: () => enable(!enabled),
    play,
    tension(value) {
      if (ctx && whineGain) {
        whine.frequency.setTargetAtTime(180 + value * 800, ctx.currentTime, 0.12);
        whineGain.gain.setTargetAtTime(enabled ? Math.max(0, value - 0.46) * 0.055 : 0, ctx.currentTime, 0.1);
      }
    },
    setPlace(value) {
      place = value;
      if (ctx && water)
        water.gain.setTargetAtTime(
          place === 'shop' ? 0.045 : place === 'tank' ? 0.075 : place === 'ocean' ? 0.3 : 0.18,
          ctx.currentTime,
          0.6,
        );
    },
    ambience(dt, region, phase) {
      if (!enabled || place === 'shop' || place === 'tank') return;
      ambienceWait -= Math.min(dt, 0.1);
      if (ambienceWait > 0) return;
      ambienceWait = 14 + Math.random() * 25;
      const r = Math.random();
      if (region >= 3) play(r < 0.26 ? 'horn' : 'gull');
      else if (phase !== 'night') play(r < 0.2 ? 'car' : 'bird');
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(0.6, value));
      if (ctx && enabled) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.12);
    },
    pause() {
      if (ctx) ctx.suspend();
      window.speechSynthesis?.cancel();
    },
    resume() {
      if (ctx && enabled) ctx.resume().catch(() => {});
    },
    get enabled() {
      return enabled;
    },
  };
}
