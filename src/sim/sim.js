import { G, rand, randi, pick, clamp, gauss, weightedPick, fmtMoney } from '../game.js';
import {
  ITEMS, MAXW, MAXD, DOOR_I, OPEN_MIN, LAST_ARRIVAL_MIN, CLOSE_MIN, EXPANSIONS, RENT_PER_TILE, ELECTRIC_PRICE,
  MARKETING, LOANS, STAFF_ROLES, EVENTS, MILESTONES, ISSUES, PRAISES, xpForLevel, GROUPS,
  CLASSES, CLASS_LEN, CLASS_SLOTS, CLASS_DEFAULT, hasKind, isWet,
} from '../data.js';
import { Grid } from './grid.js';
import { localToWorld, itemDims, itemCenter } from '../render/world.js';
import {
  spawnCustomer, updateCustomer, spawnStaff, updateStaff, updateAgentVisual, removeAgentVisual, forceExit,
  staffLeave, abortCustomer, spotWorld, showBubble, kickCustomer,
} from './agents.js';
import { createMemberProfile, createStaffCandidate, dateInfo, save } from '../state.js';

const WD_FACTOR = [1.15, 1.05, 1.0, 0.98, 0.86, 0.72, 0.6];
const MONTH_SEASON = [1.6, 1.2, 1.1, 1.1, 1.25, 1.2, 0.85, 0.8, 1.15, 1.0, 0.95, 0.75];
const MONTH_VISIT = [1.12, 1.05, 1.0, 1.0, 1.05, 1.0, 0.88, 0.85, 1.0, 1.0, 0.97, 0.9];

export const INCOME_NAMES = {
  membership: 'Yeni üyelik', joinfee: 'Kayıt ücreti', renewal: 'Üyelik yenileme', daypass: 'Günlük bilet', vending: 'Otomat satışı',
  shop: 'Protein bar', pt: 'PT dersleri', reward: 'Hedef ödülleri', loan: 'Kredi',
};
export const EXPENSE_NAMES = {
  rent: 'Kira', wages: 'Maaşlar', electric: 'Elektrik', water: 'Su', loan: 'Kredi taksiti',
  marketing: 'Pazarlama', purchase: 'Ekipman yatırımı', repair: 'Tamir servisi', fine: 'Cezalar', severance: 'Tazminat', expand: 'Genişleme',
};

export class Sim {
  constructor() {
    this.grid = new Grid();
    this.customers = [];
    this.staffAgents = [];
    this.dirt = new Float32Array(MAXW * MAXD);
    this.appeal = new Float32Array(MAXW * MAXD);
    this.accessSet = new Set();
    this.itemsByType = new Map();
    this.temp = 22;
    this.dirtTimer = 0;
    this.cashSoundT = 0;
  }

  // ---------------- kurulum ----------------
  init() {
    const s = G.state;
    this.grid.setExpansion(s.expansion);
    if (s.dirt && s.dirt.length === MAXW * MAXD) this.dirt.set(s.dirt);
    for (const it of s.items) this._register(it);
    this.recompute();
    G.world.rebuildBuilding();
    G.world.updateDirt(this.dirt);
    this.memberMap = new Map(s.members.map(m => [m.id, m]));
    if (!s.today || s.phase === 'night') {
      if (s.phase === 'night' && s.today) {
        // gece kaydedildi -> yeni güne geç
        s.day++;
      }
      this.startDay();
    } else {
      this.resumeDay();
    }
  }

  serializeDirt() {
    return Array.from(this.dirt, v => Math.round(v * 100) / 100);
  }

  today() {
    return G.state.today;
  }

  allAgents() {
    return this.customers.concat(this.staffAgents);
  }

  // ---------------- eşyalar ----------------
  _register(it) {
    const def = ITEMS[it.type];
    it._spots = (def.spots || []).map(() => ({ user: null, res: null }));
    it._queue = [];
    it.cond ??= 100;
    it.uses ??= 0;
    for (const c of this.cells(it.type, it.i, it.j, it.rot)) this.grid.blocked[c.j * MAXW + c.i]++;
    G.world.addItemMesh(it);
    this.refreshItemIcon(it);
  }

  _unregister(it) {
    for (const c of this.cells(it.type, it.i, it.j, it.rot)) this.grid.blocked[c.j * MAXW + c.i]--;
    G.world.removeItemMesh(it);
  }

  cells(type, i, j, rot) {
    const [w, d] = itemDims(type, rot);
    const out = [];
    for (let dj = 0; dj < d; dj++) for (let di = 0; di < w; di++) out.push({ i: i + di, j: j + dj });
    return out;
  }

  accessTiles(type, i, j, rot) {
    const it = { type, i, j, rot };
    const def = ITEMS[type];
    const out = [];
    for (const s of def.spots || []) {
      const p = localToWorld(it, s.ax, s.az);
      out.push({ i: Math.floor(p.x), j: Math.floor(p.z), x: p.x, z: p.z });
    }
    return out;
  }

  isAccessTile(i, j) {
    return this.accessSet.has(j * MAXW + i);
  }

  recompute() {
    // tip haritası
    this.itemsByType = new Map();
    for (const it of G.state.items) {
      if (!this.itemsByType.has(it.type)) this.itemsByType.set(it.type, []);
      this.itemsByType.get(it.type).push(it);
    }
    // erişim karoları
    this.accessSet = new Set();
    this.grid.cost.fill(0);
    for (const it of G.state.items)
      for (const a of this.accessTiles(it.type, it.i, it.j, it.rot)) {
        if (a.j >= 0 && a.j < MAXD && a.i >= 0 && a.i < MAXW) {
          this.accessSet.add(a.j * MAXW + a.i);
          this.grid.cost[a.j * MAXW + a.i] = 1.2;
        }
      }
    // atmosfer haritası
    const ap = this.appeal;
    ap.fill(0);
    for (const it of G.state.items) {
      const def = ITEMS[it.type];
      const val = def.appeal || 0;
      if (!val) continue;
      const r = def.radius || 2.2;
      const c = itemCenter(it);
      for (let j = Math.floor(c.z - r); j <= c.z + r; j++)
        for (let i = Math.floor(c.x - r); i <= c.x + r; i++) {
          if (i < 0 || j < 0 || i >= MAXW || j >= MAXD) continue;
          const d = Math.hypot(i + 0.5 - c.x, j + 0.5 - c.z);
          if (d > r) continue;
          ap[j * MAXW + i] += val * (1 - (d / r) * 0.6);
        }
    }
    // istatistik önbelleği
    this.cooling = 0;
    for (const it of G.state.items) this.cooling += ITEMS[it.type].cooling || 0;
    this.fairPriceCache = null;
  }

  itemsOfKind(kind) {
    const out = [];
    for (const it of G.state.items) if (hasKind(ITEMS[it.type], kind)) out.push(it);
    return out;
  }

  priceOf(type) {
    let p = ITEMS[type].price;
    if (this.hasEvent('expo') && ITEMS[type].cat !== 'decor') p = Math.round(p * 0.8);
    return p;
  }

