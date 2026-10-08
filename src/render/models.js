import * as THREE from 'three';

// ---- Paylaşılan malzemeler ----
const std = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
export const MAT = {
  frame: std(0x2b2f36, 0.45, 0.55),
  frameLight: std(0x8e97a2, 0.35, 0.75),
  chrome: std(0xd9dee4, 0.16, 1.0),
  black: std(0x17181b, 0.55),
  rubber: std(0x1e1f22, 0.95),
  pad: std(0x1c1e24, 0.55),
  padRed: std(0x9b1d26, 0.55),
  accent: std(0xe63946, 0.42, 0.1),
  accent2: std(0xffb703, 0.45, 0.1),
  teal: std(0x2a9d8f, 0.5),
  white: std(0xf1f3f5, 0.5),
  offwhite: std(0xdfe4ea, 0.6),
  wood: std(0xb98552, 0.65),
  woodDark: std(0x6f4a2c, 0.7),
  steel: std(0x6c7a89, 0.4, 0.5),
  tile: std(0xdce8ef, 0.3),
  glass: std(0xcfe8ff, 0.05, 0.1, { transparent: true, opacity: 0.28, depthWrite: false }),
  frosted: std(0xe8f4ff, 0.3, 0.0, { transparent: true, opacity: 0.55, depthWrite: false }),
  water: std(0x8fd3ff, 0.1, 0.0, { transparent: true, opacity: 0.35, depthWrite: false }),
  screen: std(0x0b1b2b, 0.3, 0, { emissive: 0x2bb3ff, emissiveIntensity: 0.9 }),
  screenGreen: std(0x0b2b14, 0.3, 0, { emissive: 0x38ff8a, emissiveIntensity: 0.8 }),
  terracotta: std(0xc0643b, 0.85),
  leaf: std(0x3f8f3a, 0.8),
  leaf2: std(0x2e7d32, 0.8),
  gold: std(0xf2c14e, 0.25, 1.0),
  mirror: std(0xe6eef5, 0.04, 1.0),
  iron: std(0x262626, 0.5, 0.6),
  plateRed: std(0xb3202c, 0.5),
  plateBlue: std(0x1f5fbf, 0.5),
  plateYellow: std(0xe5b81a, 0.5),
  plateGreen: std(0x2f9e44, 0.5),
};

function B(p, m, w, h, d, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  p.add(mesh);
  return mesh;
}
function Cy(p, m, r, h, x = 0, y = 0, z = 0, axis = 'y', seg = 16, r2) {
  const g = new THREE.CylinderGeometry(r, r2 ?? r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  p.add(mesh);
  return mesh;
}
function Sp(p, m, r, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  p.add(mesh);
  return mesh;
}

function screenOn(parent, w, h, x, y, z, rx = 0, m = MAT.screen) {
  const s = B(parent, m, w, h, 0.012, x, y, z);
  s.rotation.x = rx;
  s.castShadow = false;
  return s;
}

function barbell(p, x, y, z, plates = MAT.plateRed) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  Cy(g, MAT.chrome, 0.016, 1.9, 0, 0, 0, 'x', 8);
  for (const s of [-1, 1]) {
    Cy(g, plates, 0.2, 0.05, s * 0.72, 0, 0, 'x', 20);
    Cy(g, MAT.iron, 0.16, 0.04, s * 0.77, 0, 0, 'x', 16);
    Cy(g, MAT.chrome, 0.03, 0.04, s * 0.83, 0, 0, 'x', 8);
  }
  p.add(g);
  return g;
}

function plateTree(p, x, z) {
  B(p, MAT.frame, 0.35, 0.04, 0.35, x, 0.02, z);
  Cy(p, MAT.frame, 0.03, 1.0, x, 0.5, z);
  const cols = [MAT.plateRed, MAT.plateBlue, MAT.plateYellow, MAT.plateGreen];
  for (let i = 0; i < 4; i++) {
    const pl = Cy(p, cols[i], 0.2 - i * 0.025, 0.04, x + 0.06, 0.25 + i * 0.2, z, 'x', 18);
    pl.rotation.z = Math.PI / 2;
    pl.rotation.y = 0;
  }
}

// ---- Oda yardımcıları ----
// Taban y=0'da olan duvar parçası; kamera tarafına bakarsa World alçaltır (userData.walls)
function roomWall(g, mat, w, h, d, x, z, nx, nz, hideWhenLow = false) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0, z);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  g.add(m);
  (g.userData.walls ||= []).push({ mesh: m, nx, nz, h, hideWhenLow });
  return m;
}

// W x D oda, ön duvarda doorW genişliğinde kapı boşluğu
function roomShell(g, W, D, H, doorW, mats) {
  const t = 0.1;
  roomWall(g, mats.back, W, H, t, 0, -D / 2 + t / 2, 0, -1);
  roomWall(g, mats.side, t, H, D - t * 2, -W / 2 + t / 2, 0, -1, 0);
  roomWall(g, mats.side, t, H, D - t * 2, W / 2 - t / 2, 0, 1, 0);
  const seg = (W - doorW) / 2;
  roomWall(g, mats.front, seg, H, t, -W / 2 + seg / 2, D / 2 - t / 2, 0, 1);
  roomWall(g, mats.front, seg, H, t, W / 2 - seg / 2, D / 2 - t / 2, 0, 1);
  const lintel = roomWall(g, mats.side, doorW, 0.35, t, 0, D / 2 - t / 2, 0, 1, true);
  lintel.position.y = H - 0.35;
  return lintel;
}

