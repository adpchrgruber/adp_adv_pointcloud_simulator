import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Render pipeline of the operator view.
//  AO on : lit scene (workshop + scanner) -> MSAA half-float target -> GTAO (reduced res) -> OutputPass (ACES + sRGB) -> screen,
//          then a depth-only pass of the lit scene and the overlay (point clouds, beam, rings, annotations) on top, untoned.
//  AO off: one plain renderer.render(); the overlay is excluded from tone mapping so both paths show identical colours.
// GTAO (three/addons, same version as the importmap) needs no extra library and is the best quality per cost in r160:
// SAO/SSAO are noisier or need far more samples, and baked AO cannot follow the moving machines.

const THEMES = {
  light: { bg: 0xf2f3f5, exposure: 1.15, sun: 0xfff2e2, sunI: 3.4, sky: 0xffffff, ground: 0xdedbd4, hemiI: 1.6, env: 0.4 },
  dark: { bg: 0x14161a, exposure: 0.85, sun: 0xd2d9e8, sunI: 1.4, sky: 0x9aa0ad, ground: 0x2b2d33, hemiI: 0.8, env: 0.16 },
};

const QUALITY = {
  standard: { aoScale: 0.5, samples: 8, pdSamples: 8, shadowMap: 2048 },
  high: { aoScale: 0.85, samples: 16, pdSamples: 16, shadowMap: 4096 },
};

// three's ACESFilmicToneMapping, inverted numerically to pre-compensate the clear colour OutputPass will tone map
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const mul3 = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function aces(v, exposure) {
  const c = mul3(ACES_IN, v.map((x) => (x * exposure) / 0.6)).map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081));
  return mul3(ACES_OUT, c).map((x) => Math.min(1, Math.max(0, x)));
}
function inverseAces(target, exposure) {
  let x = target.map((t) => t * 2);
  for (let it = 0; it < 40; it++) {
    const y = aces(x, exposure);
    const J = [0, 1, 2].map(() => [0, 0, 0]);
    for (let c = 0; c < 3; c++) {
      const p = x.slice();
      p[c] += 1e-3;
      const yp = aces(p, exposure);
      for (let r = 0; r < 3; r++) J[r][c] = (yp[r] - y[r]) / 1e-3;
    }
    const b = [0, 1, 2].map((r) => target[r] - y[r]);
    const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
    if (Math.abs(det) < 1e-9) break;
    const solve = (col) => { // Cramer's rule
      const A = J.map((row, r) => row.map((v, c) => (c === col ? b[r] : v)));
      return (A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])) / det;
    };
    x = x.map((v, c) => Math.min(60, Math.max(0, v + solve(c))));
  }
  return x;
}

