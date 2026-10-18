export function createAudio() {
  let ctx,
    master,
    water,
    lapGain,
    rainGain,
    windGain,
    windFilter,
    enabled = false,
    musicOn = true,
    noiseBuffer,
    pinkBuffer,
    volume = 0.3,
    whine,
    whineGain,
    place = 'lake',
    ambienceWait = 10,
    musicWait = 6,
    chordStep = 0;

  // Pentatonic water-harp scales (Hz): warm major pentatonic by day, contemplative suspended mode at night.
  const DAY_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99],
    NIGHT_SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25];

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
    pinkBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0),
      pink = pinkBuffer.getChannelData(0);
    let brown = 0,
      b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      brown = (brown + w * 0.025) / 1.018;
      data[i] = brown * 4;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      pink[i] = (b0 + b1 + b2 + w * 0.1848) * 0.08;
    }
    // Layer 1: Deep water current / surf bed.
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 90;
    water = ctx.createGain();
    water.gain.value = 0.2;
    source.connect(filter);
    filter.connect(high);
    high.connect(water);
    water.connect(master);
    source.start();
    const lfo = ctx.createOscillator(),
      depth = ctx.createGain();
    lfo.frequency.value = 0.09;
    depth.gain.value = 0.038;
    lfo.connect(depth);
    depth.connect(water.gain);
    lfo.start();

    // Layer 2: Gentle shoreline lap / ripple shimmer.
    const lapSrc = ctx.createBufferSource();
    lapSrc.buffer = pinkBuffer;
    lapSrc.loop = true;
    const lapBand = ctx.createBiquadFilter();
    lapBand.type = 'bandpass';
    lapBand.frequency.value = 920;
    lapBand.Q.value = 1.4;
    lapGain = ctx.createGain();
    lapGain.gain.value = 0.032;
    lapSrc.connect(lapBand);
    lapBand.connect(lapGain);
    lapGain.connect(master);
    lapSrc.start();
    const lapLfo = ctx.createOscillator(),
      lapDepth = ctx.createGain();
    lapLfo.frequency.value = 0.21;
    lapDepth.gain.value = 0.022;
    lapLfo.connect(lapDepth);
    lapDepth.connect(lapGain.gain);
    lapLfo.start();

    // Layer 3: Dynamic rain patter and wind swell channels.
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = pinkBuffer;
    rainSrc.loop = true;
    const rainBand = ctx.createBiquadFilter();
    rainBand.type = 'bandpass';
    rainBand.frequency.value = 2100;
    rainBand.Q.value = 0.7;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainBand);
    rainBand.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 2.2;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    // Line tension whine oscillator.
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
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * end), time + duration);
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
  // Soft resonant harp-like pluck with a warm fundamental and a delicate octave overtone.
  function harpNote(freq, time, duration = 2.4, level = 0.028, pan = 0) {
    if (!enabled || !ctx) return;
    note(freq, time, duration, level, pan, 'sine', 0.998);
    note(freq * 2, time + 0.006, duration * 0.55, level * 0.32, -pan * 0.6, 'triangle', 0.996);
  }
  function splash(time, strength = 0.3, duration = 0.7, freq = 1050) {
    if (!enabled || !ctx) return;
    const src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + duration);
    filter.Q.value = 0.85;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(strength, time + 0.022);
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
      // Rod whip whoosh + crisp spool release click.
      splash(t, 0.13, 0.24, 1450);
      note(180, t, 0.28, 0.055, -0.2, 'sine', 2.45);
      note(1250, t + 0.02, 0.035, 0.025, 0.15, 'triangle', 0.7);
    } else if (type === 'bobber') {
      splash(t, 0.28, 0.46, 1100);
      note(390, t, 0.13, 0.03, 0, 'sine', 0.68);
      note(580, t + 0.06, 0.11, 0.02, 0.08, 'sine', 1.25);
    } else if (type === 'nibble') {
      // A small hollow 'plip' as the float is tugged under.
      note(520 + Math.random() * 80, t, 0.09, 0.032, 0.1, 'sine', 0.55);
      splash(t, 0.075, 0.16, 1300);
    } else if (type === 'rise') {
      // Distant surface ring and water droplet.
      splash(t, 0.055 + Math.random() * 0.03, 0.34, 950);
      note(620 + Math.random() * 140, t + 0.04, 0.08, 0.016, (Math.random() - 0.5) * 0.7, 'sine', 1.35);
    } else if (type === 'thrash') {
      splash(t, 0.24 + Math.random() * 0.08, 0.38, 1200);
      splash(t + 0.09, 0.14, 0.26, 880);
    } else if (type === 'drip') {
      note(750 + Math.random() * 300, t, 0.075, 0.02, (Math.random() - 0.5) * 0.7, 'sine', 0.45);
      splash(t, 0.025, 0.09, 1500);
    } else if (type === 'bite') {
      note(640, t, 0.25, 0.13, 0.15);
      note(830, t + 0.14, 0.35, 0.09, -0.15);
      splash(t + 0.02, 0.18, 0.28, 980);
    } else if (type === 'catch') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        note(f, t + 0.08 + i * 0.11, 1.05, 0.09, (i - 1.5) * 0.15);
        note(f * 2, t + 0.09 + i * 0.11, 0.5, 0.022, (1.5 - i) * 0.15, 'triangle', 1.0);
      });
    } else if (type === 'story' || type === 'breed') {
      [440, 554.37, 659.25, 880, 1108.73, 1318.5].forEach((f, i) =>
        harpNote(f, t + i * 0.09, 1.4, 0.065, (i - 2.5) * 0.14),
      );
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
    } else if (type === 'cricket') {
      for (let i = 0; i < 4; i++)
        note(3950 + (i % 2) * 120, t + i * 0.048, 0.035, 0.014, -0.45, 'sine', 0.98);
    } else if (type === 'frog') {
      note(195, t, 0.18, 0.03, 0.45, 'triangle', 1.38);
      note(215, t + 0.24, 0.22, 0.026, 0.45, 'triangle', 1.32);
    } else if (type === 'bell') {
      // Distant harbour buoy bell rocking on the swell.
      note(587.33, t, 2.1, 0.032, 0.5, 'sine', 0.995);
      note(1174.66, t, 1.1, 0.012, 0.5, 'triangle', 0.99);
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
      for (let i = 0; i < 5; i++) {
        note(240 + i * 35, t + i * 0.032, 0.048, 0.035);
        note(1350 + i * 90, t + i * 0.032, 0.018, 0.016, 0.1, 'triangle', 0.75);
      }
    } else if (type === 'perfect') {
      for (let i = 0; i < 5; i++) {
        note(270 + i * 42, t + i * 0.028, 0.052, 0.036);
        note(1550 + i * 110, t + i * 0.028, 0.018, 0.016, 0.12, 'triangle', 0.8);
      }
      note(880, t + 0.04, 0.3, 0.048, 0.1, 'sine', 1.02);
      note(1318.5, t + 0.09, 0.34, 0.032, -0.1, 'sine', 1.01);
    } else if (type === 'rhythm') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        note(f, t + i * 0.05, 0.45, 0.055, (i - 1.5) * 0.15, 'sine', 1.01),
      );
    } else if (type === 'thunder') {
      // Distant thunder: a long low-passed rumble that swells and rolls away.
      const src = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain(),
        d = 3.2 + Math.random() * 1.5;
      src.buffer = noiseBuffer;
      src.loop = true;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, t);
      filter.frequency.exponentialRampToValueAtTime(70, t + d);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.35);
      gain.gain.setTargetAtTime(0.18, t + 0.5, 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + d);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + d + 0.1);
      note(46, t + 0.1, d * 0.8, 0.07, 0, 'sine', 0.85);
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
      if (ctx && water) {
        water.gain.setTargetAtTime(
          place === 'shop' ? 0.045 : place === 'tank' ? 0.075 : place === 'ocean' ? 0.28 : 0.18,
          ctx.currentTime,
          0.6,
        );
        lapGain?.gain.setTargetAtTime(
          place === 'shop' ? 0.005 : place === 'tank' ? 0.025 : place === 'ocean' ? 0.052 : 0.032,
          ctx.currentTime,
          0.6,
        );
      }
    },
    setWeather(weather = 'clear', windKmh = 8) {
      if (!ctx || !enabled) return;
      const isRain = weather === 'rain' ? 0.08 : weather === 'storm' ? 0.15 : 0;
      const isWind = Math.max(0, (windKmh - 12) / 35) * (place === 'shop' || place === 'tank' ? 0.15 : 0.09);
      rainGain?.gain.setTargetAtTime(place === 'tank' || place === 'shop' ? isRain * 0.25 : isRain, ctx.currentTime, 1.2);
      windGain?.gain.setTargetAtTime(isWind, ctx.currentTime, 1.2);
      windFilter?.frequency.setTargetAtTime(260 + windKmh * 6, ctx.currentTime, 1.2);
    },
    setMusic(on = true) {
      musicOn = !!on;
    },
    ambience(dt, region, phase, weather = 'clear', windKmh = 8) {
      if (!enabled) return;
      this.setWeather(weather, windKmh);
      const step = Math.min(dt, 0.1);
      // Generative pentatonic water-harp music: sparse, unhurried notes across the water.
      if (musicOn && place !== 'shop') {
        musicWait -= step;
        if (musicWait <= 0) {
          musicWait = 5.5 + Math.random() * 6.5;
          const scale = phase === 'night' || phase === 'dusk' ? NIGHT_SCALE : DAY_SCALE;
          const idx = (chordStep + Math.floor(Math.random() * 3)) % scale.length;
          chordStep = (chordStep + 2) % scale.length;
          const freq = scale[idx] * (region >= 3 ? 0.75 : 1);
          const t = ctx.currentTime;
          harpNote(freq, t, 2.8, 0.022, (Math.random() - 0.5) * 0.6);
          if (Math.random() < 0.45) {
            const fifth = scale[(idx + 2) % scale.length] * (region >= 3 ? 0.75 : 1);
            harpNote(fifth, t + 0.38, 2.4, 0.016, (Math.random() - 0.5) * 0.6);
          }
        }
      }
      if (place === 'shop' || place === 'tank') return;
      ambienceWait -= step;
      if (ambienceWait > 0) return;
      ambienceWait = 11 + Math.random() * 20;
      const r = Math.random();
      if (region >= 3) play(r < 0.22 ? 'horn' : r < 0.48 ? 'bell' : 'gull');
      else if (phase === 'night' || phase === 'dusk') play(r < 0.55 ? 'cricket' : 'frog');
      else play(r < 0.2 ? 'car' : 'bird');
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
