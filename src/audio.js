import { G } from './game.js';

// Prosedürel ses efektleri ve arka plan müziği (WebAudio, harici dosya yok)
export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.muted = false;
    this._unlock = () => this.unlock();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings() {
    const s = G.state ? G.state.settings : { music: true, sfx: true };
    this.musicOn = s.music;
    this.sfxOn = s.sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(this.musicOn && !this.muted ? 0.22 : 0, t + 0.5);
    this.sfxGain.gain.value = this.sfxOn && !this.muted ? 0.55 : 0;
  }

  setMuted(m) {
    this.muted = m;
    this.applySettings();
  }

  tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, vol = 0.2, when = 0, freq = 2000, type = 'bandpass', out) {
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out || this.sfxGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || !this.sfxOn || this.muted) return;
    switch (name) {
      case 'click':
        this.tone(880, 0.06, 'triangle', 0.15);
        break;
      case 'open':
        this.tone(520, 0.08, 'triangle', 0.12);
        this.tone(780, 0.1, 'triangle', 0.1, 0.05);
        break;
      case 'place':
        this.tone(160, 0.18, 'sine', 0.4, 0, -80);
        this.noise(0.12, 0.15, 0, 900);
        this.tone(660, 0.08, 'triangle', 0.1, 0.06);
        break;
      case 'coin':
        this.tone(1320, 0.07, 'square', 0.05);
        this.tone(1760, 0.16, 'square', 0.05, 0.06);
        break;
      case 'cash':
        this.noise(0.08, 0.12, 0, 5000, 'highpass');
        this.tone(1046, 0.08, 'triangle', 0.18, 0.05);
        this.tone(1568, 0.25, 'triangle', 0.16, 0.12);
        break;
      case 'error':
        this.tone(220, 0.12, 'square', 0.08);
        this.tone(160, 0.2, 'square', 0.08, 0.1);
        break;
      case 'break':
        this.noise(0.3, 0.3, 0, 600, 'lowpass');
        this.tone(300, 0.3, 'sawtooth', 0.08, 0, -200);
        break;
      case 'goal':
        [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, i * 0.07));
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, i * 0.09));
        this.tone(1568, 0.6, 'sine', 0.1, 0.45);
        break;
      case 'notify':
        this.tone(740, 0.1, 'sine', 0.12);
        break;
      case 'day':
        [392, 523, 659].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12, i * 0.12));
        break;
    }
  }

  // ---- basit lo-fi / house müzik döngüsü ----
  startMusic() {
    if (this.musicStarted) return;
    this.musicStarted = true;
    const c = this.ctx;
    const bpm = 100;
    this.beat = 60 / bpm;
    this.nextT = c.currentTime + 0.2;
    this.step = 0;
    // A minör - F - C - G
    this.prog = [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [48, 52, 55, 59],
      [55, 59, 62, 65],
    ];
    this.lp = c.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 2400;
    this.lp.connect(this.musicGain);
    setInterval(() => this._schedule(), 50);
  }

  _schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    while (this.nextT < c.currentTime + 0.25) {
      this._playStep(this.step, this.nextT);
      this.nextT += this.beat / 2;
      this.step = (this.step + 1) % 64;
    }
  }

  _playStep(step, t) {
    const c = this.ctx;
    const bar = Math.floor(step / 8) % 4;
    const chord = this.prog[bar];
    const mf = n => 440 * Math.pow(2, (n - 69) / 12);
    const out = this.lp;
    const eighth = step % 8;
    // kick
    if (eighth % 4 === 0 || (eighth === 6 && Math.random() < 0.3)) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
    }
    // snare/clap
    if (eighth === 2 || eighth === 6) this.noise(0.14, 0.18, t - c.currentTime, 1800, 'bandpass', out);
    // hi-hat
    this.noise(0.04, eighth % 2 ? 0.06 : 0.03, t - c.currentTime, 8000, 'highpass', out);
    // pad
    if (eighth === 0) {
      for (const n of chord) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.value = mf(n);
        o.detune.value = (Math.random() - 0.5) * 12;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035, t + 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + this.beat * 4);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + this.beat * 4 + 0.1);
      }
    }
    // bas
    if (eighth === 0 || eighth === 3 || eighth === 4 || eighth === 7) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = mf(chord[0] - 24 + (eighth === 7 ? 7 : 0));
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + this.beat * 0.45);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + this.beat * 0.5);
    }
    // arpej
    if (step >= 32 && Math.random() < 0.55) {
      const scale = [0, 3, 5, 7, 10, 12, 15];
      const n = 69 + scale[Math.floor(Math.random() * scale.length)];
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.value = mf(n);
      g.gain.setValueAtTime(0.018, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.22);
    }
  }
}