function signTexture(text, bg, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = fg;
  x.font = 'bold 44px "Segoe UI", Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function doorSign(parent, text, bg, y, z) {
  const m = new THREE.MeshStandardMaterial({ map: signTexture(text, bg), emissive: 0xffffff, emissiveMap: signTexture(text, bg), emissiveIntensity: 0.25 });
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.03), [MAT.black, MAT.black, MAT.black, MAT.black, m, MAT.black]);
  p.position.set(0, y, z);
  parent.add(p);
  return p;
}

function buildLockerRoom(g, gender) {
  const male = gender === 'm';
  const wallMat = std(male ? 0xdbe7f3 : 0xf6e1ea, 0.8);
  roomShell(g, 3, 3, 2.4, 0.9, { back: wallMat, side: wallMat, front: wallMat });
  // fayans zemin
  B(g, std(male ? 0xc9dced : 0xf1d3df, 0.35), 2.8, 0.02, 2.8, 0, 0.01, 0).castShadow = false;
  // kapı tabelası (lento ile birlikte alçalır)
  const lintel = g.userData.walls[g.userData.walls.length - 1].mesh;
  doorSign(lintel, male ? '♂ ERKEK' : '♀ KADIN', male ? '#2b6cb0' : '#c2185b', 0.17, 0.07);
  // dolaplar
  const body = std(male ? 0x3f5f80 : 0x8a4f6e, 0.45, 0.35);
  const door = std(male ? 0x5d82a8 : 0xb06a8f, 0.4, 0.35);
  B(g, body, 2.75, 1.9, 0.4, 0, 0.95, -1.18);
  for (let c = 0; c < 6; c++)
    for (let r = 0; r < 2; r++) {
      const x = -1.15 + c * 0.46;
      const y = 0.52 + r * 0.92;
      B(g, door, 0.42, 0.86, 0.02, x, y, -0.97);
      B(g, MAT.chrome, 0.03, 0.08, 0.03, x + 0.15, y, -0.95);
    }
  // bank
  B(g, MAT.wood, 2.3, 0.05, 0.28, 0, 0.42, -0.72);
  for (const s of [-1, 1]) B(g, MAT.frame, 0.05, 0.4, 0.22, s * 1.0, 0.2, -0.72);
  // duş (sol ön)
  B(g, MAT.tile, 0.88, 0.06, 0.98, -0.95, 0.03, 0.9);
  B(g, MAT.frosted, 0.03, 1.9, 1.0, -0.48, 0.95, 0.9);
  B(g, MAT.chrome, 0.04, 0.45, 0.04, -1.36, 1.85, 0.9);
  Cy(g, MAT.chrome, 0.09, 0.03, -1.28, 2.05, 0.9, 'y', 14);
  const water = Cy(g, MAT.water, 0.1, 1.9, -1.15, 1.05, 0.9, 'y', 12, 0.24);
  water.castShadow = false;
  water.visible = false;
  g.userData.water = water;
  // tuvalet kabini (sağ ön)
  const part = std(0x7a8ca0, 0.5);
  B(g, part, 0.04, 1.9, 1.0, 0.48, 0.95, 0.9);
  B(g, std(0x5c6f84, 0.5), 0.86, 1.8, 0.04, 0.95, 0.95, 0.38);
  B(g, MAT.chrome, 0.12, 0.03, 0.04, 0.7, 1.0, 0.35);
  B(g, MAT.white, 0.36, 0.4, 0.46, 0.95, 0.2, 1.12);
  B(g, MAT.white, 0.36, 0.42, 0.14, 0.95, 0.55, 1.32);
  // lavabo + ayna (sağ duvar)
  B(g, MAT.white, 0.35, 0.12, 0.4, 1.25, 0.85, -0.25);
  B(g, MAT.mirror, 0.02, 0.6, 0.5, 1.38, 1.45, -0.25);
}

function buildStudio(g) {
  const wallMat = std(0xefe9df, 0.85);
  const glass = std(0xcfe8ff, 0.08, 0.1, { transparent: true, opacity: 0.35, depthWrite: false });
  roomShell(g, 5, 4, 2.6, 1.0, { back: wallMat, side: glass, front: glass });
  const walls = g.userData.walls;
  // çerçeve dikmeleri cam duvarlarda
  for (const x of [-2.45, -0.5, 0.5, 2.45]) roomWall(g, MAT.frame, 0.06, 2.6, 0.12, x, 1.94, 0, 1);
  for (const z of [-1.0, 0.0, 1.0]) {
    roomWall(g, MAT.frame, 0.12, 2.6, 0.06, -2.45, z, -1, 0);
    roomWall(g, MAT.frame, 0.12, 2.6, 0.06, 2.45, z, 1, 0);
  }
  // arka duvarda ayna (duvarla birlikte alçalır)
  const back = walls[0].mesh;
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.8, 0.02), MAT.mirror);
  mirror.position.set(0, 1.25, 0.06);
  back.add(mirror);
  const lintel = walls.find(w => w.hideWhenLow).mesh;
  doorSign(lintel, 'STÜDYO', '#6a3fb5', 0.17, 0.07);
  // ahşap zemin (parke şeritleri)
  const woodA = std(0xc99a68, 0.6), woodB = std(0xb98955, 0.6);
  for (let i = 0; i < 10; i++) B(g, i % 2 ? woodA : woodB, 4.8, 0.03, 0.38, 0, 0.015, -1.71 + i * 0.38).castShadow = false;
  // eğitmen kürsüsü
  B(g, std(0x2b2f36, 0.6), 1.4, 0.15, 0.8, 0, 0.075, -1.35);
  B(g, MAT.accent, 1.42, 0.03, 0.82, 0, 0.16, -1.35);
  // matlar
  const cols = [0x8e44ad, 0x16a085, 0xe67e22, 0x2980b9, 0xc0392b, 0x27ae60, 0xd35400];
  const pts = [[-1.6, 0.75], [-0.55, 0.75], [0.55, 0.75], [1.6, 0.75], [-1.1, -0.3], [0, -0.3], [1.1, -0.3]];
  pts.forEach(([x, z], i) => (B(g, std(cols[i], 0.9), 0.6, 0.014, 0.95, x, 0.037, z).castShadow = false));
  // hoparlörler
  for (const s of [-1, 1]) B(g, MAT.black, 0.35, 0.55, 0.28, s * 2.1, 2.05, -1.75);
  // pilates topları
  const ballCols = [0x4cc9f0, 0xf72585, 0x7209b7];
  ballCols.forEach((c, i) => Sp(g, std(c, 0.4), 0.28, 2.05, 0.3, -0.6 + i * 0.62));
}

