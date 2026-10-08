import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- materials: restrained palette, grey/white + blue accent + safety orange/yellow ----------
const matCache = new Map();

// procedural texture pack: pale birch plywood, light concrete, plaster (CUBE workshop, Civic Architects, is white, timber and concrete)
function canvasTex(size, repeatX, repeatY, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function plyTex(rx, ry) {
  return canvasTex(512, rx, ry, (g, s) => {
    g.fillStyle = '#ecd6b0';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 380; i++) {
      const y = rand() * s, a = 8 + rand() * 20, f = 0.01 + rand() * 0.02, p = rand() * 6;
      g.strokeStyle = `rgba(${150 + rand() * 40 | 0},${110 + rand() * 30 | 0},${60 + rand() * 30 | 0},${0.05 + rand() * 0.12})`;
      g.lineWidth = 0.5 + rand() * 1.5;
      g.beginPath();
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * f + p) * a * 0.15);
      g.stroke();
    }
    g.strokeStyle = 'rgba(120,90,50,0.35)'; // sheet joint
    g.strokeRect(0, 0, s, s);
  });
}
function concreteTex(rx, ry) {
  return canvasTex(512, rx, ry, (g, s) => {
    g.fillStyle = '#d6d7d5';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const v = 190 + rand() * 50 | 0;
      g.fillStyle = `rgba(${v},${v},${v - 2},${0.05 + rand() * 0.08})`;
      g.beginPath();
      g.arc(rand() * s, rand() * s, 10 + rand() * 60, 0, 6.3);
      g.fill();
    }
    for (let i = 0; i < 3000; i++) {
      const v = rand() * 255 | 0;
      g.fillStyle = `rgba(${v},${v},${v},0.05)`;
      g.fillRect(rand() * s, rand() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(90,92,94,0.5)'; // saw-cut joints
    g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
  });
}
function plasterTex(rx, ry) {
  return canvasTex(256, rx, ry, (g, s) => {
    g.fillStyle = '#f6f6f2';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const v = 225 + rand() * 30 | 0;
      g.fillStyle = `rgba(${v},${v},${v - 3},0.18)`;
      g.fillRect(rand() * s, rand() * s, 3, 3);
    }
  });
}
function mat(color, { r = 0.8, m = 0.05, e = 0, ei = 1, map = null, scan = null } = {}) {
  const key = [color, r, m, e, ei, map ? map.uuid : ''].join('|');
  if (!matCache.has(key)) {
    // polygonOffset pushes surfaces back so the scan points lying on them stay visible
    const mt = new THREE.MeshStandardMaterial({
      color, roughness: r, metalness: m, emissive: e, emissiveIntensity: ei, map,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    // the scan reads the colour from userData.rgb, so textured surfaces get their average tone
    if (scan !== null) mt.userData.rgb = [(scan >> 16) & 255, (scan >> 8) & 255, scan & 255];
    matCache.set(key, mt);
  }
  return matCache.get(key);
}

const M = {
  floor: mat(0xffffff, { r: 0.92, map: concreteTex(14 / 3, 11 / 3), scan: 0xd4d5d3 }),
  ceiling: mat(0xffffff, { r: 0.9, map: plyTex(14 / 2.4, 11 / 1.2), scan: 0xe9d3ad }),
  wallA: mat(0xffffff, { r: 0.95, map: plasterTex(14 / 4, 8.4 / 4), scan: 0xf6f6f2 }),
  wallB: mat(0xffffff, { r: 0.95, map: plasterTex(11 / 4, 8.4 / 4), scan: 0xf1f1ed }),
  white: mat(0xf4f5f6, { r: 0.55, m: 0.1 }),
  light: mat(0xe3e6e9, { r: 0.6, m: 0.15 }),
  grey: mat(0xbcc2c8, { r: 0.55, m: 0.3 }),
  dark: mat(0x4a4f56, { r: 0.6, m: 0.3 }),
  black: mat(0x24272c, { r: 0.7, m: 0.1 }),
  steel: mat(0xd2d7dc, { r: 0.35, m: 0.6 }),
  beam: mat(0xe2e5e8, { r: 0.6, m: 0.3 }),
  blue: mat(0x002fa7, { r: 0.5, m: 0.1 }),
  orange: mat(0xf26a10, { r: 0.45, m: 0.1 }),
  yellow: mat(0xf2c200, { r: 0.6 }),
  red: mat(0xc8321f, { r: 0.5 }),
  glass: mat(0x1b2733, { r: 0.15, m: 0.5 }),
  sky: mat(0xcfe8ff, { e: 0xcfe8ff, ei: 0.8 }),
  lamp: mat(0xfffbe8, { e: 0xfffbe8, ei: 1.3 }),
  screen: mat(0x2a8fb8, { e: 0x2a8fb8, ei: 0.9 }),
  ledG: mat(0x1fd37a, { e: 0x1fd37a, ei: 1.2 }),
  ledA: mat(0x8a6a10),
  ledR: mat(0x7a2018),
  wood: mat(0xe0bd8a, { r: 0.85 }),
  ply: mat(0xffffff, { r: 0.85, map: plyTex(1, 1), scan: 0xecd6b0 }),
  mdf: mat(0xd2b283, { r: 0.9 }),
  mdfLine: mat(0x9c8158, { r: 0.9 }),
  timberA: mat(0xe8c796, { r: 0.85 }),
  timberB: mat(0xdcb47c, { r: 0.85 }),
  pallet: mat(0xbb9c72, { r: 0.9 }),
  mortar: mat(0xd2cfc8, { r: 0.95 }),
  card: mat(0xd6b87f, { r: 0.9 }),
  rubber: mat(0x2a2c30, { r: 0.9 }),
  plant: mat(0x4f8a4b, { r: 0.9 }),
  soil: mat(0x3b3029, { r: 0.95 }),
  bricks: [0xb5523b, 0xa8472f, 0xc2603f, 0x9c4a36].map((c) => mat(c, { r: 0.95 })),
};

// ---------- geometry batching: parts are baked into one merged mesh per material ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

class Part {
  constructor() { this.items = []; }

  add(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);
    geo.applyMatrix4(_m4);
    this.items.push({ geo, material });
    return this;
  }
  box(w, h, d, material, x, y, z, rx, ry, rz) { return this.add(new THREE.BoxGeometry(w, h, d), material, x, y, z, rx, ry, rz); }
  cyl(r, h, material, x, y, z, rx, ry, rz, seg = 10) { return this.add(new THREE.CylinderGeometry(r, r, h, seg, 1), material, x, y, z, rx, ry, rz); }
  cone(rTop, rBot, h, material, x, y, z, rx, ry, rz, seg = 10) { return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), material, x, y, z, rx, ry, rz); }
  tube(pts, r, material, seg = 10, radial = 6) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return this.add(new THREE.TubeGeometry(curve, seg, r, radial, false), material);
  }
  sph(r, material, x, y, z) { return this.add(new THREE.SphereGeometry(r, 10, 7), material, x, y, z); }

  build(parent, { cast = true, receive = true } = {}) {
    const buckets = new Map();
    for (const { geo, material } of this.items) {
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(geo);
    }
    for (const [material, geos] of buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      geos.forEach((g) => g.dispose());
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      if (mesh.geometry.index.count >= 48 * 3) {
        mesh.geometry.userData.bvh = buildBVH(mesh.geometry);
        mesh.raycast = bvhRaycast;
      }
      parent.add(mesh);
    }
    this.items.length = 0;
  }
}

function plane(parent, w, h, material, pos, rot, receive) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

// a cylinder between two points whose ends follow moving parts (hoses)
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function stretch(mesh, a, b) {
  _d.subVectors(b, a);
  const len = _d.length() || 1e-6;
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(_up, _d.divideScalar(len));
}

// ---------- triangle BVH: merged meshes hold thousands of triangles, scanning needs a fast raycast ----------
const LEAF = 6;

