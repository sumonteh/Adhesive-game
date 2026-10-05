// Molar procedural: corona con cúspides, cavidad tallada, estados por vértice
// (gel, humedad, adhesivo…) y mallas de relleno para los incrementos de composite.
import * as THREE from 'three';

export const UNIT_MM = 5;        // 1 unidad de escena = 5 mm
export const ENAMEL_T = 0.4;     // espesor de esmalte oclusal ≈ 2 mm
export const ZONE = { OUTER: 0, ENAMEL: 1, DENTIN: 2 };

const NR = 72;   // anillos de la cara oclusal
const NS = 16;   // filas de la pared axial
const NA = 200;  // divisiones angulares
const A = 1.05, B = 0.94, EXP = 2.6; // contorno superelíptico (mesiodistal × vestibulolingual)

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, s, h) => { const dx = x - cx, dz = z - cz; return h * Math.exp(-(dx * dx + dz * dz) / (2 * s * s)); };

export function outlineR(th) {
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  return Math.pow(Math.pow(c / A, EXP) + Math.pow(s / B, EXP), -1 / EXP);
}

// Altura de la superficie oclusal intacta.
export function surfaceY(x, z, r) {
  let y = 1.38;
  y += gauss(x, z, 0.46, 0.38, 0.27, 0.30);   // mesiovestibular
  y += gauss(x, z, -0.44, 0.38, 0.27, 0.27);  // distovestibular
  y += gauss(x, z, 0.46, -0.38, 0.27, 0.31);  // mesiolingual
  y += gauss(x, z, -0.44, -0.38, 0.27, 0.27); // distolingual
  y += gauss(x, z, 0.02, -0.5, 0.22, 0.10);
  // surco central y surco vestibulolingual
  y -= 0.08 * Math.exp(-(z * z) / (2 * 0.07 * 0.07)) * (1 - smooth(0.55, 0.95, Math.abs(x)));
  y -= 0.06 * Math.exp(-(x * x) / (2 * 0.06 * 0.06)) * (1 - smooth(0.4, 0.8, Math.abs(z)));
  // rebordes marginales
  y += 0.06 * Math.exp(-Math.pow((Math.abs(x) - 0.82) / 0.07, 2)) * (1 - smooth(0.3, 0.6, Math.abs(z)));
  const sh = smooth(0.6, 1.0, r);
  y -= 0.55 * sh * sh;
  return y;
}

function sdRoundBox(px, pz, bx, bz, rad) {
  const qx = Math.abs(px) - bx + rad, qz = Math.abs(pz) - bz + rad;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rad;
}
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// sd < 0 dentro de la preparación; floor = altura absoluta del piso.
export const CAVITIES = {
  claseI: {
    sd: (x, z) => smin(sdRoundBox(x, z, 0.5, 0.15, 0.13), sdRoundBox(x + 0.02, z, 0.15, 0.27, 0.13), 0.12),
    floor: () => 0.66,
    wall: 0.06,
  },
  mod: {
    sd: (x, z) => smin(sdRoundBox(x, z, 1.5, 0.21, 0.1), sdRoundBox(Math.abs(x) - 1.02, z, 0.42, 0.36, 0.08), 0.1),
    floor: (x) => 0.52 - 0.26 * smooth(0.55, 0.63, Math.abs(x)), // piso pulpar + piso gingival de las cajas
    wall: 0.06,
  },
};

const C = (hex) => new THREE.Color(hex);
const PAL = {
  enamel: C('#ece5d3'), enamelOuter: C('#f2ede1'), dentin: C('#d5b276'),
  frosty: C('#fdfdfb'), gel: C('#2a6ff0'), adh: C('#f0c95c'), primer: C('#e7c48e'),
  coat: C('#f3eee3'), wetTint: C('#aebfcf'),
};

export class Tooth {
  constructor(cavityKey) {
    this.cav = CAVITIES[cavityKey];
    this.group = new THREE.Group();
    this._tmp = new THREE.Color();
    this._buildCrown();
    this._buildStates();
    this._buildCavityFill();
    this._buildSurroundings();
  }

