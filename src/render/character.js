import * as THREE from 'three';

// Paylaşılan geometri ve malzemeler
const matCache = new Map();
export function mat(color, rough = 0.8, metal = 0) {
  const key = color + '_' + rough + '_' + metal;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}
const headGeo = new THREE.SphereGeometry(0.12, 14, 10);
const capGeo = new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const bunGeo = new THREE.SphereGeometry(0.06, 10, 8);
const neckGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8);
const handleGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6).rotateZ(Math.PI / 2);
const barGeo = new THREE.CylinderGeometry(0.016, 0.016, 1.9, 6).rotateZ(Math.PI / 2);
const plateGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16).rotateZ(Math.PI / 2);
const dbPlateGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8).rotateZ(Math.PI / 2);
const mopStickGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.3, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

function mk(geo, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

const STAND_Y = 0.96;

export class Character {
  constructor(look, opts = {}) {
    this.look = look;
    const root = (this.root = new THREE.Group());
    const L = look;
    const wf = 1 + L.weight * 0.35; // genişlik faktörü
    const fem = L.g === 'f';
    const skin = mat(L.skin, 0.75);
    const top = mat(opts.uniform ?? L.top, 0.85);
    const bottom = mat(opts.uniformBottom ?? L.bottom, 0.85);
    const shoe = mat(L.shoe, 0.6);
    const hair = mat(L.hair, 0.9);

    const body = (this.body = new THREE.Group());
    root.add(body);
    body.position.y = STAND_Y;

    // Pelvis
    mk(boxGeo((fem ? 0.32 : 0.3) * wf, 0.18, 0.2 * wf), bottom, body, 0, -0.03, 0);

    // Omurga / gövde
    const spine = (this.spine = new THREE.Group());
    spine.position.y = 0.04;
    body.add(spine);
    const torsoW = (fem ? 0.32 : 0.37) * (1 + L.weight * 0.25);
    const torso = mk(boxGeo(torsoW, 0.5, 0.21 * wf), top, spine, 0, 0.25, 0);
    if (L.weight > 0.55) mk(boxGeo(torsoW * 0.85, 0.22, 0.08), top, spine, 0, 0.12, 0.12 * wf);
    if (fem) mk(boxGeo(torsoW * 0.8, 0.12, 0.06), top, spine, 0, 0.36, 0.11 * wf);
    if (L.tank && !opts.uniform) {
      // atlet: omuzlar çıplak
      mk(boxGeo(torsoW * 1.01, 0.08, 0.215 * wf), skin, spine, 0, 0.46, 0);
    }
    this.torso = torso;
    mk(neckGeo, skin, spine, 0, 0.54, 0);

    // Kafa
    const head = (this.head = new THREE.Group());
    head.position.y = 0.58;
    spine.add(head);
    const hm = mk(headGeo, skin, head, 0, 0.12, 0.0);
    hm.scale.set(1, 1.1, 1.05);
    mk(boxGeo(0.018, 0.024, 0.01), eyeMat, head, 0.043, 0.145, 0.124).castShadow = false;
    mk(boxGeo(0.018, 0.024, 0.01), eyeMat, head, -0.043, 0.145, 0.124).castShadow = false;
    this._buildHair(head, hair, L.hairStyle);

    // Kollar
    const shX = torsoW / 2 + 0.045;
    const sleeve = L.tank && !opts.uniform ? skin : top;
    const makeArm = side => {
      const sh = new THREE.Group();
      sh.position.set(side * shX, 0.47, 0);
      spine.add(sh);
      mk(boxGeo(0.095 * (1 + L.weight * 0.2), 0.3, 0.1 * (1 + L.weight * 0.2)), sleeve, sh, 0, -0.14, 0);
      const el = new THREE.Group();
      el.position.y = -0.29;
      sh.add(el);
      mk(boxGeo(0.08, 0.26, 0.085), skin, el, 0, -0.13, 0);
      mk(boxGeo(0.075, 0.08, 0.09), skin, el, 0, -0.3, 0.005);
      const hand = new THREE.Group();
      hand.position.y = -0.31;
      el.add(hand);
      return [sh, el, hand];
    };
    [this.shL, this.elL, this.handL] = makeArm(1);
    [this.shR, this.elR, this.handR] = makeArm(-1);
    this.shX = shX;

    // Bacaklar
    const shinMat = L.shorts && !opts.uniform ? skin : bottom;
    const makeLeg = side => {
      const hp = new THREE.Group();
      hp.position.set(side * 0.085 * wf, -0.06, 0);
      body.add(hp);
      mk(boxGeo(0.14 * wf, 0.46, 0.15 * wf), bottom, hp, 0, -0.22, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.44;
      hp.add(kn);
      mk(boxGeo(0.115, 0.42, 0.125), shinMat, kn, 0, -0.2, 0);
      mk(boxGeo(0.115, 0.08, 0.25), shoe, kn, 0, -0.42, 0.045);
      return [hp, kn];
    };
    [this.hipL, this.knL] = makeLeg(1);
    [this.hipR, this.knR] = makeLeg(-1);

    root.scale.setScalar(L.height || 1);
    this.props = {};
    this.prop = null;
    this.animT = Math.random() * 10;
    this.root.userData.character = this;
  }

  _buildHair(head, hair, style) {
    if (style === 6) {
      // kel + sakal
      mk(boxGeo(0.17, 0.06, 0.05), hair, head, 0, 0.04, 0.1);
      return;
    }
    const cap = mk(capGeo, hair, head, 0, 0.135, -0.01);
    cap.scale.set(1.02, style === 5 ? 0.75 : 1.05, 1.06);
    if (style === 0) mk(boxGeo(0.24, 0.3, 0.07), hair, head, 0, 0.03, -0.1);
    if (style === 1) mk(boxGeo(0.07, 0.2, 0.07), hair, head, 0, 0.08, -0.15);
    if (style === 2) mk(bunGeo, hair, head, 0, 0.27, -0.08);
    if (style === 3) mk(boxGeo(0.26, 0.16, 0.2), hair, head, 0, 0.1, -0.04);
    if (style === 7) mk(boxGeo(0.17, 0.07, 0.05), hair, head, 0, 0.03, 0.1);
  }

  setProp(name) {
    if (this.prop === name) return;
    for (const k in this.props) this.props[k].visible = false;
    this.prop = name;
    if (!name) return;
    if (!this.props[name]) this.props[name] = this._makeProp(name);
    this.props[name].visible = true;
  }

  _makeProp(name) {
    const g = new THREE.Group();
    const iron = mat(0x2a2a2a, 0.5, 0.6);
    const chrome = mat(0xc9ced6, 0.3, 0.9);
    if (name === 'dumbbells') {
      // iki ele ayrı dambıl; görünürlük ikisine birden uygulanır
      const parts = [this.handL, this.handR].map(hand => {
        const d = new THREE.Group();
        mk(handleGeo, chrome, d);
        mk(dbPlateGeo, iron, d, 0.08, 0, 0);
        mk(dbPlateGeo, iron, d, -0.08, 0, 0);
        hand.add(d);
        return d;
      });
      return {
        get visible() { return parts[0].visible; },
        set visible(v) { for (const p of parts) p.visible = v; },
      };
    }
    if (name === 'barbell' || name === 'barbellBack') {
      const b = new THREE.Group();
      mk(barGeo, chrome, b);
      mk(plateGeo, iron, b, 0.78, 0, 0);
      mk(plateGeo, iron, b, -0.78, 0, 0);
      if (name === 'barbell') {
        b.position.set(this.shX, 0, 0);
        this.handR.add(b);
      } else {
        b.position.set(0, 0.5, -0.13);
        this.spine.add(b);
      }
      return b;
    }
    if (name === 'smithbar') {
      const b = new THREE.Group();
      mk(barGeo, chrome, b);
      b.position.set(0, 0.5, -0.13);
      this.spine.add(b);
      return b;
    }
    if (name === 'mop') {
      const b = new THREE.Group();
      const st = mk(mopStickGeo, mat(0x3d8bfd, 0.5), b, 0, -0.35, 0.1);
      st.rotation.x = 0.5;
      mk(boxGeo(0.35, 0.06, 0.12), mat(0xdddddd, 0.9), b, 0, -0.92, 0.42);
      this.handR.add(b);
      return b;
    }
    if (name === 'wrench') {
      const b = new THREE.Group();
      mk(boxGeo(0.03, 0.03, 0.22), chrome, b, 0, 0, 0.08);
      this.handR.add(b);
      return b;
    }
    if (name === 'clipboard') {
      const b = new THREE.Group();
      mk(boxGeo(0.18, 0.24, 0.02), mat(0x8b5a2b, 0.8), b, 0, 0, 0.05);
      mk(boxGeo(0.15, 0.2, 0.005), mat(0xffffff, 0.9), b, 0, 0, 0.065);
      this.handL.add(b);
      return b;
    }
    return g;
  }

  reset() {
    const b = this.body;
    b.position.set(0, STAND_Y, 0);
    b.rotation.set(0, 0, 0);
    this.spine.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const j of [this.shL, this.shR, this.elL, this.elR, this.hipL, this.hipR, this.knL, this.knR]) j.rotation.set(0, 0, 0);
    this.root.visible = true;
  }

  // Poz uygula. t: animasyon zamanı (sn), k: hız katsayısı
  pose(name, t) {
    this.reset();
    const f = POSES[name] || POSES.idle;
    f(this, t);
  }
}

const S = Math.sin;
const C = Math.cos;
const cyc = (t, sp) => (1 - C(t * sp)) / 2; // 0..1..0

function arms(c, l, r, el, er) {
  c.shL.rotation.x = l;
  c.shR.rotation.x = r;
  c.elL.rotation.x = el;
  c.elR.rotation.x = er;
}

const POSES = {
  idle(c, t) {
    c.spine.rotation.x = S(t * 1.6) * 0.015;
    c.shL.rotation.z = 0.07;
    c.shR.rotation.z = -0.07;
    c.elL.rotation.x = -0.12;
    c.elR.rotation.x = -0.12;
    c.head.rotation.y = S(t * 0.4) * 0.3;
  },
  wait(c, t) {
    POSES.idle(c, t);
    c.shL.rotation.z = 0.5;
    c.elL.rotation.x = -1.9;
    c.shR.rotation.z = -0.5;
    c.elR.rotation.x = -1.9;
    c.shL.rotation.x = -0.3;
    c.shR.rotation.x = -0.3;
    c.head.rotation.y = S(t * 0.8) * 0.6;
  },
  walk(c, t) {
    const p = t * 9;
    const a = S(p) * 0.5;
    c.hipL.rotation.x = a;
    c.hipR.rotation.x = -a;
    c.knL.rotation.x = Math.max(0, S(p - 1.4)) * 0.7;
    c.knR.rotation.x = Math.max(0, S(p + Math.PI - 1.4)) * 0.7;
    arms(c, -a * 0.8, a * 0.8, -0.25, -0.25);
    c.body.position.y = STAND_Y + Math.abs(C(p)) * 0.025;
  },
  run(c, t) {
    const p = t * 13;
    const a = S(p) * 0.75;
    c.hipL.rotation.x = a - 0.1;
    c.hipR.rotation.x = -a - 0.1;
    c.knL.rotation.x = 0.3 + Math.max(0, S(p - 1.2)) * 1.3;
    c.knR.rotation.x = 0.3 + Math.max(0, S(p + Math.PI - 1.2)) * 1.3;
    c.spine.rotation.x = 0.14;
    arms(c, -a * 0.9, a * 0.9, -1.45, -1.45);
    c.body.position.y = STAND_Y - 0.03 + Math.abs(C(p)) * 0.07;
  },
  cycle(c, t) {
    const p = t * 7;
    c.body.position.y = 0.08;
    c.spine.rotation.x = 0.45;
    c.hipL.rotation.x = -1.25 + S(p) * 0.35;
    c.hipR.rotation.x = -1.25 - S(p) * 0.35;
    c.knL.rotation.x = 1.45 - S(p + 1.2) * 0.5;
    c.knR.rotation.x = 1.45 + S(p + 1.2) * 0.5;
    arms(c, -1.05, -1.05, -0.35, -0.35);
    c.head.rotation.x = -0.35;
  },
  elliptical(c, t) {
    const p = t * 6;
    const a = S(p) * 0.35;
    c.hipL.rotation.x = -0.25 + a;
    c.hipR.rotation.x = -0.25 - a;
    c.knL.rotation.x = 0.35 - a * 0.6;
    c.knR.rotation.x = 0.35 + a * 0.6;
    c.spine.rotation.x = 0.08;
    arms(c, -0.75 - a, -0.75 + a, -1.0, -1.0);
    c.body.position.y = STAND_Y - 0.06 + S(p * 2) * 0.03;
  },
  row(c, t) {
    const k = cyc(t, 3.2); // 0 catch, 1 finish
    c.body.position.y = 0.08;
    c.body.position.z = 0.3 - k * 0.45;
    c.spine.rotation.x = 0.45 - k * 0.75;
    c.hipL.rotation.x = c.hipR.rotation.x = -2.0 + k * 0.55;
    c.knL.rotation.x = c.knR.rotation.x = 2.0 - k * 1.9;
    const sh = -1.45 + k * 0.85;
    const el = -k * 1.9;
    arms(c, sh, sh, el, el);
  },
  stair(c, t) {
    const p = t * 6;
    const a = S(p);
    c.hipL.rotation.x = -0.5 + a * 0.4;
    c.hipR.rotation.x = -0.5 - a * 0.4;
    c.knL.rotation.x = 0.7 - a * 0.55;
    c.knR.rotation.x = 0.7 + a * 0.55;
    c.spine.rotation.x = 0.2;
    c.body.position.y = STAND_Y - 0.1 + Math.abs(a) * 0.04;
    arms(c, -0.55, -0.55, -0.7, -0.7);
  },
  curl(c, t) {
    const p = t * 3.5;
    c.hipL.rotation.x = -0.05;
    c.hipR.rotation.x = 0.05;
    c.shL.rotation.z = 0.12;
    c.shR.rotation.z = -0.12;
    c.elL.rotation.x = -cyc(p, 1) * 2.3 - 0.1;
    c.elR.rotation.x = -cyc(p + Math.PI, 1) * 2.3 - 0.1;
    c.spine.rotation.x = 0.03;
  },
  dbpress(c, t) {
    lying(c);
    const k = cyc(t, 3);
    const sh = -1.0 - k * 0.55;
    const el = -1.5 + k * 1.45;
    arms(c, sh, sh, el, el);
    c.shL.rotation.z = 0.5 - k * 0.45;
    c.shR.rotation.z = -0.5 + k * 0.45;
  },
  bench(c, t) {
    lying(c);
    const k = cyc(t, 2.6);
    const sh = -1.05 - k * 0.52;
    const el = -1.55 + k * 1.5;
    arms(c, sh, sh, el, el);
  },
  squat(c, t) {
    const k = cyc(t, 2.4);
    c.hipL.rotation.x = c.hipR.rotation.x = -k * 1.45;
    c.hipL.rotation.z = 0.12;
    c.hipR.rotation.z = -0.12;
    c.knL.rotation.x = c.knR.rotation.x = k * 1.95;
    c.body.position.y = STAND_Y - k * 0.42;
    c.spine.rotation.x = k * 0.55;
    c.shL.rotation.z = 1.35;
    c.shR.rotation.z = -1.35;
    c.shL.rotation.x = c.shR.rotation.x = 0.25;
    c.elL.rotation.z = 0;
    c.elL.rotation.x = c.elR.rotation.x = -1.5;
    c.head.rotation.x = -k * 0.4;
  },
  pulldown(c, t) {
    const k = cyc(t, 2.8);
    c.body.position.y = 0.08;
    c.spine.rotation.x = -0.15;
    c.hipL.rotation.x = c.hipR.rotation.x = -1.5;
    c.knL.rotation.x = c.knR.rotation.x = 1.5;
    const sh = -2.95 + k * 1.2;
    arms(c, sh, sh, -k * 1.5, -k * 1.5);
    c.shL.rotation.z = 0.35 + k * 0.3;
    c.shR.rotation.z = -0.35 - k * 0.3;
    c.head.rotation.x = -0.3;
  },
  legpress(c, t) {
    const k = cyc(t, 2.6);
    c.body.position.y = 0.12;
    c.body.rotation.x = -0.85;
    c.hipL.rotation.x = c.hipR.rotation.x = -2.05 + k * 0.7;
    c.knL.rotation.x = c.knR.rotation.x = 1.9 - k * 1.65;
    arms(c, 0.2, 0.2, -0.6, -0.6);
    c.shL.rotation.z = 0.35;
    c.shR.rotation.z = -0.35;
    c.head.rotation.x = 0.4;
  },
  cable(c, t) {
    const k = cyc(t, 2.6);
    c.hipL.rotation.x = -0.35;
    c.hipR.rotation.x = 0.3;
    c.knL.rotation.x = 0.35;
    c.spine.rotation.x = 0.25;
    c.shL.rotation.x = c.shR.rotation.x = -1.2 + k * 0.1;
    c.shL.rotation.z = 1.3 - k * 1.15;
    c.shR.rotation.z = -1.3 + k * 1.15;
    c.elL.rotation.x = c.elR.rotation.x = -0.3;
  },
  yoga(c, t) {
    const phase = Math.floor(t / 7) % 3;
    if (phase === 0) {
      // mekik
      lying(c, 0.12);
      const k = cyc(t, 2.4);
      c.spine.rotation.x = k * 0.7;
      c.hipL.rotation.x = c.hipR.rotation.x = 0.0 - 0.9;
      c.knL.rotation.x = c.knR.rotation.x = 1.6;
      arms(c, -2.7, -2.7, -2.1, -2.1);
    } else if (phase === 1) {
      // plank
      c.body.rotation.x = Math.PI / 2 - 0.28;
      c.body.position.y = 0.5;
      c.body.position.z = 0.35;
      arms(c, -Math.PI / 2 - 0.25, -Math.PI / 2 - 0.25, 0, 0);
      c.head.rotation.x = -0.3 + S(t * 2) * 0.05;
    } else {
      // ayakta esneme
      const s = S(t * 1.2) * 0.35;
      arms(c, -3.0, -3.0, -0.1, -0.1);
      c.spine.rotation.z = s;
      c.hipL.rotation.z = 0.18;
      c.hipR.rotation.z = -0.18;
    }
  },
  punch(c, t) {
    const p = t * 5;
    c.hipL.rotation.x = -0.35;
    c.hipR.rotation.x = 0.3;
    c.knL.rotation.x = 0.3;
    c.knR.rotation.x = 0.2;
    c.body.position.y = STAND_Y - 0.05 + Math.abs(S(p * 1.5)) * 0.03;
    c.spine.rotation.y = S(p) * 0.25;
    const pl = Math.max(0, S(p)) ** 3;
    const pr = Math.max(0, -S(p)) ** 3;
    arms(c, -1.25 - pl * 0.3, -1.25 - pr * 0.3, -2.0 + pl * 1.9, -2.0 + pr * 1.9);
    c.shL.rotation.z = -0.2;
    c.shR.rotation.z = 0.2;
  },
  locker(c, t) {
    arms(c, -1.1 + S(t * 3) * 0.15, -1.0 - S(t * 3) * 0.15, -0.7, -0.6);
    c.head.rotation.x = 0.1;
  },
  drink(c, t) {
    c.spine.rotation.x = 0.6;
    c.head.rotation.x = 0.3;
    arms(c, -0.6, 0.1, -0.5, -0.2);
  },
  buy(c, t) {
    arms(c, 0, -1.2 + S(t * 4) * 0.08, -0.1, -0.35);
    c.head.rotation.x = 0.15;
  },
  sit(c, t) {
    c.body.position.y = 0.06;
    c.hipL.rotation.x = c.hipR.rotation.x = -1.5;
    c.knL.rotation.x = c.knR.rotation.x = 1.5;
    arms(c, -0.5, -0.5, -0.8, -0.8);
    c.spine.rotation.x = 0.1 + S(t * 1.5) * 0.02;
    c.head.rotation.y = S(t * 0.5) * 0.4;
  },
  shower(c, t) {
    const s = S(t * 4) * 0.25;
    arms(c, -2.6 + s, -2.6 - s, -1.9, -1.9);
    c.shL.rotation.z = 0.5;
    c.shR.rotation.z = -0.5;
    c.head.rotation.x = -0.2;
  },
  hidden(c) {
    c.root.visible = false;
  },
  work(c, t) {
    arms(c, -0.75 + S(t * 9) * 0.04, -0.75 + C(t * 8) * 0.04, -0.85, -0.85);
    c.spine.rotation.x = 0.1;
    c.head.rotation.x = 0.2;
    c.head.rotation.y = S(t * 0.3) * 0.25;
  },
  greet(c, t) {
    arms(c, -0.4, -2.6, -0.4, -0.4 + S(t * 8) * 0.4);
    c.shR.rotation.z = -0.3;
  },
  mop(c, t) {
    const s = S(t * 3);
    c.spine.rotation.y = s * 0.35;
    c.spine.rotation.x = 0.2;
    arms(c, -0.85, -0.7, -0.6, -0.5);
    c.hipL.rotation.x = -0.15;
    c.hipR.rotation.x = 0.15;
  },
  repair(c, t) {
    c.body.position.y = 0.48;
    c.hipL.rotation.x = -1.6;
    c.hipR.rotation.x = -0.6;
    c.knL.rotation.x = 1.9;
    c.knR.rotation.x = 2.3;
    c.hipR.rotation.z = -0.2;
    c.spine.rotation.x = 0.35;
    arms(c, -1.0 + S(t * 6) * 0.2, -1.2 - S(t * 6) * 0.25, -0.9, -0.6);
    c.head.rotation.x = 0.4;
  },
  coach(c, t) {
    c.shL.rotation.z = 0.7;
    c.elL.rotation.x = -1.6;
    arms(c, -0.1, -1.0 + S(t * 3) * 0.45, -1.6, -0.6 + S(t * 3) * 0.3);
    c.head.rotation.x = S(t * 2.2) * 0.12;
  },
  cheer(c, t) {
    const k = Math.abs(S(t * 6));
    arms(c, -2.8, -2.8, -0.2, -0.2);
    c.shL.rotation.z = 0.3;
    c.shR.rotation.z = -0.3;
    c.body.position.y = STAND_Y + k * 0.12;
  },
};

function lying(c, y = 0.13) {
  c.body.rotation.x = -Math.PI / 2;
  c.body.position.y = y;
  c.body.position.z = 0.25;
  c.hipL.rotation.x = c.hipR.rotation.x = 0.35;
  c.knL.rotation.x = c.knR.rotation.x = 1.25;
  c.hipL.rotation.z = 0.15;
  c.hipR.rotation.z = -0.15;
}