function buildBVH(geo) {
  const pos = geo.attributes.position.array, idx = geo.index.array, n = idx.length / 3;
  const cen = new Float32Array(n * 3), order = new Uint32Array(n);
  for (let t = 0; t < n; t++) {
    order[t] = t;
    for (let k = 0; k < 3; k++) cen[t * 3 + k] = (pos[idx[t * 3] * 3 + k] + pos[idx[t * 3 + 1] * 3 + k] + pos[idx[t * 3 + 2] * 3 + k]) / 3;
  }
  const bounds = [], left = [], right = [], start = [], count = [];
  const build = (s, e) => {
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const cb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = s; i < e; i++) {
      const t = order[i];
      for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) {
        const p = pos[idx[t * 3 + v] * 3 + k];
        if (p < bb[k]) bb[k] = p;
        if (p > bb[k + 3]) bb[k + 3] = p;
      }
      for (let k = 0; k < 3; k++) {
        const c = cen[t * 3 + k];
        if (c < cb[k]) cb[k] = c;
        if (c > cb[k + 3]) cb[k + 3] = c;
      }
    }
    const id = bounds.length / 6;
    bounds.push(...bb);
    left.push(-1); right.push(-1); start.push(s); count.push(e - s);
    if (e - s > LEAF) {
      let ax = 0;
      for (let k = 1; k < 3; k++) if (cb[k + 3] - cb[k] > cb[ax + 3] - cb[ax]) ax = k;
      order.subarray(s, e).sort((a, b) => cen[a * 3 + ax] - cen[b * 3 + ax]);
      const mid = (s + e) >> 1;
      left[id] = build(s, mid);
      right[id] = build(mid, e);
      count[id] = 0;
    }
    return id;
  };
  build(0, n);
  return { bounds: Float32Array.from(bounds), left: Int32Array.from(left), right: Int32Array.from(right), start: Int32Array.from(start), count: Int32Array.from(count), order };
}

const _ray = new THREE.Ray(), _inv = new THREE.Matrix4(), _sph = new THREE.Sphere();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3(), _hit = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _stack = new Int32Array(64);

// replaces Mesh.raycast: returns only the nearest hit of this mesh (front faces only, like FrontSide materials)
function bvhRaycast(raycaster, intersects) {
  const geo = this.geometry, bvh = geo.userData.bvh;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  _sph.copy(geo.boundingSphere).applyMatrix4(this.matrixWorld);
  if (!raycaster.ray.intersectsSphere(_sph)) return;
  _inv.copy(this.matrixWorld).invert();
  _ray.copy(raycaster.ray).applyMatrix4(_inv);
  const o = _ray.origin, d = _ray.direction, ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
  const { bounds, left, right, start, count, order } = bvh;
  const pos = geo.attributes.position.array, idx = geo.index.array;
  let best = Infinity, bt = -1, sp = 0;
  _stack[sp++] = 0;
  while (sp) {
    const n = _stack[--sp], b = n * 6;
    let t0 = 0, t1 = best, a, c;
    a = (bounds[b] - o.x) * ix; c = (bounds[b + 3] - o.x) * ix;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    a = (bounds[b + 1] - o.y) * iy; c = (bounds[b + 4] - o.y) * iy;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    a = (bounds[b + 2] - o.z) * iz; c = (bounds[b + 5] - o.z) * iz;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    if (t0 > t1) continue;
    if (left[n] < 0) {
      for (let i = start[n], e = i + count[n]; i < e; i++) {
        const t = order[i] * 3, p = idx[t] * 3, q = idx[t + 1] * 3, r = idx[t + 2] * 3;
        _va.set(pos[p], pos[p + 1], pos[p + 2]);
        _vb.set(pos[q], pos[q + 1], pos[q + 2]);
        _vc.set(pos[r], pos[r + 1], pos[r + 2]);
        if (_ray.intersectTriangle(_va, _vb, _vc, true, _tmp)) {
          const dist = o.distanceTo(_tmp);
          if (dist < best) { best = dist; bt = order[i]; _hit.copy(_tmp); }
        }
      }
    } else { _stack[sp++] = left[n]; _stack[sp++] = right[n]; }
  }
  if (bt < 0) return;
  const t = bt * 3, a = idx[t], b = idx[t + 1], c = idx[t + 2];
  _va.fromArray(pos, a * 3); _vb.fromArray(pos, b * 3); _vc.fromArray(pos, c * 3);
  const normal = _vc.clone().sub(_vb).cross(_va.clone().sub(_vb)).normalize();
  const point = _hit.clone().applyMatrix4(this.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(point);
  if (distance < raycaster.near || distance > raycaster.far) return;
  intersects.push({ distance, point, object: this, face: { a, b, c, normal, materialIndex: 0 }, faceIndex: bt });
}

const ROOM = { w: 14, d: 11, h: 8.4 };
const SERVICE_Y = 4.2; // luminaires, trays and pipes hang at the former ceiling level

// ---------- room shell, ceiling services ----------
function buildRoom(g, C) {
  const hw = ROOM.w / 2, hd = ROOM.d / 2, H = ROOM.h, S = SERVICE_Y;
  // Planes face inward so they vanish when viewed from outside (dollhouse view); none of them casts a shadow.
  plane(g, ROOM.w, ROOM.d, M.floor, [0, 0, 0], [-PI / 2, 0, 0], true);
  plane(g, ROOM.w, ROOM.d, M.ceiling, [0, H, 0], [PI / 2, 0, 0], false);
  plane(g, ROOM.w, H, M.wallA, [0, H / 2, -hd], [0, 0, 0], true);
  plane(g, ROOM.w, H, M.wallA, [0, H / 2, hd], [0, PI, 0], true);
  plane(g, ROOM.d, H, M.wallB, [-hw, H / 2, 0], [0, PI / 2, 0], true);
  plane(g, ROOM.d, H, M.wallB, [hw, H / 2, 0], [0, -PI / 2, 0], true);

  // primary roof beams, and a secondary steel grid at service level
  for (let i = 0; i < 5; i++) {
    const x = -5.6 + i * 2.8;
    C.box(0.3, 0.6, ROOM.d, M.beam, x, H - 0.3, 0);
    C.box(0.06, 0.3, ROOM.d, M.beam, x, S - 0.15, 0);
    C.box(0.26, 0.03, ROOM.d, M.beam, x, S - 0.285, 0);
  }
  for (const z of [-4.2, 0, 4.2]) C.box(ROOM.w, 0.3, 0.2, M.beam, 0, H - 0.75, z);

  // luminaires on short rods just below the roof
  const LY = H - 0.9;
  for (const x of [-4.2, 0, 4.2]) for (const z of [-2.8, 2.8]) {
    C.box(1.6, 0.05, 0.32, M.grey, x, LY, z);
    C.box(1.5, 0.02, 0.24, M.lamp, x, LY - 0.032, z);
    for (const dx of [-0.6, 0.6]) C.cyl(0.008, H - LY, M.dark, x + dx, (H + LY) / 2, z, 0, 0, 0, 5);
  }

  // cable trays with cables and hangers
  for (const z of [-1.6, 1.6]) {
    const y = S - 0.6;
    C.box(12.6, 0.02, 0.32, M.grey, 0, y, z);
    C.box(12.6, 0.06, 0.015, M.grey, 0, y + 0.03, z - 0.16);
    C.box(12.6, 0.06, 0.015, M.grey, 0, y + 0.03, z + 0.16);
    C.box(12.6, 0.03, 0.06, M.black, 0, y + 0.025, z - 0.07);
    C.box(12.6, 0.025, 0.04, M.blue, 0, y + 0.02, z + 0.04);
    for (let x = -6.2; x <= 6.2; x += 0.5) C.box(0.02, 0.012, 0.32, M.grey, x, y + 0.01, z);
    for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) for (const dz of [-0.16, 0.16]) C.cyl(0.008, H - y, M.dark, x, (H + y) / 2, z + dz, 0, 0, 0, 5);
  }

  // dust-extraction pipes: headers, drops to the CNC mills and to the router hose
  const pipe = M.light;
  C.cyl(0.17, 9.85, pipe, -1.325, 3.55, -4.7, 0, 0, PI / 2, 14);
  C.cyl(0.14, 4.0, pipe, -6.25, 3.55, -2.85, PI / 2, 0, 0, 14);
  C.cyl(0.1, 0.9, pipe, 3.2, 3.55, -4.25, PI / 2, 0, 0, 12);
  C.sph(0.17, pipe, -6.25, 3.55, -4.7);
  C.sph(0.13, pipe, 3.2, 3.55, -4.7);
  for (const z of [-3.8, -1.2]) {
    C.cyl(0.07, 0.95, pipe, -6.25, 3.075, z, 0, 0, 0, 10);
    C.cyl(0.1, 0.03, M.dark, -6.25, 2.62, z, 0, 0, 0, 10);
  }
  C.cyl(0.1, 0.3, pipe, 3.2, 3.4, -3.8, 0, 0, 0, 12);
  C.cyl(0.125, 0.03, M.dark, 3.2, 3.26, -3.8, 0, 0, 0, 12);
  for (const x of [-5, -2.5, 0, 2.5]) {
    C.cyl(0.19, 0.04, M.steel, x, 3.55, -4.7, 0, 0, PI / 2, 14);
    C.cyl(0.008, H - 3.55, M.dark, x, (H + 3.55) / 2, -4.7, 0, 0, 0, 5);
  }

  // windows (front wall) and sliding door (back wall)
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    const z = hd - 0.04;
    C.box(2.0, 1.3, 0.03, M.sky, x, 2.5, z + 0.01);
    for (const [w, h, px, py] of [[2.2, 0.08, 0, 3.29], [2.2, 0.08, 0, 1.71], [0.08, 1.5, -1.06, 2.5], [0.08, 1.5, 1.06, 2.5], [0.05, 1.3, 0, 2.5], [2.0, 0.05, 0, 2.5]]) C.box(w, h, 0.06, M.dark, x + px, py, z);
    C.box(2.4, 0.04, 0.14, M.light, x, 1.66, z - 0.03);
  }
  // clerestory windows high on the front and side walls
  for (const x of [-5.25, -1.75, 1.75, 5.25]) {
    const z = hd - 0.04;
    C.box(3.0, 1.6, 0.03, M.sky, x, 6.6, z + 0.01);
    for (const [w, h, px, py] of [[3.2, 0.08, 0, 7.44], [3.2, 0.08, 0, 5.76], [0.08, 1.7, -1.56, 6.6], [0.08, 1.7, 1.56, 6.6], [0.05, 1.6, 0, 6.6]]) C.box(w, h, 0.06, M.dark, x + px, py, z);
  }
  for (const sx of [-1, 1]) for (const z of [-3, 0, 3]) {
    const x = sx * (hw - 0.04);
    C.box(0.03, 1.6, 2.4, M.sky, x - sx * 0.01, 6.6, z);
    for (const [h, d, pz, py] of [[0.08, 2.6, 0, 7.44], [0.08, 2.6, 0, 5.76], [1.7, 0.08, -1.26, 6.6], [1.7, 0.08, 1.26, 6.6]]) C.box(0.06, h, d, M.dark, x, py, z + pz);
  }
  C.box(3.4, 3.0, 0.08, M.light, -1.2, 1.5, -hd + 0.04);
  for (let i = 1; i < 4; i++) C.box(0.03, 2.9, 0.02, M.grey, -2.9 + i * 0.85, 1.5, -hd + 0.09);
  C.box(0.08, 3.0, 0.1, M.dark, 0.5, 1.5, -hd + 0.08);
  C.box(0.04, 0.5, 0.05, M.steel, 0.38, 1.3, -hd + 0.11);
  C.box(4.2, 0.12, 0.12, M.dark, -1.0, 3.12, -hd + 0.1);
  C.box(3.4, 0.1, 0.1, M.yellow, -1.2, 0.05, -hd + 0.1);
  C.box(0.2, 3.1, 0.12, M.dark, -3.0, 1.55, -hd + 0.07);

  // baseboards
  C.box(ROOM.w, 0.12, 0.03, M.dark, 0, 0.06, -hd + 0.015);
  C.box(ROOM.w, 0.12, 0.03, M.dark, 0, 0.06, hd - 0.015);
  C.box(0.03, 0.12, ROOM.d, M.dark, -hw + 0.015, 0.06, 0);
  C.box(0.03, 0.12, ROOM.d, M.dark, hw - 0.015, 0.06, 0);
}

