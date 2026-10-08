import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, rand, pick } from '../game.js';
import { MAXW, MAXD, DOOR_I, ITEMS, EXPANSIONS } from '../data.js';
import { buildItemModel, MAT } from './models.js';
import { Character } from './character.js';
import { randomLook } from '../state.js';

const WALL_H = 3.0;
const LOW_H = 0.35;
const WALL_T = 0.2;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

function noiseFill(x, w, h, base, spread, count, size = 1) {
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = Math.random();
    x.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${Math.random() * spread})`;
    x.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// Eşya pozisyon yardımcıları (sim ile ortak)
export function itemDims(type, rot) {
  const [w, d] = ITEMS[type].size;
  return rot % 2 ? [d, w] : [w, d];
}
export function itemCenter(it) {
  const [w, d] = itemDims(it.type, it.rot);
  return { x: it.i + w / 2, z: it.j + d / 2 };
}
export function localToWorld(it, lx, lz) {
  const th = (it.rot * Math.PI) / 2;
  const c = itemCenter(it);
  const cs = Math.cos(th), sn = Math.sin(th);
  return { x: c.x + lx * cs + lz * sn, z: c.z - lx * sn + lz * cs };
}

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.itemGroup = new THREE.Group();
    this.root.add(this.itemGroup);
    this.agentGroup = new THREE.Group();
    this.root.add(this.agentGroup);
    this.buildingGroup = new THREE.Group();
    this.root.add(this.buildingGroup);
    this.fxGroup = new THREE.Group();
    this.root.add(this.fxGroup);
    this.walls = [];
    this.floats = [];
    this.spriteCache = new Map();
    this.cars = [];
    this.peds = [];
    this.lamps = [];
    this.doorOpen = 0;

    this._buildEnvironment();
    this._buildDirtOverlay();
    this._buildHeatOverlay();
    this._buildSelection();
  }

  // ---------------- ÇEVRE ----------------
  _buildEnvironment() {
    const env = new THREE.Group();
    this.root.add(env);
    // Çimen
    const grassTex = canvasTex(256, 256, (x, w, h) => {
      noiseFill(x, w, h, '#6fae4f', 0.18, 5000, 2);
      for (let i = 0; i < 600; i++) {
        x.fillStyle = Math.random() < 0.5 ? 'rgba(40,90,30,0.25)' : 'rgba(150,200,90,0.25)';
        x.fillRect(Math.random() * w, Math.random() * h, 3, 1);
      }
    }, true);
    grassTex.repeat.set(40, 40);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(MAXW / 2, -0.03, MAXD / 2);
    grass.receiveShadow = true;
    env.add(grass);

    // Kaldırım
    const paveTex = canvasTex(128, 128, (x, w, h) => {
      noiseFill(x, w, h, '#c9c6bf', 0.12, 1500);
      x.strokeStyle = 'rgba(90,90,90,0.35)';
      x.lineWidth = 2;
      x.strokeRect(1, 1, w - 2, h - 2);
      x.beginPath();
      x.moveTo(0, h / 2);
      x.lineTo(w, h / 2);
      x.moveTo(w / 2, 0);
      x.lineTo(w / 2, h / 2);
      x.moveTo(w / 4, h / 2);
      x.lineTo(w / 4, h);
      x.stroke();
    }, true);
    const sideLen = 140;
    const mkSidewalk = (z0, z1) => {
      const t = paveTex.clone();
      t.needsUpdate = true;
      t.repeat.set(sideLen, z1 - z0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(sideLen, 0.12, z1 - z0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
      m.position.set(MAXW / 2, 0.0, (z0 + z1) / 2);
      m.receiveShadow = true;
      env.add(m);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(sideLen, 0.14, 0.18), new THREE.MeshStandardMaterial({ color: 0x9d9a94, roughness: 0.8 }));
      curb.position.set(MAXW / 2, 0.01, z1 - 0.09);
      env.add(curb);
    };
    mkSidewalk(MAXD, MAXD + 3);
    // Yol
    const roadTex = canvasTex(256, 256, (x, w, h) => {
      noiseFill(x, w, h, '#3a3d42', 0.15, 4000);
    }, true);
    roadTex.repeat.set(30, 2);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(sideLen, 7), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(MAXW / 2, -0.01, MAXD + 6.5);
    road.receiveShadow = true;
    env.add(road);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    for (let x = -60; x < MAXW + 60; x += 4) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.15), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.0, MAXD + 6.5);
      env.add(l);
    }
    // yaya geçidi
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6.2), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(-6 + i * 1.0, 0.0, MAXD + 6.5);
      env.add(l);
    }
    const far = new THREE.Mesh(new THREE.BoxGeometry(sideLen, 0.12, 3), new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.9 }));
    far.position.set(MAXW / 2, 0, MAXD + 11.5);
    far.receiveShadow = true;
    env.add(far);

    // Arsa zemini (boş genişleme alanı)
    const lotTex = canvasTex(128, 128, (x, w, h) => noiseFill(x, w, h, '#bdb39b', 0.2, 2500, 2), true);
    lotTex.repeat.set(MAXW / 2, MAXD / 2);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(MAXW, MAXD), new THREE.MeshStandardMaterial({ map: lotTex, roughness: 1 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(MAXW / 2, -0.005, MAXD / 2);
    lot.receiveShadow = true;
    env.add(lot);

    // Ağaçlar
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const leafMats = [0x3f8f3a, 0x4fa043, 0x2f7a35, 0x5aa84a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
    const tree = (x, z, s = 1) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6), trunkMat);
      t.position.y = 0.8;
      t.castShadow = true;
      g.add(t);
      if (Math.random() < 0.35) {
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(1.1 - i * 0.25, 1.4, 7), pick(leafMats));
          c.position.y = 1.7 + i * 0.7;
          c.castShadow = true;
          g.add(c);
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 - i * 0.12, 0), pick(leafMats));
          c.position.set(rand(-0.35, 0.35), 2.0 + i * 0.45, rand(-0.35, 0.35));
          c.castShadow = true;
          g.add(c);
        }
      }
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = rand(0, 6);
      env.add(g);
    };
    for (let i = 0; i < 70; i++) {
      const x = rand(-45, MAXW + 45);
      const z = rand(-40, MAXD - 1);
      const inLot = x > -3 && x < MAXW + 3 && z > -3 && z < MAXD + 1;
      if (inLot) continue;
      if (Math.abs(x + 15) < 7 && z > -2 && z < 15) continue;
      if (Math.abs(x - (MAXW + 13)) < 7 && z > 0 && z < 15) continue;
      tree(x, z, rand(0.8, 1.4));
    }
    for (let x = -30; x < MAXW + 30; x += 9) tree(x + rand(-1, 1), MAXD + 13.2, rand(0.8, 1.1));

    // Komşu binalar
    const winTex = (base, lit) =>
      canvasTex(128, 256, (x, w, h) => {
        x.fillStyle = base;
        x.fillRect(0, 0, w, h);
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 4; c++) {
            x.fillStyle = Math.random() < lit ? '#ffd98a' : '#2d3e50';
            x.fillRect(10 + c * 30, 12 + r * 30, 18, 20);
          }
      });
    const building = (x, z, w, d, h, color) => {
      const tex = winTex(color, 0.15);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(w / 4, h / 8);
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, m, new THREE.MeshStandardMaterial({ color: 0x777777 }), m, m, m]);
      b.position.set(x, h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      env.add(b);
    };
    building(-15, 8, 10, 12, 13, '#d9c3a5');
    building(MAXW + 13, 6, 11, 12, 10, '#b7c6d6');
    building(4, -14, 14, 8, 16, '#c9a99b');
    building(22, -15, 12, 8, 12, '#e3d7c3');
    building(-14, -10, 9, 9, 20, '#a9b4c2');

    // Sokak lambaları
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.4 });
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd28a, emissiveIntensity: 0 });
    for (let x = -24; x < MAXW + 26; x += 11) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8), poleMat);
      p.position.y = 2.1;
      p.castShadow = true;
      g.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), poleMat);
      arm.position.set(0, 4.15, 0.4);
      g.add(arm);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), this.bulbMat);
      bulb.position.set(0, 4.08, 0.8);
      g.add(bulb);
      g.position.set(x, 0, MAXD + 2.75);
      env.add(g);
    }

    // Tabela (direk)
    this.pylon = new THREE.Group();
    env.add(this.pylon);

    // Arabalar
    const carCols = [0xe63946, 0x1d3557, 0xf1faee, 0x2a9d8f, 0x222222, 0xffb703, 0x8d99ae, 0x6a4c93];
    for (let i = 0; i < 6; i++) {
      const car = this._makeCar(pick(carCols));
      const dir = i % 2 ? 1 : -1;
      car.userData = { dir, speed: rand(6, 10), x: rand(-50, MAXW + 50) };
      car.position.set(car.userData.x, 0, MAXD + (dir > 0 ? 4.8 : 8.2));
      car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      env.add(car);
      this.cars.push(car);
    }

    // Çit ve genişleme işaretleri için grup
    this.lotGroup = new THREE.Group();
    env.add(this.lotGroup);
    this.env = env;
  }

  _makeCar(color) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a38, metalness: 0.3, roughness: 0.15 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4.2), body);
    b.position.y = 0.55;
    b.castShadow = true;
    g.add(b);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.2), glass);
    cab.position.set(0, 1.12, -0.2);
    cab.castShadow = true;
    g.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 1.9), body);
    roof.position.set(0, 1.42, -0.25);
    g.add(roof);
    for (const sx of [-0.85, 0.85])
      for (const sz of [-1.35, 1.35]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14), tire);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.34, sz);
        g.add(w);
      }
    const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.6 });
    for (const sx of [-0.6, 0.6]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), hl);
      l.position.set(sx, 0.62, 2.1);
      g.add(l);
    }
    return g;
  }

  // ---------------- BİNA ----------------
  buildingRect() {
    const e = EXPANSIONS[G.state.expansion];
    return { x0: 0, z0: MAXD - e.d, w: e.w, d: e.d, x1: e.w, z1: MAXD };
  }

  rebuildBuilding() {
    const bg = this.buildingGroup;
    while (bg.children.length) {
      const c = bg.children.pop();
      c.traverse(o => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    this.walls = [];
    const R = this.buildingRect();

    // Zemin
    if (!this.floorTex) {
      this.floorTex = canvasTex(128, 128, (x, w, h) => {
        noiseFill(x, w, h, '#4d525a', 0.22, 2600, 2);
        x.strokeStyle = 'rgba(0,0,0,0.35)';
        x.lineWidth = 2;
        x.strokeRect(0, 0, w, h);
      }, true);
    }
    const ft = this.floorTex;
    ft.repeat.set(R.w, R.d);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(R.w, 0.1, R.d), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 }));
    floor.position.set(R.x0 + R.w / 2, -0.045, R.z0 + R.d / 2);
    floor.receiveShadow = true;
    bg.add(floor);
    this.floor = floor;

    // Duvarlar
    const wallMat = (this.wallMat ||= new THREE.MeshStandardMaterial({ color: 0xefebe4, roughness: 0.85 }));
    const capMat = (this.capMat ||= new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6 }));
    const stripeMat = (this.stripeMat ||= new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.5 }));
    const frameMat = (this.frameMat ||= new THREE.MeshStandardMaterial({ color: 0x2d3238, roughness: 0.4, metalness: 0.6 }));
    const glassMat = (this.glassMat ||= new THREE.MeshStandardMaterial({ color: 0xa8d8ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false }));

    const makeWall = (axis, fixed, a0, a1, normal, opts = {}) => {
      // axis 'x': duvar x boyunca uzanır, z sabit
      const full = new THREE.Group();
      const low = new THREE.Group();
      const boxes = { wall: [], cap: [], stripe: [], frame: [], glass: [] };
      const add = (kind, len, h, y, along, thick = WALL_T, off = 0) => {
        const g = axis === 'x' ? new THREE.BoxGeometry(len, h, thick) : new THREE.BoxGeometry(thick, h, len);
        if (axis === 'x') g.translate(along, y, fixed + off);
        else g.translate(fixed + off, y, along);
        boxes[kind].push(g);
      };
      const glassFront = opts.glassFront;
      const door = opts.door; // [d0, d1]
      for (let p = a0; p < a1; p += 1) {
        const mid = p + 0.5;
        const isDoor = door && mid > door[0] && mid < door[1];
        if (isDoor) {
          add('wall', 1, WALL_H - 2.3, 2.3 + (WALL_H - 2.3) / 2, mid);
          continue;
        }
        const winSlot = glassFront ? true : (Math.floor(p - a0) % 4 === 1 || Math.floor(p - a0) % 4 === 2) && p > a0 && p < a1 - 1;
        if (winSlot) {
          const bottom = glassFront ? 0.3 : 1.0;
          const top = glassFront ? 2.7 : 2.4;
          add('wall', 1, bottom, bottom / 2, mid);
          add('wall', 1, WALL_H - top, top + (WALL_H - top) / 2, mid);
          add('glass', 1, top - bottom, (top + bottom) / 2, mid, 0.05);
          add('frame', 0.06, top - bottom, (top + bottom) / 2, p, 0.12);
        } else {
          add('wall', 1, WALL_H, WALL_H / 2, mid);
          if (!glassFront) add('stripe', 1, 0.14, 1.15, mid, 0.02, -normal * (WALL_T / 2 + 0.01));
        }
      }
      add('cap', a1 - a0 + WALL_T, 0.08, WALL_H + 0.04, (a0 + a1) / 2, WALL_T + 0.04);
      const mats = { wall: wallMat, cap: capMat, stripe: stripeMat, frame: frameMat, glass: glassMat };
      for (const k in boxes) {
        if (!boxes[k].length) continue;
        const geo = mergeGeometries(boxes[k]);
        const m = new THREE.Mesh(geo, mats[k]);
        m.castShadow = k !== 'glass';
        m.receiveShadow = true;
        full.add(m);
        boxes[k].forEach(g => g.dispose());
      }
      // alçak versiyon
      const lowParts = [];
      for (let p = a0; p < a1; p += 1) {
        const mid = p + 0.5;
        if (door && mid > door[0] && mid < door[1]) continue;
        const g = axis === 'x' ? new THREE.BoxGeometry(1, LOW_H, WALL_T) : new THREE.BoxGeometry(WALL_T, LOW_H, 1);
        if (axis === 'x') g.translate(mid, LOW_H / 2, fixed);
        else g.translate(fixed, LOW_H / 2, mid);
        lowParts.push(g);
      }
      if (lowParts.length) {
        const lm = new THREE.Mesh(mergeGeometries(lowParts), capMat);
        lm.receiveShadow = true;
        low.add(lm);
        lowParts.forEach(g => g.dispose());
      }
      bg.add(full);
      bg.add(low);
      const wall = { full, low, normal: axis === 'x' ? { x: 0, z: normal } : { x: normal, z: 0 } };
      this.walls.push(wall);
      return wall;
    };
    makeWall('x', R.z0, R.x0, R.x1, -1);
    makeWall('x', R.z1, R.x0, R.x1, 1, { glassFront: true, door: [DOOR_I[0], DOOR_I[1] + 1] });
    makeWall('z', R.x0, R.z0, R.z1, -1);
    makeWall('z', R.x1, R.z0, R.z1, 1);
    // köşe direkleri
    for (const [x, z] of [[R.x0, R.z0], [R.x1, R.z0], [R.x0, R.z1], [R.x1, R.z1]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, WALL_H + 0.1, 0.3), capMat);
      c.position.set(x, (WALL_H + 0.1) / 2, z);
      c.castShadow = true;
      bg.add(c);
      this.walls.push({ full: c, low: null, corner: { x: x === R.x0 ? -1 : 1, z: z === R.z0 ? -1 : 1 } });
    }

    // Kapı (sürgülü cam)
    const doorG = new THREE.Group();
    const dx0 = DOOR_I[0], dx1 = DOOR_I[1] + 1;
    const dw = (dx1 - dx0) / 2;
    this.doorPanels = [];
    for (let s = 0; s < 2; s++) {
      const p = new THREE.Group();
      const gl = new THREE.Mesh(new THREE.BoxGeometry(dw, 2.25, 0.04), glassMat);
      gl.position.y = 1.15;
      p.add(gl);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.08, 0.06), frameMat);
      fr.position.y = 0.04;
      p.add(fr);
      const fr2 = fr.clone();
      fr2.position.y = 2.26;
      p.add(fr2);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.08), MAT.chrome);
      handle.position.set(s ? -dw / 2 + 0.1 : dw / 2 - 0.1, 1.1, 0);
      p.add(handle);
      p.userData.base = dx0 + dw / 2 + s * dw;
      p.userData.dir = s ? 1 : -1;
      p.position.set(p.userData.base, 0, R.z1);
      doorG.add(p);
      this.doorPanels.push(p);
    }
    // kapı paspası
    const mat = new THREE.Mesh(new THREE.BoxGeometry(dx1 - dx0, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: 0x8b1e27, roughness: 1 }));
    mat.position.set((dx0 + dx1) / 2, 0.01, R.z1 + 0.6);
    mat.receiveShadow = true;
    doorG.add(mat);
    bg.add(doorG);

    // Cephe tabelası (ön duvar üstü)
    const sign = this._makeSignMesh(Math.min(6, R.w - 2), 0.9);
    sign.position.set(R.x0 + Math.min(6, R.w - 2) / 2 + 4.6, WALL_H - 0.55, R.z1 + 0.13);
    this.walls[1].full.add(sign);

    this._rebuildPylon(R);
    this._rebuildLot(R);
    this.updateWallVisibility(true);
    this.resizeOverlays();
  }

  _makeSignMesh(w, h) {
    const name = G.state.gymName.toUpperCase();
    const tex = canvasTex(1024, 160, (x, cw, ch) => {
      x.fillStyle = '#16181d';
      x.fillRect(0, 0, cw, ch);
      x.fillStyle = '#e63946';
      x.fillRect(0, ch - 18, cw, 18);
      x.font = 'bold 96px "Arial Black", Arial, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.shadowColor = '#ff5a66';
      x.shadowBlur = 18;
      x.fillStyle = '#ffffff';
      x.fillText(name, cw / 2, ch / 2 - 6, cw - 60);
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.4 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [MAT.black, MAT.black, MAT.black, MAT.black, m, MAT.black]);
    mesh.castShadow = true;
    return mesh;
  }

  _rebuildPylon(R) {
    const p = this.pylon;
    while (p.children.length) p.remove(p.children[0]);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), MAT.frame);
    post.position.y = 1.6;
    post.castShadow = true;
    p.add(post);
    const s = this._makeSignMesh(2.6, 0.75);
    s.position.y = 3.0;
    p.add(s);
    const s2 = this._makeSignMesh(2.6, 0.75);
    s2.position.y = 3.0;
    s2.rotation.y = Math.PI;
    p.add(s2);
    p.position.set(-1.2, 0, MAXD + 0.5);
  }

  _rebuildLot(R) {
    const g = this.lotGroup;
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse(o => o.geometry && o.geometry.dispose());
    }
    const fenceMat = (this.fenceMat ||= new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.4, roughness: 0.5 }));
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) return;
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), fenceMat);
        post.position.set(x0 + (x1 - x0) * t, 0.55, z0 + (z1 - z0) * t);
        g.add(post);
      }
      for (const y of [0.4, 0.95]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 !== x0 ? len : 0.05, 0.05, z1 !== z0 ? len : 0.05), fenceMat);
        rail.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        g.add(rail);
      }
    };
    if (R.d < MAXD) fence(0, 0, MAXW, 0);
    else if (R.w < MAXW) fence(R.w, 0, MAXW, 0);
    if (R.w < MAXW) {
      fence(MAXW, 0, MAXW, MAXD);
      fence(R.w + 0.3, MAXD, MAXW, MAXD);
    }
    if (R.d < MAXD) fence(0, 0, 0, R.z0 - 0.2);

    // sonraki genişleme alanı
    const next = EXPANSIONS[G.state.expansion + 1];
    if (next) {
      const z0 = MAXD - next.d;
      const pts = [new THREE.Vector3(0, 0.05, z0), new THREE.Vector3(next.w, 0.05, z0), new THREE.Vector3(next.w, 0.05, MAXD), new THREE.Vector3(R.w, 0.05, MAXD)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 0.5, gapSize: 0.3 }));
      line.computeLineDistances();
      g.add(line);
      // satılık tabelası
      const tex = canvasTex(256, 160, (x, w, h) => {
        x.fillStyle = '#ffd166';
        x.fillRect(0, 0, w, h);
        x.fillStyle = '#1b1b1b';
        x.font = 'bold 40px Arial';
        x.textAlign = 'center';
        x.fillText('GENİŞLEME', w / 2, 62);
        x.font = 'bold 30px Arial';
        x.fillText('ALANI', w / 2, 112);
      });
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.05), [MAT.black, MAT.black, MAT.black, MAT.black, new THREE.MeshStandardMaterial({ map: tex }), MAT.black]);
      board.position.set(Math.min(MAXW - 1.5, R.w + 2.5), 1.4, MAXD - 1.2);
      board.castShadow = true;
      g.add(board);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), fenceMat);
      post.position.set(board.position.x, 0.5, board.position.z - 0.05);
      g.add(post);
    }
  }

  updateWallVisibility(force) {
    const cd = this.engine.camDir();
    const key = Math.round(cd.x * 10) + '_' + Math.round(cd.z * 10);
    if (!force && key === this._wallKey) return;
    this._wallKey = key;
    for (const w of this.walls) {
      if (w.corner) {
        const facing = w.corner.x * cd.x > 0.1 || w.corner.z * cd.z > 0.1;
        w.full.visible = !facing;
        continue;
      }
      const facing = w.normal.x * cd.x + w.normal.z * cd.z > 0.1;
      w.full.visible = !facing;
      if (w.low) w.low.visible = facing;
    }
  }

  // ---------------- EŞYALAR ----------------
  addItemMesh(it) {
    const m = buildItemModel(it.type, it.id);
    this.placeMesh(m, it);
    m.traverse(o => {
      o.userData.itemId = it.id;
    });
    this.itemGroup.add(m);
    it._mesh = m;
    return m;
  }

  placeMesh(m, it) {
    const c = itemCenter(it);
    m.position.set(c.x, 0, c.z);
    m.rotation.y = (it.rot * Math.PI) / 2;
  }

  removeItemMesh(it) {
    if (!it._mesh) return;
    this.itemGroup.remove(it._mesh);
    it._mesh.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    if (it._icon) {
      this.fxGroup.remove(it._icon);
      it._icon = null;
    }
    it._mesh = null;
  }

  // ---------------- KİR KATMANI ----------------
  _buildDirtOverlay() {
    const data = new Uint8Array(MAXW * MAXD * 4);
    const tex = new THREE.DataTexture(data, MAXW, MAXD, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.dirtData = data;
    this.dirtTex = tex;
    const noise = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = '#000';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) {
        const r = rand(4, 22);
        const gr = x.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.5)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.save();
        x.translate(Math.random() * w, Math.random() * h);
        x.fillStyle = gr;
        x.fillRect(-r, -r, r * 2, r * 2);
        x.restore();
      }
    }, true);
    noise.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { dirt: { value: tex }, noise: { value: noise }, size: { value: new THREE.Vector2(MAXW, MAXD) } },
      vertexShader: `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D dirt; uniform sampler2D noise; uniform vec2 size; varying vec2 vW;
        void main(){
          vec2 uv = vW/size;
          float d = texture2D(dirt, uv).r;
          float n = texture2D(noise, vW*0.23).r;
          float n2 = texture2D(noise, vW*0.61+0.3).r;
          float a = smoothstep(0.05, 0.9, d*(0.35 + n*1.4 + n2*0.5)) * 0.82;
          if(a < 0.02) discard;
          vec3 col = mix(vec3(0.33,0.25,0.16), vec3(0.18,0.13,0.08), n2);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(MAXW, MAXD), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(MAXW / 2, 0.015, MAXD / 2);
    plane.renderOrder = 1;
    this.root.add(plane);
    this.dirtPlane = plane;
  }

  updateDirt(dirt) {
    const d = this.dirtData;
    for (let k = 0; k < MAXW * MAXD; k++) {
      d[k * 4] = Math.min(255, dirt[k] * 255);
    }
    this.dirtTex.needsUpdate = true;
  }

  // Atmosfer/ısı haritası katmanı
  _buildHeatOverlay() {
    const data = new Uint8Array(MAXW * MAXD * 4);
    const tex = new THREE.DataTexture(data, MAXW, MAXD, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.heatData = data;
    this.heatTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(MAXW, MAXD), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(MAXW / 2, 0.03, MAXD / 2);
    plane.scale.y = -1;
    plane.renderOrder = 2;
    plane.visible = false;
    this.root.add(plane);
    this.heatPlane = plane;
  }

  showHeat(values, inside) {
    if (!values) {
      this.heatPlane.visible = false;
      return;
    }
    const d = this.heatData;
    for (let k = 0; k < MAXW * MAXD; k++) {
      const v = Math.max(0, Math.min(1, values[k]));
      if (!inside[k]) {
        d[k * 4 + 3] = 0;
        continue;
      }
      // kırmızı -> sarı -> yeşil
      const r = v < 0.5 ? 255 : Math.round(255 * (1 - v) * 2);
      const g = v < 0.5 ? Math.round(255 * v * 2) : 255;
      d[k * 4] = r;
      d[k * 4 + 1] = g;
      d[k * 4 + 2] = 60;
      d[k * 4 + 3] = 200;
    }
    this.heatTex.needsUpdate = true;
    this.heatPlane.visible = true;
  }

  resizeOverlays() {}

  // ---------------- SEÇİM ----------------
  _buildSelection() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.selBox = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, depthWrite: false }));
    this.selBox.visible = false;
    this.selBox.renderOrder = 3;
    this.root.add(this.selBox);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffd166 }));
    this.selBox.add(edges);

    this.footprint = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: 0x4cff7a, transparent: true, opacity: 0.25, depthWrite: false }));
    this.footprint.visible = false;
    this.footprint.renderOrder = 3;
    this.root.add(this.footprint);
    this.accessMarkers = [];
    const amGeo = new THREE.CircleGeometry(0.25, 16).rotateX(-Math.PI / 2);
    const amMat = new THREE.MeshBasicMaterial({ color: 0x4cc9ff, transparent: true, opacity: 0.7, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(amGeo, amMat);
      m.visible = false;
      m.renderOrder = 4;
      this.root.add(m);
      this.accessMarkers.push(m);
    }
    // kişi seçimi halkası
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.48, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, depthWrite: false }));
    this.selRing.visible = false;
    this.root.add(this.selRing);
  }

  showSelectionItem(it) {
    if (!it) {
      this.selBox.visible = false;
      return;
    }
    const [w, d] = itemDims(it.type, it.rot);
    const c = itemCenter(it);
    this.selBox.position.set(c.x, 0.04, c.z);
    this.selBox.scale.set(w, 1, d);
    this.selBox.visible = true;
  }

  showFootprint(it, ok, accessPts) {
    if (!it) {
      this.footprint.visible = false;
      this.accessMarkers.forEach(m => (m.visible = false));
      return;
    }
    const [w, d] = itemDims(it.type, it.rot);
    const c = itemCenter(it);
    this.footprint.position.set(c.x, 0.04, c.z);
    this.footprint.scale.set(w, 1, d);
    this.footprint.material.color.set(ok ? 0x4cff7a : 0xff4c4c);
    this.footprint.visible = true;
    this.accessMarkers.forEach((m, i) => {
      const p = accessPts && accessPts[i];
      m.visible = !!p;
      if (p) m.position.set(Math.floor(p.x) + 0.5, 0.05, Math.floor(p.z) + 0.5);
    });
  }

  // ---------------- EFEKTLER ----------------
  emojiMaterial(emoji, bubble = true) {
    const key = emoji + (bubble ? 'b' : '');
    let m = this.spriteCache.get(key);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    if (bubble) {
      x.fillStyle = 'rgba(255,255,255,0.95)';
      x.strokeStyle = 'rgba(0,0,0,0.25)';
      x.lineWidth = 4;
      x.beginPath();
      x.arc(64, 56, 46, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.beginPath();
      x.moveTo(50, 96);
      x.lineTo(64, 122);
      x.lineTo(76, 96);
      x.fill();
    }
    x.font = `${bubble ? 56 : 90}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(emoji, 64, bubble ? 60 : 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
    this.spriteCache.set(key, m);
    return m;
  }

  makeBubble(emoji) {
    const s = new THREE.Sprite(this.emojiMaterial(emoji));
    s.scale.set(0.75, 0.75, 1);
    s.renderOrder = 10;
    return s;
  }

  floatText(x, y, z, text, color = '#3ddc84') {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 42px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 128, 34);
    g.fillStyle = color;
    g.fillText(text, 128, 34);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(2.0, 0.5, 1);
    s.position.set(x, y, z);
    s.renderOrder = 11;
    this.fxGroup.add(s);
    this.floats.push({ s, t: 0 });
  }

  setItemIcon(it, emoji) {
    if (it._iconEmoji === emoji) return;
    it._iconEmoji = emoji;
    if (it._icon) {
      this.fxGroup.remove(it._icon);
      it._icon = null;
    }
    if (!emoji) return;
    const s = new THREE.Sprite(this.emojiMaterial(emoji));
    s.scale.set(0.9, 0.9, 1);
    s.renderOrder = 10;
    const c = itemCenter(it);
    s.position.set(c.x, 2.6, c.z);
    s.userData.baseY = 2.6;
    this.fxGroup.add(s);
    it._icon = s;
  }

  // ---------------- YAYALAR ----------------
  _spawnPed() {
    const look = randomLook(Math.random() < 0.5 ? 'f' : 'm', rand(0, 0.7));
    const ch = new Character(look);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = dir > 0 ? -40 : MAXW + 40;
    ch.root.position.set(x, 0.06, MAXD + 2.3 + rand(-0.2, 0.3));
    ch.root.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.agentGroup.add(ch.root);
    this.peds.push({ ch, dir, speed: rand(1.1, 1.6), t: Math.random() * 5 });
  }

  update(dt, gdt) {
    // arabalar
    for (const car of this.cars) {
      const u = car.userData;
      u.x += u.dir * u.speed * dt;
      if (u.x > MAXW + 60) u.x = -60;
      if (u.x < -60) u.x = MAXW + 60;
      car.position.x = u.x;
    }
    // yayalar
    if (this.peds.length < 4 && Math.random() < dt * 0.25) this._spawnPed();
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      p.t += dt;
      p.ch.root.position.x += p.dir * p.speed * dt;
      p.ch.pose('walk', p.t * p.speed * 0.75);
      if (p.ch.root.position.x > MAXW + 42 || p.ch.root.position.x < -42) {
        this.agentGroup.remove(p.ch.root);
        this.peds.splice(i, 1);
      }
    }
    // uçan yazılar
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      f.s.position.y += dt * 0.9;
      f.s.material.opacity = Math.max(0, 1 - f.t / 1.6);
      if (f.t > 1.6) {
        this.fxGroup.remove(f.s);
        f.s.material.map.dispose();
        f.s.material.dispose();
        this.floats.splice(i, 1);
      }
    }
    // ikon zıplatma
    const tt = performance.now() / 1000;
    for (const s of this.fxGroup.children) if (s.userData.baseY) s.position.y = s.userData.baseY + Math.sin(tt * 3) * 0.08;

    // kapı
    let near = false;
    const dc = (DOOR_I[0] + DOOR_I[1] + 1) / 2;
    if (G.sim) {
      for (const a of G.sim.allAgents()) {
        const dx = a.pos.x - dc, dz = a.pos.z - MAXD;
        if (dx * dx + dz * dz < 4.5) {
          near = true;
          break;
        }
      }
    }
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
    if (this.doorPanels) for (const p of this.doorPanels) p.position.x = p.userData.base + p.userData.dir * this.doorOpen * 0.95;

    // eşya animasyonları
    const cd = this.engine.camDir();
    for (const it of G.state.items) {
      const m = it._mesh;
      if (!m) continue;
      const u = m.userData;
      // oda duvarları: kameraya bakan duvarlar alçalır, içerisi görünür
      if (u.walls) {
        const th = (it.rot * Math.PI) / 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        for (const w of u.walls) {
          const wx = w.nx * cs + w.nz * sn, wz = -w.nx * sn + w.nz * cs;
          const facing = wx * cd.x + wz * cd.z > 0.1;
          if (w.hideWhenLow) w.mesh.visible = !facing;
          else w.mesh.scale.y = facing ? Math.min(1, 0.45 / w.h) : 1;
        }
      }
      if (u.spin) u.spin.rotation.z += dt * 18;
      if (u.swing) {
        const busy = it._busy;
        u.swing.rotation.x = busy ? Math.sin(tt * 10) * 0.08 : u.swing.rotation.x * 0.95;
      }
      if (u.tvScreen) {
        const h = (tt * 0.05 + it.id * 0.13) % 1;
        u.tvScreen.material.emissive.setHSL(h, 0.6, 0.45 + Math.sin(tt * 2 + it.id) * 0.05);
      }
    }

    // gece lambaları
    const n = this.engine.nightFactor || 0;
    this.bulbMat.emissiveIntensity = n * 3;
    this.updateWallVisibility(false);
  }
}
