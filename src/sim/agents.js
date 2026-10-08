import { G, rand, randi, pick, clamp } from '../game.js';
import { ITEMS, GROUPS, GROUP_FALLBACK, GOALS, MAXD, MAXW, DOOR_I, ISSUES, STAFF_ROLES, CLASSES, spotKind, isWet } from '../data.js';
import { Character } from '../render/character.js';
import { localToWorld, itemCenter, itemDims } from '../render/world.js';

export const WALK_SPEED = 0.55; // karo / oyun dakikası
const ENTER_TIME = 0.5;
const ROUTE_SPEED = 1.1; // oda içinde yürüme (karo / oyun dakikası)
const DOOR_X = (DOOR_I[0] + DOOR_I[1] + 1) / 2;

// ---------- ortak yardımcılar ----------
export function spotWorld(it, s) {
  const p = localToWorld(it, s.x, s.z);
  const a = localToWorld(it, s.ax, s.az);
  return { x: p.x, z: p.z, y: s.y || 0, face: (s.face || 0) + (it.rot * Math.PI) / 2, ax: a.x, az: a.z };
}

function makeAgentVisual(a, look, opts) {
  a.ch = new Character(look, opts);
  a.ch.root.userData.agent = a;
  a.ch.root.traverse(o => (o.userData.agent = a));
  G.world.agentGroup.add(a.ch.root);
  a.animT = Math.random() * 10;
  a.faceCur = a.face = 0;
}

export function removeAgentVisual(a) {
  if (a.ch) G.world.agentGroup.remove(a.ch.root);
  a.ch = null;
}

export function showBubble(a, emoji, dur = 2.5) {
  if (!a.ch) return;
  if (a.bubble) a.ch.root.remove(a.bubble);
  a.bubble = G.world.makeBubble(emoji);
  a.bubble.position.set(0, 2.25, 0);
  a.ch.root.add(a.bubble);
  a.bubbleT = dur;
}

function setPath(a, tx, tz) {
  const p = G.sim.grid.findPath(a.pos.x, a.pos.z, tx, tz);
  if (!p) return false;
  a.path = p;
  a.pi = 1;
  return true;
}

function followPath(a, dt) {
  let step = a.speed * dt;
  while (step > 0 && a.pi < a.path.length) {
    const t = a.path[a.pi];
    const dx = t.x - a.pos.x, dz = t.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) a.face = Math.atan2(dx, dz);
    if (d <= step) {
      a.pos.x = t.x;
      a.pos.z = t.z;
      step -= d;
      a.pi++;
    } else {
      a.pos.x += (dx / d) * step;
      a.pos.z += (dz / d) * step;
      step = 0;
    }
  }
  return a.pi >= a.path.length;
}

// Belirli bir noktaya yürü, varınca cb
function goTo(a, x, z, cb, failCb) {
  if (!setPath(a, x, z)) {
    if (failCb) failCb();
    return false;
  }
  a.state = 'move';
  a.onArrive = cb;
  return true;
}

// kind verilirse sadece o türdeki yerler (ör. soyunma odasındaki duş)
function freeSpots(it, kind) {
  const res = [];
  if (it.broken) return res;
  const def = ITEMS[it.type];
  const spots = def.spots || [];
  for (let k = 0; k < spots.length; k++) {
    if (kind && spotKind(def, spots[k]) !== kind) continue;
    const r = it._spots[k];
    if (!r.user && !r.res) res.push(k);
  }
  return res;
}

// cinsiyete özel odalar (soyunma odası)
const genderOk = (a, it) => !ITEMS[it.type].gender || ITEMS[it.type].gender === a.m.look.g;

// ---------- oda içi rotalar ----------
function viaPts(it, s) {
  return (s.via || []).map(([x, z]) => localToWorld(it, x, z));
}

// pts boyunca sabit hızla yürüt; y geçişi girişte son, çıkışta ilk parçada olur
function startRoute(a, pts, y0, y1, done, yAtEnd = true) {
  const segLen = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    segLen.push(d);
    len += d;
  }
  a.route = { pts, segLen, len, t: 0, dur: Math.max(ENTER_TIME, len / ROUTE_SPEED), y0, y1, yAtEnd, done };
  a.state = 'route';
}

function routeStep(a, dt) {
  const r = a.route;
  a.pose = 'walk';
  if (!r) return;
  r.t += dt;
  const k = Math.min(1, r.t / r.dur);
  if (r.segLen.length) {
    let d = k * r.len;
    let i = 0;
    while (i < r.segLen.length - 1 && d > r.segLen[i]) {
      d -= r.segLen[i];
      i++;
    }
    const p0 = r.pts[i], p1 = r.pts[i + 1];
    const f = r.segLen[i] > 0 ? Math.min(1, d / r.segLen[i]) : 1;
    a.pos.x = p0.x + (p1.x - p0.x) * f;
    a.pos.z = p0.z + (p1.z - p0.z) * f;
    if (r.segLen[i] > 0.01) a.face = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const last = r.segLen.length - 1;
    if (r.yAtEnd) a.y = i === last ? r.y0 + (r.y1 - r.y0) * f : r.y0;
    else a.y = i === 0 ? r.y0 + (r.y1 - r.y0) * f : r.y1;
  }
  if (k >= 1) {
    a.route = null;
    a.y = r.y1;
    r.done();
  }
}

function nearest(a, list, posFn) {
  let best = null, bd = 1e9;
  for (const x of list) {
    const p = posFn(x);
    const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
    if (d < bd) {
      bd = d;
      best = x;
    }
  }
  return best;
}