// ---------- floor markings and furniture ----------
function floorRect(P, cx, cz, w, d) {
  const y = 0.006, t = 0.08, c = M.yellow;
  P.box(w, 0.012, t, c, cx, y, cz - d / 2);
  P.box(w, 0.012, t, c, cx, y, cz + d / 2);
  P.box(t, 0.012, d, c, cx - w / 2, y, cz);
  P.box(t, 0.012, d, c, cx + w / 2, y, cz);
}

// black chevrons over a yellow line
function hazardEdge(P, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
  for (let s = 0.12; s < len - 0.1; s += 0.3) {
    const t = (s + 0.075) / len;
    P.box(0.08, 0.004, 0.14, M.black, x0 + (x1 - x0) * t, 0.0135, z0 + (z1 - z0) * t, 0, a + 0.6, 0);
  }
}

function pallet(P, cx, cz, w, d, h = 0.15) {
  const bh = h - 0.04;
  for (let i = 0; i < 3; i++) P.box(w, 0.02, 0.1, M.pallet, cx, 0.01, cz - d / 2 + 0.05 + i * (d - 0.1) / 2);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P.box(0.1, bh, 0.1, M.pallet, cx - w / 2 + 0.05 + i * (w - 0.1) / 2, 0.02 + bh / 2, cz - d / 2 + 0.05 + j * (d - 0.1) / 2);
  const n = Math.max(4, Math.round(d / 0.16));
  for (let k = 0; k < n; k++) P.box(w, 0.02, d / n - 0.02, M.pallet, cx, h - 0.01, cz - d / 2 + (k + 0.5) * d / n);
}

function brick(P, x, y, z, ry, i = Math.floor(rand() * 4), turned = false) {
  P.box(turned ? 0.15 : 0.3, 0.1, turned ? 0.3 : 0.15, M.bricks[i % 4], x, y, z, 0, ry, 0);
}

function brickWall(P, cx, cz) {
  pallet(P, cx, cz, 2.2, 0.7);
  const rows = 11, pitch = 0.112;
  for (let row = 0; row < rows; row++) {
    const n = (row % 2 ? 6 : 7) - Math.max(0, row - 6) * 2; // stepped: still under construction
    if (n <= 0) continue;
    const x0 = cx - 0.97 + (row % 2 ? 0.16 : 0);
    P.box(n * 0.325 - 0.025, 0.012, 0.12, M.mortar, x0 + (n - 1) * 0.1625, 0.156 + row * pitch, cz);
    for (let i = 0; i < n; i++) brick(P, x0 + i * 0.325, 0.212 + row * pitch, cz + (rand() - 0.5) * 0.015, (rand() - 0.5) * 0.04);
  }
  for (let i = 0; i < 5; i++) brick(P, cx + 1.25 + rand() * 0.15, 0.05, cz + 0.55 + rand() * 0.2, rand() * PI);
}

function brickStack(P, cx, cz) {
  pallet(P, cx, cz, 1.0, 0.8);
  for (let l = 0; l < 5; l++) {
    const y = 0.2 + l * 0.1;
    if (l % 2 === 0) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) brick(P, cx - 0.3 + i * 0.3, y, cz - 0.225 + j * 0.15, 0, (i + j + l) % 4);
    } else {
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) brick(P, cx - 0.375 + i * 0.15, y, cz - 0.15 + j * 0.3, 0, (i + j + l) % 4, true);
    }
  }
  for (const dx of [-0.25, 0.25]) {
    P.box(0.018, 0.004, 0.62, M.black, cx + dx, 0.652, cz);
    for (const s of [-1, 1]) P.box(0.018, 0.5, 0.004, M.black, cx + dx, 0.4, cz + s * 0.3);
  }
}

function timberStack(P, x, z) {
  pallet(P, x, z, 1.8, 0.9);
  for (let r = 0; r < 5; r++) for (let i = 0; i < 5; i++) {
    const len = 1.62 + rand() * 0.12;
    P.box(len, 0.1, 0.15, (r + i) % 2 ? M.timberA : M.timberB, x + (rand() - 0.5) * 0.06, 0.2 + r * 0.1, z - 0.34 + i * 0.17);
  }
  for (const dx of [-0.5, 0.5]) {
    P.box(0.02, 0.004, 0.84, M.black, x + dx, 0.652, z);
    for (const s of [-1, 1]) P.box(0.02, 0.5, 0.004, M.black, x + dx, 0.4, z + s * 0.42);
  }
}