// ---- Model üreticileri ----
const BUILD = {
  lockerroom_m(g) {
    buildLockerRoom(g, 'm');
  },
  lockerroom_f(g) {
    buildLockerRoom(g, 'f');
  },
  studio(g) {
    buildStudio(g);
  },
  treadmill(g) {
    B(g, MAT.frame, 0.78, 0.14, 1.85, 0, 0.09, 0.05);
    B(g, MAT.rubber, 0.56, 0.03, 1.62, 0, 0.18, 0.1);
    for (const s of [-1, 1]) {
      B(g, MAT.frameLight, 0.09, 0.05, 1.62, s * 0.33, 0.19, 0.1);
      const up = B(g, MAT.frame, 0.07, 1.12, 0.08, s * 0.34, 0.74, -0.8);
      up.rotation.x = -0.12;
      B(g, MAT.chrome, 0.04, 0.04, 0.42, s * 0.34, 1.1, -0.58);
    }
    Cy(g, MAT.frameLight, 0.05, 0.62, 0, 0.1, 0.92, 'x', 10);
    B(g, MAT.accent, 0.78, 0.26, 0.34, 0, 0.21, -0.8);
    const con = B(g, MAT.black, 0.74, 0.38, 0.1, 0, 1.36, -0.86);
    con.rotation.x = -0.55;
    screenOn(con, 0.5, 0.22, 0, 0.03, 0.056);
    B(g, MAT.accent, 0.74, 0.06, 0.11, 0, 1.53, -0.97).rotation.x = -0.55;
  },
  bike(g) {
    B(g, MAT.frame, 0.62, 0.06, 0.1, 0, 0.03, -0.78);
    B(g, MAT.frame, 0.56, 0.06, 0.1, 0, 0.03, 0.72);
    B(g, MAT.frame, 0.1, 0.1, 1.45, 0, 0.1, -0.03);
    Cy(g, MAT.accent, 0.3, 0.12, 0, 0.38, -0.5, 'x', 24);
    Cy(g, MAT.frameLight, 0.12, 0.14, 0, 0.38, -0.5, 'x', 16);
    const post = B(g, MAT.frame, 0.09, 0.95, 0.09, 0, 0.6, -0.38);
    post.rotation.x = 0.28;
    B(g, MAT.chrome, 0.52, 0.04, 0.04, 0, 1.06, -0.5);
    for (const s of [-1, 1]) B(g, MAT.black, 0.05, 0.05, 0.26, s * 0.25, 1.07, -0.38);
    const con = B(g, MAT.black, 0.26, 0.16, 0.06, 0, 1.16, -0.56);
    con.rotation.x = -0.6;
    screenOn(con, 0.18, 0.09, 0, 0.01, 0.032);
    const sp = B(g, MAT.frameLight, 0.06, 0.68, 0.06, 0, 0.44, 0.36);
    sp.rotation.x = -0.25;
    B(g, MAT.pad, 0.24, 0.08, 0.32, 0, 0.78, 0.44);
    Cy(g, MAT.frame, 0.03, 0.42, 0, 0.32, -0.05, 'x', 8);
    for (const s of [-1, 1]) B(g, MAT.black, 0.1, 0.03, 0.14, s * 0.2, 0.32 + s * 0.08, -0.05 + s * 0.1);
  },
  elliptical(g) {
    B(g, MAT.frame, 0.52, 0.1, 1.85, 0, 0.05, 0.02);
    B(g, MAT.accent, 0.42, 0.62, 0.42, 0, 0.36, -0.72);
    Cy(g, MAT.frameLight, 0.2, 0.44, 0, 0.36, -0.72, 'x', 20);
    B(g, MAT.frame, 0.09, 1.25, 0.09, 0, 0.75, -0.72).rotation.x = -0.12;
    const con = B(g, MAT.black, 0.36, 0.22, 0.07, 0, 1.38, -0.8);
    con.rotation.x = -0.5;
    screenOn(con, 0.26, 0.12, 0, 0.01, 0.037);
    for (const s of [-1, 1]) {
      const arm = B(g, MAT.chrome, 0.04, 1.25, 0.04, s * 0.26, 0.95, -0.45);
      arm.rotation.x = 0.28 + s * 0.1;
      const rail = B(g, MAT.frameLight, 0.06, 0.06, 1.1, s * 0.15, 0.22, -0.1);
      rail.rotation.x = 0.12;
      B(g, MAT.black, 0.15, 0.04, 0.36, s * 0.15, 0.3 + s * 0.05, 0.25);
    }
  },
  rower(g) {
    B(g, MAT.frameLight, 0.12, 0.08, 1.85, 0, 0.3, 0.05);
    B(g, MAT.frame, 0.45, 0.28, 0.1, 0, 0.14, 0.88);
    B(g, MAT.frame, 0.5, 0.08, 0.12, 0, 0.04, 0.88);
    Cy(g, MAT.black, 0.27, 0.22, 0, 0.36, -0.72, 'x', 24);
    Cy(g, MAT.accent, 0.12, 0.24, 0, 0.36, -0.72, 'x', 12);
    B(g, MAT.frame, 0.55, 0.08, 0.12, 0, 0.04, -0.75);
    const fs = B(g, MAT.black, 0.38, 0.04, 0.22, 0, 0.3, -0.38);
    fs.rotation.x = -0.9;
    B(g, MAT.pad, 0.3, 0.06, 0.32, 0, 0.37, 0.36);
    B(g, MAT.chrome, 0.46, 0.03, 0.03, 0, 0.45, -0.5);
    const con = B(g, MAT.black, 0.2, 0.15, 0.04, 0, 0.82, -0.62);
    con.rotation.x = -0.5;
    screenOn(con, 0.14, 0.09, 0, 0, 0.022, 0, MAT.screenGreen);
    B(g, MAT.frame, 0.04, 0.5, 0.04, 0, 0.62, -0.68).rotation.x = 0.25;
  },
  stair(g) {
    B(g, MAT.frame, 0.82, 0.14, 1.4, 0, 0.07, 0.15);
    B(g, MAT.accent, 0.82, 1.7, 0.32, 0, 0.85, -0.78);
    for (let i = 0; i < 5; i++) B(g, MAT.black, 0.66, 0.05, 0.24, 0, 0.18 + i * 0.12, 0.5 - i * 0.2);
    for (const s of [-1, 1]) {
      B(g, MAT.chrome, 0.04, 0.04, 0.85, s * 0.38, 1.15, -0.2);
      B(g, MAT.frame, 0.05, 1.0, 0.05, s * 0.38, 0.65, 0.2);
    }
    const con = B(g, MAT.black, 0.5, 0.3, 0.08, 0, 1.55, -0.6);
    con.rotation.x = -0.4;
    screenOn(con, 0.38, 0.18, 0, 0.02, 0.042);
  },
  dumbbells(g) {
    for (const s of [-1, 1]) {
      const side = B(g, MAT.frame, 0.07, 0.95, 0.5, s * 0.93, 0.47, -0.1);
      side.rotation.x = 0.06;
    }
    B(g, MAT.frame, 1.9, 0.05, 0.32, 0, 0.42, 0.04);
    B(g, MAT.frame, 1.9, 0.05, 0.3, 0, 0.78, -0.18);
    const tiers = [
      { y: 0.5, z: 0.04, n: 7 },
      { y: 0.86, z: -0.18, n: 8 },
    ];
    let k = 0;
    for (const t of tiers) {
      for (let i = 0; i < t.n; i++) {
        const size = 0.05 + k * 0.006;
        const x = -0.8 + (i + 0.5) * (1.6 / t.n);
        const d = new THREE.Group();
        d.position.set(x, t.y + size, t.z);
        Cy(d, MAT.chrome, 0.015, 0.22, 0, 0, 0, 'z', 6);
        Cy(d, MAT.iron, size, 0.06, 0, 0, 0.1, 'z', 6);
        Cy(d, MAT.iron, size, 0.06, 0, 0, -0.1, 'z', 6);
        g.add(d);
        k++;
      }
    }
  },
  flatbench(g) {
    B(g, MAT.frame, 0.36, 0.42, 0.07, 0, 0.21, -0.62);
    B(g, MAT.frame, 0.4, 0.42, 0.07, 0, 0.21, 0.55);
    B(g, MAT.frame, 0.09, 0.08, 1.3, 0, 0.4, -0.02);
    B(g, MAT.pad, 0.3, 0.09, 1.38, 0, 0.48, -0.06);
    B(g, MAT.accent, 0.31, 0.02, 1.39, 0, 0.44, -0.06);
  },
  benchpress(g) {
    B(g, MAT.frame, 0.4, 0.4, 0.08, 0, 0.2, 0.68);
    B(g, MAT.frame, 0.09, 0.08, 1.3, 0, 0.4, 0.05);
    B(g, MAT.pad, 0.32, 0.1, 1.32, 0, 0.48, 0.08);
    B(g, MAT.accent, 0.33, 0.02, 1.33, 0, 0.43, 0.08);
    for (const s of [-1, 1]) {
      B(g, MAT.frame, 0.08, 1.25, 0.08, s * 0.55, 0.62, -0.62);
      B(g, MAT.frame, 0.08, 0.06, 0.55, s * 0.55, 0.03, -0.45);
      B(g, MAT.chrome, 0.06, 0.06, 0.12, s * 0.55, 1.12, -0.55);
    }
    g.userData.bar = barbell(g, 0, 1.17, -0.52);
    plateTree(g, 0.82, 0.7);
  },
  pulldown(g) {
    B(g, MAT.frame, 0.6, 0.06, 1.85, 0, 0.03, 0);
    B(g, MAT.frame, 0.12, 2.15, 0.12, 0, 1.075, -0.82);
    B(g, MAT.steel, 0.5, 1.6, 0.06, 0, 0.9, -0.72);
    for (let i = 0; i < 10; i++) B(g, MAT.black, 0.32, 0.055, 0.12, 0, 0.12 + i * 0.065, -0.62);
    B(g, MAT.accent, 0.36, 0.4, 0.04, 0, 1.75, -0.74);
    B(g, MAT.frame, 0.1, 0.1, 1.05, 0, 2.15, -0.35);
    B(g, MAT.black, 0.008, 0.4, 0.008, 0, 1.92, 0.12);
    B(g, MAT.chrome, 1.0, 0.035, 0.035, 0, 1.72, 0.12);
    B(g, MAT.frame, 0.08, 0.45, 0.08, 0, 0.24, 0.25);
    B(g, MAT.pad, 0.42, 0.08, 0.42, 0, 0.48, 0.28);
    B(g, MAT.frame, 0.06, 0.32, 0.06, 0, 0.62, -0.02);
    B(g, MAT.pad, 0.46, 0.09, 0.12, 0, 0.78, -0.02);
  },
  squat(g) {
    B(g, MAT.woodDark, 1.95, 0.03, 1.95, 0, 0.015, 0);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) B(g, MAT.frame, 0.08, 2.3, 0.08, sx * 0.78, 1.15, sz * 0.62);
    for (const sx of [-1, 1]) {
      B(g, MAT.frame, 0.08, 0.08, 1.32, sx * 0.78, 2.28, 0);
      B(g, MAT.chrome, 0.05, 0.05, 1.3, sx * 0.78, 0.82, 0);
      B(g, MAT.chrome, 0.1, 0.05, 0.12, sx * 0.78, 1.38, -0.5);
    }
    B(g, MAT.frame, 1.64, 0.08, 0.08, 0, 2.28, -0.62);
    B(g, MAT.frame, 1.64, 0.08, 0.08, 0, 2.28, 0.62);
    B(g, MAT.chrome, 1.4, 0.04, 0.04, 0, 2.1, 0.62);
    g.userData.bar = barbell(g, 0, 1.43, -0.5);
  },
  legpress(g) {
    B(g, MAT.frame, 0.72, 0.14, 1.9, 0, 0.07, 0);
    for (const s of [-1, 1]) {
      const r = B(g, MAT.frameLight, 0.06, 0.06, 1.25, s * 0.3, 0.7, -0.38);
      r.rotation.x = 0.78;
    }
    const plate = B(g, MAT.black, 0.62, 0.55, 0.06, 0, 0.95, -0.55);
    plate.rotation.x = 0.78;
    B(g, MAT.accent, 0.66, 0.1, 0.2, 0, 0.9, -0.7).rotation.x = 0.78;
    for (const s of [-1, 1]) Cy(g, MAT.plateRed, 0.18, 0.05, s * 0.4, 1.0, -0.7, 'x', 16);
    B(g, MAT.frame, 0.4, 0.35, 0.4, 0, 0.25, 0.45);
    B(g, MAT.pad, 0.48, 0.08, 0.45, 0, 0.45, 0.45);
    const back = B(g, MAT.pad, 0.48, 0.7, 0.08, 0, 0.82, 0.78);
    back.rotation.x = -0.7;
    for (const s of [-1, 1]) B(g, MAT.chrome, 0.03, 0.03, 0.3, s * 0.3, 0.5, 0.35);
  },
  cable(g) {
    for (const s of [-1, 1]) {
      B(g, MAT.frame, 0.34, 2.35, 0.32, s * 1.3, 1.175, -0.12);
      B(g, MAT.steel, 0.24, 1.4, 0.04, s * 1.3, 0.85, 0.05);
      for (let i = 0; i < 9; i++) B(g, MAT.black, 0.2, 0.06, 0.1, s * 1.3, 0.12 + i * 0.07, 0.1);
      B(g, MAT.accent, 0.36, 0.25, 0.34, s * 1.3, 2.1, -0.12);
      Cy(g, MAT.chrome, 0.05, 0.05, s * 1.12, 1.85, 0.05, 'z', 10);
      B(g, MAT.black, 0.12, 0.04, 0.04, s * 1.05, 1.83, 0.08);
    }
    B(g, MAT.frame, 2.9, 0.12, 0.12, 0, 2.38, -0.12);
    B(g, MAT.frame, 2.9, 0.06, 0.2, 0, 0.03, -0.12);
    B(g, MAT.chrome, 1.2, 0.04, 0.04, 0, 2.2, -0.12);
  },
  smith(g) {
    B(g, MAT.woodDark, 1.95, 0.03, 1.95, 0, 0.015, 0);
    for (const sx of [-1, 1]) {
      B(g, MAT.frame, 0.1, 2.3, 0.1, sx * 0.85, 1.15, -0.55);
      B(g, MAT.frame, 0.1, 2.3, 0.1, sx * 0.85, 1.15, 0.55);
      B(g, MAT.chrome, 0.04, 2.1, 0.04, sx * 0.72, 1.1, -0.3);
      B(g, MAT.frame, 0.1, 0.1, 1.2, sx * 0.85, 2.3, 0);
    }
    B(g, MAT.accent, 1.8, 0.12, 0.12, 0, 2.3, -0.55);
    B(g, MAT.frame, 1.8, 0.1, 0.1, 0, 2.3, 0.55);
    const bar = new THREE.Group();
    g.add(bar);
    Cy(bar, MAT.chrome, 0.02, 1.7, 0, 1.4, -0.3, 'x', 8);
    for (const s of [-1, 1]) {
      B(bar, MAT.frameLight, 0.1, 0.12, 0.1, s * 0.72, 1.4, -0.3);
      Cy(bar, MAT.plateBlue, 0.2, 0.05, s * 0.6, 1.4, -0.3, 'x', 18);
    }
    g.userData.bar = bar;
  },
  yogamat(g, v) {
    const cols = [0x8e44ad, 0x16a085, 0xe67e22, 0x2980b9, 0xc0392b];
    const m = std(cols[v % cols.length], 0.9);
    B(g, m, 0.66, 0.015, 1.78, 0, 0.008, 0);
    Cy(g, std(0x333333, 0.9), 0.07, 0.4, 0.38, 0.07, -0.75, 'x', 10).position.x = 0.0;
    const kb = new THREE.Group();
    kb.position.set(0.36, 0, 0.75);
    Sp(kb, MAT.iron, 0.09, 0, 0.09, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), MAT.iron);
    handle.position.y = 0.16;
    kb.add(handle);
    g.add(kb);
  },
  punchbag(g) {
    B(g, MAT.frame, 0.7, 0.04, 0.7, 0, 0.02, -0.1);
    B(g, MAT.frame, 0.09, 2.45, 0.09, 0, 1.22, -0.38);
    B(g, MAT.frame, 0.08, 0.08, 0.5, 0, 2.38, -0.15);
    B(g, MAT.chrome, 0.01, 0.35, 0.01, 0, 2.15, 0.08);
    const bag = Cy(g, MAT.padRed, 0.19, 0.95, 0, 1.45, 0.08, 'y', 18);
    Cy(g, MAT.black, 0.195, 0.08, 0, 1.92, 0.08, 'y', 18);
    Cy(g, MAT.black, 0.195, 0.08, 0, 0.98, 0.08, 'y', 18);
    g.userData.swing = bag;
  },
  reception(g) {
    B(g, MAT.white, 2.9, 1.05, 0.14, 0, 0.525, 0.38);
    B(g, MAT.accent, 2.9, 0.16, 0.15, 0, 0.75, 0.39);
    B(g, MAT.wood, 3.0, 0.06, 0.6, 0, 1.08, 0.24);
    B(g, MAT.white, 0.14, 1.05, 0.9, -1.38, 0.525, -0.05);
    B(g, MAT.offwhite, 2.5, 0.05, 0.5, 0, 0.76, 0.05);
    const mon = B(g, MAT.black, 0.42, 0.28, 0.03, -0.45, 1.0, 0.12);
    mon.rotation.y = Math.PI;
    screenOn(mon, 0.38, 0.24, 0, 0, 0.018);
    B(g, MAT.black, 0.05, 0.2, 0.05, -0.45, 0.85, 0.14);
    B(g, MAT.black, 0.3, 0.02, 0.12, -0.45, 0.79, -0.05);
    B(g, MAT.woodDark, 2.8, 1.7, 0.2, 0, 0.85, -0.88);
    for (let i = 0; i < 3; i++) B(g, MAT.wood, 2.6, 0.03, 0.18, 0, 0.5 + i * 0.45, -0.78);
    for (let i = 0; i < 8; i++) {
      const c = [MAT.accent, MAT.teal, MAT.accent2, MAT.white][i % 4];
      Cy(g, c, 0.06, 0.2, -1.1 + i * 0.3, 1.06, -0.8, 'y', 10);
    }
    // küçük bitki
    Cy(g, MAT.white, 0.08, 0.14, 1.1, 1.18, 0.25, 'y', 10, 0.06);
    Sp(g, MAT.leaf, 0.12, 1.1, 1.36, 0.25);
    B(g, MAT.pad, 0.45, 0.08, 0.45, 0.4, 0.5, -0.35);
    B(g, MAT.frame, 0.05, 0.45, 0.05, 0.4, 0.25, -0.35);
  },
  locker(g) {
    const body = std(0x51657a, 0.45, 0.35);
    B(g, body, 1.92, 1.95, 0.5, 0, 0.975, -0.18);
    const door = std(0x6f8aa5, 0.4, 0.35);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 2; r++) {
        const x = -0.72 + c * 0.48;
        const y = 0.52 + r * 0.92;
        B(g, door, 0.44, 0.86, 0.02, x, y, 0.08);
        B(g, MAT.chrome, 0.03, 0.08, 0.03, x + 0.16, y, 0.1);
        B(g, MAT.black, 0.2, 0.02, 0.01, x, y + 0.32, 0.095);
      }
    B(g, MAT.wood, 1.7, 0.05, 0.3, 0, 0.42, 0.33);
    for (const s of [-1, 1]) B(g, MAT.frame, 0.05, 0.4, 0.25, s * 0.75, 0.2, 0.33);
  },
  water(g) {
    B(g, MAT.white, 0.36, 1.0, 0.36, 0, 0.5, -0.18);
    B(g, MAT.steel, 0.2, 0.1, 0.06, 0, 0.75, 0.02);
    Cy(g, MAT.water, 0.14, 0.42, 0, 1.22, -0.18, 'y', 16);
    Cy(g, std(0x4fb3ff, 0.2, 0, { transparent: true, opacity: 0.6 }), 0.12, 0.3, 0, 1.18, -0.18, 'y', 16);
    B(g, MAT.accent, 0.04, 0.04, 0.04, -0.05, 0.84, 0.02);
    B(g, MAT.plateBlue, 0.04, 0.04, 0.04, 0.05, 0.84, 0.02);
  },
  toilet(g) {
    const part = std(0x7a8ca0, 0.5);
    B(g, part, 0.05, 2.0, 0.98, -0.47, 1.0, 0);
    B(g, part, 0.05, 2.0, 0.98, 0.47, 1.0, 0);
    B(g, part, 0.98, 2.0, 0.05, 0, 1.0, -0.47);
    const door = B(g, std(0x5c6f84, 0.5), 0.88, 1.85, 0.04, 0, 1.0, 0.46);
    B(g, MAT.chrome, 0.03, 0.12, 0.04, 0.32, 1.0, 0.49);
    B(g, MAT.screenGreen, 0.12, 0.05, 0.01, 0, 1.75, 0.485);
    B(g, MAT.white, 0.38, 0.4, 0.5, 0, 0.2, -0.18);
    B(g, MAT.white, 0.38, 0.45, 0.15, 0, 0.55, -0.4);
    g.userData.door = door;
  },
  shower(g) {
    B(g, MAT.tile, 0.96, 0.08, 0.96, 0, 0.04, 0);
    B(g, MAT.tile, 0.96, 2.15, 0.06, 0, 1.075, -0.46);
    B(g, MAT.frosted, 0.03, 1.95, 0.92, -0.465, 1.03, 0);
    B(g, MAT.frosted, 0.03, 1.95, 0.92, 0.465, 1.03, 0);
    B(g, MAT.frosted, 0.92, 1.95, 0.03, 0, 1.03, 0.465);
    for (const s of [-1, 1]) B(g, MAT.chrome, 0.04, 2.0, 0.04, s * 0.47, 1.0, 0.47);
    B(g, MAT.chrome, 0.04, 0.5, 0.04, 0, 1.85, -0.4);
    Cy(g, MAT.chrome, 0.1, 0.03, 0, 2.05, -0.28, 'y', 16);
    B(g, MAT.chrome, 0.04, 0.04, 0.14, 0, 2.08, -0.35);
    const water = Cy(g, MAT.water, 0.11, 1.9, 0, 1.08, -0.2, 'y', 12, 0.25);
    water.castShadow = false;
    water.visible = false;
    g.userData.water = water;
  },
  vending(g) {
    B(g, std(0x1c2c3c, 0.45, 0.3), 0.86, 1.92, 0.72, 0, 0.96, -0.12);
    B(g, MAT.accent, 0.04, 1.92, 0.72, -0.44, 0.96, -0.12);
    B(g, std(0x0e1a26, 0.3, 0, { emissive: 0x2a4a6a, emissiveIntensity: 0.6 }), 0.55, 1.3, 0.02, -0.1, 1.12, 0.245);
    const cols = [0xe63946, 0x2a9d8f, 0xffb703, 0x3a86ff, 0xff006e, 0x06d6a0];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 4; c++)
        B(g, std(cols[(r * 4 + c) % cols.length], 0.5), 0.09, 0.15, 0.08, -0.31 + c * 0.14, 0.6 + r * 0.24, 0.17);
    B(g, MAT.glass, 0.56, 1.32, 0.02, -0.1, 1.12, 0.26);
    B(g, MAT.steel, 0.16, 0.5, 0.03, 0.3, 1.15, 0.245);
    screenOn(g, 0.12, 0.06, 0.3, 1.35, 0.262);
    B(g, MAT.black, 0.5, 0.18, 0.04, -0.1, 0.25, 0.25);
    B(g, std(0xffffff, 0.4, 0, { emissive: 0xff3355, emissiveIntensity: 0.8 }), 0.84, 0.12, 0.02, 0, 1.86, 0.245);
  },
  bench(g) {
    for (let i = 0; i < 3; i++) B(g, MAT.wood, 1.8, 0.04, 0.12, 0, 0.45, -0.14 + i * 0.14);
    for (const s of [-1, 1]) {
      B(g, MAT.frame, 0.06, 0.43, 0.06, s * 0.8, 0.215, -0.14);
      B(g, MAT.frame, 0.06, 0.43, 0.06, s * 0.8, 0.215, 0.14);
    }
    B(g, MAT.frame, 1.7, 0.04, 0.04, 0, 0.12, 0);
  },
  proteinbar(g) {
    B(g, MAT.teal, 2.9, 1.05, 0.15, 0, 0.525, 0.62);
    B(g, MAT.accent2, 2.9, 0.12, 0.16, 0, 0.85, 0.63);
    B(g, MAT.white, 3.0, 0.06, 0.6, 0, 1.08, 0.5);
    B(g, MAT.offwhite, 0.14, 1.05, 1.0, -1.38, 0.525, 0.1);
    B(g, MAT.woodDark, 2.8, 1.9, 0.24, 0, 0.95, -0.86);
    const cols = [0x111111, 0xe63946, 0xffffff, 0x3a86ff, 0xffb703];
    for (let r = 0; r < 3; r++) {
      B(g, MAT.wood, 2.6, 0.03, 0.22, 0, 0.6 + r * 0.45, -0.74);
      for (let i = 0; i < 9; i++) Cy(g, std(cols[(i + r) % 5], 0.5), 0.07, 0.2, -1.15 + i * 0.29, 0.72 + r * 0.45, -0.74, 'y', 10);
    }
    const menu = B(g, MAT.black, 1.4, 0.55, 0.04, 0, 2.15, -0.98);
    screenOn(menu, 1.3, 0.45, 0, 0, 0.022, 0, MAT.screenGreen);
    for (const x of [-0.8, 0.0, 0.8]) {
      Cy(g, MAT.black, 0.08, 0.12, x, 1.17, 0.4, 'y', 10);
      Cy(g, MAT.glass, 0.07, 0.22, x, 1.34, 0.4, 'y', 10);
    }
    for (const x of [-1, 1]) {
      Cy(g, MAT.chrome, 0.03, 0.75, x, 0.37, 1.25, 'y', 8);
      Cy(g, MAT.pad, 0.18, 0.06, x, 0.76, 1.25, 'y', 16);
    }
  },
  // ---- dekor ----
  plant(g) {
    Cy(g, MAT.terracotta, 0.2, 0.42, 0, 0.21, 0, 'y', 14, 0.15);
    Cy(g, std(0x3b2a1a, 1), 0.18, 0.02, 0, 0.42, 0, 'y', 14);
    Sp(g, MAT.leaf, 0.22, 0, 0.66, 0, 1, 1.2, 1);
    Sp(g, MAT.leaf2, 0.17, 0.12, 0.85, 0.05);
    Sp(g, MAT.leaf, 0.15, -0.1, 0.8, -0.08);
  },
  bigplant(g) {
    Cy(g, MAT.white, 0.26, 0.55, 0, 0.275, 0, 'y', 16, 0.2);
    Cy(g, std(0x6b4a2b, 0.9), 0.05, 1.4, 0, 1.2, 0, 'y', 8, 0.07);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const l = B(g, i % 2 ? MAT.leaf : MAT.leaf2, 0.16, 0.03, 0.85, Math.cos(a) * 0.38, 1.82, Math.sin(a) * 0.38);
      l.rotation.y = -a + Math.PI / 2;
      l.rotation.x = 0.45;
      l.rotation.order = 'YXZ';
    }
  },
  mirror(g) {
    B(g, MAT.black, 1.94, 2.1, 0.06, 0, 1.12, -0.42);
    B(g, MAT.mirror, 1.84, 2.0, 0.02, 0, 1.12, -0.385);
    B(g, MAT.frame, 1.9, 0.06, 0.2, 0, 0.03, -0.38);
  },
  speaker(g) {
    Cy(g, MAT.frame, 0.25, 0.03, 0, 0.015, 0, 'y', 16);
    Cy(g, MAT.chrome, 0.025, 1.3, 0, 0.66, 0);
    B(g, MAT.black, 0.42, 0.68, 0.36, 0, 1.6, 0);
    Cy(g, std(0x333333, 0.8), 0.13, 0.02, 0, 1.5, 0.18, 'z', 18);
    Cy(g, std(0x333333, 0.8), 0.06, 0.02, 0, 1.8, 0.18, 'z', 12);
    B(g, MAT.screen, 0.04, 0.04, 0.01, 0.15, 1.88, 0.18);
  },
  tv(g) {
    B(g, MAT.frame, 1.0, 0.04, 0.5, 0, 0.02, -0.2);
    B(g, MAT.frame, 0.1, 1.5, 0.08, 0, 0.75, -0.38);
    B(g, MAT.black, 1.7, 0.98, 0.06, 0, 1.75, -0.35);
    const scr = B(g, std(0x000000, 0.3, 0, { emissive: 0x4477ff, emissiveIntensity: 0.9 }), 1.6, 0.88, 0.01, 0, 1.75, -0.318);
    g.userData.tvScreen = scr;
  },
  fan(g) {
    Cy(g, MAT.white, 0.22, 0.04, 0, 0.02, 0, 'y', 16);
    Cy(g, MAT.white, 0.025, 1.2, 0, 0.62, 0);
    const head = new THREE.Group();
    head.position.set(0, 1.3, 0.05);
    g.add(head);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 6, 24), MAT.white);
    head.add(cage);
    Cy(head, MAT.white, 0.07, 0.12, 0, 0, -0.08, 'z', 10);
    const blades = new THREE.Group();
    head.add(blades);
    for (let i = 0; i < 3; i++) {
      const bl = B(blades, std(0x9ad0ff, 0.4, 0, { transparent: true, opacity: 0.8 }), 0.07, 0.2, 0.01, 0, 0.11, 0);
      bl.geometry.translate(0, 0, 0);
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 3) * Math.PI * 2;
      pivot.add(bl);
      blades.add(pivot);
    }
    g.userData.spin = blades;
  },
  ac(g) {
    B(g, MAT.white, 0.55, 1.85, 0.36, 0, 0.925, -0.12);
    for (let i = 0; i < 6; i++) B(g, std(0xb5bec8, 0.5), 0.45, 0.02, 0.02, 0, 1.25 + i * 0.07, 0.065);
    B(g, std(0xcfd6dd, 0.5), 0.45, 0.6, 0.02, 0, 0.5, 0.065);
    screenOn(g, 0.12, 0.05, 0, 1.0, 0.07);
  },
  neon(g) {
    B(g, std(0x1a1a24, 0.8), 1.94, 2.3, 0.12, 0, 1.15, -0.42);
    const tex = neonTexture();
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, transparent: true, map: tex });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), m);
    p.position.set(0, 1.45, -0.355);
    g.add(p);
  },
  trophy(g) {
    B(g, MAT.woodDark, 1.9, 0.3, 0.45, 0, 0.15, -0.25);
    B(g, MAT.glass, 1.86, 1.6, 0.42, 0, 1.1, -0.25);
    B(g, MAT.woodDark, 1.9, 0.08, 0.45, 0, 1.94, -0.25);
    B(g, MAT.wood, 1.8, 0.03, 0.38, 0, 1.0, -0.25);
    for (let i = 0; i < 4; i++) {
      const x = -0.65 + i * 0.43;
      for (const y of [0.32, 1.02]) {
        Cy(g, MAT.gold, 0.05, 0.12, x, y + 0.06, -0.25, 'y', 10);
        Cy(g, MAT.gold, 0.1, 0.18, x, y + 0.24, -0.25, 'y', 14, 0.04);
      }
    }
  },
};