function walkableNear(it, radius = 2) {
  const g = G.sim.grid;
  const c = itemCenter(it);
  const [w, d] = itemDims(it.type, it.rot);
  const cands = [];
  for (let j = Math.floor(c.z - d / 2 - radius); j <= c.z + d / 2 + radius; j++)
    for (let i = Math.floor(c.x - w / 2 - radius); i <= c.x + w / 2 + radius; i++) {
      if (!g.walkable(i, j) || j >= MAXD) continue;
      if (G.sim.isAccessTile(i, j)) continue;
      cands.push({ x: i + 0.5 + rand(-0.2, 0.2), z: j + 0.5 + rand(-0.2, 0.2) });
    }
  if (!cands.length) return null;
  return pick(cands);
}

// ==================== MÜŞTERİ ====================
export function spawnCustomer(profile, walkin, opts = {}) {
  const fromLeft = Math.random() < 0.5;
  const a = {
    kind: 'customer',
    id: G.state.nextId++,
    m: profile,
    walkin,
    vip: !!opts.vip,
    pos: { x: fromLeft ? -9 : MAXW + 9, z: MAXD + 0.8 + Math.random() * 1.2 },
    y: 0,
    speed: WALK_SPEED * rand(0.9, 1.12),
    state: 'idle',
    tasks: [],
    timer: 0,
    thirst: rand(0, 0.3),
    bladder: rand(0, 0.55),
    sweat: 0,
    energy: rand(0.75, 1),
    issues: {},
    good: {},
    waitTotal: 0,
    exDone: 0,
    exMissing: 0,
    env: { dirt: 0, appeal: 0, crowd: 0, temp: 0, n: 0 },
    spent: 0,
    coached: false,
    arriveMin: G.state.minute,
    status: 'Salona geliyor',
  };
  makeAgentVisual(a, profile.look);
  // plan
  const goal = GOALS[profile.goal] || GOALS.fitness;
  const ex = [];
  for (const [group, mn, mx] of goal.plan) {
    const n = randi(mn, mx);
    for (let k = 0; k < n; k++) ex.push({ type: 'exercise', group, pref: pick(GROUPS[group]) });
  }
  if (!ex.length) ex.push({ type: 'exercise', group: 'cardio', pref: 'treadmill' });
  if (opts.cls) {
    // derse gelen: ders + belki bir alet
    ex.splice(randi(0, 1));
    ex.unshift({ type: 'class', sid: opts.cls.sid, k: opts.cls.k });
  }
  // karıştır (ısınma için kardiyo başta olabilir)
  ex.sort(() => Math.random() - 0.5);
  const cardioIdx = ex.findIndex(e => e.group === 'cardio');
  if (cardioIdx > 0 && Math.random() < 0.6) ex.unshift(ex.splice(cardioIdx, 1)[0]);
  a.tasks.push({ type: 'checkin' }, { type: 'locker', first: true }, ...ex, { type: 'shower' }, { type: 'locker', first: false }, { type: 'buy' }, { type: 'exit' });
  a.plannedEx = ex.length;
  if (a.vip) showBubble(a, '⭐', 9999);
  if (opts.noClass) issue(a, 'noClass');
  G.sim.customers.push(a);
  // kapıya yürü
  if (!goTo(a, DOOR_X, MAXD + 0.6, () => nextTask(a))) nextTask(a);
  return a;
}

export function issue(a, key, once = true) {
  if (once && a.issues[key]) return;
  a.issues[key] = (a.issues[key] || 0) + 1;
  const t = G.state.today;
  t.complaints[key] = (t.complaints[key] || 0) + 1;
  showBubble(a, ISSUES[key].emoji);
}

function releaseSpot(a) {
  if (a.spot) {
    const r = a.spot.it._spots[a.spot.k];
    if (r.user === a) r.user = null;
    if (r.res === a) r.res = null;
    a.spot.it._busy = a.spot.it._spots.some(s => s.user);
    const m = a.spot.it._mesh;
    const def = ITEMS[a.spot.it.type];
    if (m && m.userData.bar && !a.spot.it._busy) m.userData.bar.visible = true;
    if (m && m.userData.water && spotKind(def, def.spots[a.spot.k]) === 'shower') m.userData.water.visible = false;
    a.spot = null;
  }
  if (a.ch) a.ch.setProp(null);
}

function leaveQueue(a) {
  if (a.desk) {
    const q = a.desk._queue;
    const i = q.indexOf(a);
    if (i >= 0) q.splice(i, 1);
    a.desk = null;
  }
}

export function abortCustomer(a) {
  releaseSpot(a);
  leaveQueue(a);
}

// Kullandığı alet kaldırıldı/taşındı: bir sonraki işe geç
export function kickCustomer(a) {
  releaseSpot(a);
  leaveQueue(a);
  a.y = 0;
  a.path = null;
  if (a.state === 'exiting' || a.state === 'leaving') return;
  nextTask(a);
}

function nextTask(a) {
  a.timer = 0;
  // acil ihtiyaçlar
  if (a.tasks.length > 1 && a.tasks[0].type !== 'checkin' && a.state !== 'exiting') {
    if (a.bladder > 0.85 && !a._wcTried) {
      a._wcTried = true;
      return startUse(a, { type: 'toilet' });
    }
    if (a.thirst > 0.7 && !a._drinkTried) {
      a._drinkTried = true;
      return startUse(a, { type: 'drink' });
    }
    if (a.energy < 0.25 && !a._restTried) {
      a._restTried = true;
      return startUse(a, { type: 'rest' });
    }
  }
  const t = a.tasks.shift();
  if (!t) return startExit(a);
  a.task = t;
  if (t.type === 'checkin') return startCheckin(a);
  if (t.type === 'class') return startClass(a, t);
  if (t.type === 'exit') return startExit(a);
  return startUse(a, t);
}