function shelf(P, x, z, len) {
  const lv = [0.25, 0.8, 1.35, 1.9];
  for (const dz of [-len / 2, len / 2]) for (const sx of [-0.24, 0.24]) {
    P.box(0.05, 2.2, 0.05, M.blue, x + sx, 1.1, z + dz);
    P.box(0.1, 0.02, 0.1, M.dark, x + sx, 0.01, z + dz);
  }
  for (const sx of [-0.24, 0.24]) P.box(0.02, 0.025, len, M.grey, x + sx, 2.15, z);
  const binCols = [M.white, M.light, M.blue, M.yellow, M.grey];
  for (const y of lv) {
    P.box(0.52, 0.025, len, M.light, x, y, z);
    P.box(0.52, 0.04, 0.02, M.orange, x, y - 0.03, z - len / 2 + 0.01);
    P.box(0.52, 0.04, 0.02, M.orange, x, y - 0.03, z + len / 2 - 0.01);
    let zz = z - len / 2 + 0.12;
    while (zz < z + len / 2 - 0.3) {
      const w = 0.22 + rand() * 0.2, h = 0.14 + rand() * 0.2, kind = rand();
      const yc = y + 0.0125 + h / 2, top = y + 0.0125 + h;
      if (kind < 0.5) { // plastic bin: body, lighter rim, label, grip slot
        P.box(0.4, h, w, binCols[Math.floor(rand() * binCols.length)], x, yc, zz + w / 2);
        P.box(0.42, 0.02, w + 0.02, M.white, x, top, zz + w / 2);
        P.box(0.005, 0.045, w * 0.6, M.white, x + 0.2, yc + h * 0.1, zz + w / 2);
        P.box(0.005, 0.03, w * 0.5, M.dark, x + 0.2, top - 0.05, zz + w / 2);
      } else if (kind < 0.8) { // cardboard box with tape
        P.box(0.4, h, w, M.card, x, yc, zz + w / 2);
        P.box(0.402, 0.004, w, M.white, x, top - 0.002, zz + w / 2);
      } else { // tub
        P.cyl(Math.min(0.17, w / 2), h, M.grey, x, yc, zz + w / 2, 0, 0, 0, 12);
        P.cyl(Math.min(0.175, w / 2 + 0.005), 0.02, M.dark, x, top, zz + w / 2, 0, 0, 0, 12);
      }
      zz += w + 0.06;
    }
  }
}

function workbench(P, x, z, len) {
  P.box(0.8, 0.06, len, M.wood, x, 0.9, z);
  P.box(0.82, 0.02, len + 0.02, M.dark, x, 0.865, z);
  for (const dz of [-len / 2 + 0.1, len / 2 - 0.1]) for (const dx of [-0.33, 0.33]) {
    P.box(0.06, 0.84, 0.06, M.dark, x + dx, 0.42, z + dz);
    P.box(0.1, 0.02, 0.1, M.black, x + dx, 0.01, z + dz);
  }
  P.box(0.74, 0.04, len - 0.2, M.grey, x, 0.25, z);
  for (const dx of [-0.33, 0.33]) P.box(0.04, 0.04, len - 0.2, M.dark, x + dx, 0.5, z);
  // drawer unit under the bench with three drawers
  const dz = z + len / 2 - 0.65;
  P.box(0.7, 0.62, 1.0, M.light, x, 0.52, dz);
  for (let k = 0; k < 3; k++) {
    P.box(0.012, 0.17, 0.92, M.white, x - 0.356, 0.3 + k * 0.2, dz);
    P.box(0.03, 0.025, 0.3, M.steel, x - 0.375, 0.34 + k * 0.2, dz);
  }
  // vise at the front end
  const vz = z - len / 2 + 0.5;
  P.box(0.22, 0.1, 0.2, M.blue, x - 0.15, 0.98, vz);
  P.box(0.05, 0.1, 0.2, M.steel, x - 0.28, 1.0, vz);
  P.cyl(0.012, 0.28, M.steel, x - 0.15, 0.985, vz - 0.22, PI / 2, 0, 0, 6);
  P.cyl(0.012, 0.18, M.steel, x - 0.15, 0.985, vz - 0.36, 0, 0, PI / 2, 6);
  // laptop, caliper, mug
  const lz = z - 0.1;
  P.box(0.3, 0.015, 0.22, M.dark, x + 0.1, 0.9375, lz);
  P.box(0.3, 0.2, 0.01, M.black, x + 0.1, 1.04, lz - 0.11, -0.25, 0, 0);
  P.box(0.27, 0.17, 0.005, M.screen, x + 0.1, 1.04, lz - 0.105, -0.25, 0, 0);
  P.box(0.2, 0.005, 0.02, M.steel, x + 0.2, 0.9325, z - 0.6);
  P.cyl(0.035, 0.09, M.white, x - 0.2, 0.975, z - 0.6, 0, 0, 0, 12);
  // tool board on the right wall with hanging tools
  const wx = 6.97;
  P.box(0.02, 1.0, 2.4, M.light, wx, 1.75, z + 0.4);
  for (let i = 0; i < 9; i++) {
    const tz = z - 0.65 + i * 0.26, kind = i % 3;
    if (kind === 0) { P.box(0.02, 0.4, 0.035, M.steel, wx - 0.02, 1.7, tz); P.box(0.02, 0.07, 0.07, M.steel, wx - 0.02, 1.9, tz); }
    else if (kind === 1) { P.box(0.03, 0.3, 0.03, M.wood, wx - 0.025, 1.65, tz); P.box(0.03, 0.06, 0.14, M.dark, wx - 0.025, 1.83, tz); }
    else { P.box(0.02, 0.25, 0.06, M.orange, wx - 0.02, 1.68, tz); P.box(0.02, 0.1, 0.05, M.dark, wx - 0.02, 1.9, tz); }
  }
  P.box(0.1, 0.03, 2.3, M.dark, wx - 0.05, 1.18, z + 0.4);
}

function printer3d(P, x, y, z) {
  for (const sx of [-0.23, 0.23]) for (const sz of [-0.23, 0.23]) P.box(0.03, 0.46, 0.03, M.white, x + sx, y + 0.25, z + sz);
  P.box(0.5, 0.06, 0.5, M.dark, x, y + 0.03, z);
  P.box(0.4, 0.015, 0.4, M.grey, x, y + 0.075, z);
  P.box(0.5, 0.03, 0.5, M.white, x, y + 0.485, z);
  P.box(0.03, 0.03, 0.46, M.steel, x - 0.2, y + 0.3, z);
  P.box(0.03, 0.03, 0.46, M.steel, x + 0.2, y + 0.3, z);
  P.box(0.42, 0.03, 0.03, M.steel, x, y + 0.3, z);
  P.box(0.08, 0.06, 0.06, M.blue, x, y + 0.27, z);
  P.cyl(0.1, 0.06, M.orange, x + 0.1, y + 0.56, z - 0.05, 0, 0, PI / 2, 16);
  P.cyl(0.03, 0.07, M.white, x + 0.1, y + 0.56, z - 0.05, 0, 0, PI / 2, 8);
  P.box(0.12, 0.1, 0.12, M.blue, x, y + 0.14, z + 0.02);
  P.box(0.14, 0.08, 0.02, M.screen, x, y + 0.04, z + 0.25);
}

function stool(P, x, z, seat) {
  P.cyl(0.17, 0.04, seat, x, 0.64, z, 0, 0, 0, 14);
  P.cyl(0.02, 0.58, M.steel, x, 0.33, z, 0, 0, 0, 8);
  for (let k = 0; k < 4; k++) P.box(0.34, 0.02, 0.03, M.dark, x, 0.03, z, 0, k * PI / 4, 0);
  P.cyl(0.13, 0.015, M.dark, x, 0.25, z, 0, 0, 0, 12);
}

