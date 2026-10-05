import './style.css';
import { G } from './game.js';
import { Engine } from './render/engine.js';
import { World } from './render/world.js';
import { Sim } from './sim/sim.js';
import { UI } from './ui/ui.js';
import { Audio } from './audio.js';
import { SDK } from './sdk.js';
import { newState, loadSave, save, deleteSave, dateInfo } from './state.js';
import { REAL_SEC_PER_GAME_MIN, MAXD } from './data.js';
import { fmtMoney } from './game.js';
import { Character } from './render/character.js';
import { spotWorld, removeAgentVisual } from './sim/agents.js';
import { ITEMS } from './data.js';

const $ = id => document.getElementById(id);

async function boot() {
  if (import.meta.env.DEV || location.search.includes('debug')) {
    window.G = G;
    window.DBG = { Character, spotWorld, ITEMS };
  }
  G.sdk = new SDK();
  await G.sdk.init();
  G.sdk.loadingStart();
  G.audio = new Audio();
  G.engine = new Engine($('canvas-wrap'));

  const saved = loadSave();
  G.state = saved || newState('FitZone');
  if (G.state.settings.shadows === false) G.engine.renderer.shadowMap.enabled = false;
  G.world = new World(G.engine);
  G.sim = new Sim();
  G.sim.init();
  G.ui = new UI();
  G.audio.applySettings();

  const focusGym = () => {
    const R = G.sim.grid.rect;
    G.engine.focus(R.w / 2 + 0.5, MAXD - R.d / 2 + 1.5);
    // binayı ekrana sığdır (telefon dikey ekranında daha uzak)
    const aspect = window.innerWidth / window.innerHeight;
    G.engine.setZoom(Math.min(R.w <= 10 ? 1.5 : 1.1, (22 * aspect) / (R.w + 5)));
    G.engine.zoom = G.engine.zoomGoal;
  };
  focusGym();

  // Sayfayı yenilemeden sıfırdan yeni oyun
  G.resetGame = name => {
    deleteSave();
    G.ui.endBuild();
    G.ui.select(null);
    G.ui.closePanel();
    G.ui.closeModal();
    for (const a of G.sim.customers.concat(G.sim.staffAgents)) removeAgentVisual(a);
    for (const it of G.state.items) G.world.removeItemMesh(it);
    G.world.showHeat(null);
    G.state = newState(name || G.state.gymName);
    G.state.started = true;
    G.sim = new Sim();
    G.sim.init();
    G.ui._tutRendered = -1;
    G.ui.tutT = 0;
    G.ui.rotByType = {};
    G.speed = 0;
    G.ui.setSpeed(0);
    G.ui.refreshAll();
    focusGym();
    save();
  };
  G.engine.target.copy(G.engine.targetGoal);

  // döngü
  let last = performance.now();
  let saveT = 0;
  const frame = now => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const gdt = G.running ? (dt * G.speed) / REAL_SEC_PER_GAME_MIN : 0;
    G.sim.update(gdt, dt);
    G.engine.update(dt);
    const r = G.sim.grid.rect;
    G.engine.setTimeOfDay(G.running ? G.state.minute : 10 * 60, { x0: 0, z0: r.z0, w: r.w, d: r.d });
    G.world.update(dt, gdt);
    if (G.running) {
      G.ui.update(dt);
      saveT += dt;
      if (saveT > 30 && G.state.phase !== 'night') {
        saveT = 0;
        save();
      }
    } else {
      // menüde kamera yavaşça döner
      G.engine.azGoal += dt * 0.05;
    }
    G.engine.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.running) save();
  });
  window.addEventListener('beforeunload', () => G.running && save());

  // menü
  $('loading').classList.add('hidden');
  G.sdk.loadingStop();
  const start = () => {
    $('menu').classList.add('hidden');
    G.running = true;
    G.engine.azGoal = Math.round((G.engine.azimuth - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 4;
    G.ui.show();
    G.audio.unlock();
    if (G.state.tutorial >= 0 && !G.state.started) G.speed = 0;
    else G.speed = 1;
    G.state.started = true;
    G.ui.setSpeed(G.speed);
    if (G.speed) G.sdk.gameplayStart();
  };

  $('menu').classList.remove('hidden');
  if (saved) {
    $('menu-continue').classList.remove('hidden');
    const di = dateInfo(saved.day);
    $('save-info').textContent = `${saved.gymName} · Gün ${saved.day} (${di.label}) · ${fmtMoney(saved.money)} · ${saved.members.length} üye`;
    $('gym-input').value = '';
    $('gym-input').placeholder = 'Yeni salon adı';
  }
  $('btn-continue').addEventListener('click', start);
  $('btn-new').addEventListener('click', () => {
    const name = ($('gym-input').value || 'FitZone').trim().slice(0, 18) || 'FitZone';
    if (saved) {
      // iki adımlı onay: kayıt silinecek
      const b = $('btn-new');
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = '⚠️ Kayıt silinecek — onaylamak için tekrar tıkla';
        b.classList.add('red');
        return;
      }
      start();
      G.resetGame(name);
      return;
    }
    G.state.gymName = name;
    G.world.rebuildBuilding();
    start();
  });
  $('gym-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-new').click();
  });
}

setTimeout(() => {
  boot().catch(err => {
    console.error(err);
    $('loading').innerHTML = '<div>Oyun başlatılamadı 😢<br><small>' + String(err && err.message) + '</small></div>';
  });
}, 30);