// ---------- resepsiyon ----------
function startCheckin(a) {
  const desks = G.sim.itemsOfKind('reception');
  if (!desks.length) {
    if (a.walkin) {
      issue(a, 'noStaff');
      a.noEntry = true;
      return startExit(a);
    }
    return nextTask(a);
  }
  const desk = desks.reduce((b, d) => (d._queue.length < b._queue.length ? d : b), desks[0]);
  a.desk = desk;
  desk._queue.push(a);
  a.state = 'queue';
  a.qIndex = -1;
  a.qTimer = 0;
  a.status = 'Resepsiyonda sırada';
}

function queuePos(desk, k) {
  const sp = spotWorld(desk, ITEMS.reception.spots[0]);
  const th = (desk.rot * Math.PI) / 2;
  const fx = Math.sin(th), fz = Math.cos(th);
  const g = G.sim.grid;
  let last = { x: sp.ax, z: sp.az };
  let n = 0;
  for (let s = 0; s < 14; s++) {
    const x = sp.ax + fx * s * 0.8, z = sp.az + fz * s * 0.8;
    if (!g.walkable(Math.floor(x), Math.floor(z)) || z >= MAXD) break;
    if (n === k) return { x, z };
    last = { x, z };
    n++;
  }
  return { x: last.x + rand(-0.6, 0.6), z: last.z + rand(-0.6, 0.6) };
}

function updateQueue(a, dt) {
  const desk = a.desk;
  if (!desk || !G.state.items.includes(desk)) {
    leaveQueue(a);
    return nextTask(a);
  }
  const k = desk._queue.indexOf(a);
  if (k !== a.qIndex) {
    a.qIndex = k;
    const p = queuePos(desk, k);
    if (!setPath(a, p.x, p.z)) a.path = null;
  }
  if (a.path && a.pi < a.path.length) {
    followPath(a, dt);
    a.pose = 'walk';
    return;
  }
  a.face = spotWorld(desk, ITEMS.reception.spots[0]).face;
  a.pose = 'wait';
  a.qTimer += dt;
  if (a.qTimer > 6 && !a.issues.queue) issue(a, 'queue');
  if (k !== 0) return;
  const staff = desk._staff && desk._staff.state === 'work' ? desk._staff : null;
  a.serve = (a.serve || 0) + dt;
  if (staff) {
    a.pose = 'idle';
    const need = (a.walkin ? 2.6 : 0.7) / (0.7 + staff.data.skill * 0.15);
    a.status = a.walkin ? 'Günlük bilet alıyor' : 'Giriş yapıyor';
    if (a.serve >= need) {
      if (a.walkin) G.sim.earn('daypass', G.state.prices.dayPass, a);
      leaveQueue(a);
      showBubble(a, '👋', 1.2);
      nextTask(a);
    }
  } else {
    if (!a.walkin && a.serve > 1.2) {
      leaveQueue(a);
      nextTask(a);
    } else if (a.walkin) {
      a.status = 'Resepsiyonda kimseyi bekliyor';
      if (a.serve > 6) {
        issue(a, 'noStaff');
        a.noEntry = true;
        leaveQueue(a);
        startExit(a);
      }
    }
  }
}

// ---------- alet kullanımı ----------
const KIND_OF = { locker: 'locker', shower: 'shower', toilet: 'toilet', drink: 'water', rest: 'rest' };

function startUse(a, t) {
  a.task = t;
  let candidates = [];
  let dur = 3;
  let types = null;
  if (t.type === 'exercise') {
    const all = G.sim.itemsByType;
    let tlist = [t.pref];
    if (!(all.get(t.pref) || []).length) {
      tlist = GROUPS[t.group].filter(ty => (all.get(ty) || []).length);
      if (!tlist.length) {
        tlist = (GROUP_FALLBACK[t.group] || []).filter(ty => (all.get(ty) || []).length);
        if (tlist.length) a.compromise = (a.compromise || 0) + 1;
      }
      if (!tlist.length) {
        issue(a, 'missing', false);
        G.sim.trackMissing(t.group);
        a.exMissing++;
        a.missingGroups = a.missingGroups || {};
        a.missingGroups[t.group] = 1;
        return nextTask(a);
      }
    }
    types = tlist;
    candidates = tlist.flatMap(ty => all.get(ty) || []);
    t.alt = GROUPS[t.group];
  } else if (t.type === 'buy') {
    const vend = G.sim.itemsOfKind('vending');
    const shop = G.sim.itemsOfKind('shop');
    if (shop.length && Math.random() < 0.5) candidates = shop;
    else if (vend.length && Math.random() < 0.45) candidates = vend;
    if (!candidates.length) return nextTask(a);
    dur = 1.2;
  } else {
    const kind = KIND_OF[t.type];
    t.kind = kind;
    candidates = G.sim.itemsOfKind(kind).filter(it => genderOk(a, it));
    if (t.type === 'locker') {
      if (!candidates.length) {
        if (a.m.cares.locker && t.first) issue(a, 'noLocker');
        return nextTask(a);
      }
      dur = t.first ? rand(2, 3.5) : rand(2, 3);
    }
    if (t.type === 'shower') {
      if (a.sweat < 0.35 || !a.m.cares.shower) return nextTask(a);
      if (G.sim.hasEvent('waterCut')) return nextTask(a);
      if (!candidates.length) {
        issue(a, 'noShower');
        return nextTask(a);
      }
      dur = rand(5, 8);
    }
    if (t.type === 'toilet') {
      if (!candidates.length) {
        issue(a, 'noToilet');
        a.bladder = 0.4;
        return nextTask(a);
      }
      dur = rand(2, 4);
    }
    if (t.type === 'drink') {
      if (!candidates.length) {
        issue(a, 'thirst');
        a.thirst = 0.35;
        return nextTask(a);
      }
      dur = 0.8;
    }
    if (t.type === 'rest') {
      if (!candidates.length) {
        a.energy = 0.45;
        return nextTask(a);
      }
      dur = rand(2, 4);
    }
  }
  t.dur = dur;
  t.types = types;
  t.cands = candidates;
  if (candidates.some(c => c.broken)) issue(a, 'broken');
  tryClaim(a, t, true);
}