function trolley(P, x, z) {
  for (const y of [0.18, 0.62]) P.box(0.8, 0.03, 0.5, M.light, x, y, z);
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.23, 0.23]) {
    P.box(0.025, 0.65, 0.025, M.dark, x + sx, 0.4, z + sz);
    P.cyl(0.05, 0.03, M.black, x + sx, 0.05, z + sz, 0, 0, PI / 2, 10);
  }
  P.box(0.025, 0.025, 0.5, M.dark, x - 0.38, 0.95, z);
  for (const sz of [-0.23, 0.23]) P.box(0.025, 0.3, 0.025, M.dark, x - 0.38, 0.8, z + sz);
  P.box(0.3, 0.16, 0.22, M.red, x - 0.15, 0.285, z - 0.1);
  P.box(0.28, 0.08, 0.2, M.blue, x + 0.2, 0.25, z + 0.1);
  P.box(0.5, 0.05, 0.3, M.card, x, 0.675, z);
  P.cyl(0.04, 0.2, M.orange, x + 0.2, 0.78, z + 0.1, 0, 0, 0, 8);
  P.box(0.12, 0.03, 0.05, M.steel, x - 0.2, 0.71, z - 0.1);
}

function wasteBin(P, x, z, color) {
  P.cyl(0.2, 0.5, color, x, 0.25, z, 0, 0, 0, 16);
  P.cyl(0.175, 0.012, M.black, x, 0.5, z, 0, 0, 0, 16);
}

function extinguisher(P, x, z) {
  P.box(0.3, 0.3, 0.01, M.red, x, 1.7, z - 0.07);
  P.box(0.12, 0.03, 0.012, M.white, x, 1.68, z - 0.065);
  P.cyl(0.07, 0.4, M.red, x, 1.0, z, 0, 0, 0, 14);
  P.cyl(0.071, 0.05, M.black, x, 0.83, z, 0, 0, 0, 14);
  P.cyl(0.028, 0.08, M.steel, x, 1.24, z, 0, 0, 0, 8);
  P.box(0.1, 0.02, 0.025, M.black, x, 1.3, z);
  P.tube([[x + 0.03, 1.25, z], [x + 0.1, 1.15, z + 0.05], [x + 0.08, 0.95, z + 0.07]], 0.01, M.black, 8, 5);
  P.box(0.16, 0.025, 0.04, M.dark, x, 1.15, z - 0.065);
  P.box(0.16, 0.025, 0.04, M.dark, x, 0.9, z - 0.065);
}

function plant(P, x, z) {
  P.cone(0.17, 0.12, 0.3, M.white, x, 0.15, z, 0, 0, 0, 14);
  P.cyl(0.155, 0.01, M.soil, x, 0.3, z, 0, 0, 0, 14);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7, t = 0.25 + rand() * 0.35;
    P.cone(0.0, 0.05, 0.5, M.plant, x + Math.cos(a) * 0.08, 0.55, z + Math.sin(a) * 0.08, Math.sin(a) * t, 0, -Math.cos(a) * t, 5);
  }
}

// ---------- CNC mill ----------
function cncMill(x, z, ry, body, accent) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const P = new Part();

  for (const sx of [-0.88, 0.88]) for (const sz of [-0.68, 0.68]) P.cyl(0.06, 0.1, M.dark, sx, 0.05, sz, 0, 0, 0, 8);
  P.box(1.92, 0.08, 1.52, M.black, 0, 0.14, 0);
  P.box(2.0, 0.72, 1.6, M.white, 0, 0.54, 0);
  P.box(2.02, 0.06, 1.62, accent, 0, 0.91, 0);
  P.box(2.0, 1.3, 1.6, body, 0, 1.59, 0);
  P.box(2.04, 0.04, 1.64, M.grey, 0, 2.26, 0);
  P.box(2.0, 0.05, 0.012, accent, 0, 2.19, 0.806);

  // door: frame, glass, handle, rails, rollers
  const dx = -0.15, dy = 1.6;
  P.box(1.36, 0.05, 0.04, M.steel, dx, dy + 0.405, 0.82);
  P.box(1.36, 0.05, 0.04, M.steel, dx, dy - 0.405, 0.82);
  P.box(0.05, 0.86, 0.04, M.steel, dx - 0.655, dy, 0.82);
  P.box(0.05, 0.86, 0.04, M.steel, dx + 0.655, dy, 0.82);
  P.box(1.26, 0.76, 0.02, M.glass, dx, dy, 0.81);
  P.box(0.035, 0.5, 0.035, M.steel, 0.44, 1.6, 0.9);
  for (const y of [1.4, 1.8]) P.box(0.03, 0.03, 0.07, M.steel, 0.44, y, 0.86);
  P.box(1.9, 0.05, 0.07, M.grey, -0.05, 2.1, 0.835);
  P.box(1.9, 0.04, 0.06, M.grey, -0.05, 1.14, 0.835);
  for (const rx of [-0.6, 0.3]) P.cyl(0.025, 0.03, M.dark, rx, 2.07, 0.86, PI / 2, 0, 0, 8);

  // base cabinet: seams, handles, label, nameplate
  for (const sx of [-0.5, 0.2]) P.box(0.012, 0.7, 0.006, M.grey, sx, 0.54, 0.802);
  for (const sx of [-0.55, -0.45, 0.15, 0.25]) P.box(0.02, 0.14, 0.025, M.steel, sx, 0.62, 0.815);
  P.box(0.18, 0.12, 0.01, M.yellow, -0.85, 0.55, 0.805);
  P.box(0.12, 0.012, 0.012, M.black, -0.85, 0.59, 0.81);
  P.box(0.05, 0.05, 0.012, M.black, -0.85, 0.54, 0.81, 0, 0, PI / 4);
  P.box(0.3, 0.05, 0.008, accent, 0.6, 0.5, 0.804);

  // side +x: hinged service door with hinges, lock and warning label
  P.box(0.012, 0.9, 0.7, M.light, 1.006, 1.55, -0.1);
  for (const y of [1.2, 1.55, 1.9]) P.cyl(0.015, 0.1, M.steel, 1.012, y, -0.46, 0, 0, 0, 6);
  P.cyl(0.02, 0.03, M.dark, 1.02, 1.55, 0.2, 0, 0, PI / 2, 8);
  P.box(0.02, 0.1, 0.03, M.steel, 1.02, 1.45, 0.2);
  P.box(0.012, 0.14, 0.12, M.yellow, 1.014, 1.95, 0.0);
  P.box(0.013, 0.05, 0.05, M.black, 1.016, 1.95, 0.0, PI / 4, 0, 0);
  // side -x: tool-changer cutout with carousel pockets
  P.box(0.012, 0.56, 0.62, M.dark, -1.006, 1.55, 0);
  P.box(0.014, 0.46, 0.52, M.black, -1.008, 1.55, 0);
  P.cyl(0.2, 0.02, M.grey, -1.012, 1.55, 0, 0, 0, PI / 2, 14);
  for (let k = 0; k < 8; k++) P.cyl(0.018, 0.03, M.steel, -1.016, 1.55 + Math.cos(k * PI / 4) * 0.14, Math.sin(k * PI / 4) * 0.14, 0, 0, PI / 2, 6);
  // louvres both sides
  for (const sx of [-1.008, 1.008]) for (let k = 0; k < 6; k++) P.box(0.02, 0.025, 0.62, M.dark, sx, 0.4 + k * 0.075, 0.1);

  // control panel on a swing arm: screen, keys, buttons, E-stop, handwheel
  P.cyl(0.035, 0.14, M.dark, 0.78, 1.45, 0.83, 0, 0, 0, 8);
  P.box(0.08, 0.08, 0.3, M.dark, 0.78, 1.45, 0.95);
  P.box(0.45, 0.55, 0.1, M.dark, 0.78, 1.45, 1.05);
  P.box(0.43, 0.53, 0.012, M.black, 0.78, 1.45, 1.105);
  P.box(0.36, 0.24, 0.008, M.screen, 0.78, 1.58, 1.114);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) P.box(0.04, 0.025, 0.01, r === 0 ? M.grey : M.light, 0.62 + i * 0.065, 1.4 - r * 0.04, 1.115);
  P.cyl(0.018, 0.015, M.ledG, 0.66, 1.25, 1.118, PI / 2, 0, 0, 8);
  P.cyl(0.018, 0.015, M.black, 0.72, 1.25, 1.118, PI / 2, 0, 0, 8);
  P.cyl(0.018, 0.015, M.orange, 0.78, 1.25, 1.118, PI / 2, 0, 0, 8);
  P.cyl(0.05, 0.015, M.yellow, 0.9, 1.26, 1.118, PI / 2, 0, 0, 12);
  P.cyl(0.035, 0.03, M.red, 0.9, 1.26, 1.13, PI / 2, 0, 0, 12);
  P.cyl(0.04, 0.02, M.steel, 0.64, 1.18, 1.12, PI / 2, 0, 0, 12);

  // roof: extractor with collar, coolant tank, light tower
  P.box(0.5, 0.12, 0.5, M.grey, 0, 2.32, -0.45);
  P.cyl(0.2, 0.04, M.dark, 0, 2.39, -0.45, 0, 0, 0, 14);
  P.cyl(0.1, 0.16, M.steel, 0, 2.46, -0.45, 0, 0, 0, 12);
  P.cyl(0.13, 0.03, M.dark, 0, 2.55, -0.45, 0, 0, 0, 12);
  for (let k = 0; k < 5; k++) P.box(0.4, 0.012, 0.03, M.dark, 0, 2.325, -0.62 + k * 0.08);
  P.box(0.45, 0.25, 0.4, M.dark, -0.75, 2.39, 0.15);
  P.box(0.3, 0.02, 0.2, M.grey, -0.75, 2.52, 0.15);
  P.cyl(0.02, 0.28, M.steel, 0.85, 2.4, -0.6, 0, 0, 0, 6);
  P.box(0.1, 0.02, 0.1, M.dark, 0.85, 2.275, -0.6);
  P.cyl(0.045, 0.07, M.ledR, 0.85, 2.58, -0.6, 0, 0, 0, 10);
  P.cyl(0.045, 0.07, M.ledA, 0.85, 2.65, -0.6, 0, 0, 0, 10);
  P.cyl(0.045, 0.07, M.ledG, 0.85, 2.72, -0.6, 0, 0, 0, 10);
  P.cyl(0.05, 0.015, M.dark, 0.85, 2.77, -0.6, 0, 0, 0, 10);
  // coolant hose from the tank down the front-left corner
  P.tube([[-0.8, 2.3, 0.3], [-0.9, 2.5, 0.55], [-1.02, 2.2, 0.78], [-1.03, 1.7, 0.84], [-1.0, 1.3, 0.9], [-0.9, 1.1, 0.86]], 0.02, M.black, 14, 5);

  // chip conveyor and bin at the back
  P.box(0.7, 0.5, 0.5, M.grey, -0.2, 0.25, -1.05);
  P.box(0.62, 0.02, 0.42, M.dark, -0.2, 0.51, -1.05);
  for (let k = 0; k < 6; k++) P.box(0.04 + rand() * 0.05, 0.02, 0.03, M.steel, -0.35 + rand() * 0.3, 0.53, -1.0 - rand() * 0.15, 0, rand() * PI, 0);
  P.box(0.46, 0.04, 0.55, M.steel, -0.2, 0.5, -0.98, 0.5, 0, 0);
  for (const sx of [-0.23, 0.23]) P.box(0.03, 0.08, 0.55, M.dark, -0.2 + sx, 0.53, -0.98, 0.5, 0, 0);

  P.build(g);
  return g;
}

