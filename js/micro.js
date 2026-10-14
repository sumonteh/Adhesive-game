// Vista microscópica (esquemática) de la interfase diente – cemento – restauración.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CEMENTS, MATERIALS, matGroup, TOOLS } from './data.js';

const W = 34, DZ = 20;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export class MicroView {
  constructor(renderer, container) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1420');
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 800);
    this.camera.position.set(48, 20, 80);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(8, 2, 0);
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
  setSize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.labels.setSize(w, h); }
  setActive(on) { this.controls.enabled = on; this.labels.domElement.style.display = on ? '' : 'none'; }
  clear() { for (const c of [...this.root.children]) { this.root.remove(c); c.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); } }

  label(text, y, cls = '') {
    const el = document.createElement('div'); el.className = 'mlabel ' + cls; el.textContent = text;
    const o = new CSS2DObject(el); o.position.set(W / 2 + 1.5, y, DZ / 2); o.center.set(0, 0.5); this.root.add(o);
  }
  slab(y0, y1, color, opacity = 1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, Math.max(0.05, y1 - y0), DZ),
      new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.6, depthWrite: opacity >= 1 }));
    m.position.y = (y0 + y1) / 2; this.root.add(m); return m;
  }
  particles(n, y0, y1, r, color, rand, shape = 'sphere', scale = [1, 1, 1]) {
    const geo = shape === 'box' ? new THREE.BoxGeometry(r, r, r) : new THREE.SphereGeometry(r, 8, 6);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      e.set(rand() * 3, rand() * 3, rand() * 3); q.setFromEuler(e);
      m.compose(new THREE.Vector3((rand() - 0.5) * (W - 1), y0 + rand() * (y1 - y0), (rand() - 0.5) * (DZ - 1)), q, new THREE.Vector3(...scale));
      im.setMatrixAt(i, m);
    }
    this.root.add(im); return im;
  }

  // m: resultado de bondModel; S: resumen; tab: 'esmalte' | 'dentina'
  build(cfg, m, S, tab) {
    this.clear();
    const rand = rng(5), C = CEMENTS[cfg.cement], g = matGroup(cfg.case), M = MATERIALS[cfg.case.material];
    const weakTooth = m.weak === 'diente';
    // ---- Diente (y -22 … -4) ----
    if (tab === 'esmalte') {
      const etched = S.enamel.cov > 0.4 && S.enamel.etchT > 2;
      const depth = etched ? 6 : 0;
      const geo = new THREE.CylinderGeometry(1.5, 1.5, 1, 6);
      const pts = [];
      for (let row = 0, z = -DZ / 2 + 1.5; z < DZ / 2 - 1.5; z += 2.6, row++) for (let x = -W / 2 + 1.5 + (row % 2) * 1.5; x < W / 2 - 1.5; x += 3) pts.push([x, z]);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.5 }), pts.length);
      const mm = new THREE.Matrix4();
      pts.forEach(([x, z], i) => { const top = -4 - (etched ? depth * (0.5 + 0.5 * rand()) : 0); const h = top + 22; mm.compose(new THREE.Vector3(x, -22 + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(etched ? 0.9 : 1, h, etched ? 0.9 : 1)); im.setMatrixAt(i, mm); });
      this.root.add(im);
      this.label(etched ? `Esmalte grabado ${S.enamel.etchT.toFixed(0)} s` : 'Esmalte sin grabar', -14, etched ? 'ok' : (C.selfAdhesive ? 'bad' : ''));
      if (etched) { this.slab(-4 - depth, -4, '#ffb92e', 0.3); this.label('Tags de resina en el esmalte grabado', -4 - depth / 2, 'ok'); }
    } else {
      this.slab(-22, -6, '#d9b77a', 0.42);
      const tub = new THREE.MeshStandardMaterial({ color: '#4a3018', transparent: true, opacity: 0.55 });
      for (let x = -14; x <= 14; x += 5.6) for (let z = -7; z <= 7; z += 4.8) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 16, 12), tub); t.position.set(x, -14, z); this.root.add(t); }
      this.label('Dentina · túbulos', -14);
      if (cfg.ids) {
        this.slab(-6, -4.5, '#ffb92e', 0.35); this.slab(-4.5, -4, '#efe3bf', 0.9);
        this.label('IDS: capa híbrida + resin coat (sesión de preparación)', -5, 'ok');
      } else if (C.selfAdhesive) {
        const etchedD = S.dentin.cov > 0.15 && S.dentin.etchT > 1;
        this.slab(-6, -4, etchedD ? '#ff4d6d' : '#b9ad95', etchedD ? 0.3 : 0.6);
        this.label(etchedD ? 'Colágeno expuesto sin infiltrar (grabado con fosfórico)' : 'Interacción superficial del autoadhesivo (≈1 µm)', -5, etchedD ? 'bad' : '');
      } else {
        const ok = S.tp.id === C.toothPrimer;
        this.slab(-6, -4, ok ? '#ffb92e' : '#9a9488', ok ? 0.35 : 0.8);
        this.label(ok ? `Capa híbrida · ${TOOLS[C.toothPrimer].name}` : 'Sin primer del sistema: barrillo dentinario', -5, ok ? 'ok' : 'bad');
      }
    }
    this.label(`Diente–cemento: ${(tab === 'esmalte' ? m.E : m.D).toFixed(1)} MPa${weakTooth ? ' · eslabón débil' : ''}`, -2.6, weakTooth ? 'bad title-ish' : 'ok');

    // ---- Cemento (y -4 … 4) ----
    const cureOK = m.cure > 0.8;
    this.slab(-4, 4, cureOK ? '#e8dcc0' : '#cfc3a6', 0.88);
    this.particles(220, -3.5, 3.5, 0.45, '#fffaf0', rand);
    if (m.cure < 0.6) { this.particles(30, -3.5, 3.5, 0.8, '#7a6b55', rand); }
    this.label(`${C.name} · polimerización ${Math.round(m.cure * 100)}%${m.cure < 0.6 ? ' (insuficiente)' : ''}`, 0, m.cure < 0.6 ? 'bad' : '');

    // ---- Interfase restauración (y 4 … 6) ----
    const contam = Math.max(S.r.contamAtPrimer, S.r.contamFinal);
    if (g === 'glass') {
      const etched = S.r.hfCov > 0.3;
      if (etched) { this.particles(160, 4, 6, 0.7, '#ffcf6b', rand, 'sphere', [1, 1.6, 1]); this.label(`Patrón de grabado HF ${S.r.hfT.toFixed(0)} s, relleno por el cemento`, 5, 'ok'); }
      else this.label('Cerámica sin grabar: superficie lisa', 5, 'bad');
      const sil = ['silano', 'monobond', 'ccpp', 'sbu'].includes(S.r.primer);
      this.slab(6, 6.3, sil ? '#5fd39a' : '#555', sil ? 0.8 : 0.2);
      this.label(sil ? `Silano (${TOOLS[S.r.primer].name})` : 'Sin silano: no hay unión química', 6.6, sil ? 'ok' : 'bad');
    } else {
      const apa = S.r.apaCov > 0.4;
      this.particles(apa ? 200 : 20, 4, 6, 0.6, apa ? '#cfc8bb' : '#999', rand, 'box');
      const mdp = ['ccpp', 'monobond', 'sbu'].includes(S.r.primer) || C.mdp >= 1;
      this.slab(6, 6.3, mdp ? '#b48be0' : '#555', mdp ? 0.85 : 0.2);
      this.label(apa ? 'Superficie arenada (Al₂O₃ 50 µm)' : 'Superficie sin arenar', 5, apa ? 'ok' : 'bad');
      this.label(mdp ? 'MDP unido a los óxidos (enlace químico)' : (C.mdp > 0 ? 'Monómeros fosfatados del cemento' : 'Sin MDP: unión solo mecánica'), 6.6, mdp ? 'ok' : 'warn');
    }
    if (contam > 0.2) { this.particles(80, 5.5, 6.4, 0.35, '#3d5a70', rand); this.label('Proteínas salivales de la prueba (contaminación)', 7.6, 'bad'); }

    // ---- Restauración (y 6.3 … 18) ----
    const col = { zirconia: '#f2f0ea', disilicate: '#e6d8c4', feldspathic: '#efe6d6', metal: '#9ea7b0' }[cfg.case.material];
    this.slab(6.3, 18, col, cfg.case.material === 'metal' ? 1 : 0.9);
    if (cfg.case.material === 'disilicate') this.particles(260, 7, 17, 0.5, '#fff7ea', rand, 'box', [3.5, 0.5, 0.5]);
    else if (cfg.case.material === 'zirconia') this.particles(300, 7, 17, 1.2, '#ffffff', rand, 'box');
    else if (cfg.case.material === 'feldspathic') this.particles(120, 7, 17, 0.6, '#fffaf2', rand);
    const weakR = m.weak === 'restauracion';
    this.label(`${M.name} · cemento–restauración: ${m.rest.toFixed(1)} MPa${weakR ? ' · eslabón débil' : ''}`, 12, weakR ? 'bad' : 'ok');
    this.label(`Adhesión final 24 h: ${m.final24.toFixed(1)} MPa · envejecida: ${m.aged.toFixed(1)} MPa`, 21, 'title');
  }

  render() { this.controls.update(); this.renderer.render(this.scene, this.camera); this.labels.render(this.scene, this.camera); }
}
