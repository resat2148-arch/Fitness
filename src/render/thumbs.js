import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ITEMS } from '../data.js';
import { buildItemModel } from './models.js';

// Katalog kartları için her eşyanın 3D küçük resmini üretir.
export function generateThumbnails(size = 160) {
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    return out;
  }
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(3, 6, 4);
  scene.add(d);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  for (const type of Object.keys(ITEMS)) {
    const m = buildItemModel(type, 1);
    // odalarda kameraya bakan duvarları alçalt ki içi görünsün
    for (const w of m.userData.walls || []) {
      if (w.nx * 6 + w.nz * 7 > 0) {
        if (w.hideWhenLow) w.mesh.visible = false;
        else w.mesh.scale.y = Math.min(1, 0.45 / w.h);
      }
    }
    scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const ext = Math.max(sz.x, sz.y, sz.z) * 0.78;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.position.set(c.x + 6, c.y + 5, c.z + 7);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    r.render(scene, cam);
    out[type] = r.domElement.toDataURL('image/png');
    scene.remove(m);
    m.traverse(o => o.geometry && o.geometry.dispose());
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