function tryClaim(a, t, first) {
  let cands = t.cands.filter(c => G.state.items.includes(c));
  if (t.type === 'exercise' && t.alt && !first) {
    // beklerken aynı gruptaki benzer aletlere de bak
    for (const ty of t.alt) for (const it of G.sim.itemsByType.get(ty) || []) if (!cands.includes(it)) cands.push(it);
  }
  const free = [];
  for (const it of cands) for (const k of freeSpots(it, t.kind)) free.push({ it, k });
  if (free.length) {
    const s = nearest(a, free, f => spotWorld(f.it, ITEMS[f.it.type].spots[f.k]));
    claimAndGo(a, s.it, s.k);
    return true;
  }
  if (first) {
    // bekleme
    const usable = cands.filter(c => !c.broken);
    if (!usable.length) {
      if (t.type === 'exercise') {
        a.exMissing++;
        issue(a, 'broken');
      }
      nextTask(a);
      return false;
    }
    const target = nearest(a, usable, it => itemCenter(it));
    const p = walkableNear(target, 2) || { x: a.pos.x, z: a.pos.z };
    a.waitStart = 0;
    a.waitFor = t;
    if (t.type === 'exercise') G.sim.trackWait(target.type);
    goTo(a, p.x, p.z, () => {
      a.state = 'wait';
      a.timer = 0;
    }, () => {
      a.state = 'wait';
      a.timer = 0;
    });
    a.status = 'Alet bekliyor';
  }
  return false;
}

function claimAndGo(a, it, k) {
  const r = it._spots[k];
  r.res = a;
  a.spot = { it, k };
  const s = ITEMS[it.type].spots[k];
  const sw = spotWorld(it, s);
  a.status = statusFor(a.task, it);
  const ok = goTo(a, sw.ax, sw.az, () => enterSpot(a), () => {
    releaseSpot(a);
    nextTask(a);
  });
  if (!ok) return;
}

function statusFor(t, it) {
  const n = ITEMS[it.type].name;
  switch (t.type) {
    case 'exercise': return n + ' kullanıyor';
    case 'locker': return t.first ? 'Üstünü değiştiriyor' : 'Eşyalarını topluyor';
    case 'shower': return 'Duş alıyor';
    case 'toilet': return 'Tuvalette';
    case 'drink': return 'Su içiyor';
    case 'buy': return 'Alışveriş yapıyor';
    case 'rest': return 'Dinleniyor';
    case 'class': return 'Grup dersine gidiyor';
  }
  return '';
}

function enterSpot(a) {
  const sp = a.spot;
  if (!sp || !G.state.items.includes(sp.it) || sp.it.broken) {
    releaseSpot(a);
    return nextTask(a);
  }
  const r = sp.it._spots[sp.k];
  r.res = null;
  r.user = a;
  sp.it._busy = true;
  const s = ITEMS[sp.it.type].spots[sp.k];
  const sw = spotWorld(sp.it, s);
  const pts = [{ x: a.pos.x, z: a.pos.z }, ...viaPts(sp.it, s), { x: sw.x, z: sw.z }];
  startRoute(a, pts, a.y, sw.y, () => onEntered(a, sw), true);
}

function onEntered(a, sw) {
  if (!a.spot) return nextTask(a);
  const it = a.spot.it;
  const def = ITEMS[it.type];
  const s = def.spots[a.spot.k];
  a.state = 'use';
  a.face = sw.face;
  a.timer = a.task.type === 'exercise' ? rand(...def.dur) * (a.task.short ? 0.6 : 1) : a.task.dur;
  a.useT = 0;
  if (a.ch) a.ch.setProp(s.prop || null);
  const m = it._mesh;
  if (m && m.userData.bar && (s.pose === 'bench' || s.pose === 'squat')) m.userData.bar.visible = false;
  if (m && m.userData.water && spotKind(def, s) === 'shower') m.userData.water.visible = true;
}

// ---------- grup dersi ----------
function classFallback(a) {
  // ders olmadıysa normal antrenmana dön
  a.tasks.unshift({ type: 'exercise', group: 'cardio', pref: pick(GROUPS.cardio) });
  return nextTask(a);
}

