import { MAXW, MAXD, DOOR_I, EXPANSIONS } from '../data.js';

export const GX0 = -10;
export const NW = MAXW + 20;
export const NH = MAXD + 3;

// Navigasyon ızgarası: bina içi + kaldırım
export class Grid {
  constructor() {
    this.blocked = new Uint8Array(MAXW * MAXD); // eşya ile dolu
    this.inside = new Uint8Array(MAXW * MAXD);
    this.cost = new Float32Array(MAXW * MAXD); // ek maliyet
    this.rect = { w: 10, d: 8, z0: MAXD - 8 };
    // A* tamponları
    const N = NW * NH;
    this.g = new Float32Array(N);
    this.f = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.curStamp = 1;
    this.heap = new Int32Array(N * 8);
  }

  setExpansion(level) {
    const e = EXPANSIONS[level];
    this.rect = { w: e.w, d: e.d, z0: MAXD - e.d };
    this.inside.fill(0);
    for (let j = this.rect.z0; j < MAXD; j++) for (let i = 0; i < e.w; i++) this.inside[j * MAXW + i] = 1;
  }

  isInside(i, j) {
    return i >= 0 && i < MAXW && j >= 0 && j < MAXD && this.inside[j * MAXW + i] === 1;
  }

  walkable(i, j) {
    if (j >= MAXD) {
      if (j >= MAXD + 3 || i < GX0 || i >= GX0 + NW) return false;
      if (j === MAXD && (i === -2 || i === -1)) return false; // tabela direği
      return true;
    }
    if (!this.isInside(i, j)) return false;
    return this.blocked[j * MAXW + i] === 0;
  }

  // iki komşu karo arası geçiş izni (duvar/kapı kuralı)
  passable(i1, j1, i2, j2) {
    const in1 = j1 < MAXD, in2 = j2 < MAXD;
    if (in1 !== in2) {
      if (i1 !== i2) return false;
      return i1 >= DOOR_I[0] && i1 <= DOOR_I[1];
    }
    return true;
  }

  idx(i, j) {
    return j * NW + (i - GX0);
  }

  findPath(sx, sz, tx, tz) {
    const si = Math.floor(sx), sj = Math.floor(sz);
    let ti = Math.floor(tx), tj = Math.floor(tz);
    if (!this.walkable(ti, tj)) return null;
    if (!this.walkable(si, sj)) {
      // başlangıç bloke ise en yakın yürünebilir komşudan başla
      const n = this.nearestWalkable(si, sj);
      if (!n) return null;
      return this._astar(n.i, n.j, ti, tj, sx, sz, tx, tz, true);
    }
    return this._astar(si, sj, ti, tj, sx, sz, tx, tz, false);
  }

  nearestWalkable(i, j) {
    for (let r = 1; r < 4; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.walkable(i + di, j + dj)) return { i: i + di, j: j + dj };
        }
    return null;
  }

  _astar(si, sj, ti, tj, sx, sz, tx, tz, prepend) {
    const st = ++this.curStamp;
    const g = this.g, f = this.f, par = this.parent, stamp = this.stamp, closed = this.closed;
    const heap = this.heap;
    let hn = 0;
    const s = this.idx(si, sj), t = this.idx(ti, tj);
    const h = (i, j) => {
      const dx = Math.abs(i - ti), dy = Math.abs(j - tj);
      return dx + dy + (1.4142 - 2) * Math.min(dx, dy);
    };
    const push = k => {
      let n = hn++;
      heap[n] = k;
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (f[heap[p]] <= f[heap[n]]) break;
        const tmp = heap[p];
        heap[p] = heap[n];
        heap[n] = tmp;
        n = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      heap[0] = heap[--hn];
      let n = 0;
      for (;;) {
        const l = n * 2 + 1, r = l + 1;
        let m = n;
        if (l < hn && f[heap[l]] < f[heap[m]]) m = l;
        if (r < hn && f[heap[r]] < f[heap[m]]) m = r;
        if (m === n) break;
        const tmp = heap[m];
        heap[m] = heap[n];
        heap[n] = tmp;
        n = m;
      }
      return top;
    };
    stamp[s] = st;
    g[s] = 0;
    f[s] = h(si, sj);
    par[s] = -1;
    push(s);
    let found = false;
    let iter = 0;
    while (hn > 0 && iter++ < 6000) {
      const k = pop();
      if (closed[k] === st) continue;
      closed[k] = st;
      if (k === t) {
        found = true;
        break;
      }
      const ci = (k % NW) + GX0, cj = Math.floor(k / NW);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.walkable(ni, nj)) continue;
          if (!this.passable(ci, cj, ni, nj)) continue;
          if (di && dj) {
            if (!this.walkable(ci + di, cj) || !this.walkable(ci, cj + dj)) continue;
            if (!this.passable(ci, cj, ci + di, cj) || !this.passable(ci, cj, ci, cj + dj)) continue;
          }
          const nk = this.idx(ni, nj);
          if (closed[nk] === st) continue;
          let c = di && dj ? 1.4142 : 1;
          if (nj < MAXD && ni >= 0 && ni < MAXW) c += this.cost[nj * MAXW + ni];
          const ng = g[k] + c;
          if (stamp[nk] !== st || ng < g[nk]) {
            stamp[nk] = st;
            g[nk] = ng;
            f[nk] = ng + h(ni, nj);
            par[nk] = k;
            push(nk);
          }
        }
    }
    if (!found) return null;
    const cells = [];
    let k = t;
    while (k !== -1) {
      cells.push({ x: (k % NW) + GX0 + 0.5, z: Math.floor(k / NW) + 0.5 });
      k = par[k];
    }
    cells.reverse();
    // başlangıç noktası mevcut konum
    const pts = [{ x: sx, z: sz }];
    if (prepend) pts.push(cells[0]);
    for (let n = 1; n < cells.length - 1; n++) pts.push(cells[n]);
    pts.push({ x: tx, z: tz });
    return this.smooth(pts);
  }

  los(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return true;
    const regA = a.z < MAXD, regB = b.z < MAXD;
    if (regA !== regB) return false;
    const nx = -dz / len, nz = dx / len;
    const steps = Math.ceil(len / 0.2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + dx * t, pz = a.z + dz * t;
      for (const o of [-0.3, 0, 0.3]) {
        const qx = px + nx * o, qz = pz + nz * o;
        if ((qz < MAXD) !== regA) return false;
        if (!this.walkable(Math.floor(qx), Math.floor(qz))) return false;
      }
    }
    return true;
  }

  smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.los(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  // Kapıdan ulaşılabilir karolar (BFS) — yerleştirme doğrulaması için
  reachableFromDoor(extraBlocked) {
    const seen = new Uint8Array(MAXW * MAXD);
    const q = [];
    const blockedAt = (i, j) => extraBlocked && extraBlocked.has(j * MAXW + i);
    for (const di of DOOR_I) {
      const j = MAXD - 1;
      if (this.walkable(di, j) && !blockedAt(di, j)) {
        seen[j * MAXW + di] = 1;
        q.push(di, j);
      }
    }
    let h = 0;
    while (h < q.length) {
      const i = q[h++], j = q[h++];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (nj >= MAXD || !this.walkable(ni, nj) || blockedAt(ni, nj)) continue;
        const k = nj * MAXW + ni;
        if (seen[k]) continue;
        seen[k] = 1;
        q.push(ni, nj);
      }
    }
    return seen;
  }
}