// ---------- gantry router ----------
function gantryRouter(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const P = new Part();

  for (const sx of [-1.5, 1.5]) for (const sz of [-0.75, 0.75]) {
    P.box(0.12, 0.8, 0.12, M.dark, sx, 0.4, sz);
    P.cyl(0.08, 0.03, M.black, sx, 0.015, sz, 0, 0, 0, 10);
    P.cyl(0.015, 0.05, M.steel, sx, 0.05, sz, 0, 0, 0, 6);
  }
  for (const sz of [-0.75, 0.75]) P.box(2.9, 0.06, 0.06, M.dark, 0, 0.25, sz);
  for (const sx of [-1.5, 1.5]) P.box(0.06, 0.06, 1.5, M.dark, sx, 0.25, 0);
  P.box(3.2, 0.15, 1.7, M.dark, 0, 0.82, 0);
  // control cabinet and vacuum pump under the bed
  P.box(0.8, 0.5, 0.6, M.white, -0.7, 0.45, 0);
  for (let k = 0; k < 5; k++) P.box(0.5, 0.015, 0.012, M.grey, -0.7, 0.3 + k * 0.05, 0.306);
  P.box(0.05, 0.2, 0.012, M.dark, -0.5, 0.55, 0.306);
  P.cyl(0.2, 0.42, M.blue, 0.6, 0.4, 0, 0, 0, 0, 16);
  P.cyl(0.21, 0.04, M.dark, 0.6, 0.63, 0, 0, 0, 0, 16);
  P.tube([[0.6, 0.64, 0], [0.5, 0.72, 0.2], [0.2, 0.745, 0.35], [-0.2, 0.745, 0.4]], 0.03, M.black, 12, 6);
  // spoilboard with vacuum grooves, sheets, hold-downs
  P.box(2.9, 0.06, 1.5, M.mdf, 0, 0.93, 0);
  for (let k = 0; k < 7; k++) P.box(2.9, 0.004, 0.012, M.mdfLine, 0, 0.963, -0.675 + k * 0.225);
  for (let k = 0; k < 11; k++) P.box(0.012, 0.004, 1.5, M.mdfLine, -1.38 + k * 0.276, 0.9635, 0);
  P.box(1.2, 0.04, 0.8, M.ply, -0.5, 0.98, 0.1);
  P.box(0.3, 0.025, 0.2, M.ply, 0.4, 0.9825, -0.35, 0, 0.3, 0);
  P.box(0.2, 0.025, 0.25, M.ply, 0.7, 0.9825, 0.4, 0, -0.2, 0);
  for (const [cx, cz] of [[-1.05, -0.25], [-1.05, 0.45], [0.05, 0.5]]) {
    P.box(0.07, 0.03, 0.04, M.steel, cx, 1.015, cz);
    P.cyl(0.012, 0.04, M.dark, cx, 1.04, cz, 0, 0, 0, 6);
  }
  // side rails, ball screws, bearing blocks, motor, fixed cable trough
  for (const sz of [-0.82, 0.82]) {
    P.box(3.2, 0.08, 0.1, M.grey, 0, 1.0, sz);
    P.box(3.2, 0.02, 0.04, M.steel, 0, 1.05, sz);
  }
  for (const sz of [-0.94, 0.94]) {
    P.cyl(0.02, 3.0, M.steel, 0, 0.93, sz, 0, 0, PI / 2, 8);
    for (const sx of [-1.55, 1.55]) P.box(0.1, 0.1, 0.1, M.dark, sx, 0.93, sz);
  }
  P.cyl(0.06, 0.2, M.dark, -1.7, 0.93, 0.94, 0, 0, PI / 2, 12);
  P.box(3.0, 0.08, 0.12, M.dark, 0, 0.95, -1.0);
  for (let k = 0; k < 11; k++) P.box(0.02, 0.1, 0.12, M.black, -1.5 + k * 0.3, 0.95, -1.0);
  // sheet stock on a pallet beside the router
  pallet(P, 2.3, 0, 1.3, 0.9);
  for (let k = 0; k < 5; k++) P.box(1.22, 0.04, 0.82, M.ply, 2.3 + (rand() - 0.5) * 0.03, 0.17 + k * 0.04, (rand() - 0.5) * 0.03);
  P.build(g);

  // gantry moving along x
  const gantry = new THREE.Group();
  gantry.position.y = 1.0;
  g.add(gantry);
  const G = new Part();
  for (const sz of [-0.85, 0.85]) {
    G.box(0.22, 0.6, 0.22, M.blue, 0, 0.3, sz);
    G.box(0.32, 0.06, 0.3, M.steel, 0, 0.03, sz);
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) G.box(0.02, k % 2 ? 0.1 : 0.14, 0.2, M.black, sx * (0.22 + k * 0.035), 0.06, sz);
  }
  G.box(0.3, 0.3, 2.1, M.blue, 0, 0.7, 0);
  G.box(0.2, 0.04, 1.9, M.white, 0, 0.87, 0);
  G.box(0.03, 0.04, 1.8, M.steel, 0.16, 0.74, 0);
  G.box(0.03, 0.04, 1.8, M.steel, 0.16, 0.62, 0);
  G.box(0.12, 0.05, 1.7, M.dark, 0, 0.915, 0);
  for (let k = 0; k < 14; k++) G.box(0.14, 0.03, 0.03, M.black, 0, 0.92, -0.78 + k * 0.12);
  G.cyl(0.07, 0.2, M.dark, 0, 0.7, 1.17, PI / 2, 0, 0, 12);
  G.build(gantry);

  // spindle head moving along the beam
  const head = new THREE.Group();
  head.position.y = 0.7;
  gantry.add(head);
  const S = new Part();
  S.box(0.4, 0.45, 0.35, M.light, 0.28, 0, 0);
  S.box(0.04, 0.5, 0.4, M.steel, 0.1, 0, 0);
  S.cyl(0.06, 0.2, M.dark, 0.28, 0.33, 0, 0, 0, 0, 10);
  S.cyl(0.095, 0.3, M.grey, 0.28, -0.35, 0, 0, 0, 0, 14);
  for (let k = 0; k < 3; k++) S.cyl(0.105, 0.012, M.steel, 0.28, -0.26 - k * 0.06, 0, 0, 0, 0, 14);
  S.cyl(0.045, 0.06, M.steel, 0.28, -0.55, 0, 0, 0, 0, 10);
  S.cyl(0.012, 0.14, M.steel, 0.28, -0.65, 0, 0, 0, 0, 6);
  S.cyl(0.15, 0.03, M.dark, 0.28, -0.585, 0, 0, 0, 0, 14);
  S.add(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 14, 1, true), M.black, 0.28, -0.635, 0); // brush skirt
  S.cyl(0.045, 0.16, M.dark, 0.38, -0.6, 0, 0, 0, PI / 2, 10);
  S.sph(0.05, M.dark, 0.46, -0.6, 0);
  S.cyl(0.045, 0.7, M.black, 0.46, -0.25, 0, 0, 0, 0, 10);
  for (let k = 0; k < 6; k++) S.cyl(0.053, 0.012, M.dark, 0.46, -0.5 + k * 0.1, 0, 0, 0, 0, 10);
  S.cyl(0.055, 0.05, M.steel, 0.46, 0.13, 0, 0, 0, 0, 10);
  S.build(head);

  // extraction hose from the ceiling drop to the head (two segments, follows the motion)
  const hose = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true), M.black);
    m.castShadow = true;
    g.add(m);
    return m;
  });
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.black);
  g.add(knee);
  const top = new THREE.Vector3(0, 3.25, 0), bot = new THREE.Vector3(), mid = new THREE.Vector3();

  return {
    group: g,
    update(t) {
      gantry.position.x = Math.sin(t * 0.35) * 0.9;
      head.position.z = Math.sin(t * 0.9) * 0.6;
      bot.set(gantry.position.x + 0.46, 2.0, head.position.z);
      mid.addVectors(top, bot).multiplyScalar(0.5);
      mid.y -= 0.2;
      stretch(hose[0], top, mid);
      stretch(hose[1], mid, bot);
      knee.position.copy(mid);
    },
  };
}