function startClass(a, t) {
  const st = G.state.items.find(i => i.id === t.sid);
  const c = st && G.sim.classInfo(st, t.k);
  const now = G.state.minute;
  if (!st || !c) return classFallback(a);
  if (c.state === 'canceled') {
    issue(a, 'classCanceled');
    return classFallback(a);
  }
  if (c.state === 'done' || now > c.start + 15) return classFallback(a);
  // ders başlamasına çok varsa önce bir alet kullan, sonra derse gel
  if (c.start - now > 22 && (t.deferred || 0) < 3) {
    t.deferred = (t.deferred || 0) + 1;
    a.tasks.unshift({ type: 'exercise', group: 'cardio', pref: pick(GROUPS.cardio), short: true }, t);
    return nextTask(a);
  }
  t.kind = 'class';
  t.dur = 0;
  t.cands = [st];
  const free = freeSpots(st, 'class');
  if (!free.length) {
    issue(a, 'classFull');
    return classFallback(a);
  }
  const k = nearest(a, free.map(k => ({ k })), f => spotWorld(st, ITEMS[st.type].spots[f.k])).k;
  claimAndGo(a, st, k);
}

function updateClassUse(a, dt) {
  const st = a.spot.it;
  const c = G.sim.classInfo(st, a.task.k);
  a.useT += dt;
  if (!c || c.state === 'canceled') {
    if (!a.issues.classCanceled) issue(a, 'classCanceled');
    return finishUse(a);
  }
  const cl = CLASSES[c.type];
  if (c.state === 'upcoming') {
    a.pose = 'idle';
    a.status = `${cl.name} dersinin başlamasını bekliyor`;
    if (a.useT > 45) finishUse(a);
    return;
  }
  if (c.state === 'running') {
    a.pose = cl.pose;
    a.status = `${cl.icon} ${cl.name} dersinde`;
    a.sweat = Math.min(1, a.sweat + dt * 0.03);
    a.energy = Math.max(0, a.energy - dt * 0.008);
    a.thirst += dt * 0.006;
    a.sampleT = (a.sampleT || 0) + dt;
    if (a.sampleT >= 1) {
      a.sampleT = 0;
      G.sim.sampleEnv(a);
    }
    return;
  }
  if (!a.classDone) {
    a.classDone = c.type;
    a.exDone += 2;
    G.sim.trackClass(c.type, st, a.task.k);
    showBubble(a, '🙌', 2);
  }
  finishUse(a);
}

function finishUse(a) {
  const sp = a.spot;
  const t = a.task;
  if (sp) {
    const it = sp.it;
    const def = ITEMS[it.type];
    it.uses = (it.uses || 0) + 1;
    if (def.wear) G.sim.wearItem(it, def.wear * rand(0.5, 0.9));
    const us = def.spots[sp.k];
    const uk = spotKind(def, us);
    const water = us.water ?? def.water;
    if (water) G.sim.today().waterCost += water;
    if (uk === 'shower' || uk === 'toilet') {
      it.dirt = Math.min(1, (it.dirt || 0) + rand(0.05, 0.1));
      if (it.dirt > 0.65) issue(a, 'dirtyWc');
    }
    if (t.type === 'exercise') {
      a.exDone++;
      G.sim.trackExercise(it.type);
    }
    if (t.type === 'buy') {
      const [lo, hi] = def.sale;
      const amt = Math.round(rand(lo, hi));
      G.sim.earn(def.kind === 'shop' ? 'shop' : 'vending', amt, a);
      a.spent += amt;
      a.energy = Math.min(1, a.energy + 0.2);
    }
    if (t.type === 'shower') a.sweat = 0;
    if (t.type === 'toilet') a.bladder = 0;
    if (t.type === 'drink') a.thirst = 0;
    if (t.type === 'rest') a.energy = Math.min(1, a.energy + 0.5);
    // çıkış: oda içindeyse aynı yoldan kapıya
    const sw = spotWorld(it, us);
    const pts = [{ x: a.pos.x, z: a.pos.z }, ...viaPts(it, us).reverse(), { x: sw.ax, z: sw.az }];
    startRoute(a, pts, a.y, 0, () => {
      releaseSpot(a);
      a.y = 0;
      nextTask(a);
    }, false);
    return;
  }
  nextTask(a);
}

function startExit(a) {
  // oda içindeyken (duş, ders) önce kapıdan çık
  if (a.spot && !a._exitRouted && (a.state === 'use' || a.state === 'route') && G.state.items.includes(a.spot.it)) {
    const s = ITEMS[a.spot.it.type].spots[a.spot.k];
    if (s.via) {
      a._exitRouted = true;
      a.tasks = [];
      const sw = spotWorld(a.spot.it, s);
      const pts = [{ x: a.pos.x, z: a.pos.z }, ...viaPts(a.spot.it, s).reverse(), { x: sw.ax, z: sw.az }];
      startRoute(a, pts, a.y, 0, () => startExit(a), false);
      return;
    }
  }
  releaseSpot(a);
  leaveQueue(a);
  a.y = 0;
  a.state = 'exiting';
  a.status = 'Salondan çıkıyor';
  a.tasks = [];
  const ok = goTo(a, DOOR_X + rand(-0.6, 0.6), MAXD + 0.7, () => {
    G.sim.finalizeVisit(a);
    const side = Math.random() < 0.5 ? -11 : MAXW + 11;
    goTo(a, side, MAXD + 0.9 + Math.random() * 1.3, () => {
      a.gone = true;
    }, () => (a.gone = true));
    a.state = 'leaving';
  }, () => {
    G.sim.finalizeVisit(a);
    a.gone = true;
  });
  if (!ok) a.state = 'exiting';
}

export function forceExit(a) {
  if (a.state === 'leaving' || a.state === 'exiting') return;
  startExit(a);
}

const CARDIO = new Set(GROUPS.cardio);