  canPlace(type, i, j, rot, ignore = null) {
    const def = ITEMS[type];
    const cells = this.cells(type, i, j, rot);
    const g = this.grid;
    if (ignore) for (const c of this.cells(ignore.type, ignore.i, ignore.j, ignore.rot)) g.blocked[c.j * MAXW + c.i]--;
    const ignoreAccess = new Set(ignore ? this.accessTiles(ignore.type, ignore.i, ignore.j, ignore.rot).map(a => a.j * MAXW + a.i) : []);
    const access = this.accessTiles(type, i, j, rot);
    const res = (ok, reason) => {
      if (ignore) for (const c of this.cells(ignore.type, ignore.i, ignore.j, ignore.rot)) g.blocked[c.j * MAXW + c.i]++;
      return { ok, reason, access };
    };
    const cellSet = new Set(cells.map(c => c.j * MAXW + c.i));
    for (const c of cells) {
      if (!g.isInside(c.i, c.j)) return res(false, 'Bina dışına yerleştirilemez');
      if (g.blocked[c.j * MAXW + c.i]) return res(false, 'Bu alan dolu');
      if (c.j >= MAXD - 2 && c.i >= DOOR_I[0] - 0 && c.i <= DOOR_I[1]) return res(false, 'Kapı önü boş kalmalı');
      const k = c.j * MAXW + c.i;
      if (this.accessSet.has(k) && !ignoreAccess.has(k)) return res(false, 'Başka bir aletin kullanım alanını kapatıyor');
    }
    for (const a of access) {
      if (!g.isInside(a.i, a.j) || g.blocked[a.j * MAXW + a.i] || cellSet.has(a.j * MAXW + a.i)) return res(false, 'Kullanım alanı (mavi) boş olmalı');
    }
    // ulaşılabilirlik
    const reach = g.reachableFromDoor(cellSet);
    const need = [...access];
    for (const it of G.state.items) {
      if (it === ignore) continue;
      need.push(...this.accessTiles(it.type, it.i, it.j, it.rot));
    }
    for (const a of need) {
      if (a.j < 0 || a.j >= MAXD || a.i < 0 || a.i >= MAXW) continue;
      if (!reach[a.j * MAXW + a.i]) return res(false, 'Bu yerleşim yolu kapatıyor');
    }
    return res(true, '');
  }

  placeItem(type, i, j, rot) {
    const price = this.priceOf(type);
    if (G.state.money < price) {
      G.ui.notify('Yeterli paran yok!', 'bad');
      G.audio.play('error');
      return null;
    }
    const chk = this.canPlace(type, i, j, rot);
    if (!chk.ok) {
      G.ui.notify(chk.reason, 'bad');
      G.audio.play('error');
      return null;
    }
    const it = { id: G.state.nextId++, type, i, j, rot, cond: 100, broken: false, uses: 0, dirt: 0 };
    if (ITEMS[type].kind === 'studio') it.classes = CLASS_DEFAULT.slice();
    G.state.items.push(it);
    this._register(it);
    this.recompute();
    this.spend('purchase', price);
    const c = itemCenter(it);
    G.world.floatText(c.x, 2.2, c.z, '-' + fmtMoney(price), '#ff6b6b');
    this.progressGoal('buy', 1);
    G.audio.play('place');
    this.checkMilestones();
    return it;
  }

  moveItem(it, i, j, rot) {
    const chk = this.canPlace(it.type, i, j, rot, it);
    if (!chk.ok) {
      G.ui.notify(chk.reason, 'bad');
      G.audio.play('error');
      return false;
    }
    this._evict(it);
    this._unregister(it);
    it.i = i;
    it.j = j;
    it.rot = rot;
    this._register(it);
    this.recompute();
    G.audio.play('place');
    return true;
  }

  _evict(it) {
    for (const a of this.customers) {
      if (a.spot && a.spot.it === it) kickCustomer(a);
      else if (a.desk === it) kickCustomer(a);
    }
    for (const a of this.staffAgents) {
      if (a.desk === it || a.target === it || a.cleanItem === it || a.studio === it) {
        if (a.desk === it) it._staff = null;
        if (a.studio === it) it._instructor = null;
        a.studio = null;
        a.desk = null;
        a.target = null;
        a.cleanItem = null;
        a.state = 'idle';
        a.y = 0;
        a.timer = 0;
      }
    }
  }

  sellValue(it) {
    return Math.round(ITEMS[it.type].price * (0.2 + 0.3 * (it.cond / 100)));
  }

  sellItem(it) {
    const val = this.sellValue(it);
    this._evict(it);
    this._unregister(it);
    G.state.items.splice(G.state.items.indexOf(it), 1);
    this.recompute();
    G.state.money += val;
    const c = itemCenter(it);
    G.world.floatText(c.x, 2.2, c.z, '+' + fmtMoney(val));
    G.audio.play('cash');
  }

  repairNow(it) {
    const cost = Math.round(ITEMS[it.type].price * 0.12) + 40;
    if (G.state.money < cost) {
      G.ui.notify('Tamir için yeterli para yok', 'bad');
      return;
    }
    this.spend('repair', cost);
    it.broken = false;
    it.cond = 100;
    this.refreshItemIcon(it);
    G.audio.play('place');
  }

  repairCost(it) {
    return Math.round(ITEMS[it.type].price * 0.12) + 40;
  }

  wearItem(it, amt) {
    it.cond = Math.max(0, it.cond - amt);
    if (!it.broken && it.cond < 30 && Math.random() < ((30 - it.cond) / 30) * 0.22) {
      it.broken = true;
      G.ui.notify(`⚠️ ${ITEMS[it.type].name} bozuldu!`, 'bad', () => G.ui.selectItem(it));
      G.audio.play('break');
      this.refreshItemIcon(it);
    }
  }

  refreshItemIcon(it) {
    let e = null;
    if (it.broken) e = '🔧';
    else if ((it.dirt || 0) > 0.6) e = '🧽';
    G.world.setItemIcon(it, e);
  }

  // ---------------- kir & çevre ----------------
  addDirt(x, z, amt) {
    const i = Math.floor(x), j = Math.floor(z);
    if (i < 0 || j < 0 || i >= MAXW || j >= MAXD) return;
    const k = j * MAXW + i;
    this.dirt[k] = Math.min(1, this.dirt[k] + amt);
  }

