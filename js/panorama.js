import * as THREE from 'three';

// Equirectangular panorama buffer, filled pixel by pixel while the scan runs.
export class Pano {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.mode = 'color';
    this.dirty = false;
    this.rgb = [0, 0, 0];
  }

  setup(W, H) {
    this.W = W;
    this.H = H;
    this.canvas.width = W;
    this.canvas.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.clear();
  }

  // switch to another station's sim and its stored image
  use(sim, img) {
    this.sim = sim;
    this.W = sim.W;
    this.H = sim.H;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.img = img;
    this.repaintAll();
    this.dirty = true;
  }

  clear() {
    const { W, H, nA } = { W: this.W, H: this.H, nA: this.sim.nA };
    const d = this.img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        const blind = y >= nA;
        const v = blind ? (((x + y) >> 2) & 1 ? 34 : 24) : 12;
        d[o] = v; d[o + 1] = blind ? v + 2 : v + 6; d[o + 2] = blind ? v + 6 : v + 16; d[o + 3] = 255;
      }
    }
    this.dirty = true;
  }

  paint(idx) {
    const d = this.img.data, o = idx * 4;
    if (this.sim.state[idx] === 2) {
      d[o] = d[o + 1] = d[o + 2] = 0;
    } else {
      this.sim.pixelColor(idx, this.mode, this.rgb);
      d[o] = this.rgb[0]; d[o + 1] = this.rgb[1]; d[o + 2] = this.rgb[2];
    }
    d[o + 3] = 255;
    this.dirty = true;
  }

  repaintAll() {
    for (let i = 0; i < this.sim.state.length; i++) if (this.sim.state[i]) this.paint(i);
  }

  flush() {
    if (!this.dirty) return false;
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
    return true;
  }
}

// Inside-out sphere viewer: drag to look around, wheel to zoom.
export class Viewer360 {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.source = source;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    this.camera.rotation.order = 'YXZ';
    this.yaw = Math.PI; // look along +z (azimuth 0)
    this.pitch = 0;
    this.texDirty = true;

    // Same direction convention as the scanner: dir = (-cos(el) sin(az), sin(el), cos(el) cos(az))
    const SEG_U = 128, SEG_V = 64, pos = [], uv = [], idx = [];
    for (let v = 0; v <= SEG_V; v++) {
      const el = Math.PI / 2 - (v / SEG_V) * Math.PI;
      for (let u = 0; u <= SEG_U; u++) {
        const az = (u / SEG_U) * Math.PI * 2;
        pos.push(-Math.cos(el) * Math.sin(az) * 5, Math.sin(el) * 5, Math.cos(el) * Math.cos(az) * 5);
        uv.push(u / SEG_U, 1 - v / SEG_V);
      }
    }
    for (let v = 0; v < SEG_V; v++) {
      for (let u = 0; u < SEG_U; u++) {
        const a = v * (SEG_U + 1) + u, b = a + SEG_U + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(geo, this.mat));
    this.refreshTexture();

    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = this.camera.fov / 75 * 0.005;
      this.yaw += (e.clientX - drag.x) * k;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + (e.clientY - drag.y) * k));
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.fov = Math.max(25, Math.min(100, this.camera.fov + e.deltaY * 0.05));
      this.camera.updateProjectionMatrix();
    }, { passive: false });
  }

  refreshTexture() {
    if (this.tex) this.tex.dispose();
    this.tex = new THREE.CanvasTexture(this.source);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.mat.map = this.tex;
    this.mat.needsUpdate = true;
    this.texDirty = true;
  }

  markDirty() { this.texDirty = true; }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.texDirty) { this.tex.needsUpdate = true; this.texDirty = false; }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