export function updateCustomer(a, dt) {
  const inside = a.pos.z < MAXD;
  // ihtiyaçlar
  const exercising = a.state === 'use' && a.task && a.task.type === 'exercise';
  a.bladder += dt * 0.0055;
  a.thirst += dt * (exercising ? 0.011 : 0.003);
  if (exercising) {
    a.sweat = Math.min(1, a.sweat + dt * 0.03);
    a.energy = Math.max(0, a.energy - dt * 0.009 * (CARDIO.has(a.spot?.it.type) ? 1.3 : 1));
  }

  switch (a.state) {
    case 'move':
    case 'exiting':
    case 'leaving':
      if (a.path && followPath(a, dt)) {
        a.path = null;
        const cb = a.onArrive;
        a.onArrive = null;
        if (cb) cb();
      }
      a.pose = 'walk';
      break;
    case 'queue':
      updateQueue(a, dt);
      break;
    case 'route':
      routeStep(a, dt);
      break;
    case 'use': {
      if (a.task.type === 'class') {
        updateClassUse(a, dt);
        break;
      }
      const s = ITEMS[a.spot.it.type].spots[a.spot.k];
      a.pose = s.pose;
      a.timer -= dt;
      a.useT += dt;
      a.sampleT = (a.sampleT || 0) + dt;
      if (a.sampleT >= 1) {
        a.sampleT = 0;
        G.sim.sampleEnv(a);
      }
      if (a.spot.it.broken) {
        issue(a, 'broken');
        a.timer = 0;
      }
      if (a.timer <= 0) finishUse(a);
      break;
    }
    case 'wait': {
      a.pose = 'wait';
      a.timer += dt;
      a.waitTotal += dt;
      if (a.timer > 2 && !a._waitBubble) {
        a._waitBubble = true;
        showBubble(a, '⏳', 3);
      }
      a.recheck = (a.recheck || 0) + dt;
      if (a.recheck > 0.4) {
        a.recheck = 0;
        if (tryClaim(a, a.waitFor, false)) {
          a._waitBubble = false;
          break;
        }
      }
      const patience = 11 * a.m.patience;
      if (a.timer > patience) {
        a._waitBubble = false;
        if (a.waitFor.type === 'exercise') {
          issue(a, 'wait', false);
          a.gaveUp = (a.gaveUp || 0) + 1;
        }
        nextTask(a);
      }
      break;
    }
    default:
      a.pose = 'idle';
  }

  // kir bırak
  if (inside) G.sim.addDirt(a.pos.x, a.pos.z, dt * (exercising ? 0.0035 : 0.0022));
}

// ==================== PERSONEL ====================
export function spawnStaff(rec) {
  const role = STAFF_ROLES[rec.role];
  const a = {
    kind: 'staff',
    id: rec.id,
    data: rec,
    role: rec.role,
    pos: { x: DOOR_X + rand(-0.5, 0.5), z: MAXD + 1.2 },
    y: 0,
    speed: WALK_SPEED * 1.15,
    state: 'idle',
    timer: rand(0, 1),
    status: 'İşe geliyor',
  };
  const uniform = role.color;
  makeAgentVisual(a, rec.look, { uniform, uniformBottom: 0x22252b });
  if (rec.role === 'trainer') a.ch.setProp('clipboard');
  G.sim.staffAgents.push(a);
  return a;
}

function staffIdle(a, dt) {
  a.pose = 'idle';
  a.timer -= dt;
  if (a.timer <= 0) {
    a.timer = rand(2, 6);
    // rastgele dolaş
    const R = G.sim.grid.rect;
    for (let tries = 0; tries < 8; tries++) {
      const i = randi(0, R.w - 1), j = randi(R.z0, MAXD - 1);
      if (G.sim.grid.walkable(i, j) && !G.sim.isAccessTile(i, j)) {
        goTo(a, i + 0.5, j + 0.5, () => {
          a.state = 'idle';
          a.timer = rand(2, 6);
        });
        return;
      }
    }
  }
}

function moveStep(a, dt) {
  if (a.path && followPath(a, dt)) {
    a.path = null;
    const cb = a.onArrive;
    a.onArrive = null;
    if (cb) cb();
  }
  a.pose = 'walk';
}

export function staffLeave(a) {
  if (a.desk && a.desk._staff === a) a.desk._staff = null;
  a.desk = null;
  if (a.target && a.target._tech === a) a.target._tech = null;
  if (a.coachee) a.coachee._coach = null;
  a.coachee = null;
  if (a.studio && a.studio._instructor === a) a.studio._instructor = null;
  a.studio = null;
  if (a.ch) a.ch.setProp(a.role === 'trainer' ? 'clipboard' : null);
  a.y = 0;
  a.status = 'Eve gidiyor';
  a.state = 'leaving';
  const ok = goTo(a, DOOR_X, MAXD + 0.8, () => {
    goTo(a, -11, MAXD + 1.6, () => (a.gone = true), () => (a.gone = true));
    a.state = 'leaving';
  }, () => (a.gone = true));
  if (ok) a.state = 'leaving';
}

export function updateStaff(a, dt) {
  const sk = 0.7 + a.data.skill * 0.15;
  if (a.state === 'leaving' || a.state === 'move') {
    moveStep(a, dt);
    return;
  }
  if (a.state === 'route') {
    routeStep(a, dt);
    return;
  }
  switch (a.role) {
    case 'receptionist': return updateReceptionist(a, dt, sk);
    case 'cleaner': return updateCleaner(a, dt, sk);
    case 'technician': return updateTechnician(a, dt, sk);
    case 'trainer': return updateTrainer(a, dt, sk);
    case 'instructor': return updateInstructor(a, dt, sk);
  }
}

