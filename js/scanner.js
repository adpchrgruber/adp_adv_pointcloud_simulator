import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const DEG = Math.PI / 180;
export const SCANNER_ORIGIN_Y = 1.47; // height of the mirror centre, the origin of every ray
export const BLIND_EL = -60; // like a real 300 degree scanner: bottom cone is not covered
export const MAX_RANGE = 40;
const TAIL = 48;

// ---------- Scanner 3D model ----------

function limb(a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

// "Faro Focus" by VAR Lab (CC-BY-4.0), a photogrammetry scan: one rigid mesh, so the
// rotating head and the static mount are separated by triangle height.
const FARO = {
  url: 'assets/faro_focus/scene.gltf',
  scale: 0.78,                                   // scan is ~1.3x oversize; real Focus S is 240 x 200 x 100 mm
  yaw: -40 * DEG,                                // turns the mirror slot to face +z
  mirror: new THREE.Vector3(0.01, 0.057, -0.01), // mirror centre in model units
  mountTopY: -0.128,                             // triangles below this stay static
};

function subsetMeshes(root, keepBelow) {
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.geometry, idx = src.index.array, pos = src.attributes.position, keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      let y = 0;
      for (let k = 0; k < 3; k++) y += v.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(o.matrixWorld).y;
      if ((y / 3 < FARO.mountTopY) === keepBelow) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.attributes = src.attributes;
    g.setIndex(keep);
    o.geometry = g;
    o.castShadow = o.receiveShadow = true;
  });
}

export function buildScannerModel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.4 });

  const top = new THREE.Vector3(0, 1.27, 0);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + 0.5;
    const leg = limb(top, new THREE.Vector3(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7), 0.02, dark);
    leg.castShadow = true;
    group.add(leg);
  }
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 24), dark);
  plate.position.y = 1.28;
  plate.castShadow = true;
  group.add(plate);

  const head = new THREE.Group();
  head.position.y = SCANNER_ORIGIN_Y;
  group.add(head);
  const mount = new THREE.Group();
  mount.position.y = SCANNER_ORIGIN_Y;
  group.add(mount);

  // places the mirror centre on the vertical axis, at the ray origin
  const m = FARO.mirror.clone().multiplyScalar(FARO.scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), FARO.yaw);
  const place = (obj) => {
    obj.scale.setScalar(FARO.scale);
    obj.rotation.y = FARO.yaw;
    obj.position.set(-m.x, -m.y, -m.z);
  };

  const ready = new GLTFLoader().loadAsync(FARO.url).then((gltf) => {
    const headScene = gltf.scene, mountScene = gltf.scene.clone(true);
    subsetMeshes(headScene, false);
    subsetMeshes(mountScene, true);
    place(headScene);
    place(mountScene);
    head.add(headScene);
    mount.add(mountScene);
  });

  return {
    group,
    ready,
    // headAz: head rotation (rad, 0 = +z); the mirror is inside the housing, its angle is not drawn
    setPose(headAz) {
      head.rotation.y = -headAz;
    },
  };
}

// ---------- Scan simulation ----------

function matRGB(m) {
  if (!m.userData.rgb) {
    const h = m.color.getHex();
    m.userData.rgb = [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  }
  return m.userData.rgb;
}

function turbo(t, o) {
  const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
  const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
  const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))));
  o[0] = Math.max(0, Math.min(255, r));
  o[1] = Math.max(0, Math.min(255, g));
  o[2] = Math.max(0, Math.min(255, b));
}

export function shade(mode, d, l, r, g, b, out) {
  if (mode === 'range') {
    turbo(Math.min(1, d / 14), out);
    const k = 0.6 + 0.4 * l;
    out[0] *= k; out[1] *= k; out[2] *= k;
  } else if (mode === 'intensity') {
    const v = 255 * Math.min(1, (0.15 + 0.85 * l) * Math.exp(-d / 30) * 1.25);
    out[0] = out[1] = out[2] = v;
  } else {
    const k = 0.45 + 0.55 * l;
    out[0] = r * k; out[1] = g * k; out[2] = b * k;
  }
}

export class ScanSim {
  constructor(targets) {
    this.targets = targets;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = MAX_RANGE;
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.nrm = new THREE.Vector3();
    this.tail = new Float32Array(TAIL * 3);
    this.TAIL = TAIL;
    this.onSample = null;
  }

  configure(W, H, origin) {
    this.W = W;
    this.H = H;
    this.origin.copy(origin);
    let nA = 0;
    for (let j = 0; j < H; j++) if (90 - (j + 0.5) * 180 / H >= BLIND_EL) nA++;
    this.nA = nA;
    this.totalRays = W * nA;
    this.state = new Uint8Array(W * H); // 0 unscanned, 1 hit, 2 miss
    this.dist = new Float32Array(W * H);
    this.lum = new Float32Array(W * H);
    this.base = new Uint8Array(W * H * 3);
    this.pos = new Float32Array(W * H * 3);
    this.reset();
  }

  reset() {
    this.c = 0;
    this.k = 0;
    this.done = false;
    this.rays = 0;
    this.tailN = 0;
    this.tailHead = 0;
    this.state.fill(0);
    this.cur = { headAz: 0, beta: 90 * DEG, col: 0, row: 0, range: 0, hit: new THREE.Vector3() };
  }