  _buildCrown() {
    const rows = NR + 1 + NS, N = rows * NA;
    this.N = N; this.NTOP = (NR + 1) * NA;
    const pos = new Float32Array(N * 3);
    this.zone = new Uint8Array(N);
    this.inCav = new Float32Array(N);
    this.origY = new Float32Array(N);
    this.cavY = new Float32Array(N);
    const edgeY = new Float32Array(NA);

    for (let i = 0; i <= NR; i++) {
      const r = i / NR;
      for (let j = 0; j < NA; j++) {
        const th = (j / NA) * Math.PI * 2, R = outlineR(th);
        const x = r * R * Math.cos(th), z = r * R * Math.sin(th);
        const oy = surfaceY(x, z, r);
        const sd = this.cav.sd(x, z);
        const f = smooth(0, this.cav.wall, -sd);
        const cy = oy - f * Math.max(0, oy - this.cav.floor(x, z));
        const k = i * NA + j;
        pos[k * 3] = x; pos[k * 3 + 1] = cy; pos[k * 3 + 2] = z;
        this.origY[k] = oy; this.cavY[k] = cy; this.inCav[k] = f;
        if (f > 0.02) {
          const depth = oy - cy;
          this.zone[k] = (depth < ENAMEL_T * 0.85 || r > 0.9) ? ZONE.ENAMEL : ZONE.DENTIN;
        } else if (sd < 0.07) {
          this.zone[k] = ZONE.ENAMEL; // ángulo cavosuperficial
        } else {
          this.zone[k] = ZONE.OUTER;
        }
        if (i === NR) edgeY[j] = cy;
      }
    }
    for (let s = 1; s <= NS; s++) {
      const t = s / NS;
      const sc = 1 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.5)) - 0.15 * t * t;
      for (let j = 0; j < NA; j++) {
        const th = (j / NA) * Math.PI * 2, R = outlineR(th) * sc;
        const k = (NR + s) * NA + j;
        const y = edgeY[j] * (1 - t);
        pos[k * 3] = R * Math.cos(th); pos[k * 3 + 1] = y; pos[k * 3 + 2] = R * Math.sin(th);
        this.origY[k] = y; this.cavY[k] = y; this.zone[k] = ZONE.OUTER;
      }
    }
    const idx = [];
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < NA; j++) {
        const j2 = (j + 1) % NA;
        const a = i * NA + j, b = i * NA + j2, c = (i + 1) * NA + j, d = (i + 1) * NA + j2;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.colors = new Float32Array(N * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo = geo;
    this.positions = pos;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35,
    }));

    // Película brillante (agua, gel, adhesivo) superpuesta con alfa por vértice.
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', geo.attributes.position);
    fgeo.setAttribute('normal', geo.attributes.normal);
    fgeo.setIndex(geo.index);
    this.film = new Float32Array(N * 4);
    fgeo.setAttribute('color', new THREE.BufferAttribute(this.film, 4));
    this.filmMesh = new THREE.Mesh(fgeo, new THREE.MeshPhysicalMaterial({
      vertexColors: true, transparent: true, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }));
    this.filmMesh.renderOrder = 2;
    this.filmMesh.raycast = () => {};
    this.group.add(this.mesh, this.filmMesh);
  }

  _buildStates() {
    const N = this.N;
    this.s = {
      gel: new Uint8Array(N), gelOn: new Float32Array(N), etchT: new Float32Array(N),
      wet: new Float32Array(N), primer: new Uint8Array(N), adh: new Uint8Array(N), coat: new Uint8Array(N),
    };
    this.counts = [0, 0, 0];
    for (let k = 0; k < this.NTOP; k++) {
      this.s.wet[k] = this.inCav[k] > 0.02 ? 0.25 : 0.1;
      this.counts[this.zone[k]]++;
    }
  }

  // Recorre los vértices oclusales dentro de un radio; fn(k, peso 0..1).
  forEachInRadius(p, radius, fn) {
    const P = this.positions, r2 = radius * radius;
    for (let k = 0; k < this.NTOP; k++) {
      const dx = P[k * 3] - p.x, dy = P[k * 3 + 1] - p.y, dz = P[k * 3 + 2] - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) fn(k, 1 - Math.sqrt(d2) / radius);
    }
  }

  updateColors(now) {
    const s = this.s, col = this.colors, film = this.film, c = this._tmp;
    for (let k = 0; k < this.N; k++) {
      const z = this.zone[k];
      if (k >= this.NTOP) {
        col[k * 3] = PAL.enamelOuter.r; col[k * 3 + 1] = PAL.enamelOuter.g; col[k * 3 + 2] = PAL.enamelOuter.b;
        film[k * 4 + 3] = 0;
        continue;
      }
      c.copy(z === ZONE.DENTIN ? PAL.dentin : (this.inCav[k] > 0.02 ? PAL.enamel : PAL.enamelOuter));
      const wet = s.wet[k];
      const et = s.etchT[k] + (s.gel[k] ? now - s.gelOn[k] : 0);
      if (et > 2 && z !== ZONE.DENTIN && !s.adh[k] && !s.primer[k] && !s.gel[k]) {
        c.lerp(PAL.frosty, 0.85 * smooth(2, 12, et) * (1 - smooth(0.2, 0.5, wet)));
      }
      if (et > 2 && z === ZONE.DENTIN && !s.gel[k] && !s.adh[k]) c.multiplyScalar(1 - 0.06 * smooth(2, 15, et));
      if (s.primer[k]) c.lerp(PAL.primer, 0.25);
      if (s.adh[k]) c.lerp(PAL.adh, 0.35);
      if (s.coat[k]) c.lerp(PAL.coat, 0.75);
      if (wet > 0.3 && !s.adh[k]) {
        const w = smooth(0.3, 1, wet);
        c.lerp(PAL.wetTint, 0.12 * w).multiplyScalar(1 - 0.12 * w);
      }
      if (s.gel[k]) c.lerp(PAL.gel, 0.85);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;

      let a = 0.6 * smooth(0.25, 1, wet);
      if (s.primer[k]) a = Math.max(a, 0.3);
      if (s.adh[k]) a = Math.max(a, 0.45);
      if (s.coat[k]) a = Math.max(a, 0.35);
      if (s.gel[k]) a = Math.max(a, 0.55);
      film[k * 4] = s.gel[k] ? 0.25 : 1; film[k * 4 + 1] = s.gel[k] ? 0.5 : 1; film[k * 4 + 2] = 1;
      film[k * 4 + 3] = a;
    }
    this.geo.attributes.color.needsUpdate = true;
    this.filmMesh.geometry.attributes.color.needsUpdate = true;
  }

  // ---- Relleno por incrementos -------------------------------------------
  _buildCavityFill() {
    const index = this.geo.index.array;
    const map = new Int32Array(this.N).fill(-1);
    const verts = [], tris = [];
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      if (a >= this.NTOP || b >= this.NTOP || c >= this.NTOP) continue;
      if (this.inCav[a] < 0.01 || this.inCav[b] < 0.01 || this.inCav[c] < 0.01) continue;
      for (const v of [a, b, c]) {
        if (map[v] < 0) { map[v] = verts.length; verts.push(v); }
        tris.push(map[v]);
      }
    }
    this.fillVerts = Int32Array.from(verts);
    this.fillIndex = tris;
    let minY = Infinity;
    const ys = [];
    for (const v of verts) {
      minY = Math.min(minY, this.cavY[v]);
      if (this.inCav[v] > 0.5) ys.push(this.origY[v]);
    }
    ys.sort((a, b) => a - b);
    this.floorMin = minY;
    this.fillTarget = ys[Math.floor(ys.length * 0.97)];   // superficie a reconstruir
    this.dejY = this.fillTarget - ENAMEL_T;               // unión amelodentinaria (UAD)
  }

  makeFillMesh(color) {
    const n = this.fillVerts.length, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = this.fillVerts[i];
      pos[i * 3] = this.positions[k * 3]; pos[i * 3 + 2] = this.positions[k * 3 + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(this.fillIndex);
    const mesh = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({
      color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, transparent: true, opacity: 0.92,
    }));
    mesh.raycast = () => {};
    this.group.add(mesh);
    return mesh;
  }

  setFillLevel(mesh, level) {
    const p = mesh.geometry.attributes.position.array;
    for (let i = 0; i < this.fillVerts.length; i++) {
      const k = this.fillVerts[i], cy = this.cavY[k], oy = this.origY[k];
      p[i * 3 + 1] = level <= cy + 0.003 ? cy - 0.04 : Math.min(level, oy) + 0.002;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }

  // ---- Entorno: encía, vecinos, dique, matriz, fibra ------------------------
  _outlinePath(scale, path, flipZ = true) {
    for (let j = 0; j <= 96; j++) {
      const th = (j / 96) * Math.PI * 2, R = outlineR(th) * scale;
      const x = R * Math.cos(th), y = (flipZ ? -1 : 1) * R * Math.sin(th);
      j === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
    }
    return path;
  }

  _sheet(w, h, toothScale, neighborR, opts) {
    const shape = new THREE.Shape();
    shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h); shape.lineTo(-w, h); shape.closePath();
    shape.holes.push(this._outlinePath(toothScale, new THREE.Path()));
    for (const sx of [-1, 1]) {
      const p = new THREE.Path();
      p.absellipse(sx * 2.02, 0, neighborR, neighborR * 0.95, 0, Math.PI * 2, false, 0);
      shape.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(shape, { curveSegments: 32, ...opts });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  _buildSurroundings() {
    const gumGeo = this._sheet(3.4, 2.6, 0.86, 0.72, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 });
    const gum = new THREE.Mesh(gumGeo, new THREE.MeshStandardMaterial({ color: '#d4868c', roughness: 0.55 }));
    gum.position.y = -0.92;
    gum.raycast = () => {};
    this.group.add(gum);

    for (const sx of [-1, 1]) {
      const g = new THREE.SphereGeometry(1, 48, 32);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (y > 0.2) p.setY(i, y + 0.12 * Math.max(0, Math.cos(x * 4) * Math.cos(z * 4)) * y);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: '#efe8d8', roughness: 0.4, clearcoat: 0.4 }));
      m.scale.set(0.86, 0.78, 0.82);
      m.position.set(sx * 2.02, 0.55, 0);
      m.raycast = () => {};
      this.group.add(m);
    }

    // Dique de goma
    const damGeo = this._sheet(3.6, 2.8, 0.9, 0.76, { depth: 0.02, bevelEnabled: false });
    const dp = damGeo.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), z = dp.getZ(i);
      const d = Math.hypot(x / 1.3, z);
      dp.setY(i, dp.getY(i) + 0.12 * Math.pow(Math.max(0, d - 1.1), 1.3));
    }
    damGeo.computeVertexNormals();
    this.dam = new THREE.Mesh(damGeo, new THREE.MeshStandardMaterial({ color: '#1f9e8f', roughness: 0.5, side: THREE.DoubleSide }));
    this.dam.position.y = 0.16;
    this.dam.visible = false;
    this.dam.raycast = () => {};
    const clampMat = new THREE.MeshStandardMaterial({ color: '#cfd6dd', metalness: 0.9, roughness: 0.25 });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.025, 8, 48, Math.PI), clampMat);
    bow.rotation.y = Math.PI / 2; bow.position.y = 0.28; bow.scale.set(1, 0.55, 0.85);
    this.dam.add(bow);
    this.group.add(this.dam);

    // Matriz seccional + cuñas
    this.matrix = new THREE.Group();
    const band = new THREE.MeshStandardMaterial({ color: '#c9d1d9', metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide });
    for (const [sx, th] of [[1, Math.PI / 2], [-1, 3 * Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, 1.25, 32, 1, true, th - 0.5, 1.0), band);
      m.position.y = 0.62;
      this.matrix.add(m);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 3), new THREE.MeshStandardMaterial({ color: '#e9d9b4', roughness: 0.6 }));
      w.rotation.x = Math.PI / 2; w.position.set(sx * 1.22, 0.12, 0);
      this.matrix.add(w);
    }
    this.matrix.visible = false;
    this.matrix.traverse(o => { if (o.isMesh) o.raycast = () => {}; });
    this.group.add(this.matrix);

    // Fibra de polietileno (sólo se usa en el nivel biomimético)
    const fg = new THREE.PlaneGeometry(1.9, 0.2, 80, 2);
    fg.rotateX(-Math.PI / 2);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setY(i, this.cav.floor(fp.getX(i), fp.getZ(i)) + 0.03);
    fg.computeVertexNormals();
    this.fiber = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: weaveTexture(), transparent: true, opacity: 0.95, roughness: 0.6, side: THREE.DoubleSide }));
    this.fiber.visible = false;
    this.fiber.raycast = () => {};
    this.group.add(this.fiber);
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose(); });
    });
  }
}

function weaveTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f7f4'; x.fillRect(0, 0, 256, 32);
  x.strokeStyle = 'rgba(120,130,140,0.55)'; x.lineWidth = 1.2;
  for (let i = -32; i < 256; i += 6) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 32, 32); x.stroke();
    x.beginPath(); x.moveTo(i + 32, 0); x.lineTo(i, 32); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
