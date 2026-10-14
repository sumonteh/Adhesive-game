// Superficie con estados por vértice (gel, humedad, arenado, contaminación, primers, cemento)
// y color/película brillante que los reflejan.
import * as THREE from 'three';
import { Z } from './geometry.js';

const C = (h) => new THREE.Color(h);
const PAL = {
  enamel: C('#ece5d3'), dentin: C('#d5b276'), ids: C('#eee0b8'), frosty: C('#fdfdfb'),
  gelP: C('#2a6ff0'), gelHF: C('#e0506b'), wetTint: C('#aebfcf'), abr: C('#dcd8d0'),
  contam: C('#8fa7ba'), cement: C('#f3ecdc'), glassEtch: C('#fcfaf6'),
};
export const PRODUCT = { toothprimer: 1, mlprimer: 2, adhese: 3, sbu: 4, silano: 5, ccpp: 6, monobond: 7 };
const PCOLOR = ['#000', '#b48be0', '#e89a6a', '#f3d27a', '#f0c24b', '#9fd1b5', '#b9a6e8', '#e8c36a'].map(C);

export class Paintable {
  constructor(mesh, zone, { base = null, glass = false, ids = false } = {}) {
    this.mesh = mesh;
    const geo = mesh.geometry;
    this.N = geo.attributes.position.count;
    this.P = geo.attributes.position.array;
    this.zone = zone || new Uint8Array(this.N).fill(Z.INTAGLIO);
    this.base = base ? C(base) : null;
    this.glass = glass;
    this.ids = ids;
    this.colors = new Float32Array(this.N * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    mesh.material.vertexColors = true;
    mesh.material.needsUpdate = true;
    const n = this.N;
    this.s = {
      gel: new Uint8Array(n), gelOn: new Float32Array(n), etchT: new Float32Array(n), acid2: new Uint8Array(n),
      wet: new Float32Array(n), abr: new Float32Array(n), contam: new Float32Array(n),
      prod: new Uint8Array(n), cement: new Float32Array(n), clean: new Float32Array(n),
    };
    for (let k = 0; k < n; k++) this.s.wet[k] = this.zone[k] === Z.INTAGLIO ? 0 : 0.25;
    this.counts = [0, 0, 0, 0];
    for (let k = 0; k < n; k++) this.counts[this.zone[k]]++;
    // Película brillante
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', geo.attributes.position);
    fg.setAttribute('normal', geo.attributes.normal);
    fg.setIndex(geo.index);
    this.film = new Float32Array(n * 4);
    fg.setAttribute('color', new THREE.BufferAttribute(this.film, 4));
    this.filmMesh = new THREE.Mesh(fg, new THREE.MeshPhysicalMaterial({
      vertexColors: true, transparent: true, roughness: 0.05, clearcoat: 1, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2, side: mesh.material.side,
    }));
    this.filmMesh.renderOrder = 2;
    this.filmMesh.raycast = () => {};
    mesh.add(this.filmMesh);
    this._tmp = new THREE.Color();
    this._v = new THREE.Vector3();
  }

  forEach(worldPoint, radius, fn) {
    const p = this.mesh.worldToLocal(this._v.copy(worldPoint)), P = this.P, r2 = radius * radius;
    for (let k = 0; k < this.N; k++) {
      if (!this.zone[k]) continue;
      const dx = P[k * 3] - p.x, dy = P[k * 3 + 1] - p.y, dz = P[k * 3 + 2] - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r2) fn(k, 1 - Math.sqrt(d2) / radius);
    }
  }

  // Estadísticas de un canal en una zona (o todas las pintables si zone = 0).
  frac(channel, zone = 0, thr = 0.5) {
    const a = this.s[channel]; let n = 0, c = 0;
    for (let k = 0; k < this.N; k++) {
      const z = this.zone[k];
      if (!z || (zone && z !== zone)) continue;
      n++; if (a[k] > thr) c++;
    }
    return n ? c / n : 0;
  }
  avg(channel, zone = 0) {
    const a = this.s[channel]; let n = 0, sum = 0;
    for (let k = 0; k < this.N; k++) {
      const z = this.zone[k];
      if (!z || (zone && z !== zone)) continue;
      n++; sum += a[k];
    }
    return n ? sum / n : 0;
  }
  etchStats(zone, now) {
    const s = this.s; let n = 0, c = 0, sum = 0;
    for (let k = 0; k < this.N; k++) {
      if (this.zone[k] !== zone) continue;
      n++;
      const te = s.etchT[k] + (s.gel[k] === 1 || s.gel[k] === 2 ? now - s.gelOn[k] : 0);
      if (te > 0.5) { c++; sum += te; }
    }
    return { cov: n ? c / n : 0, avg: c ? sum / c : 0 };
  }
  gelCount() { let c = 0; for (let k = 0; k < this.N; k++) if (this.s.gel[k]) c++; return c; }

  updateColors(now) {
    const s = this.s, col = this.colors, film = this.film, c = this._tmp;
    for (let k = 0; k < this.N; k++) {
      const z = this.zone[k];
      if (z === Z.ENAMEL) c.copy(PAL.enamel);
      else if (z === Z.DENTIN) c.copy(this.ids ? PAL.ids : PAL.dentin);
      else if (z === Z.INTAGLIO) c.copy(this.base || PAL.enamel);
      else c.copy(PAL.enamel).multiplyScalar(0.97);
      const wet = s.wet[k];
      const et = s.etchT[k] + (s.gel[k] ? now - s.gelOn[k] : 0);
      if (et > 2 && !s.gel[k] && !s.prod[k] && wet < 0.4) {
        if (z === Z.ENAMEL) c.lerp(PAL.frosty, 0.8 * Math.min(1, (et - 2) / 10));
        else if (z === Z.INTAGLIO && this.glass) c.lerp(PAL.glassEtch, 0.6 * Math.min(1, (et - 2) / 15)).multiplyScalar(0.97);
      }
      if (s.abr[k] > 0) c.lerp(PAL.abr, 0.55 * s.abr[k]);
      if (s.contam[k] > 0) c.lerp(PAL.contam, 0.35 * s.contam[k]);
      if (s.prod[k]) c.lerp(PCOLOR[s.prod[k]], 0.3);
      if (s.cement[k] > 0) c.lerp(PAL.cement, 0.8 * s.cement[k]);
      if (wet > 0.3) { const w = Math.min(1, (wet - 0.3) / 0.7); c.lerp(PAL.wetTint, 0.12 * w).multiplyScalar(1 - 0.1 * w); }
      if (s.gel[k]) c.lerp(s.gel[k] === 2 ? PAL.gelHF : PAL.gelP, 0.85);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      let a = 0.6 * Math.max(0, Math.min(1, (wet - 0.25) / 0.75));
      if (s.prod[k]) a = Math.max(a, 0.4);
      if (s.cement[k] > 0) a = Math.max(a, 0.35);
      if (s.gel[k]) a = Math.max(a, 0.55);
      if (z === Z.NONE) a = 0;
      film[k * 4] = 1; film[k * 4 + 1] = 1; film[k * 4 + 2] = 1; film[k * 4 + 3] = a;
    }
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.filmMesh.geometry.attributes.color.needsUpdate = true;
  }
}
