// Ortak oyun nesnesi — modüller arası paylaşılan referanslar.
export const G = {
  state: null, // kaydedilen kalıcı durum
  engine: null, // renderer / kamera / sahne
  world: null, // bina, nesne meshleri, overlay
  sim: null, // simülasyon
  ui: null, // arayüz
  audio: null,
  sdk: null,
  speed: 1, // 0 = duraklat
  running: false,
};

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function fmtMoney(v, sign = false) {
  const neg = v < 0;
  const s = Math.round(Math.abs(v)).toLocaleString('tr-TR');
  return (neg ? '-' : sign ? '+' : '') + '$' + s;
}

export function fmtTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function weightedPick(entries) {
  // entries: [[value, weight], ...]
  let total = 0;
  for (const e of entries) total += e[1];
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

export function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