let _neonTex = null;
function neonTexture() {
  if (_neonTex) return _neonTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 512, 256);
  x.textAlign = 'center';
  x.font = 'bold 76px Arial Black, Arial, sans-serif';
  x.shadowColor = '#ff2fd6';
  x.shadowBlur = 24;
  x.fillStyle = '#ff7be8';
  x.fillText('NO PAIN', 256, 105);
  x.shadowColor = '#22e6ff';
  x.fillStyle = '#9ff4ff';
  x.fillText('NO GAIN', 256, 200);
  _neonTex = new THREE.CanvasTexture(c);
  _neonTex.colorSpace = THREE.SRGBColorSpace;
  return _neonTex;
}

export function buildItemModel(type, variant = 0) {
  const g = new THREE.Group();
  const f = BUILD[type];
  if (f) f(g, variant);
  else B(g, MAT.accent, 0.8, 0.8, 0.8, 0, 0.4, 0);
  g.userData.type = type;
  return g;
}

// Hayalet (yerleştirme önizlemesi) malzemesi
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x4cff7a, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4c4c, transparent: true, opacity: 0.45, depthWrite: false });
export function makeGhost(type) {
  const g = buildItemModel(type);
  g.traverse(o => {
    if (o.isMesh) {
      o.material = ghostOk;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  g.userData.setOk = ok => {
    g.traverse(o => {
      if (o.isMesh) o.material = ok ? ghostOk : ghostBad;
    });
  };
  return g;
}
