import { G } from './game.js';

// CrazyGames SDK v3 sarmalayıcısı — SDK yoksa (yerel geliştirme) sessizce devre dışı kalır.
export class SDK {
  constructor() {
    this.sdk = null;
    this.env = 'disabled';
  }

  async init() {
    try {
      if (!window.CrazyGames) {
        // SDK betiğini yükle; erişilemezse (çevrimdışı) en fazla 2.5 sn bekle
        await new Promise(res => {
          const s = document.createElement('script');
          s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
          s.onload = res;
          s.onerror = res;
          document.head.appendChild(s);
          setTimeout(res, 2500);
        });
      }
      const cg = window.CrazyGames && window.CrazyGames.SDK;
      if (!cg) return;
      await cg.init();
      this.sdk = cg;
      this.env = cg.environment;
    } catch (e) {
      this.sdk = null;
    }
  }

  get adsAvailable() {
    return !!this.sdk && (this.env === 'crazygames' || this.env === 'local');
  }

  _call(fn) {
    try {
      if (this.sdk && this.env !== 'disabled') fn(this.sdk);
    } catch (e) {}
  }

  loadingStart() { this._call(s => s.game.loadingStart()); }
  loadingStop() { this._call(s => s.game.loadingStop()); }
  gameplayStart() {
    if (this._playing) return;
    this._playing = true;
    this._call(s => s.game.gameplayStart());
  }
  gameplayStop() {
    if (!this._playing) return;
    this._playing = false;
    this._call(s => s.game.gameplayStop());
  }
  happytime() { this._call(s => s.game.happytime()); }

  _ad(type, done) {
    if (!this.adsAvailable) return done(false);
    let finished = false;
    const end = ok => {
      if (finished) return;
      finished = true;
      G.audio.setMuted(false);
      done(ok);
    };
    try {
      this.sdk.ad.requestAd(type, {
        adStarted: () => G.audio.setMuted(true),
        adFinished: () => end(true),
        adError: () => end(false),
      });
    } catch (e) {
      end(false);
    }
  }

  rewarded(done) { this._ad('rewarded', done); }
  midgame(done) { this._ad('midgame', () => done && done()); }

  _data() {
    return this.sdk && this.env === 'crazygames' && this.sdk.data ? this.sdk.data : null;
  }
  saveData(k, v) {
    try { const d = this._data(); if (d) d.setItem(k, v); } catch (e) {}
  }
  loadData(k) {
    try { const d = this._data(); return d ? d.getItem(k) : null; } catch (e) { return null; }
  }
  removeData(k) {
    try { const d = this._data(); if (d) d.removeItem(k); } catch (e) {}
  }
}