  pixelColor(idx, mode, out) {
    shade(mode, this.dist[idx], this.lum[idx], this.base[idx * 3], this.base[idx * 3 + 1], this.base[idx * 3 + 2], out);
  }

  step(maxRays, budgetMs) {
    const t0 = performance.now();
    let n = 0;
    while (n < maxRays && !this.done) {
      this.castOne();
      n++;
      if ((n & 7) === 0 && performance.now() - t0 > budgetMs) break;
    }
    return n;
  }

  castOne() {
    const { W, H, nA, c, k, origin, dir, nrm } = this;
    // One mirror revolution per head step: front half scans column c upward, back half scans column c+W/2 downward.
    let i, j;
    if (k < nA) { i = c; j = nA - 1 - k; } else { i = c + W / 2; j = k - nA; }
    const az = (i + 0.5) / W * Math.PI * 2;
    const el = (90 - (j + 0.5) * 180 / H) * DEG;
    dir.set(-Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));

    this.raycaster.set(origin, dir);
    const hit = this.raycaster.intersectObjects(this.targets, false)[0];
    const idx = i + j * W;
    const cur = this.cur;
    cur.headAz = (c + 0.5) / W * Math.PI * 2;
    cur.beta = k < nA ? el : Math.PI - el;
    cur.col = i;
    cur.row = j;

    let px, py, pz;
    if (hit) {
      nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      const rgb = matRGB(hit.object.material);
      this.state[idx] = 1;
      this.dist[idx] = hit.distance;
      this.lum[idx] = Math.abs(nrm.dot(dir));
      this.base[idx * 3] = rgb[0];
      this.base[idx * 3 + 1] = rgb[1];
      this.base[idx * 3 + 2] = rgb[2];
      px = hit.point.x; py = hit.point.y; pz = hit.point.z;
      cur.range = hit.distance;
    } else {
      this.state[idx] = 2;
      px = origin.x + dir.x * MAX_RANGE; py = origin.y + dir.y * MAX_RANGE; pz = origin.z + dir.z * MAX_RANGE;
      cur.range = 0;
    }
    cur.hit.set(px, py, pz);
    this.pos[idx * 3] = px; this.pos[idx * 3 + 1] = py; this.pos[idx * 3 + 2] = pz;
    const h = this.tailHead * 3;
    this.tail[h] = px; this.tail[h + 1] = py; this.tail[h + 2] = pz;
    this.tailHead = (this.tailHead + 1) % TAIL;
    this.tailN = Math.min(TAIL, this.tailN + 1);
    if (this.onSample) this.onSample(idx, !!hit, px, py, pz);

    this.rays++;
    if (++this.k >= 2 * nA) {
      this.k = 0;
      if (++this.c >= W / 2) this.done = true;
    }
  }
}

// ---------- Point cloud shown in the operator view ----------

export class CloudView {
  constructor() {
    this.material = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.n = 0;
  }

  reset(capacity) {
    this.points.geometry.dispose();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.pix = new Int32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.points.geometry = g;
    this.n = 0;
  }

  add(x, y, z, idx, rgb) {
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = rgb[0] / 255; this.col[i * 3 + 1] = rgb[1] / 255; this.col[i * 3 + 2] = rgb[2] / 255;
    this.pix[i] = idx;
    this.dirty = true;
  }

  recolor(sim, mode, tint = null) {
    const rgb = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      const p = this.pix[i];
      if (tint) {
        const k = 0.35 + 0.65 * sim.lum[p];
        rgb[0] = tint[0] * k; rgb[1] = tint[1] * k; rgb[2] = tint[2] * k;
      } else {
        sim.pixelColor(p, mode, rgb);
      }
      this.col[i * 3] = rgb[0] / 255; this.col[i * 3 + 1] = rgb[1] / 255; this.col[i * 3 + 2] = rgb[2] / 255;
    }
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, this.n);
    this.dirty = false;
  }
}

// ---------- Laser beam visual (fan of the most recent rays) ----------

export class BeamView {
  constructor() {
    this.group = new THREE.Group();
    this.pos = new Float32Array(TAIL * 6);
    this.col = new Float32Array(TAIL * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.lines.frustumCulled = false;
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    this.group.add(this.lines, this.dot);
  }

  update(sim) {
    const o = sim.origin;
    for (let a = 0; a < TAIL; a++) {
      const o6 = a * 6;
      if (a < sim.tailN) {
        const s = ((sim.tailHead - 1 - a + TAIL) % TAIL) * 3;
        const f = Math.pow(1 - a / TAIL, 2);
        this.pos.set([o.x, o.y, o.z, sim.tail[s], sim.tail[s + 1], sim.tail[s + 2]], o6);
        this.col.set([f, 0.12 * f, 0.08 * f, f, 0.12 * f, 0.08 * f], o6);
      } else {
        this.pos.set([o.x, o.y, o.z, o.x, o.y, o.z], o6);
        this.col.fill(0, o6, o6 + 6);
      }
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    this.dot.position.copy(sim.cur.hit);
    this.group.visible = sim.tailN > 0 && !sim.done;
  }
}