function updateReceptionist(a, dt) {
  if (a.state === 'work') {
    if (!a.desk || !G.state.items.includes(a.desk)) {
      a.desk = null;
      a.state = 'idle';
      a.y = 0;
      return;
    }
    a.pose = a.desk._queue.length && a.desk._queue[0].serve > 0 ? 'work' : 'idle';
    a.status = a.desk._queue.length ? `Müşterilerle ilgileniyor (${a.desk._queue.length} sırada)` : 'Resepsiyonda bekliyor';
    return;
  }
  // masa ara
  const desks = G.sim.itemsOfKind('reception').filter(d => !d._staff || d._staff === a);
  if (!desks.length) {
    a.status = 'Boşta: resepsiyon masası yok';
    return staffIdle(a, dt);
  }
  const desk = nearest(a, desks, d => itemCenter(d));
  desk._staff = a;
  a.desk = desk;
  const ss = ITEMS.reception.staffSpot;
  const sw = spotWorld(desk, ss);
  const go = () =>
    startRoute(a, [{ x: a.pos.x, z: a.pos.z }, { x: sw.x, z: sw.z }], 0, 0, () => {
      a.state = 'work';
      a.face = sw.face;
      a.timer = 0;
    });
  a.status = 'Masasına gidiyor';
  if (!goTo(a, sw.ax, sw.az, go)) {
    // erişim noktası kapalıysa ışınlan
    a.pos.x = sw.x;
    a.pos.z = sw.z;
    a.state = 'work';
  }
}

function updateCleaner(a, dt, sk) {
  if (a.state === 'clean') {
    a.pose = 'mop';
    a.ch && a.ch.setProp('mop');
    a.timer += dt;
    const done = a.cleanItem
      ? G.sim.cleanItem(a.cleanItem, dt * 0.35 * sk)
      : G.sim.cleanArea(a.pos.x, a.pos.z, dt * 0.16 * sk);
    if (done || a.timer > 7) {
      a.state = 'idle';
      a.timer = rand(0.5, 1.5);
      a.cleanItem = null;
    }
    return;
  }
  a.ch && a.ch.setProp('mop');
  a.timer -= dt;
  if (a.timer > 0) {
    a.pose = 'idle';
    return;
  }
  // kirli ıslak alan?
  const wet = G.state.items.filter(it => isWet(ITEMS[it.type]) && (it.dirt || 0) > 0.4 && (ITEMS[it.type].room || !it._spots.some(s => s.user)));
  if (wet.length) {
    const it = wet.sort((x, y) => y.dirt - x.dirt)[0];
    const sw = spotWorld(it, ITEMS[it.type].spots[0]);
    a.status = ITEMS[it.type].name + ' temizlemeye gidiyor';
    if (goTo(a, sw.ax, sw.az, () => {
      a.state = 'clean';
      a.timer = 0;
      a.cleanItem = it;
      a.face = sw.face + Math.PI;
      a.status = ITEMS[it.type].name + ' temizliyor';
    })) return;
  }
  const t = G.sim.dirtiestTile(a);
  if (t) {
    a.status = 'Kirli alana gidiyor';
    if (goTo(a, t.x, t.z, () => {
      a.state = 'clean';
      a.timer = 0;
      a.status = 'Zemini temizliyor';
    })) return;
  }
  a.status = 'Salon temiz, dolaşıyor';
  a.timer = 0;
  staffIdle(a, dt);
}

function updateTechnician(a, dt, sk) {
  if (a.state === 'repair') {
    a.pose = 'repair';
    a.ch && a.ch.setProp('wrench');
    a.timer += dt;
    const it = a.target;
    if (!it || !G.state.items.includes(it)) {
      a.state = 'idle';
      a.target = null;
      return;
    }
    if (a.timer >= a.need) {
      if (it.broken) {
        it.broken = false;
        it.cond = Math.min(100, 65 + a.data.skill * 7);
        G.ui.notify(`🔧 ${ITEMS[it.type].name} tamir edildi`, 'good');
      } else it.cond = Math.min(100, it.cond + 25 + a.data.skill * 4);
      it._tech = null;
      a.target = null;
      a.state = 'idle';
      a.timer = rand(0.5, 1.5);
      a.ch && a.ch.setProp(null);
      G.sim.refreshItemIcon(it);
    }
    return;
  }
  a.timer -= dt;
  if (a.timer > 0) {
    a.pose = 'idle';
    return;
  }
  const items = G.state.items.filter(it => ITEMS[it.type].wear && !it._tech);
  const broken = items.filter(it => it.broken);
  let target = broken.length ? nearest(a, broken, it => itemCenter(it)) : null;
  if (!target) {
    const worn = items.filter(it => it.cond < 60 && !it._spots.some(s => s.user || s.res)).sort((x, y) => x.cond - y.cond);
    target = worn[0];
  }
  if (target) {
    const s = ITEMS[target.type].spots[0];
    const sw = spotWorld(target, s);
    target._tech = a;
    a.target = target;
    a.status = (target.broken ? 'Tamire gidiyor: ' : 'Bakıma gidiyor: ') + ITEMS[target.type].name;
    if (goTo(a, sw.ax, sw.az, () => {
      a.state = 'repair';
      a.timer = 0;
      a.need = (target.broken ? 12 : 5) / sk;
      const c = itemCenter(target);
      a.face = Math.atan2(c.x - a.pos.x, c.z - a.pos.z);
      a.status = (target.broken ? 'Tamir ediyor: ' : 'Bakım yapıyor: ') + ITEMS[target.type].name;
    }, () => {
      target._tech = null;
      a.target = null;
    })) return;
  }
  a.status = 'Tüm aletler sağlam';
  a.timer = 0;
  staffIdle(a, dt);
}

