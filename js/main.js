import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorkshop } from './workshop.js';
import { buildScannerModel, ScanSim, CloudView, BeamView, DEG, SCANNER_ORIGIN_Y } from './scanner.js';
import { Pano, Viewer360 } from './panorama.js';
import { createLighting } from './lighting.js';

const $ = (s) => document.querySelector(s);
const POINTS_PER_SEC_REAL = 976000; // FARO Focus class scanner
const NAMES = ['A', 'B', 'C'];
const TINTS = [[79, 123, 255], [255, 138, 0], [40, 200, 120]];

// ---------- operator view ----------
const opCanvas = $('#operatorCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: opCanvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(15, 13, 17);
const controls = new OrbitControls(camera, opCanvas);
controls.target.set(0, 1.2, -0.5);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.95;

const workshop = buildWorkshop();
scene.add(workshop.group);
const scanner = buildScannerModel();
scene.add(scanner.group);
const beam = new BeamView();
scene.add(beam.group);

const lighting = createLighting({ renderer, scene, camera, lit: [workshop.group, scanner.group] });
lighting.mountUI($('#sceneExtra'));
lighting.setTheme(document.documentElement.dataset.theme);
document.addEventListener('themechange', (e) => lighting.setTheme(e.detail.theme));
scanner.ready.then(() => { lighting.tuneScanner(scanner.group); lighting.refreshShadows(); }, (e) => console.error('Scanner model failed to load', e));

// ---------- labels over the operator view ----------
const labelsEl = $('#labels');
const labelItems = [];
function addLabel(text, pos, cls = '') {
  const el = document.createElement('div');
  el.className = 'mlabel ' + cls;
  el.textContent = text;
  labelsEl.appendChild(el);
  const item = { el, pos };
  labelItems.push(item);
  return item;
}
function removeLabel(item) {
  item.el.remove();
  labelItems.splice(labelItems.indexOf(item), 1);
}
const _p = new THREE.Vector3();
function updateLabels() {
  const w = labelsEl.clientWidth, h = labelsEl.clientHeight;
  for (const { el, pos } of labelItems) {
    _p.copy(pos).project(camera);
    if (_p.z > 1) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${(_p.x + 1) / 2 * w + 8}px, ${(1 - _p.y) / 2 * h - 8}px) translateY(-100%)`;
  }
}

// ---------- stations: each keeps its own scan, panorama image and cloud ----------
const panoCanvas = $('#panoCanvas');
const stations = workshop.stations.map((def, i) => {
  const st = { def, sim: new ScanSim(workshop.targets), cloud: new CloudView(), img: null, name: NAMES[i] };
  st.origin = new THREE.Vector3(def.x, SCANNER_ORIGIN_Y, def.z);
  scene.add(st.cloud.points);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.28, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: (TINTS[i][0] << 16) | (TINTS[i][1] << 8) | TINTS[i][2], depthWrite: false }),
  );
  ring.position.set(def.x, 0.03, def.z);
  scene.add(ring);
  addLabel(st.name, new THREE.Vector3(def.x, 0.4, def.z), 'station');
  return st;
});

let cur = 0;
let sim = stations[0].sim;
let cloud = stations[0].cloud;
const pano = new Pano(panoCanvas, sim);
const viewer = new Viewer360($('#sphereCanvas'), panoCanvas);
const rgb = [0, 0, 0];

function pointColor(st, idx) {
  if ($('#chkTint').checked) {
    const k = 0.35 + 0.65 * st.sim.lum[idx], t = TINTS[stations.indexOf(st)];
    rgb[0] = t[0] * k; rgb[1] = t[1] * k; rgb[2] = t[2] * k;
  } else {
    st.sim.pixelColor(idx, pano.mode, rgb);
  }
  return rgb;
}
stations.forEach((st) => {
  st.sim.onSample = (idx, hit, x, y, z) => {
    pano.paint(idx);
    if (hit) st.cloud.add(x, y, z, idx, pointColor(st, idx));
  };
});

// ---------- UI ----------
const stationSel = $('#station');
let running = false;
let scanAll = false;
let animTime = 0;
let acc = 0;
const raysPerSec = () => Math.pow(10, $('#speed').value / 10);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function updateSpeedOut() { $('#speedOut').textContent = `${fmt(raysPerSec())} pts/s`; }

function setRunning(v) {
  running = v && !sim.done;
  $('#btnRun').textContent = running ? 'Pause' : (sim.done ? 'Done' : (sim.rays ? 'Resume' : 'Start'));
}

function refreshStationSelect() {
  stations.forEach((st, i) => { stationSel.options[i].text = `${st.def.name}${st.sim.done ? ' (scanned)' : ''}`; });
  stationSel.value = cur;
}

function updateVisibility() {
  const all = $('#chkStack').checked;
  stations.forEach((st, i) => { st.cloud.points.visible = $('#chkCloud').checked && (all || i === cur); });
}

function recolorClouds() {
  const tint = $('#chkTint').checked;
  stations.forEach((st, i) => st.cloud.recolor(st.sim, pano.mode, tint ? TINTS[i] : null));
}

function switchStation(i, keepRunning = false) {
  cur = i;
  const st = stations[i];
  sim = st.sim;
  cloud = st.cloud;
  pano.use(sim, st.img);
  viewer.refreshTexture();
  scanner.group.position.set(st.def.x, 0, st.def.z);
  scanner.setPose(sim.cur.headAz);
  lighting.refreshShadows();
  acc = 0;
  setRunning(keepRunning);
  updateVisibility();
  renderPins();
  refreshStationSelect();
}

function applyConfig() {
  const [W, H] = $('#res').value.split('x').map(Number);
  clearAnnotations();
  for (const st of stations) {
    st.sim.configure(W, H, st.origin);
    pano.sim = st.sim;
    pano.setup(W, H);
    st.img = pano.img;
    st.cloud.reset(W * st.sim.nA);
  }
  scanAll = false;
  switchStation(cur);
  const t = stations[cur].def;
  controls.target.set(t.x * 0.5, 1.2, t.z * 0.5);
}

function resetActive() {
  dropAnnotations((a) => a.st === cur);
  sim.reset();
  cloud.reset(sim.W * sim.nA);
  pano.clear();
  scanAll = false;
  switchStation(cur);
}

const pendingStation = () => {
  for (let k = 1; k <= stations.length; k++) {
    const i = (cur + k) % stations.length;
    if (!stations[i].sim.done) return i;
  }
  return -1;
};

$('#btnRun').onclick = () => setRunning(!running);
$('#btnReset').onclick = resetActive;
$('#btnResetAll').onclick = applyConfig;
$('#btnFast').onclick = () => { $('#speed').value = 50; updateSpeedOut(); setRunning(true); };
$('#btnAll').onclick = () => {
  if (stations.every((s) => s.sim.done)) { toast('All positions are already scanned'); return; }
  scanAll = true;
  $('#chkStack').checked = true;
  if (sim.done) switchStation(pendingStation(), true);
  updateVisibility();
  controls.target.set(0, 1.2, -0.5);
  setRunning(true);
};
$('#speed').oninput = updateSpeedOut;
$('#res').onchange = applyConfig;
stationSel.onchange = () => { scanAll = false; switchStation(+stationSel.value); };
$('#mode').onchange = (e) => {
  pano.mode = e.target.value;
  pano.repaintAll();
  recolorClouds();
};
$('#chkCloud').onchange = updateVisibility;
$('#chkStack').onchange = updateVisibility;
$('#chkTint').onchange = recolorClouds;
$('#chkModel').onchange = (e) => { workshop.group.visible = e.target.checked; lighting.refreshShadows(); };

const turnRpm = () => parseFloat($('#turnSpeed').value);
function setTurntable(on) {
  controls.autoRotate = on;
  controls.autoRotateSpeed = turnRpm();
  $('#btnTurn').classList.toggle('active', on);
}
$('#btnTurn').onclick = () => setTurntable(!controls.autoRotate);
$('#turnSpeed').oninput = () => {
  controls.autoRotateSpeed = turnRpm();
  $('#turnOut').textContent = `${turnRpm()} rpm`;
};
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') { e.preventDefault(); setRunning(!running); }
});

document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
    $('#panoView').classList.toggle('hidden', b.dataset.view !== 'pano');
    $('#sphereView').classList.toggle('hidden', b.dataset.view !== 'sphere');
    resize();
  };
});

function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; $('#stage').appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- annotations: click a point in the panorama, it is pinned in the scene ----------
const annotations = [];
let annSeq = 0;
const annGroup = new THREE.Group();
scene.add(annGroup);
const annMat = new THREE.MeshBasicMaterial({ color: 0x4f7bff, depthTest: false });
const annLine = new THREE.LineBasicMaterial({ color: 0x4f7bff, transparent: true, opacity: 0.6, depthTest: false });

const annText = (a) => `P${a.n}${a.note ? ' ' + a.note : ''}\n${a.dist.toFixed(2)} m  (${a.pos.x.toFixed(2)}, ${a.pos.y.toFixed(2)}, ${a.pos.z.toFixed(2)})`;

function addAnnotation(stIdx, idx) {
  const st = stations[stIdx], s = st.sim;
  const x = idx % s.W, y = Math.floor(idx / s.W);
  const a = {
    n: ++annSeq, st: stIdx, idx, note: '',
    pos: new THREE.Vector3(s.pos[idx * 3], s.pos[idx * 3 + 1], s.pos[idx * 3 + 2]),
    dist: s.dist[idx], az: (x + 0.5) / s.W * 360, el: 90 - (y + 0.5) * 180 / s.H,
  };
  a.marker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), annMat);
  a.marker.position.copy(a.pos);
  a.marker.renderOrder = 10;
  a.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([st.origin, a.pos]), annLine);
  a.line.renderOrder = 9;
  annGroup.add(a.marker, a.line);
  a.label = addLabel(annText(a), a.pos);

  a.row = document.createElement('div');
  a.row.className = 'ann';
  a.row.innerHTML = '<div class="head"><b></b><span></span><button class="del" title="remove">&times;</button></div><input type="text" placeholder="Add a note">';
  a.row.querySelector('b').textContent = `P${a.n}`;
  a.row.querySelector('span').textContent = `${st.name} - ${a.dist.toFixed(2)} m - az ${a.az.toFixed(0)}\u00b0 el ${a.el.toFixed(0)}\u00b0`;
  a.row.querySelector('.head').onclick = () => controls.target.copy(a.pos);
  a.row.querySelector('.del').onclick = (e) => { e.stopPropagation(); dropAnnotations((o) => o === a); };
  a.row.querySelector('input').oninput = (e) => { a.note = e.target.value; a.label.el.textContent = annText(a); };
  $('#annList').appendChild(a.row);

  annotations.push(a);
  renderPins();
}

function dropAnnotations(pred) {
  for (const a of annotations.filter(pred)) {
    annGroup.remove(a.marker, a.line);
    a.marker.geometry.dispose();
    a.line.geometry.dispose();
    removeLabel(a.label);
    a.row.remove();
    annotations.splice(annotations.indexOf(a), 1);
  }
  renderPins();
}
const clearAnnotations = () => dropAnnotations(() => true);
$('#btnAnnClear').onclick = clearAnnotations;

function renderPins() {
  const box = $('#pins');
  box.innerHTML = '';
  for (const a of annotations) {
    if (a.st !== cur) continue;
    const pin = document.createElement('div');
    pin.className = 'pin';
    pin.textContent = a.n;
    pin.style.left = `${(a.idx % sim.W + 0.5) / sim.W * 100}%`;
    pin.style.top = `${(Math.floor(a.idx / sim.W) + 0.5) / sim.H * 100}%`;
    box.appendChild(pin);
  }
}

let panoDown = null;
panoCanvas.addEventListener('pointerdown', (e) => { panoDown = [e.clientX, e.clientY]; });
panoCanvas.addEventListener('pointerup', (e) => {
  if (!panoDown || Math.hypot(e.clientX - panoDown[0], e.clientY - panoDown[1]) > 4) return;
  const r = panoCanvas.getBoundingClientRect();
  const x = Math.min(sim.W - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * sim.W)));
  const y = Math.min(sim.H - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * sim.H)));
  const idx = x + y * sim.W;
  if (sim.state[idx] !== 1) { toast('No scanned point there'); return; }
  addAnnotation(cur, idx);
});

function resize() {
  const op = $('#operatorStage');
  lighting.resize(op.clientWidth, op.clientHeight);
  camera.aspect = op.clientWidth / Math.max(1, op.clientHeight);
  camera.updateProjectionMatrix();
  const sv = $('#sphereView');
  if (sv.clientWidth) viewer.resize(sv.clientWidth, sv.clientHeight);
}
new ResizeObserver(resize).observe($('#operatorStage'));
new ResizeObserver(resize).observe($('#machineStage'));

function updateReadout() {
  const c = sim.cur;
  const pct = (100 * sim.rays / sim.totalRays);
  $('#readout').innerHTML =
    `<span>Position <b>${stations[cur].name}</b></span>` +
    `<span>Head <b>${(c.headAz / DEG).toFixed(1)}&deg;</b></span>` +
    `<span>Mirror <b>${(c.beta / DEG).toFixed(0)}&deg;</b></span>` +
    `<span>Range <b>${c.range ? c.range.toFixed(2) + ' m' : '-'}</b></span>` +
    `<span>Points <b>${fmt(cloud.n)}</b></span>` +
    `<span>Progress <b>${pct.toFixed(1)}%</b></span>` +
    `<span>Real scanner time <b>~${(sim.rays / POINTS_PER_SEC_REAL).toFixed(1)} s</b> of ${(sim.totalRays / POINTS_PER_SEC_REAL).toFixed(1)} s</span>`;

  const total = stations.reduce((s, st) => s + st.cloud.n, 0);
  $('#stackInfo').textContent = stations.map((st) => `${st.name}: ${fmt(st.cloud.n)}`).join('  |  ') + `  |  stack: ${fmt(total)} points`;

  const W = sim.W;
  $('#curA').style.left = `${(c.col + 0.5) / W * 100}%`;
  $('#curB').style.left = `${(((c.col + W / 2) % W) + 0.5) / W * 100}%`;
  const dot = $('#curDot');
  dot.style.left = `${(c.col + 0.5) / W * 100}%`;
  dot.style.top = `${(c.row + 0.5) / sim.H * 100}%`;
  $('#curA').style.display = $('#curB').style.display = dot.style.display = sim.rays && !sim.done ? '' : 'none';
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if ($('#chkAnim').checked) { animTime += dt; workshop.update(animTime); lighting.refreshShadows(33); }
  else if (running) lighting.refreshShadows(250); // scanner head turns
  scene.updateMatrixWorld(true);

  if (running) {
    acc += raysPerSec() * dt;
    const want = Math.floor(acc);
    acc -= want;
    sim.step(want, 10);
    if (sim.done) {
      const next = scanAll ? pendingStation() : -1;
      if (next >= 0) switchStation(next, true);
      else { scanAll = false; setRunning(false); refreshStationSelect(); }
    }
  }

  scanner.setPose(sim.cur.headAz);
  beam.update(sim);
  stations.forEach((st) => st.cloud.flush());
  const painted = pano.flush();
  controls.update();
  lighting.render();
  updateLabels();

  if (!$('#sphereView').classList.contains('hidden')) {
    if (painted) viewer.markDirty();
    viewer.render();
  }
  updateReadout();
  requestAnimationFrame(frame);
}

stations.forEach(() => stationSel.add(new Option('', stationSel.options.length)));
updateSpeedOut();
applyConfig();
resize();
requestAnimationFrame(frame);