export function createLighting({ renderer, scene, camera, lit }) {
  const state = { ao: true, radius: 0.6, strength: 1, quality: 'standard', shadows: true };
  const litSet = new Set(lit);
  let theme = THEMES.light;
  let cssW = 0, cssH = 0, supported = true;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // refreshed on demand, see refreshShadows()

  // ---- lights: soft sky/ground fill + one shadow-casting sun entering through the open top ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb4b2ad, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.target.position.set(0, 1, 0);
  sun.position.set(0, 1, 0).add(new THREE.Vector3(0.38, 0.8, 0.46).normalize().multiplyScalar(18));
  const sc = sun.shadow.camera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 4; sc.far = 36;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.castShadow = true;
  scene.add(hemi, sun, sun.target);

  // image-based light only feeds the glossy scanner and the metal parts; the intensity follows the theme
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // ---- AO pipeline ----
  const bgRaw = new THREE.Color(), bgComp = new THREE.Color();
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  let composer = null, renderPass = null, gtao = null;
  try {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType }));
    composer.renderTarget2.samples = 4; // RenderPass draws into the read buffer: only that one needs MSAA
    renderPass = new RenderPass(scene, camera);
    gtao = new GTAOPass(scene, camera, 16, 16, undefined, { radius: state.radius, distanceExponent: 1, thickness: 1, scale: 1, samples: 8 });
    composer.addPass(renderPass);
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  } catch (e) {
    console.warn('Ambient occlusion unavailable, falling back to direct rendering', e);
    composer = null;
    supported = false;
    state.ao = false;
  }

  function applyQuality() {
    const q = QUALITY[state.quality];
    if (gtao) {
      gtao.updateGtaoMaterial({ samples: q.samples, radius: state.radius });
      gtao.updatePdMaterial({ samples: q.pdSamples });
    }
    if (sun.shadow.mapSize.x !== q.shadowMap) {
      sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    applySize();
    shadowDirty = true;
  }

  function applySize() {
    if (!cssW || !cssH) return;
    const pr = Math.min(window.devicePixelRatio || 1, state.ao && composer ? 1.5 : 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    if (!composer) return;
    composer.setPixelRatio(pr);
    composer.setSize(cssW, cssH);
    const s = QUALITY[state.quality].aoScale;
    gtao.setSize(Math.max(1, Math.round(cssW * pr * s)), Math.max(1, Math.round(cssH * pr * s)));
  }

  // ---- shadows: the map is only re-rendered on request (machines move, scanner turns, settings change) ----
  let shadowDirty = true, lastShadow = -1e9;
  function refreshShadows(maxAgeMs = 0) {
    if (performance.now() - lastShadow >= maxAgeMs) shadowDirty = true;
  }

  function applyEnv() {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.isMeshStandardMaterial) m.envMapIntensity = theme.env;
    });
  }

  function setTheme(name) {
    theme = THEMES[name] ?? THEMES.light;
    sun.color.set(theme.sun);
    sun.intensity = theme.sunI;
    hemi.color.set(theme.sky);
    hemi.groundColor.set(theme.ground);
    hemi.intensity = theme.hemiI;
    renderer.toneMappingExposure = theme.exposure;
    bgRaw.set(theme.bg);
    bgComp.setRGB(...inverseAces([bgRaw.r, bgRaw.g, bgRaw.b], theme.exposure), THREE.LinearSRGBColorSpace);
    applyEnv();
  }

  // overlay objects (Basic materials) bypass tone mapping so point colours match the panorama
  function untone(o) {
    o.traverse((n) => {
      const m = n.material;
      if (m && m.toneMapped) { m.toneMapped = false; m.needsUpdate = true; }
    });
  }

  const saved = [];
  function showOnly(kind) {
    for (const [c, v] of saved) c.visible = v && (kind === 'all' || (kind === 'lit') === litSet.has(c) || c.isLight || c === sun.target);
  }

  function render() {
    const wantShadow = state.shadows;
    if (sun.castShadow !== wantShadow) { sun.castShadow = wantShadow; }
    if (wantShadow && shadowDirty) {
      renderer.shadowMap.needsUpdate = true;
      shadowDirty = false;
      lastShadow = performance.now();
    }
    saved.length = 0;
    for (const c of scene.children) { saved.push([c, c.visible]); if (!litSet.has(c) && !c.isLight) untone(c); }

    if (!state.ao || !composer) {
      scene.background = bgRaw;
      renderer.render(scene, camera);
      return;
    }

    scene.background = bgComp; // set while a render target is bound, so it is used as linear HDR value
    gtao.blendIntensity = state.strength;
    showOnly('lit');
    composer.render();
    scene.background = null;

    // overlay on the tone-mapped frame: depth from a colourless pass of the lit scene, then points / beam / markers
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    scene.overrideMaterial = depthMat;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    showOnly('overlay');
    renderer.render(scene, camera);
    renderer.autoClear = autoClear;
    showOnly('all');
  }

  // brighten the dark photogrammetry texture of the scanner glTF without touching the asset
  function tuneScanner(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.userData.tuned) continue;
        m.userData.tuned = true;
        m.metalnessMap = m.roughnessMap = null;
        m.metalness = 0.1;
        m.roughness = 0.6;
        m.emissive.set(0xffffff);
        m.emissiveMap = m.map;
        m.emissiveIntensity = 0.45;
        m.needsUpdate = true;
      }
    });
    applyEnv();
  }

  function mountUI(box) {
    box.innerHTML =
      '<label class="check"><input type="checkbox" id="chkAO" checked> Ambient occlusion</label>' +
      '<div class="slider"><label for="aoRadius">AO radius</label><input id="aoRadius" type="range" min="0.1" max="2" step="0.05"><output id="aoRadiusOut"></output></div>' +
      '<div class="slider"><label for="aoStrength">AO strength</label><input id="aoStrength" type="range" min="0" max="1.5" step="0.05"><output id="aoStrengthOut"></output></div>' +
      '<div class="field"><label for="aoQuality">AO quality</label><select id="aoQuality"><option value="standard">Standard</option><option value="high">High</option></select></div>' +
      '<label class="check"><input type="checkbox" id="chkShadow" checked> Soft shadows</label>';
    const $ = (s) => box.querySelector(s);
    const sync = () => {
      $('#chkAO').checked = state.ao;
      $('#aoRadius').value = state.radius;
      $('#aoStrength').value = state.strength;
      $('#aoRadiusOut').textContent = `${state.radius.toFixed(2)} m`;
      $('#aoStrengthOut').textContent = state.strength.toFixed(2);
      $('#aoQuality').value = state.quality;
      for (const id of ['#aoRadius', '#aoStrength', '#aoQuality']) $(id).disabled = !state.ao;
    };
    if (!supported) $('#chkAO').disabled = true;
    $('#chkAO').onchange = (e) => { state.ao = e.target.checked && supported; applySize(); sync(); };
    $('#aoRadius').oninput = (e) => { state.radius = +e.target.value; gtao?.updateGtaoMaterial({ radius: state.radius }); sync(); };
    $('#aoStrength').oninput = (e) => { state.strength = +e.target.value; sync(); };
    $('#aoQuality').onchange = (e) => { state.quality = e.target.value; applyQuality(); };
    $('#chkShadow').onchange = (e) => { state.shadows = e.target.checked; shadowDirty = true; };
    sync();
  }

  applyQuality();

  return {
    state,
    render,
    mountUI,
    setTheme,
    tuneScanner,
    refreshShadows,
    resize(w, h) { cssW = w; cssH = h; applySize(); },
  };
}