function updateTrainer(a, dt, sk) {
  if (a.state === 'coach') {
    a.pose = 'coach';
    a.timer += dt;
    const c = a.coachee;
    if (!c || c.gone || c.state !== 'use') {
      if (c) c._coach = null;
      a.coachee = null;
      a.state = 'idle';
      a.timer = rand(1, 2);
      return;
    }
    a.face = Math.atan2(c.pos.x - a.pos.x, c.pos.z - a.pos.z);
    if (a.timer > 7) {
      c.coached = true;
      c._coach = null;
      showBubble(c, '😄', 2);
      const chance = 0.3 + a.data.skill * 0.06;
      if (Math.random() < chance) {
        G.sim.earn('pt', G.state.prices.pt || 30, c);
        G.sim.progressGoal('pt', 1);
      }
      a.coachee = null;
      a.state = 'idle';
      a.timer = rand(1, 3);
    }
    return;
  }
  a.timer -= dt;
  if (a.timer > 0) {
    a.pose = 'idle';
    return;
  }
  const cands = G.sim.customers.filter(c => c.state === 'use' && !c.coached && !c._coach && c.task && c.task.type === 'exercise' && c.timer > 5);
  if (cands.length) {
    const c = nearest(a, cands, x => x.pos);
    c._coach = a;
    a.coachee = c;
    const g = G.sim.grid;
    let best = null, bd = 1e9;
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const i = Math.floor(c.pos.x) + di, j = Math.floor(c.pos.z) + dj;
        if (!g.walkable(i, j) || j >= MAXD || (di === 0 && dj === 0)) continue;
        const d = Math.hypot(di, dj);
        if (d < bd) {
          bd = d;
          best = { x: i + 0.5, z: j + 0.5 };
        }
      }
    if (best) {
      a.status = `${c.m.name} ile çalışmaya gidiyor`;
      if (goTo(a, best.x, best.z, () => {
        a.state = 'coach';
        a.timer = 0;
        a.status = `${c.m.name}'e koçluk yapıyor`;
      }, () => {
        c._coach = null;
        a.coachee = null;
      })) return;
    }
    c._coach = null;
    a.coachee = null;
  }
  a.status = 'Salonu gözlemliyor';
  a.timer = 0;
  staffIdle(a, dt);
}

// Grup eğitmeni: yaklaşan dersi olan stüdyoya gider, dersi verir, sonra çıkar
function updateInstructor(a, dt) {
  const ss = ITEMS.studio.staffSpot;
  if (a.state === 'teach') {
    const st = a.studio;
    if (!st || !G.state.items.includes(st)) {
      a.studio = null;
      a.state = 'idle';
      a.y = 0;
      return;
    }
    const sw = spotWorld(st, ss);
    const c = G.sim.classNow(st, 20);
    if (c) {
      a.face = sw.face;
      a.pose = c.state === 'running' ? CLASSES[c.type].pose : 'idle';
      a.status = c.state === 'running' ? `${CLASSES[c.type].icon} ${CLASSES[c.type].name} dersi veriyor` : `${CLASSES[c.type].name} dersine hazırlanıyor`;
      return;
    }
    st._instructor = null;
    a.studio = null;
    a.status = 'Dersi bitirdi';
    startRoute(a, [{ x: a.pos.x, z: a.pos.z }, ...viaPts(st, ss).reverse(), { x: sw.ax, z: sw.az }], a.y, 0, () => {
      a.state = 'idle';
      a.y = 0;
      a.timer = rand(1, 3);
    }, false);
    return;
  }
  const st = G.sim.itemsOfKind('studio').find(x => (!x._instructor || x._instructor === a) && G.sim.classNow(x, 20));
  if (st) {
    st._instructor = a;
    a.studio = st;
    const sw = spotWorld(st, ss);
    a.status = 'Derse gidiyor';
    const enter = () =>
      startRoute(a, [{ x: a.pos.x, z: a.pos.z }, ...viaPts(st, ss), { x: sw.x, z: sw.z }], 0, sw.y, () => {
        a.state = 'teach';
        a.face = sw.face;
      });
    if (!goTo(a, sw.ax, sw.az, enter)) {
      a.pos.x = sw.x;
      a.pos.z = sw.z;
      a.y = sw.y;
      a.state = 'teach';
    }
    return;
  }
  a.status = 'Sonraki dersi bekliyor';
  staffIdle(a, dt);
}

// ---------- görsel güncelleme ----------
export function updateAgentVisual(a, realDt) {
  if (!a.ch) return;
  if (a.bubble && a.bubbleT < 9000) {
    a.bubbleT -= realDt;
    if (a.bubbleT <= 0) {
      a.ch.root.remove(a.bubble);
      a.bubble = null;
    }
  }
  const sp = G.speed || 0;
  a.animT += realDt * Math.max(sp, a.pose === 'idle' || a.pose === 'wait' ? 1 : 0);
  // yön yumuşatma
  let d = a.face - a.faceCur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  a.faceCur += d * Math.min(1, realDt * 12 * Math.max(1, sp));
  const r = a.ch.root;
  const outside = a.pos.z >= MAXD;
  r.position.set(a.pos.x, (outside ? 0.06 : 0) + (a.y || 0), a.pos.z);
  r.rotation.y = a.faceCur;
  a.ch.pose(a.pose || 'idle', a.animT);
}
