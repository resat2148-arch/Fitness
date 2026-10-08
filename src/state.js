import { G, pick, rand, randi, weightedPick, clamp } from './game.js';
import { NAMES_M, NAMES_F, SURNAMES, MONTHS, MONTH_DAYS, WEEKDAYS, WEEKDAYS_SHORT, GOALS, STAFF_ROLES } from './data.js';

const SAVE_KEY = 'gymtycoon_save_v1';
export const SAVE_VERSION = 1;

const SKINS = [0xf5d0b5, 0xeac0a0, 0xd9a882, 0xc68e64, 0xa86f4a, 0x8a5536, 0x5f3a24];
const HAIR = [0x1b1410, 0x2e1f17, 0x4a2f1f, 0x6b4428, 0x9b6a3c, 0xc9a063, 0xe3cc8e, 0x7a7a7a, 0xa33b20];
const TOPS = [0xe63946, 0x1d3557, 0x457b9d, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x8338ec, 0xff006e, 0x3a86ff, 0x222222, 0xf1f1f1, 0x06d6a0, 0xffbe0b, 0x6c757d, 0xfb5607];
const BOTTOMS = [0x1a1a1a, 0x2b2d42, 0x3d405b, 0x495057, 0x1d3557, 0x6c757d, 0x003049, 0x5a189a];
const SHOES = [0xffffff, 0x111111, 0xe63946, 0x3a86ff, 0xfca311, 0x8d99ae];

export function randomName(g) {
  return pick(g === 'f' ? NAMES_F : NAMES_M) + ' ' + pick(SURNAMES)[0] + '.';
}

export function randomLook(g, heavy = 0.3) {
  return {
    g,
    skin: pick(SKINS),
    hair: pick(HAIR),
    hairStyle: g === 'f' ? randi(0, 3) : randi(4, 7),
    top: pick(TOPS),
    bottom: pick(BOTTOMS),
    shoe: pick(SHOES),
    shorts: Math.random() < (g === 'f' ? 0.25 : 0.55),
    tank: Math.random() < 0.3,
    height: g === 'f' ? rand(0.92, 1.0) : rand(0.97, 1.06),
    weight: heavy, // 0 = fit, 1 = kilolu
  };
}

export function createMemberProfile(day) {
  const g = Math.random() < 0.48 ? 'f' : 'm';
  const goal = weightedPick(Object.entries(GOALS).map(([k, v]) => [k, v.weight]));
  const heavy = goal === 'weightloss' ? rand(0.45, 1) : goal === 'muscle' ? rand(0, 0.3) : rand(0, 0.6);
  // Tercih edilen saat dilimi
  const slot = weightedPick([['early', 0.28], ['noon', 0.15], ['evening', 0.45], ['late', 0.12]]);
  return {
    id: G.state ? G.state.nextId++ : 0,
    name: randomName(g),
    look: randomLook(g, heavy),
    goal,
    fit: rand(0.1, 0.5),
    joined: day,
    renew: day + 30,
    sat: 70,
    visits: 0,
    slot,
    freq: clamp(rand(0.25, 0.62) + (goal === 'muscle' ? 0.08 : 0), 0.2, 0.75),
    patience: rand(0.7, 1.35),
    cares: { shower: Math.random() < 0.7, locker: Math.random() < 0.85 },
  };
}

export function createStaffCandidate(role) {
  const r = STAFF_ROLES[role];
  const g = Math.random() < 0.5 ? 'f' : 'm';
  const skill = weightedPick([[1, 0.25], [2, 0.35], [3, 0.25], [4, 0.11], [5, 0.04]]);
  const base = r.wage[0] + (r.wage[1] - r.wage[0]) * ((skill - 1) / 4);
  return {
    id: G.state.nextId++,
    role,
    name: randomName(g),
    look: randomLook(g, rand(0, 0.4)),
    skill,
    wage: Math.round(base * rand(0.92, 1.08)),
  };
}

export function newState(gymName) {
  const s = {
    v: SAVE_VERSION,
    gymName: gymName || 'FitZone',
    money: 25000,
    day: 1,
    minute: 6 * 60,
    phase: 'open',
    level: 1,
    xp: 0,
    rep: 2.5,
    expansion: 0,
    items: [],
    staff: [],
    members: [],
    nextId: 1,
    prices: { monthly: 35, dayPass: 12, joinFee: 20, pt: 30 },
    marketing: [],
    loan: null,
    history: [],
    today: null,
    reviews: [],
    goals: [],
    milestones: {},
    tutorial: 0,
    events: [],
    candidates: {},
    stats: { visits: 0, income: 0, maxMembers: 0, newMembers: 0, use: {}, wait: {} },
    negDays: 0,
    seenLevel: 1,
    settings: { music: true, sfx: true },
    dirt: null,
    started: false,
  };
  return s;
}

export function dateInfo(day) {
  // Gün 1 = 1 Eylül Pazartesi
  let doy = (243 + day - 1) % 365;
  const dayOfYear = doy;
  let m = 0;
  while (doy >= MONTH_DAYS[m]) {
    doy -= MONTH_DAYS[m];
    m++;
  }
  const wd = (day - 1) % 7;
  const year = 1 + Math.floor((243 + day - 1) / 365);
  return {
    doy: dayOfYear,
    month: m,
    dom: doy + 1,
    wd,
    weekday: WEEKDAYS[wd],
    wdShort: WEEKDAYS_SHORT[wd],
    monthName: MONTHS[m],
    year,
    label: `${doy + 1} ${MONTHS[m]}`,
  };
}

export function save() {
  if (!G.state) return;
  try {
    const s = G.state;
    if (G.sim) s.dirt = G.sim.serializeDirt();
    const json = JSON.stringify(s, (k, v) => (k[0] === '_' ? undefined : v));
    localStorage.setItem(SAVE_KEY, json);
    if (G.sdk) G.sdk.saveData(SAVE_KEY, json);
  } catch (e) {
    console.warn('Kayıt başarısız', e);
  }
}

export function loadSave() {
  let json = null;
  try {
    if (G.sdk) json = G.sdk.loadData(SAVE_KEY);
    if (!json) json = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    json = null;
  }
  if (!json) return null;
  try {
    const s = JSON.parse(json);
    if (!s || s.v !== SAVE_VERSION) return null;
    // eski kayıtları yeni alanlarla tamamla
    s.prices.joinFee ??= 20;
    s.prices.pt ??= 30;
    s.stats.use ??= {};
    s.stats.wait ??= {};
    return s;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return !!loadSave();
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    if (G.sdk) G.sdk.removeData(SAVE_KEY);
  } catch (e) {}
}