// ---------- 6-axis robot arm ----------
function robot({ x, y = 0, z, ry = 0, scale = 1, body = M.orange, joint = M.dark, ring = M.light, phase = 0, speed = 1, tool = 'gripper' }) {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.rotation.y = ry;
  root.scale.setScalar(scale);

  // base plate, anchor bolts, pedestal
  const B = new Part();
  B.box(0.9, 0.04, 0.9, M.dark, 0, 0.02, 0);
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.38, 0.38]) B.cyl(0.025, 0.025, M.steel, sx, 0.05, sz, 0, 0, 0, 6);
  B.cyl(0.36, 0.16, joint, 0, 0.12, 0, 0, 0, 0, 20);
  B.box(0.16, 0.12, 0.1, M.black, 0, 0.12, -0.38);
  B.build(root);

  // A1 turret
  const turret = new THREE.Group();
  turret.position.y = 0.2;
  root.add(turret);
  const T = new Part();
  T.cyl(0.3, 0.03, ring, 0, 0.015, 0, 0, 0, 0, 20);
  T.cyl(0.27, 0.4, body, 0, 0.2, 0, 0, 0, 0, 20);
  T.box(0.24, 0.36, 0.2, body, 0, 0.24, -0.26);
  T.cyl(0.12, 0.14, joint, 0.28, 0.45, 0, 0, 0, PI / 2, 12);
  T.box(0.2, 0.06, 0.01, M.white, 0, 0.12, 0.275);
  T.build(turret);

  // A2 shoulder + lower arm
  const shoulder = new THREE.Group();
  shoulder.position.y = 0.45;
  turret.add(shoulder);
  const S = new Part();
  S.cyl(0.17, 0.46, joint, 0, 0, 0, 0, 0, PI / 2, 16);
  for (const sx of [-0.25, 0.25]) S.cyl(0.2, 0.06, ring, sx, 0, 0, 0, 0, PI / 2, 16);
  S.box(0.24, 0.7, 0.26, body, 0, 0.5, 0);
  S.cyl(0.13, 0.24, body, 0, 0.14, 0, 0, 0, PI / 2, 12);
  S.cyl(0.14, 0.3, body, 0, 1.0, 0, 0, 0, PI / 2, 14);
  for (const sx of [-0.18, 0.18]) S.cyl(0.13, 0.06, joint, sx, 1.0, 0, 0, 0, PI / 2, 14);
  S.cyl(0.07, 0.24, joint, 0.2, 0.86, -0.02, 0, 0, PI / 2, 10);
  S.tube([[-0.06, 0.1, -0.2], [-0.06, 0.5, -0.2], [-0.06, 0.95, -0.17]], 0.025, M.black, 8, 6);
  S.tube([[0.0, 0.1, -0.2], [0.0, 0.5, -0.2], [0.0, 0.95, -0.17]], 0.02, M.grey, 8, 6);
  for (const cy of [0.3, 0.55, 0.8]) S.box(0.12, 0.04, 0.05, joint, -0.03, cy, -0.19);
  S.build(shoulder);

  // A3 elbow + forearm
  const elbow = new THREE.Group();
  elbow.position.y = 1.0;
  shoulder.add(elbow);
  const E = new Part();
  E.cyl(0.14, 0.3, body, 0, 0, 0, 0, 0, PI / 2, 14);
  for (const sx of [-0.18, 0.18]) E.cyl(0.13, 0.06, joint, sx, 0, 0, 0, 0, PI / 2, 14);
  E.cone(0.085, 0.13, 0.7, body, 0, 0.4, 0, 0, 0, 0, 14);
  E.cyl(0.1, 0.14, ring, 0, 0.8, 0, 0, 0, 0, 14);
  E.box(0.12, 0.2, 0.12, body, 0, 0.55, -0.12);
  E.tube([[-0.05, 0.1, -0.12], [-0.05, 0.5, -0.14], [-0.04, 0.82, -0.1]], 0.022, M.black, 8, 6);
  E.build(elbow);

  // A4-A6 wrist, flange and tool
  const wrist = new THREE.Group();
  wrist.position.y = 0.9;
  elbow.add(wrist);
  const W = new Part();
  W.cyl(0.08, 0.24, joint, 0, 0, 0, 0, 0, PI / 2, 12);
  W.box(0.14, 0.16, 0.14, body, 0, 0.12, 0);
  W.cyl(0.065, 0.1, ring, 0, 0.22, 0, 0, 0, 0, 12);
  W.cyl(0.085, 0.02, M.steel, 0, 0.27, 0, 0, 0, 0, 14);
  for (const [bx, bz] of [[0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06]]) W.cyl(0.008, 0.015, M.dark, bx, 0.285, bz, 0, 0, 0, 5);

  const f = 0.28; // flange height; the tool extends along +y
  if (tool === 'gripper') {
    W.cyl(0.06, 0.06, joint, 0, f + 0.03, 0, 0, 0, 0, 12);
    W.box(0.4, 0.08, 0.12, M.grey, 0, f + 0.1, 0);
    W.box(0.1, 0.06, 0.1, joint, 0, f + 0.17, 0);
    for (const s of [-1, 1]) {
      W.box(0.03, 0.2, 0.1, M.steel, s * 0.165, f + 0.2, 0);
      W.box(0.01, 0.09, 0.1, M.rubber, s * 0.145, f + 0.22, 0);
    }
    brick(W, 0, f + 0.22, 0, 0, 1);
    W.tube([[0.08, f + 0.14, 0], [0.14, f + 0.08, 0.06], [0.1, f - 0.05, 0.12]], 0.008, M.black, 8, 5);
  } else if (tool === 'spindle') {
    W.box(0.14, 0.02, 0.14, M.steel, 0, f + 0.01, 0);
    W.cyl(0.055, 0.28, M.dark, 0, f + 0.16, 0, 0, 0, 0, 14);
    for (let k = 0; k < 3; k++) W.cyl(0.068, 0.012, M.steel, 0, f + 0.1 + k * 0.06, 0, 0, 0, 0, 14);
    W.cone(0.03, 0.05, 0.05, M.steel, 0, f + 0.325, 0, 0, 0, 0, 10);
    W.cyl(0.009, 0.13, M.steel, 0, f + 0.41, 0, 0, 0, 0, 6);
    W.cone(0.06, 0.1, 0.06, M.black, 0, f + 0.35, 0, 0, 0, 0, 14);
    W.tube([[0.04, f + 0.1, 0], [0.12, f + 0.05, -0.03], [0.1, f - 0.08, -0.1]], 0.012, M.black, 8, 5);
  } else if (tool === 'glue') {
    W.box(0.08, 0.02, 0.1, M.steel, 0, f + 0.01, 0);
    W.box(0.07, 0.1, 0.09, M.white, 0, f + 0.07, 0);
    W.cyl(0.035, 0.22, M.white, 0, f + 0.23, 0, 0, 0, 0, 12);
    W.cyl(0.037, 0.03, M.blue, 0, f + 0.35, 0, 0, 0, 0, 12);
    W.cone(0.004, 0.022, 0.07, M.steel, 0, f + 0.4, 0, 0, 0, 0, 8);
    W.tube([[0, f + 0.36, 0], [0, f + 0.42, -0.1], [0, f + 0.32, -0.25]], 0.01, M.black, 10, 5);
  }
  W.build(wrist);

  return {
    group: root,
    update(t) {
      const s = t * speed + phase;
      turret.rotation.y = Math.sin(s * 0.5) * 1.0;
      shoulder.rotation.x = -0.35 + Math.sin(s * 0.7) * 0.35;
      elbow.rotation.x = 0.95 + Math.sin(s * 0.9) * 0.45;
      wrist.rotation.x = 2.3 + Math.sin(s * 1.3) * 0.4; // tool points down and forward
    },
  };
}

