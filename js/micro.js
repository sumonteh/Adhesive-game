// Vista microscópica (esquemática) de la interfase adhesiva: dentina y esmalte.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const W = 36, DZ = 22;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export class MicroView {
  constructor(renderer, container) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1420');
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 600);
    this.camera.position.set(44, 26, 70);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(7, -4, 0);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'micro-labels';
    this.labels.domElement.style.display = 'none';
    container.appendChild(this.labels.domElement);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#334455', 1.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(20, 40, 30); this.scene.add(d);
    this.root = new THREE.Group();
    this.scene.add(this.root);
  }

  setSize(w, h) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.labels.setSize(w, h);
  }

  setActive(on) {
    this.controls.enabled = on;
    this.labels.domElement.style.display = on ? '' : 'none';
  }

  clear() {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      c.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
  }

  label(text, y, cls = '') {
    const el = document.createElement('div');
    el.className = 'mlabel ' + cls;
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(W / 2 + 1.5, y, DZ / 2);
    o.center.set(0, 0.5);
    this.root.add(o);
  }

  slab(y0, y1, color, opacity = 1, w = W, dz = DZ) {
    const h = Math.max(0.05, y1 - y0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dz), new THREE.MeshStandardMaterial({
      color, transparent: opacity < 1, opacity, roughness: 0.6, depthWrite: opacity >= 1,
    }));
    m.position.y = (y0 + y1) / 2;
    this.root.add(m);
    return m;
  }

  particles(n, y0, y1, r, color, rand) {
    const geo = new THREE.SphereGeometry(r, 8, 6);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m.makeTranslation((rand() - 0.5) * (W - 1), y0 + rand() * (y1 - y0), (rand() - 0.5) * (DZ - 1));
      im.setMatrixAt(i, m);
    }
    this.root.add(im);
    return im;
  }

  build(p, tab) {
    this.clear();
    tab === 'esmalte' ? this._enamel(p) : this._dentin(p);
  }

  _dentin(p) {
    const rand = rng(7);
    const demin = p.demin, inf = Math.min(p.infDepth, demin);
    const base = -26;
    // Dentina mineralizada con túbulos
    this.slab(base, -demin, '#d9b77a', 0.42);
    const tubMat = new THREE.MeshStandardMaterial({ color: '#4a3018', transparent: true, opacity: 0.55 });
    const tagMat = new THREE.MeshStandardMaterial({ color: '#ffb92e', emissive: '#6a4300', roughness: 0.3 });
    for (let x = -15; x <= 15; x += 6) {
      for (let z = -8; z <= 8; z += 5.4) {
        const tub = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, -base, 14), tubMat);
        tub.position.set(x, base / 2, z);
        this.root.add(tub);
        if (p.tagLen > 0) {
          const len = demin + p.tagLen * (0.7 + 0.3 * rand());
          const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.35, len, 12), tagMat);
          tag.position.set(x, -len / 2, z);
          this.root.add(tag);
        }
      }
    }
    this.label('Dentina mineralizada · túbulos dentinarios', -14);

    if (!p.adhesive && demin <= 0) {
      this.slab(0, 1.4, '#9a9488', 0.9);
      this.label('Barrillo dentinario (smear layer)', 0.7, 'warn');
    }

    // Zona desmineralizada: colágeno infiltrado (capa híbrida) y expuesto
    if (demin > 0) {
      const top = 0, bot = -demin;
      const fibrils = [], colors = [];
      const cInf = new THREE.Color('#ffcf6b'), cExp = new THREE.Color('#ff4d6d');
      const span = p.collapsed ? demin * 0.3 : demin;
      for (let i = 0; i < 360; i++) {
        let x = (rand() - 0.5) * W, z = (rand() - 0.5) * DZ, y = top - rand() * span;
        let ang = rand() * Math.PI * 2;
        for (let s = 0; s < 6; s++) {
          const nx = THREE.MathUtils.clamp(x + Math.cos(ang) * 1.6, -W / 2, W / 2);
          const nz = THREE.MathUtils.clamp(z + Math.sin(ang) * 1.6, -DZ / 2, DZ / 2);
          const ny = THREE.MathUtils.clamp(y + (rand() - 0.5) * (p.collapsed ? 0.2 : 1.2), top - span, top);
          fibrils.push(x, y, z, nx, ny, nz);
          for (const yy of [y, ny]) { const c = (p.adhesive && yy > -inf) ? cInf : cExp; colors.push(c.r, c.g, c.b); }
          x = nx; y = ny; z = nz; ang += (rand() - 0.5) * 1.2;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(fibrils, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      this.root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })));
      if (p.adhesive && inf > 0) this.slab(-inf, 0, '#ffb92e', 0.22);
      if (demin - (p.adhesive ? inf : 0) > 0.1) {
        this.slab(bot, p.adhesive ? -inf : 0, '#ff4d6d', 0.16);
        this.label(`Colágeno expuesto sin infiltrar: ${(demin - (p.adhesive ? inf : 0)).toFixed(1)} µm`, (bot + (p.adhesive ? -inf : 0)) / 2, 'bad');
      }
      if (p.adhesive) this.label(`Capa híbrida: ${inf.toFixed(1)} µm${p.collapsed ? ' (colágeno colapsado)' : ''}`, -inf / 2, p.collapsed ? 'bad' : 'ok');
      if (p.hap) {
        const n = 260, geo = new THREE.BoxGeometry(0.5, 0.14, 0.14);
        const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff' }), n);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        for (let i = 0; i < n; i++) {
          e.set(rand() * 3, rand() * 3, rand() * 3); q.setFromEuler(e);
          m.compose(new THREE.Vector3((rand() - 0.5) * W, -rand() * demin, (rand() - 0.5) * DZ), q, new THREE.Vector3(1, 1, 1));
          im.setMatrixAt(i, m);
        }
        this.root.add(im);
        this.label('Hidroxiapatita residual · nanocapas MDP-Ca (unión química)', -demin - 1.6, 'ok');
      }
    }

    let y = 0;
    if (p.adhesive) {
      const adhT = 5;
      const uncured = p.adhCure < 0.9;
      this.slab(0, adhT, uncured ? '#f7e7b0' : '#f5cf6a', 0.5);
      if (p.overwet || p.solventLeft) {
        this.particles(p.overwet ? 40 : 20, 0.6, adhT - 0.6, 0.45, '#e8f3ff', rand);
        this.label(p.overwet ? 'Burbujas de agua atrapadas en el adhesivo' : 'Solvente residual: porosidades', adhT * 0.5, 'bad');
      } else {
        this.label(`Capa adhesiva${uncured ? ' (subpolimerizada)' : ''}`, adhT * 0.5, uncured ? 'bad' : '');
      }
      y = adhT;
    }
    if (p.coat) {
      const coatT = 7;
      this.slab(y, y + coatT, '#efe8d8', 0.88);
      this.particles(160, y + 0.4, y + coatT - 0.4, 0.22, '#ffffff', rand);
      this.label(`Resin coat (resina fluida)${p.coatCure < 0.9 ? ' · subpolimerizado' : ''}`, y + coatT / 2, p.coatCure < 0.9 ? 'bad' : 'ok');
      y += coatT;
    }
    if (p.composite) {
      const cT = 8;
      this.slab(y, y + cT, '#e2c896', 0.92);
      this.particles(260, y + 0.5, y + cT - 0.5, 0.45, '#fffaf0', rand);
      this.label('Composite (relleno inorgánico)', y + cT / 2);
      y += cT;
    }
    this.label(p.total ? 'Grabado total · técnica húmeda' : 'Dentina en modo autograbante', y + 3, 'title');
  }

  _enamel(p) {
    const rand = rng(11);
    const etched = p.enamelEtch > 1;
    const depth = etched ? THREE.MathUtils.clamp(p.enamelEtch * 0.45, 2, 9) * (0.6 + 0.4 * p.enamelCov) : 0;
    const base = -18, r = 1.55;
    const geo = new THREE.CylinderGeometry(r, r, 1, 6);
    const pts = [];
    for (let row = 0, z = -DZ / 2 + r; z < DZ / 2 - r; z += r * 1.75, row++) {
      for (let x = -W / 2 + r + (row % 2) * r * 0.98; x < W / 2 - r; x += r * 1.96) pts.push([x, z]);
    }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.5 }), pts.length);
    const m = new THREE.Matrix4();
    let minTop = 0;
    pts.forEach(([x, z], i) => {
      const top = etched ? -depth * (0.55 + 0.45 * rand()) : 0;
      minTop = Math.min(minTop, top);
      const h = top - base;
      m.compose(new THREE.Vector3(x, base + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(etched ? 0.9 : 1, h, etched ? 0.9 : 1));
      im.setMatrixAt(i, m);
    });
    this.root.add(im);
    this.slab(base, etched ? -depth * 0.95 : 0, '#e9e2d0', 0.35);
    this.label(etched ? `Esmalte grabado ${p.enamelEtch.toFixed(1)} s · patrón de grabado` : 'Esmalte sin grabar (liso)', base / 2, etched ? 'ok' : 'bad');

    let y = 0;
    if (p.adhesive && p.enamelAdh > 0.2) {
      if (etched) {
        this.slab(minTop, 0, '#ffb92e', 0.35);
        this.label(`Tags de resina · microrretención (${depth.toFixed(1)} µm)`, minTop / 2, 'ok');
      } else {
        this.label('Sin microrretención: unión débil al esmalte', -0.8, 'bad');
      }
      this.slab(0, 4, p.adhCure < 0.9 ? '#f7e7b0' : '#f5cf6a', 0.55);
      this.label('Adhesivo', 2);
      y = 4;
    } else if (p.adhesive) {
      this.label('Esmalte sin adhesivo en esta zona', 1, 'bad');
    }
    if (p.composite) {
      this.slab(y, y + 8, '#ece3cf', 0.92);
      this.particles(240, y + 0.5, y + 7.5, 0.45, '#fffaf0', rand);
      this.label('Composite', y + 4);
      y += 8;
    }
    this.label('Interfase esmalte–resina', y + 3, 'title');
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
