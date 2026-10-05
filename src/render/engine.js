import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MAXW, MAXD } from '../data.js';
import { clamp, lerp } from '../game.js';

// Renderer, izometrik kamera, kontroller, ışıklar ve gün/gece döngüsü
export class Engine {
  constructor(container) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.canvas = r.domElement;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x9fd4f5);
    scene.fog = new THREE.Fog(0x9fd4f5, 90, 170);

    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;

    // Kamera
    this.zoom = 1;
    this.viewSize = 22;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(-this.viewSize * aspect / 2, this.viewSize * aspect / 2, this.viewSize / 2, -this.viewSize / 2, 0.1, 400);
    this.target = new THREE.Vector3(7, 0, MAXD - 5);
    this.targetGoal = this.target.clone();
    this.azimuth = Math.PI / 4; // kameranın hedefe göre yatay açısı
    this.azGoal = this.azimuth;
    this.elev = 0.62;
    this.zoomGoal = 1;
    this.updateCamera();

    // Işıklar
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6d6450, 0.9);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);

    // İç mekan lambaları (gece)
    this.interiorLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffe6c4, 0, 14, 1.6);
      l.position.set(0, 2.9, 0);
      scene.add(l);
      this.interiorLights.push(l);
    }

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    window.addEventListener('resize', () => this.resize());
    this._initControls();
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateCamera();
  }

  updateCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    const vs = this.viewSize / this.zoom;
    const c = this.camera;
    c.left = (-vs * aspect) / 2;
    c.right = (vs * aspect) / 2;
    c.top = vs / 2;
    c.bottom = -vs / 2;
    const dist = 80;
    c.position.set(
      this.target.x + Math.cos(this.elev) * Math.sin(this.azimuth) * dist,
      this.target.y + Math.sin(this.elev) * dist,
      this.target.z + Math.cos(this.elev) * Math.cos(this.azimuth) * dist,
    );
    c.lookAt(this.target);
    c.updateProjectionMatrix();
  }

  // Kamera yatay yönü (hedeften kameraya)
  camDir() {
    return { x: Math.sin(this.azimuth), z: Math.cos(this.azimuth) };
  }

  rotate(dir) {
    this.azGoal += (dir * Math.PI) / 2;
  }

  setZoom(z) {
    this.zoomGoal = clamp(z, 0.45, 2.6);
  }

  focus(x, z) {
    this.targetGoal.set(x, 0, z);
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 10);
    this.azimuth = lerp(this.azimuth, this.azGoal, k);
    this.zoom = lerp(this.zoom, this.zoomGoal, k);
    this.target.lerp(this.targetGoal, k);
    // sınırlar
    this.targetGoal.x = clamp(this.targetGoal.x, -12, MAXW + 12);
    this.targetGoal.z = clamp(this.targetGoal.z, -6, MAXD + 10);
    // klavye ile kaydırma
    const ks = this.keys;
    if (ks) {
      let mx = 0, mz = 0;
      if (ks.has('KeyW') || ks.has('ArrowUp')) mz -= 1;
      if (ks.has('KeyS') || ks.has('ArrowDown')) mz += 1;
      if (ks.has('KeyA') || ks.has('ArrowLeft')) mx -= 1;
      if (ks.has('KeyD') || ks.has('ArrowRight')) mx += 1;
      if (mx || mz) {
        const sp = (dt * 18) / this.zoom;
        const s = Math.sin(this.azimuth), c = Math.cos(this.azimuth);
        // ekran sağı = (cos, -sin), ekran yukarısı = (-sin, -cos)
        this.targetGoal.x += (mx * c + mz * s) * sp;
        this.targetGoal.z += (-mx * s + mz * c) * sp;
      }
    }
    this.updateCamera();
  }

  // Ekran koordinatından zemin noktası
  screenToGround(sx, sy, y = 0) {
    this.mouse.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.groundPlane.constant = -y;
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }

  pick(sx, sy, objects) {
    this.mouse.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  worldToScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight, vis: p.z < 1 };
  }

  _initControls() {
    const el = this.canvas;
    this.keys = new Set();
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.rotate(-1);
      if (e.code === 'KeyE') this.rotate(1);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('wheel', e => {
      e.preventDefault();
      this.setZoom(this.zoomGoal * (e.deltaY > 0 ? 0.88 : 1.13));
    }, { passive: false });

    // Sürükleyerek kaydırma (sol tuş sürükleme veya sağ/orta tuş)
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    this.dragMoved = false;
    el.addEventListener('pointerdown', e => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.zoomGoal };
        drag = null;
        return;
      }
      const g = this.screenToGround(e.clientX, e.clientY);
      drag = { sx: e.clientX, sy: e.clientY, g, button: e.button, start: this.targetGoal.clone() };
      this.dragMoved = false;
    });
    window.addEventListener('pointermove', e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setZoom((pinch.z * d) / pinch.d);
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!this.dragMoved && Math.hypot(dx, dy) > 6) this.dragMoved = true;
      if (this.dragMoved && (drag.button === 0 || drag.button === 2 || drag.button === 1) && !this.dragBlocked) {
        // ekran pikselini dünya birimine çevir
        const wpp = this.viewSize / this.zoom / window.innerHeight;
        const s = Math.sin(this.azimuth), c = Math.cos(this.azimuth);
        const rx = -dx * wpp, ry = dy * wpp / Math.sin(this.elev);
        this.targetGoal.x = drag.start.x + rx * c - ry * s;
        this.targetGoal.z = drag.start.z - rx * s - ry * c;
        this.target.copy(this.targetGoal);
      }
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      drag = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Gün ışığı: minute = gün içi dakika, interior = bina sınırları
  setTimeOfDay(minute, interior) {
    const h = minute / 60;
    // güneş açısı 6:00 doğar, 20:00 batar
    const dayT = clamp((h - 6) / 14, 0, 1);
    const sunAlt = Math.sin(dayT * Math.PI);
    const night = h < 5.5 || h > 21 ? 1 : h < 7 ? 1 - (h - 5.5) / 1.5 : h > 19.5 ? (h - 19.5) / 1.5 : 0;
    const n = clamp(night, 0, 1);
    const az = lerp(-1.2, 1.2, dayT);
    const cx = MAXW / 2, cz = MAXD / 2;
    this.sun.position.set(cx + Math.sin(az) * 40, 12 + sunAlt * 45, cz + Math.cos(az) * 25 + 10);
    this.sun.target.position.set(cx, 0, cz);
    const warm = 1 - sunAlt;
    this.sun.color.setRGB(1, lerp(0.96, 0.72, warm * warm), lerp(0.9, 0.55, warm * warm));
    this.sun.intensity = lerp(2.6, 0.05, n) * (0.55 + sunAlt * 0.45);
    this.hemi.intensity = lerp(0.95, 0.28, n);
    this.hemi.color.setRGB(lerp(0.88, 0.35, n), lerp(0.94, 0.42, n), lerp(1.0, 0.7, n));
    const day = new THREE.Color(0x9fd4f5);
    const dusk = new THREE.Color(0xf4a26b);
    const nightC = new THREE.Color(0x0e1a33);
    const bg = day.clone().lerp(dusk, clamp(warm * 1.4 - 0.5, 0, 1) * (1 - n)).lerp(nightC, n);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.scene.environmentIntensity = lerp(0.45, 0.15, n);
    this.nightFactor = n;
    // iç lambalar
    if (interior) {
      const { x0, z0, w, d } = interior;
      const cols = 2, rows = 2;
      this.interiorLights.forEach((l, i) => {
        const cx2 = x0 + (w * ((i % cols) + 0.5)) / cols;
        const cz2 = z0 + (d * (Math.floor(i / cols) + 0.5)) / rows;
        l.position.set(cx2, 2.9, cz2);
        l.distance = Math.max(w, d) * 0.9;
        l.intensity = n * 12 + 1.5;
      });
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