  cleanArea(x, z, amt) {
    let mx = 0;
    const ci = Math.floor(x), cj = Math.floor(z);
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= MAXW || j >= MAXD) continue;
        const k = j * MAXW + i;
        const f = Math.abs(di) <= 1 && Math.abs(dj) <= 1 ? 1 : 0.4;
        this.dirt[k] = Math.max(0, this.dirt[k] - amt * f);
        if (f === 1) mx = Math.max(mx, this.dirt[k]);
      }
    return mx < 0.04;
  }

  cleanItem(it, amt) {
    it.dirt = Math.max(0, (it.dirt || 0) - amt);
    this.refreshItemIcon(it);
    return it.dirt <= 0.02;
  }

  dirtiestTile(agent) {
    const g = this.grid;
    const others = this.staffAgents.filter(s => s !== agent && s.role === 'cleaner' && s.path && s.path.length).map(s => s.path[s.path.length - 1]);
    let best = null, bv = 0.16;
    const R = g.rect;
    for (let j = R.z0; j < MAXD; j++)
      for (let i = 0; i < R.w; i++) {
        if (!g.walkable(i, j)) continue;
        let v = this.dirt[j * MAXW + i];
        for (const di of [-1, 1]) {
          if (i + di >= 0 && i + di < MAXW) v += this.dirt[j * MAXW + i + di] * 0.5;
          if (j + di >= 0 && j + di < MAXD) v += this.dirt[(j + di) * MAXW + i] * 0.5;
        }
        v /= 3;
        if (v <= bv) continue;
        if (others.some(o => Math.abs(o.x - i - 0.5) < 3 && Math.abs(o.z - j - 0.5) < 3)) continue;
        // yakınlık bonusu
        bv = v;
        best = { x: i + 0.5, z: j + 0.5 };
      }
    return best;
  }

  cleanliness() {
    const g = this.grid;
    const R = g.rect;
    let sum = 0, n = 0;
    for (let j = R.z0; j < MAXD; j++)
      for (let i = 0; i < R.w; i++) {
        if (!g.walkable(i, j)) continue;
        sum += this.dirt[j * MAXW + i];
        n++;
      }
    let wet = 0, wn = 0;
    for (const it of G.state.items) {
      if (isWet(ITEMS[it.type])) {
        wet += it.dirt || 0;
        wn++;
      }
    }
    const floor = n ? sum / n : 0;
    const total = wn ? floor * 0.75 + (wet / wn) * 0.25 : floor;
    return clamp(1 - total * 1.8, 0, 1);
  }

  avgAppeal() {
    const g = this.grid;
    const R = g.rect;
    let sum = 0, n = 0;
    for (let j = R.z0; j < MAXD; j++)
      for (let i = 0; i < R.w; i++) {
        sum += Math.min(1, this.appeal[j * MAXW + i] / 22);
        n++;
      }
    return n ? sum / n : 0;
  }

  outdoorTemp() {
    const di = dateInfo(G.state.day);
    const h = G.state.minute / 60;
    let t = 15 - 10 * Math.cos((2 * Math.PI * (di.doy - 15)) / 365);
    t += 5 * Math.sin((Math.PI * (h - 9)) / 12);
    if (this.hasEvent('heatwave')) t += 8;
    return t;
  }

  targetTemp() {
    const out = this.outdoorTemp();
    const R = this.grid.rect;
    const area = R.w * R.d;
    let base = out < 19 ? 20.5 : 0.55 * out + 0.45 * 21;
    const people = this.customers.filter(a => a.pos.z < MAXD).length;
    const heat = (people * 14) / area;
    const raw = base + heat;
    const cool = (this.cooling * 80) / area;
    return raw - Math.min(cool, Math.max(0, raw - 20));
  }

  sampleEnv(a) {
    const i = Math.floor(a.pos.x), j = Math.floor(a.pos.z);
    let d = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= MAXW || jj >= MAXD) continue;
        d += this.dirt[jj * MAXW + ii];
        n++;
      }
    let crowd = 0;
    for (const o of this.customers) {
      if (o === a) continue;
      const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z;
      if (dx * dx + dz * dz < 2.6) crowd++;
    }
    const e = a.env;
    e.dirt += n ? d / n : 0;
    e.appeal += Math.min(1, (this.appeal[j * MAXW + i] || 0) / 22);
    e.crowd += crowd;
    e.temp += this.temp;
    e.n++;
  }

  // ---------------- grup dersleri ----------------
  // Bugünkü aktif ders saatleri: [{ sid, k, t, type }]
  classSlots() {
    const out = [];
    for (const it of this.itemsOfKind('studio')) {
      (it.classes || []).forEach((type, k) => {
        if (type && CLASS_SLOTS[k] > G.state.minute - 5) out.push({ sid: it.id, k, t: CLASS_SLOTS[k], type });
      });
    }
    return out;
  }

  // k numaralı dersin bugünkü durumu: upcoming | running | done | canceled
  classInfo(st, k) {
    const start = CLASS_SLOTS[k];
    const c = st._cls && st._cls[k];
    if (c) return { ...c, start, end: start + CLASS_LEN };
    const type = st.classes && st.classes[k];
    if (!type) return null;
    return { state: 'upcoming', type, start, end: start + CLASS_LEN };
  }

  // şu an süren ya da `ahead` dakika içinde başlayacak ders
  classNow(st, ahead = 15) {
    const now = G.state.minute;
    for (let k = 0; k < CLASS_SLOTS.length; k++) {
      const c = this.classInfo(st, k);
      if (!c) continue;
      if (c.state === 'running') return { ...c, k };
      if (c.state === 'upcoming' && c.start - now <= ahead && now <= c.start + 12) return { ...c, k };
    }
    return null;
  }

  updateClasses() {
    const s = G.state;
    const now = s.minute;
    for (const st of this.itemsOfKind('studio')) {
      st._cls ||= [];
      for (let k = 0; k < CLASS_SLOTS.length; k++) {
        const start = CLASS_SLOTS[k];
        const c = st._cls[k];
        if (!c) {
          const type = st.classes && st.classes[k];
          if (!type || now < start) continue;
          if (now >= start + CLASS_LEN) {
            // kayıttan devam ederken geçmiş dersler (bildirim yok)
            st._cls[k] = { state: 'done', type, attend: 0 };
            continue;
          }
          const ins = st._instructor;
          if (ins && ins.state === 'teach') {
            st._cls[k] = { state: 'running', type, attend: 0 };
            s.today.classRuns = (s.today.classRuns || 0) + 1;
          } else if (now > start + 12 || !ins) {
            // eğitmen gelmedi (ya da hiç yok): ders iptal
            st._cls[k] = { state: 'canceled', type, attend: 0 };
            s.today.classCanceled = (s.today.classCanceled || 0) + 1;
            G.ui.notify(`❌ ${CLASSES[type].icon} ${CLASSES[type].name} dersi iptal: ${s.staff.some(x => x.role === 'instructor') ? 'eğitmen yetişemedi' : 'Grup Eğitmeni yok'}`, 'bad');
          }
        } else if (c.state === 'running' && now >= start + CLASS_LEN) c.state = 'done';
      }
    }
  }

  trackClass(type, st, k) {
    const s = G.state;
    const t = s.today;
    t.classAttend ||= {};
    t.classAttend[type] = (t.classAttend[type] || 0) + 1;
    s.stats.classes ||= {};
    s.stats.classes[type] = (s.stats.classes[type] || 0) + 1;
    const c = st && st._cls && st._cls[k];
    if (c) c.attend++;
  }

  setClass(st, k, type) {
    st.classes ||= CLASS_DEFAULT.slice();
    st.classes[k] = type;
    // başlamamış ders hemen güncellenir; başlamış olan yarından itibaren
  }

  // ---------------- olaylar / pazarlama ----------------
  hasEvent(type) {
    return G.state.events.some(e => e.type === type && e.until >= G.state.day);
  }

  marketingBoost() {
    let b = 0;
    for (const m of G.state.marketing) {
      if (m.until < G.state.day) continue;
      const def = MARKETING.find(x => x.id === m.id);
      if (def) b += def.boost;
    }
    return Math.min(b, 4);
  }

  launchCampaign(id) {
    const def = MARKETING.find(m => m.id === id);
    const s = G.state;
    if (s.money < def.cost) {
      G.ui.notify('Yeterli paran yok!', 'bad');
      G.audio.play('error');
      return false;
    }
    if (s.marketing.some(m => m.id === id && m.until >= s.day)) {
      G.ui.notify('Bu kampanya zaten aktif', 'bad');
      return false;
    }
    this.spend('marketing', def.cost);
    s.marketing.push({ id, until: s.day + def.days - 1 });
    // bugün için ek ziyaretçi
    if (s.phase === 'open' && s.minute < LAST_ARRIVAL_MIN - 60) {
      const frac = (LAST_ARRIVAL_MIN - s.minute) / (LAST_ARRIVAL_MIN - OPEN_MIN);
      const extra = Math.round(this.baseProspects() * def.boost * frac * 0.8);
      const sch = s.today.schedule;
      for (let k = 0; k < extra; k++) sch.push({ t: rand(s.minute + 10, LAST_ARRIVAL_MIN - 5), m: null });
      const done = sch.slice(0, s.today.sIdx);
      const rest = sch.slice(s.today.sIdx).sort((a, b) => a.t - b.t);
      s.today.schedule = done.concat(rest);
    }
    G.audio.play('cash');
    G.ui.notify(`📣 ${def.name} başladı! (${def.days} gün)`, 'good');
    return true;
  }

  // ---------------- fiyat & talep ----------------
  fairPrice() {
    const s = G.state;
    const types = new Set(s.items.filter(it => ['cardio', 'strength', 'functional'].includes(ITEMS[it.type].cat)).map(it => it.type));
    const has = k => s.items.some(it => ITEMS[it.type].kind === k);
    let p = 18 + s.rep * 3 + Math.min(types.size, 15) * 0.9;
    if (this.itemsOfKind('shower').length) p += 4;
    if (this.itemsOfKind('studio').length && s.staff.some(x => x.role === 'instructor')) p += 5;
    if (has('locker')) p += 2;
    if (has('shop')) p += 3;
    if (s.staff.some(x => x.role === 'trainer')) p += 5;
    if (this.cooling > 0) p += 2;
    p += this.avgAppeal() * 10;
    p += s.expansion * 1.5;
    return Math.round(p);
  }

  priceRatio() {
    return G.state.prices.monthly / Math.max(10, this.fairPrice());
  }

  baseProspects() {
    const s = G.state;
    const di = dateInfo(s.day);
    const avgSat = s.members.length ? s.members.reduce((a, m) => a + m.sat, 0) / s.members.length : 70;
    let base = 8 + s.rep * 3 + s.members.length * 0.012 * (avgSat / 70);
    base *= 1 + this.marketingBoost();
    base *= MONTH_SEASON[di.month] * WD_FACTOR[di.wd];
    const pr = this.priceRatio();
    base *= clamp(1.5 - 0.5 * pr, 0.3, 1.25) * clamp(1.25 - 0.025 * s.prices.dayPass, 0.5, 1.15);
    if (s.day <= 3) base *= 1.8; // açılış haftası merakı
    if (this.classSlots().length && s.staff.some(x => x.role === 'instructor')) base *= 1.15; // grup dersleri yeni kitle çeker
    else if (s.day <= 7) base *= 1.3;
    if (this.hasEvent('competitor')) base *= 0.75;
    if (this.hasEvent('viral')) base *= 1.6;
    if (this.hasEvent('marathon')) base *= 1.2;
    base *= clamp(1 - s.members.length / 3200, 0.1, 1);
    return base;
  }

  // ---------------- gün döngüsü ----------------
  startDay() {
    const s = G.state;
    s.minute = OPEN_MIN;
    s.phase = 'open';
    s.today = {
      income: {}, expense: {}, visits: 0, newMembers: 0, lost: 0, satSum: 0, satN: 0, complaints: {}, waterCost: 0,
      kwh: 0, cleanSum: 0, cleanN: 0, schedule: [], sIdx: 0, exUse: {}, turnedAway: 0, reviews: [], startMoney: s.money,
      startRep: s.rep, startMembers: s.members.length, lostNames: [], inspected: false,
    };
    // süresi dolan kampanya / olay
    s.marketing = s.marketing.filter(m => m.until >= s.day);
    s.events = s.events.filter(e => e.until >= s.day);
    this.maybeEvent();
    this.generateGoals();
    this.refreshCandidates();
    this.buildSchedule();
    for (const st of this.itemsOfKind('studio')) st._cls = [];
    this.spawnAllStaff();
    this.memberMap = new Map(s.members.map(m => [m.id, m]));
    G.ui && G.ui.onDayStart();
  }

  resumeDay() {
    if (G.state.phase === 'open') this.spawnAllStaff(true);
    G.ui && G.ui.onDayStart(true);
  }

  spawnAllStaff(inside) {
    for (const rec of G.state.staff) {
      const a = spawnStaff(rec);
      if (inside) {
        a.pos.x = DOOR_I[0] + 1;
        a.pos.z = MAXD - 1.5;
      }
    }
  }

  slotTime(slot, weekend) {
    if (weekend && Math.random() < 0.6) return clamp(11.5 + gauss() * 2.5, 8, 20.5) * 60;
    switch (slot) {
      case 'early': return clamp(7.2 + gauss() * 0.8, 6.05, 10) * 60;
      case 'noon': return clamp(12.6 + gauss() * 1.2, 10, 15.5) * 60;
      case 'evening': return clamp(18.6 + gauss() * 1.3, 16, 21.6) * 60;
      default: return clamp(20.6 + gauss() * 0.6, 19.5, 21.8) * 60;
    }
  }

  buildSchedule() {
    const s = G.state;
    const di = dateInfo(s.day);
    const weekend = di.wd >= 5;
    const sch = [];
    const slots = this.classSlots();
    const studioOpen = ITEMS.studio.level <= s.level;
    // derse göre geliş: dersten 12-25 dk önce
    const classVisit = pref => {
      let opts = slots.filter(x => x.type === pref);
      if (!opts.length && Math.random() < 0.35) opts = slots;
      if (!opts.length) return null;
      const c = pick(opts);
      // kaldırımdan yürüme + giriş + soyunma odası ~25-30 dk sürer
      return { t: c.t - rand(38, 55), m: null, cls: { sid: c.sid, k: c.k } };
    };
    for (const m of s.members) {
      const p = m.freq * WD_FACTOR[di.wd] * MONTH_VISIT[di.month] * (0.45 + m.sat / 110);
      if (Math.random() >= p) continue;
      const cv = m.classPref ? classVisit(m.classPref) : null;
      if (cv) sch.push({ ...cv, m: m.id });
      else sch.push({ t: this.slotTime(m.slot, weekend), m: m.id, noClass: !!(m.classPref && studioOpen && !slots.length && Math.random() < 0.5) });
    }
    const n = Math.max(0, Math.round(this.baseProspects() + gauss() * 1.5));
    for (let k = 0; k < n; k++) {
      const cv = slots.length && Math.random() < 0.18 ? classVisit(null) || null : null;
      if (cv) {
        sch.push(cv);
        continue;
      }
      const slot = weightedPick([['early', 0.18], ['noon', 0.27], ['evening', 0.45], ['late', 0.1]]);
      sch.push({ t: this.slotTime(slot, weekend), m: null });
    }
    if (this.hasEvent('influencer') && s.events.find(e => e.type === 'influencer').start === s.day) {
      sch.push({ t: rand(10, 18) * 60, m: 'vip' });
    }
    sch.sort((a, b) => a.t - b.t);
    s.today.schedule = sch;
    s.today.expected = sch.length;
    s.today.expectedProspects = n;
  }

  maybeEvent() {
    const s = G.state;
    if (s.day < 4 || Math.random() > 0.24) return;
    const di = dateInfo(s.day);
    const opts = [];
    const active = t => s.events.some(e => e.type === t && e.until >= s.day);
    if (di.month >= 4 && di.month <= 8) opts.push(['heatwave', 1.4]);
    opts.push(['competitor', 0.6], ['powerhike', 0.7], ['marathon', 0.8], ['expo', 1.0], ['inspection', 1.0]);
    if (this.itemsOfKind('shower').length) opts.push(['waterCut', 0.6]);
    if (s.rep >= 3.6) opts.push(['viral', 0.7]);
    if (s.level >= 3) opts.push(['influencer', 0.8]);
    const avail = opts.filter(o => !active(o[0]));
    if (!avail.length) return;
    const type = weightedPick(avail);
    const def = EVENTS[type];
    s.events.push({ type, start: s.day, until: s.day + def.days - 1 });
    G.ui && setTimeout(() => G.ui.showEvent(type), 400);
  }

  refreshCandidates() {
    const s = G.state;
    s.candidates = {};
    for (const role in STAFF_ROLES) s.candidates[role] = [0, 1, 2].map(() => createStaffCandidate(role));
  }

  hire(cand) {
    const s = G.state;
    if (STAFF_ROLES[cand.role].level > s.level) return;
    s.staff.push(cand);
    const list = s.candidates[cand.role];
    list.splice(list.indexOf(cand), 1);
    list.push(createStaffCandidate(cand.role));
    if (s.phase === 'open') {
      const a = spawnStaff(cand);
      a.pos.x = DOOR_I[0] + 1;
      a.pos.z = MAXD + 0.8;
    }
    G.audio.play('cash');
    G.ui.notify(`${STAFF_ROLES[cand.role].icon} ${cand.name} işe başladı`, 'good');
    this.checkMilestones();
  }

  fire(rec) {
    const s = G.state;
    s.staff.splice(s.staff.indexOf(rec), 1);
    this.spend('severance', rec.wage);
    const a = this.staffAgents.find(x => x.data === rec);
    if (a) staffLeave(a);
    G.ui.notify(`${rec.name} işten çıkarıldı (tazminat ${fmtMoney(rec.wage)})`, 'info');
  }

  expand() {
    const s = G.state;
    const next = EXPANSIONS[s.expansion + 1];
    if (!next) return;
    if (s.level < next.level) {
      G.ui.notify(`Seviye ${next.level} gerekli`, 'bad');
      return;
    }
    if (s.money < next.cost) {
      G.ui.notify('Yeterli paran yok!', 'bad');
      G.audio.play('error');
      return;
    }
    this.spend('expand', next.cost);
    s.expansion++;
    this.grid.setExpansion(s.expansion);
    G.world.rebuildBuilding();
    this.recompute();
    G.audio.play('levelup');
    G.ui.notify(`🏗️ Salon genişletildi! Yeni alan: ${next.w}×${next.d} m`, 'good');
    this.checkMilestones();
    save();
  }

  takeLoan(k) {
    const s = G.state;
    if (s.loan) return;
    const L = LOANS[k];
    s.money += L.amount;
    s.loan = { amount: L.amount, daily: Math.round((L.amount * (1 + L.rate)) / L.days), left: L.days };
    G.audio.play('cash');
    G.ui.notify(`🏦 ${fmtMoney(L.amount)} kredi alındı`, 'good');
  }

  payLoan() {
    const s = G.state;
    if (!s.loan) return;
    const total = s.loan.daily * s.loan.left;
    const disc = Math.round(total * 0.92);
    if (s.money < disc) {
      G.ui.notify('Yeterli paran yok', 'bad');
      return;
    }
    this.spend('loan', disc);
    s.loan = null;
    G.ui.notify('Kredi kapatıldı', 'good');
  }

  // ---------------- para ----------------
  earn(cat, amt, agent) {
    const s = G.state;
    s.money += amt;
    s.today.income[cat] = (s.today.income[cat] || 0) + amt;
    s.stats.income += amt;
    if (cat !== 'reward' && cat !== 'renewal') this.progressGoal('income', amt);
    if (agent && agent.ch) {
      G.world.floatText(agent.pos.x, 2.6, agent.pos.z, '+' + fmtMoney(amt));
      const now = performance.now();
      if (now - this.cashSoundT > 250) {
        this.cashSoundT = now;
        G.audio.play('coin');
      }
    }
  }

  spend(cat, amt) {
    const s = G.state;
    s.money -= amt;
    s.today.expense[cat] = (s.today.expense[cat] || 0) + amt;
  }

  // ---------------- alet istatistikleri ----------------
  trackExercise(type) {
    const t = G.state.today;
    t.exUse[type] = (t.exUse[type] || 0) + 1;
    const st = G.state.stats;
    st.use[type] = (st.use[type] || 0) + 1;
  }

  trackWait(type) {
    const t = G.state.today;
    t.exWait = t.exWait || {};
    t.exWait[type] = (t.exWait[type] || 0) + 1;
    const st = G.state.stats;
    st.wait[type] = (st.wait[type] || 0) + 1;
  }

  trackMissing(group) {
    const t = G.state.today;
    t.exMissing = t.exMissing || {};
    t.exMissing[group] = (t.exMissing[group] || 0) + 1;
  }

  // dönem: 'today' | 'week' | 'all' -> { use: {type: n}, wait: {type: n}, missing: {group: n} }
  usageStats(period) {
    const s = G.state;
    const t = s.today;
    if (period === 'all') return { use: { ...s.stats.use }, wait: { ...s.stats.wait }, missing: { ...(t.exMissing || {}) } };
    const out = { use: { ...t.exUse }, wait: { ...(t.exWait || {}) }, missing: { ...(t.exMissing || {}) } };
    if (period === 'week') {
      for (const h of s.history.slice(-6)) {
        for (const k of ['use', 'wait', 'missing']) for (const [ty, n] of Object.entries(h[k] || {})) out[k][ty] = (out[k][ty] || 0) + n;
      }
    }
    return out;
  }

  // ---------------- memnuniyet ----------------
  computeSat(a) {
    const iss = a.issues;
    let s = 74;
    s += Math.min(a.exDone * 2.2, 10);
    s -= Math.min(a.exMissing * 9, 20);
    s -= (a.compromise || 0) * 2.5;
    s -= Math.min(a.waitTotal * 0.9, 24);
    s -= (a.gaveUp || 0) * 5;
    const e = a.env;
    const n = Math.max(1, e.n);
    const dirt = e.n ? e.dirt / n : 0;
    const appeal = e.n ? e.appeal / n : 0;
    const crowd = e.n ? e.crowd / n : 0;
    const temp = e.n ? e.temp / n : this.temp;
    s -= Math.max(0, dirt - 0.12) * 65;
    s += appeal * 13;
    if (temp > 24) s -= (temp - 24) * 3.5;
    if (temp < 17) s -= (17 - temp) * 3;
    if (crowd > 2.2) s -= (crowd - 2.2) * 5;
    if (iss.noLocker) s -= 8;
    if (iss.noShower) s -= 8;
    if (iss.noToilet) s -= 12;
    if (iss.thirst) s -= 5;
    if (iss.broken) s -= 3 * iss.broken;
    if (iss.noStaff) s -= 20;
    if (iss.queue) s -= 6;
    if (iss.dirtyWc) s -= 6;
    if (a.coached) s += 9;
    if (a.classDone) s += 10;
    if (iss.classFull) s -= 9;
    if (iss.classCanceled) s -= 11;
    if (iss.noClass) s -= 4;
    if (a.vip) s -= 5; // ünlüler daha seçici
    const pr = this.priceRatio();
    if (pr > 1.15) s -= (pr - 1.15) * 25;
    if (pr < 0.85) s += 4;
    // canlı değerlendirme için ortam etkilerini kaydet
    a._env = { dirt, appeal, crowd, temp };
    return clamp(Math.round(s), 3, 100);
  }

  finalizeVisit(a) {
    if (a.finalized) return;
    a.finalized = true;
    const s = G.state;
    const t = s.today;
    const sat = this.computeSat(a);
    a.sat = sat;
    const pr = this.priceRatio();
    if (a.noEntry) {
      t.turnedAway++;
      s.rep = clamp(s.rep - 0.01, 0, 5);
      return;
    }
    t.visits++;
    s.stats.visits++;
    t.satSum += sat;
    t.satN++;
    this.progressGoal('visits', 1);
    this.addXP(1 + Math.round(sat / 30));
    // fiziksel gelişim
    const m = a.m;
    m.visits = (m.visits || 0) + 1;
    m.fit = Math.min(1, (m.fit || 0.2) + 0.006);
    if (m.goal === 'weightloss' || m.goal === 'fitness') m.look.weight = Math.max(0, m.look.weight - 0.006);
    if (!a.walkin && !a.vip) {
      m.sat = m.sat * 0.72 + sat * 0.28;
    } else if (a.vip) {
      if (sat >= 72) {
        s.rep = clamp(s.rep + 0.25, 0, 5);
        s.events.push({ type: 'viral', start: s.day + 1, until: s.day + 2 });
        G.ui.notify('⭐ Ünlü ziyaretçi salonuna bayıldı! Paylaşımı viral oldu, 2 gün yeni müşteri akını!', 'good');
      } else {
        s.rep = clamp(s.rep - 0.25, 0, 5);
        G.ui.notify(`⭐ Ünlü ziyaretçi memnun kalmadı (%${sat}). İtibar düştü.`, 'bad');
      }
    } else {
      // dönüşüm
      const hasRecep = this.staffAgents.some(x => x.role === 'receptionist' && x.state === 'work');
      let pc = clamp((sat - 38) / 55, 0, 1) * clamp(1.45 - 0.55 * pr, 0.08, 1.2) * (hasRecep ? 1 : 0.45) * clamp(1.1 - (s.prices.joinFee || 0) * 0.005, 0.6, 1.1);
      if (Math.random() < pc) {
        m.sat = sat;
        m.joined = s.day;
        m.renew = s.day + 30;
        s.members.push(m);
        this.memberMap.set(m.id, m);
        t.newMembers++;
        s.stats.newMembers++;
        this.earn('membership', s.prices.monthly, a);
        if (s.prices.joinFee) this.earn('joinfee', s.prices.joinFee);
        this.progressGoal('newMembers', 1);
        this.addXP(6);
        showBubble(a, '🎉', 2.5);
        s.stats.maxMembers = Math.max(s.stats.maxMembers, s.members.length);
        if (Math.random() < 0.25) G.ui.notify(`🎉 ${m.name} üye oldu!`, 'good');
      }
    }
    // itibar & yorum
    s.rep = clamp(s.rep + (sat / 20 - s.rep) * 0.005, 0, 5);
    const reviewChance = sat < 35 || sat > 88 ? 0.35 : 0.12;
    if (Math.random() < reviewChance) this.addReview(a, sat);
    if (sat < 30) showBubble(a, '😡', 3);
    else if (sat > 88) showBubble(a, '😍', 3);
  }

  addReview(a, sat) {
    const s = G.state;
    const stars = clamp(Math.round(sat / 20 + gauss() * 0.35), 1, 5);
    let text;
    if (stars <= 3) {
      const keys = Object.keys(a.issues).sort((x, y) => a.issues[y] - a.issues[x]);
      let key = keys[0];
      const e = a._env || {};
      if (!key) {
        if (e.dirt > 0.25) key = 'dirty';
        else if (e.temp > 26) key = 'hot';
        else if (e.crowd > 3) key = 'crowded';
        else if (this.priceRatio() > 1.2) key = 'price';
      }
      if (key && ISSUES[key]) {
        text = pick(ISSUES[key].review);
        if (key === 'missing' && a.missingGroups) {
          const gname = { cardio: 'kardiyo aleti', upper: 'üst vücut aleti', lower: 'bacak aleti', flex: 'esneme alanı', combat: 'boks torbası' }[Object.keys(a.missingGroups)[0]];
          text = `Salonda hiç ${gname} yok, hayal kırıklığı.`;
        }
      } else text = 'Fena değil ama daha iyi olabilir.';
    } else {
      const e = a._env || {};
      let key = 'general';
      if (a.classDone && Math.random() < 0.6) key = 'classes';
      else if (a.coached && Math.random() < 0.6) key = 'trainer';
      else if (e.appeal > 0.55 && Math.random() < 0.6) key = 'atmosphere';
      else if (e.dirt < 0.05 && Math.random() < 0.5) key = 'clean';
      else if (a.waitTotal < 1 && Math.random() < 0.5) key = 'quiet';
      else if (this.priceRatio() < 0.9 && Math.random() < 0.5) key = 'price';
      else if (a.exMissing === 0 && Math.random() < 0.4) key = 'variety';
      text = pick(PRAISES[key]);
    }
    const r = { day: s.day, name: a.m.name, stars, text, g: a.m.look.g };
    s.reviews.unshift(r);
    if (s.reviews.length > 40) s.reviews.length = 40;
    s.today.reviews.push(r);
    s.rep = clamp(s.rep + (stars - s.rep) * 0.035, 0, 5);
    G.ui && G.ui.onReview(r);
  }

  // ---------------- seviye & hedefler ----------------
  addXP(n) {
    const s = G.state;
    s.xp += n;
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
      G.ui && G.ui.levelUp(s.level);
    }
  }

  generateGoals() {
    const s = G.state;
    const exp = Math.max(4, Math.round(s.members.length * 0.35 + this.baseProspects()));
    const lastIncome = s.history.length ? s.history[s.history.length - 1].income : 300;
    const pool = [
      { type: 'visits', target: Math.max(6, Math.round(exp * 1.05)), text: n => `${n} ziyaretçi ağırla` },
      { type: 'newMembers', target: Math.max(2, Math.round(this.baseProspects() * 0.4)), text: n => `${n} yeni üye kazan` },
      { type: 'income', target: Math.max(250, Math.round((lastIncome * 1.1) / 50) * 50), text: n => `${fmtMoney(n)} gelir elde et` },
      { type: 'buy', target: randi(1, 2), text: n => `${n} yeni ekipman/dekor satın al` },
      { type: 'sat', target: clamp(Math.round((65 + s.level) / 5) * 5, 65, 85), text: n => `Ortalama memnuniyeti %${n}+ tut`, end: true },
      { type: 'clean', target: 80, text: n => `Gün sonu temizlik %${n}+ olsun`, end: true },
    ];
    if (s.staff.some(x => x.role === 'trainer')) pool.push({ type: 'pt', target: randi(2, 4), text: n => `${n} PT dersi sat` });
    const chosen = [];
    const avail = pool.slice();
    while (chosen.length < 3 && avail.length) chosen.push(avail.splice(randi(0, avail.length - 1), 1)[0]);
    s.goals = chosen.map(g => ({
      type: g.type,
      target: g.target,
      progress: 0,
      text: g.text(g.target),
      end: !!g.end,
      reward: Math.round((80 + s.day * 10 + s.level * 30) / 10) * 10,
      xp: 15 + s.level * 4,
      done: false,
    }));
  }

  progressGoal(type, amt) {
    const s = G.state;
    for (const g of s.goals) {
      if (g.done || g.type !== type || g.end) continue;
      g.progress += amt;
      if (g.progress >= g.target) this.completeGoal(g);
    }
    G.ui && G.ui.refreshGoals();
  }

  completeGoal(g) {
    g.done = true;
    g.progress = g.target;
    this.earn('reward', g.reward);
    this.addXP(g.xp);
    G.ui.notify(`🏆 Hedef tamamlandı: ${g.text} (+${fmtMoney(g.reward)})`, 'good');
    G.audio.play('goal');
  }

  checkMilestones() {
    const s = G.state;
    for (const m of MILESTONES) {
      if (s.milestones[m.id]) continue;
      if (m.check(s)) {
        s.milestones[m.id] = s.day;
        s.money += m.reward;
        s.today.income.reward = (s.today.income.reward || 0) + m.reward;
        G.ui.notify(`🎖️ Başarım: ${m.text}! (+${fmtMoney(m.reward)})`, 'good');
        G.audio.play('goal');
      }
    }
  }

  // ---------------- ana döngü ----------------
  update(gdt, realDt) {
    const s = G.state;
    if (s.phase !== 'night' && gdt > 0) {
      s.minute += gdt;
      const t = s.today;
      // gelişler
      while (t.sIdx < t.schedule.length && t.schedule[t.sIdx].t <= s.minute) {
        const e = t.schedule[t.sIdx];
        if (s.phase === 'open' && s.minute < LAST_ARRIVAL_MIN) {
          if (this.customers.length >= 140) {
            e.t += 15;
            break;
          }
          this.spawnFromSchedule(e);
        }
        t.sIdx++;
      }
      this.updateClasses();
      // sıcaklık
      const tt = this.targetTemp();
      this.temp += (tt - this.temp) * Math.min(1, gdt * 0.06);
      // enerji tüketimi
      const R = this.grid.rect;
      let kw = R.w * R.d * 0.011 + 0.3;
      for (const it of s.items) {
        const def = ITEMS[it.type];
        if (!def.power) continue;
        if (def.cooling) {
          if (this.temp > 21.5) kw += def.power;
        } else if (def.spots && def.cat !== 'facility') {
          if (it._busy) kw += def.power;
        } else kw += def.power * 0.6;
      }
      t.kwh += (kw * gdt) / 60;
      // temizlik örneklemesi
      this.cleanSampleT = (this.cleanSampleT || 0) + gdt;
      if (this.cleanSampleT > 15) {
        this.cleanSampleT = 0;
        t.cleanSum += this.cleanliness();
        t.cleanN++;
      }
      // denetim
      if (this.hasEvent('inspection') && !t.inspected && s.minute >= 15 * 60) {
        t.inspected = true;
        const c = this.cleanliness();
        if (c < 0.6) {
          const fine = 400 + s.expansion * 200;
          this.spend('fine', fine);
          s.rep = clamp(s.rep - 0.15, 0, 5);
          G.ui.notify(`📋 Denetim: Temizlik yetersiz (%${Math.round(c * 100)}). ${fmtMoney(fine)} ceza!`, 'bad');
          G.audio.play('error');
        } else if (c > 0.85) {
          s.rep = clamp(s.rep + 0.12, 0, 5);
          G.ui.notify(`📋 Denetim: Salon pırıl pırıl (%${Math.round(c * 100)}). İtibar arttı!`, 'good');
          G.audio.play('goal');
        } else G.ui.notify(`📋 Denetim geçildi (%${Math.round(c * 100)} temizlik).`, 'info');
      }
      // kapanış
      if (s.phase === 'open' && s.minute >= CLOSE_MIN) {
        s.phase = 'closing';
        for (const a of this.customers) forceExit(a);
        for (const a of this.staffAgents) staffLeave(a);
        G.ui.notify('🌙 Salon kapanıyor...', 'info');
      }
      // ajanlar
      const step = Math.min(gdt, 0.5);
      let remaining = gdt;
      while (remaining > 1e-6) {
        const d = Math.min(step, remaining);
        remaining -= d;
        for (const a of this.customers) updateCustomer(a, d);
        for (const a of this.staffAgents) updateStaff(a, d);
      }
      for (let i = this.customers.length - 1; i >= 0; i--) {
        const a = this.customers[i];
        if (a.gone) {
          if (!a.finalized) this.finalizeVisit(a);
          abortCustomer(a);
          removeAgentVisual(a);
          this.customers.splice(i, 1);
        }
      }
      for (let i = this.staffAgents.length - 1; i >= 0; i--) {
        const a = this.staffAgents[i];
        if (a.gone) {
          removeAgentVisual(a);
          this.staffAgents.splice(i, 1);
        }
      }
      if (s.phase === 'closing' && ((!this.customers.length && !this.staffAgents.length) || s.minute > CLOSE_MIN + 75)) {
        for (const a of this.customers) {
          if (!a.finalized) this.finalizeVisit(a);
          abortCustomer(a);
          removeAgentVisual(a);
        }
        for (const a of this.staffAgents) removeAgentVisual(a);
        this.customers = [];
        this.staffAgents = [];
        for (const it of s.items) {
          it._queue = [];
          it._spots.forEach(r => (r.user = r.res = null));
          it._staff = null;
          it._tech = null;
          it._busy = false;
        }
        this.endDay();
      }
    }
    // görseller
    for (const a of this.customers) updateAgentVisual(a, realDt);
    for (const a of this.staffAgents) updateAgentVisual(a, realDt);
    this.dirtTimer += realDt;
    if (this.dirtTimer > 0.5) {
      this.dirtTimer = 0;
      G.world.updateDirt(this.dirt);
      for (const it of s.items) {
        if (isWet(ITEMS[it.type])) this.refreshItemIcon(it);
      }
    }
  }

  spawnFromSchedule(e) {
    const s = G.state;
    if (e.m === 'vip') {
      const prof = createMemberProfile(s.day);
      prof.name = pick(['Fit Selin ✨', 'Coach Burak 💪', 'Gym Queen Ece 👑', 'Kaslı Kerem 🔥']);
      prof.look.top = 0xffd700;
      prof.cares = { shower: true, locker: true };
      spawnCustomer(prof, true, { vip: true });
      G.ui.notify(`⭐ ${prof.name} salona geldi! İyi bir izlenim bırak.`, 'info');
      return;
    }
    const opts = { cls: e.cls, noClass: e.noClass };
    if (e.m) {
      const m = this.memberMap.get(e.m);
      if (!m) return;
      spawnCustomer(m, false, opts);
    } else {
      spawnCustomer(createMemberProfile(s.day), true, opts);
    }
  }

  endDay() {
    const s = G.state;
    const t = s.today;
    const R = this.grid.rect;
    const area = R.w * R.d;
    // giderler
    const rent = Math.round(area * RENT_PER_TILE);
    this.spend('rent', rent);
    const wages = s.staff.reduce((a, x) => a + x.wage, 0);
    if (wages) this.spend('wages', wages);
    const elec = Math.round(t.kwh * ELECTRIC_PRICE * (this.hasEvent('powerhike') ? 1.4 : 1));
    if (elec) this.spend('electric', elec);
    const water = Math.round(t.waterCost);
    if (water) this.spend('water', water);
    if (s.loan) {
      this.spend('loan', s.loan.daily);
      s.loan.left--;
      if (s.loan.left <= 0) {
        s.loan = null;
        G.ui.notify('🏦 Kredi borcu tamamen ödendi!', 'good');
      }
    }
    // üyelik yenilemeleri
    const pr = this.priceRatio();
    const keep = [];
    let renewed = 0;
    for (const m of s.members) {
      let quit = false;
      if (s.day + 1 >= m.renew) {
        const p = clamp(0.3 + (m.sat / 100) * 0.7 - Math.max(0, pr - 1) * 0.6, 0.05, 0.97);
        if (Math.random() < p) {
          m.renew += 30;
          renewed++;
          s.money += s.prices.monthly;
          t.income.renewal = (t.income.renewal || 0) + s.prices.monthly;
          s.stats.income += s.prices.monthly;
        } else quit = true;
      } else if (m.sat < 38 && Math.random() < 0.03) quit = true;
      if (quit) {
        t.lost++;
        if (t.lostNames.length < 5) t.lostNames.push(m.name);
      } else keep.push(m);
    }
    s.members = keep;
    t.renewed = renewed;
    // gece temizliği
    const cleaners = s.staff.filter(x => x.role === 'cleaner').length;
    const f = cleaners ? 0.3 : 0.8;
    for (let k = 0; k < this.dirt.length; k++) this.dirt[k] *= f;
    for (const it of s.items) if (it.dirt) it.dirt *= cleaners ? 0.3 : 0.85;
    G.world.updateDirt(this.dirt);
    // hedefler (gün sonu)
    const avgSat = t.satN ? t.satSum / t.satN : 0;
    const avgClean = this.cleanliness();
    for (const g of s.goals) {
      if (g.done || !g.end) continue;
      g.progress = g.type === 'sat' ? Math.round(avgSat) : Math.round(avgClean * 100);
      if (g.progress >= g.target && (g.type !== 'sat' || t.satN >= 3)) this.completeGoal(g);
    }
    // itibar: üyelerin genel memnuniyetine doğru yavaş kayma
    if (s.members.length) {
      const ms = s.members.reduce((a, m) => a + m.sat, 0) / s.members.length;
      s.rep = clamp(s.rep + (ms / 20 - s.rep) * 0.02, 0, 5);
    }
    const income = Object.values(t.income).reduce((a, b) => a + b, 0);
    const expense = Object.values(t.expense).reduce((a, b) => a + b, 0);
    s.history.push({ day: s.day, income, expense, money: Math.round(s.money), members: s.members.length, sat: Math.round(avgSat), rep: s.rep, visits: t.visits, use: t.exUse, wait: t.exWait || {}, missing: t.exMissing || {}, classes: t.classAttend || {} });
    if (s.history.length > 60) s.history.shift();
    s.stats.maxMembers = Math.max(s.stats.maxMembers, s.members.length);
    this.checkMilestones();
    // iflas kontrolü
    let bankrupt = false;
    if (s.money < 0) {
      s.negDays++;
      if (s.negDays >= 5) bankrupt = true;
    } else s.negDays = 0;
    s.phase = 'night';
    const report = {
      day: s.day, income: t.income, expense: t.expense, incomeTotal: income, expenseTotal: expense,
      net: s.money - t.startMoney, visits: t.visits, newMembers: t.newMembers, lost: t.lost, renewed,
      members: s.members.length, avgSat: Math.round(avgSat), clean: Math.round(avgClean * 100),
      rep: s.rep, repDelta: s.rep - t.startRep, complaints: t.complaints, reviews: t.reviews.slice(0, 3),
      turnedAway: t.turnedAway, lostNames: t.lostNames, negDays: s.negDays, bankrupt, exUse: t.exUse,
      classRuns: t.classRuns || 0, classCanceled: t.classCanceled || 0,
      classAttend: Object.values(t.classAttend || {}).reduce((x, y) => x + y, 0),
    };
    save();
    G.ui.showDaySummary(report);
  }

  nextDay() {
    const s = G.state;
    s.day++;
    this.startDay();
    save();
  }
}