export function buildWorkshop() {
  const group = new THREE.Group();
  const animated = [];
  const P = new Part(); // static, shadow-casting furniture and floor markings
  const C = new Part(); // ceiling and wall services: receive shadows but do not block the sun

  buildRoom(group, C);

  group.add(cncMill(-5.8, -3.8, PI / 2, M.white, M.blue));
  group.add(cncMill(-5.8, -1.2, PI / 2, M.light, M.dark));
  floorRect(P, -5.4, -2.5, 2.6, 5.4);

  const router = gantryRouter(3.2, -3.8);
  group.add(router.group);
  animated.push(router);
  floorRect(P, 3.6, -3.8, 5.4, 2.8);
  hazardEdge(P, 0.9, -2.4, 6.3, -2.4);

  const r1 = robot({ x: -1.0, z: -1.2, ry: 0.4, phase: 0, tool: 'gripper' });
  group.add(r1.group);
  animated.push(r1);
  brickWall(P, 1.0, -1.1);
  brickStack(P, 0.3, -2.0);
  floorRect(P, 0.0, -1.1, 4.2, 2.4);

  // robot on a linear rail
  for (const z of [2.35, 2.85]) {
    P.box(5.0, 0.04, 0.16, M.dark, -1.5, 0.02, z);
    P.box(5.0, 0.03, 0.05, M.steel, -1.5, 0.055, z);
  }
  for (let i = 0; i < 9; i++) {
    P.box(0.1, 0.04, 0.9, M.grey, -3.5 + i * 0.5, 0.02, 2.6);
    for (const z of [2.35, 2.85]) P.cyl(0.015, 0.02, M.steel, -3.5 + i * 0.5, 0.05, z, 0, 0, 0, 6);
  }
  for (const sx of [-4.05, 1.05]) { P.box(0.12, 0.2, 0.7, M.yellow, sx, 0.1, 2.6); P.box(0.14, 0.06, 0.5, M.black, sx, 0.13, 2.6); }
  P.box(5.0, 0.06, 0.2, M.dark, -1.5, 0.03, 3.2);
  for (let i = 0; i < 10; i++) P.box(0.02, 0.07, 0.2, M.black, -3.8 + i * 0.5, 0.035, 3.2);
  const carriage = new THREE.Group();
  carriage.position.set(-1.5, 0, 2.6);
  group.add(carriage);
  const K = new Part();
  K.box(0.9, 0.14, 0.9, M.dark, 0, 0.2, 0);
  K.box(0.8, 0.04, 0.8, M.steel, 0, 0.29, 0);
  for (const sx of [-0.32, 0.32]) for (const sz of [-0.25, 0.25]) K.box(0.18, 0.1, 0.12, M.grey, sx, 0.08, sz);
  K.box(0.3, 0.1, 0.06, M.black, 0, 0.2, -0.47);
  K.build(carriage);
  const r2 = robot({ x: 0, y: 0.31, z: 0, tool: 'spindle', phase: 2 });
  carriage.add(r2.group);
  animated.push(r2, { update: (t) => (carriage.position.x = -1.5 + Math.sin(t * 0.25) * 1.6) });
  floorRect(P, -1.5, 2.6, 5.6, 1.6);

  timberStack(P, 3.4, 3.9);

  // pillars create occlusion shadows
  for (const px of [-2.8, 3.6]) {
    const pz = 0.8;
    P.cyl(0.18, ROOM.h, M.beam, px, ROOM.h / 2, pz, 0, 0, 0, 20);
    P.box(0.5, 0.03, 0.5, M.steel, px, 0.015, pz);
    P.cyl(0.2, 0.6, M.yellow, px, 0.3, pz, 0, 0, 0, 20);
    for (const y of [0.1, 0.3, 0.5]) P.cyl(0.205, 0.07, M.black, px, y, pz, 0, 0, 0, 20);
    P.box(0.4, 0.03, 0.4, M.steel, px, ROOM.h - 0.015, pz);
  }

  // workbench with cobot, 3D printer and parts
  workbench(P, 6.3, 1.6, 6);
  const cobot = robot({ x: 6.3, y: 0.93, z: 0.2, scale: 0.45, body: M.white, joint: M.grey, ring: M.blue, phase: 1, speed: 1.3, tool: 'glue' });
  group.add(cobot.group);
  animated.push(cobot);
  printer3d(P, 6.3, 0.93, 2.3);
  const partCols = [M.orange, M.blue, M.white];
  for (let i = 0; i < 5; i++) P.box(0.2 + rand() * 0.15, 0.1 + rand() * 0.2, 0.2, partCols[i % 3], 6.3, 1.05, 3.2 + i * 0.25 - 0.3);

  shelf(P, -6.6, 3.3, 3.4);

  // fab-lab details
  stool(P, 5.3, 0.6, M.blue);
  stool(P, 5.3, 2.3, M.orange);
  trolley(P, -4.9, 0.9);
  wasteBin(P, -6.65, 1.1, M.dark);
  wasteBin(P, 6.55, 5.0, M.grey);
  extinguisher(P, 1.6, -ROOM.d / 2 + 0.08);
  plant(P, 6.5, -4.8);

  P.build(group);
  C.build(group, { cast: false });

  const stations = [
    { name: 'Station A - workshop centre', x: 0.8, z: 0.9 },
    { name: 'Station B - by the CNC mills', x: -3.9, z: -2.6 },
    { name: 'Station C - near the shelf', x: -3.8, z: 4.1 },
  ];

  // scanning raycasts these non-recursively: meshes only
  const targets = [];
  group.traverse((o) => { if (o.isMesh) targets.push(o); });

  return {
    group,
    targets,
    stations,
    update(t) { animated.forEach((a) => a.update(t)); },
  };
}
