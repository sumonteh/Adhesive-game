// Instrumentos y materiales de la bandeja + sus modelos 3D.
import * as THREE from 'three';

// type: 'drop' (se suelta sobre el diente), 'paint' (se aplica mientras se mantiene presionado),
//       'extrude' (mantener presionado para extruir un incremento de composite).
export const TOOLS = {
  dique:       { name: 'Dique de goma',                 icon: '🛡️', color: '#1f9e8f', type: 'drop' },
  matriz:      { name: 'Matriz seccional + cuñas',      icon: '🧷', color: '#c9d1d9', type: 'drop' },
  limpieza:    { name: 'Piedra pómez + cepillo',        icon: '🪥', color: '#d9d2c3', type: 'drop' },
  acido:       { name: 'Ácido ortofosfórico 37%',       icon: '🧪', color: '#2f7cf6', type: 'paint', radius: 0.09 },
  agua:        { name: 'Jeringa triple: agua',          icon: '💧', color: '#7cc7ff', type: 'paint', radius: 0.24 },
  aire:        { name: 'Jeringa triple: aire',          icon: '💨', color: '#e3e9ef', type: 'paint', radius: 0.3 },
  microbrush:  { name: 'Microbrush seco (absorber)',    icon: '🖌️', color: '#f5f5f5', type: 'paint', radius: 0.16 },
  universal:   { name: 'Adhesivo universal',            icon: '🧴', color: '#f0c24b', type: 'paint', radius: 0.14 },
  primer:      { name: 'Primer autograbante (frasco 1)', icon: '①', color: '#e9a84a', type: 'paint', radius: 0.14 },
  bond:        { name: 'Adhesivo (frasco 2)',           icon: '②', color: '#f3d27a', type: 'paint', radius: 0.14 },
  lampara:     { name: 'Lámpara LED',                   icon: '🔦', color: '#3b55e6', type: 'drop' },
  fluida:      { name: 'Resina fluida (resin coat)',    icon: '💉', color: '#efe9dc', type: 'paint', radius: 0.12 },
  fibra:       { name: 'Fibra de polietileno',          icon: '🧵', color: '#ffffff', type: 'drop' },
  compDentina: { name: 'Composite dentina A3 (opaco)',  icon: '🟫', color: '#dcbd88', type: 'extrude', shade: 'dentina' },
  compEsmalte: { name: 'Composite esmalte A2 (transl.)', icon: '⬜', color: '#f1eadb', type: 'extrude', shade: 'esmalte' },
  pulido:      { name: 'Discos y gomas de pulido',      icon: '✨', color: '#ff9fb8', type: 'drop' },
};

export function trayFor(cfg) {
  return [
    'dique',
    ...(cfg.level.matrix ? ['matriz'] : []),
    'limpieza', 'acido', 'agua', 'aire', 'microbrush',
    ...(cfg.adhesive === 'universal' ? ['universal'] : ['primer', 'bond']),
    'lampara', 'fluida',
    ...(cfg.level.fiber ? ['fibra'] : []),
    'compDentina', 'compEsmalte', 'pulido',
  ];
}

const cyl = (rt, rb, h, mat, y, seg = 16) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.y = y;
  return m;
};

// Modelo con la punta en el origen y el cuerpo hacia +Y.
export function makeToolModel(id) {
  const t = TOOLS[id], g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.4, metalness: 0.1 });
  const metal = new THREE.MeshStandardMaterial({ color: '#cfd6dd', metalness: 0.9, roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: '#39424d', roughness: 0.5, metalness: 0.3 });

  if (id === 'lampara') {
    g.add(cyl(0.1, 0.12, 0.9, dark, 0.75, 24));
    g.add(cyl(0.05, 0.05, 0.28, new THREE.MeshStandardMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.8 }), 0.16));
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.55, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: '#4d7bff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 0.02 - 0.275;
    beam.name = 'beam';
    beam.visible = false;
    g.add(beam);
  } else if (['universal', 'primer', 'bond', 'microbrush'].includes(id)) {
    g.add(cyl(0.012, 0.012, 0.75, new THREE.MeshStandardMaterial({ color: id === 'microbrush' ? '#7ac' : t.color }), 0.42, 8));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), new THREE.MeshStandardMaterial({ color: id === 'microbrush' ? '#fff' : t.color, roughness: 0.9 }));
    tip.position.y = 0.03;
    g.add(tip);
  } else if (id === 'agua' || id === 'aire') {
    g.add(cyl(0.018, 0.022, 0.45, metal, 0.24, 10));
    g.add(cyl(0.06, 0.06, 0.55, dark, 0.74, 16));
  } else if (['acido', 'fluida', 'compDentina', 'compEsmalte'].includes(id)) {
    g.add(cyl(0.008, 0.02, 0.18, metal, 0.09, 10));
    g.add(cyl(0.055, 0.055, 0.6, body, 0.5, 18));
    g.add(cyl(0.02, 0.02, 0.25, new THREE.MeshStandardMaterial({ color: '#eee' }), 0.92, 8));
  } else {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), body);
    head.position.y = 0.09;
    g.add(head);
    g.add(cyl(0.02, 0.02, 0.6, metal, 0.45, 8));
  }
  g.traverse(o => { if (o.isMesh) { o.raycast = () => {}; o.castShadow = false; } });
  return g;
}

// Partículas simples para el spray de agua/aire.
export class Spray {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.SphereGeometry(0.012, 6, 4);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
      m.visible = false;
      m.raycast = () => {};
      scene.add(m);
      this.pool.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.i = 0;
  }
  emit(from, to, color, n = 3) {
    for (let k = 0; k < n; k++) {
      const p = this.pool[this.i++ % this.pool.length];
      p.m.position.copy(from);
      p.v.copy(to).sub(from).normalize().multiplyScalar(2.4)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9));
      p.life = 0.22;
      p.m.material.color.set(color);
      p.m.visible = true;
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0, p.life / 0.22) * 0.8;
      if (p.life <= 0) p.m.visible = false;
    }
  }
}
