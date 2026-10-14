// Geometría procedural de cada caso: diente preparado (pintable) y restauración (con superficie interna pintable).
import * as THREE from 'three';
import { Tooth, outlineR, smooth, ZONE } from './tooth.js';

export const Z = { NONE: 0, ENAMEL: 1, DENTIN: 2, INTAGLIO: 3 };
const gauss = (x, z, cx, cz, s, h) => { const dx = x - cx, dz = z - cz; return h * Math.exp(-(dx * dx + dz * dz) / (2 * s * s)); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Malla de anillos (filas de centro/arriba hacia afuera/abajo), normales hacia afuera.
function ringGrid(rows, NA, pos) {
  const P = new Float32Array(rows * NA * 3);
  for (let i = 0; i < rows; i++) for (let j = 0; j < NA; j++) {
    const v = pos(i, j), k = (i * NA + j) * 3;
    P[k] = v[0]; P[k + 1] = v[1]; P[k + 2] = v[2];
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < NA; j++) {
    const j2 = (j + 1) % NA, a = i * NA + j, b = i * NA + j2, c = (i + 1) * NA + j, d = (i + 1) * NA + j2;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Subconjunto de una malla como cáscara: capa externa (outer) y capa interna (inner) de los mismos vértices.
function shellFromSubset(index, keep, outerPos, innerPos) {
  const map = new Int32Array(keep.length).fill(-1), verts = [], tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (!keep[a] || !keep[b] || !keep[c]) continue;
    for (const v of [a, b, c]) { if (map[v] < 0) { map[v] = verts.length; verts.push(v); } tris.push(map[v]); }
  }
  const mk = (src, flip) => {
    const P = new Float32Array(verts.length * 3);
    verts.forEach((v, i) => { const p = src(v); P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const I = flip ? tris.map((_, i) => tris[i - (i % 3) + (2 - (i % 3))]) : tris;
    g.setIndex(I);
    g.computeVertexNormals();
    return g;
  };
  return { outer: mk(outerPos, false), inner: mk(innerPos, true), verts };
}

const restoMat = (material) => {
  const m = {
    zirconia: { color: '#f4f2ee', roughness: 0.35, clearcoat: 0.6, metalness: 0 },
    disilicate: { color: '#eadfcd', roughness: 0.2, clearcoat: 0.9, metalness: 0, transmission: 0 },
    feldspathic: { color: '#f1e9da', roughness: 0.15, clearcoat: 1, metalness: 0 },
    metal: { color: '#a9b1b9', roughness: 0.28, clearcoat: 0.2, metalness: 0.9 },
  }[material];
  return new THREE.MeshPhysicalMaterial({ ...m, side: THREE.FrontSide });
};
const intaglioMat = () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });

// ---------------------------------------------------------------------------
// Corona sobre muñón (molar)
export function buildCrownCase(material) {
  const NA = 200;
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([0.48 * t, 1.1 - 0.05 * t * t, true]); }
  for (let i = 1; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; prof.push([0.48 + 0.14 * Math.sin(a), 0.93 + 0.12 * Math.cos(a), true]); }
  for (let i = 1; i <= 10; i++) { const t = i / 10; prof.push([0.62 + 0.10 * t, 0.93 - 0.79 * t, false]); }
  prof.push([0.75, 0.08, false], [0.77, 0.03, false], [0.78, 0.0, false], [0.78, -0.15, false], [0.77, -0.4, false]);
  const marginRow = prof.findIndex(p => p[1] === 0.0);
  const pos = (i, j) => {
    const [r, y0, occ] = prof[i], th = (j / NA) * Math.PI * 2, R = outlineR(th);
    const x = r * R * Math.cos(th), z = r * R * Math.sin(th);
    let y = y0;
    if (occ) y += gauss(x, z, 0.26, 0.22, 0.13, 0.07) + gauss(x, z, -0.26, 0.22, 0.13, 0.06) + gauss(x, z, 0.26, -0.22, 0.13, 0.07) + gauss(x, z, -0.26, -0.22, 0.13, 0.06);
    return [x, y, z];
  };
  const geo = ringGrid(prof.length, NA, pos);
  const zone = new Uint8Array(prof.length * NA);
  prof.forEach(([, y], i) => { for (let j = 0; j < NA; j++) zone[i * NA + j] = y < -0.005 ? Z.NONE : y < 0.16 ? Z.ENAMEL : Z.DENTIN; });
  const toothMesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.2 }));

  // Entorno (encía, vecinos, dique) sin corona visible
  const env = new Tooth('claseI');
  env.mesh.visible = false; env.filmMesh.visible = false;
  env.mesh.raycast = () => {};

  // Restauración: forma externa anatómica + superficie interna = muñón expandido
  const outerT = new Tooth('none', { surroundings: false });
  const outer = new THREE.Mesh(outerT.geo, restoMat(material));
  outerT.geo.deleteAttribute('color');
  const keepRows = prof.map(p => p[1] >= 0);
  const rowsIn = keepRows.filter(Boolean).length;
  const inPos = (i, j) => { const p = pos(i, j); const s = 1.012; return [p[0] * s, p[1] + 0.006, p[2] * s]; };
  const inGeo = ringGrid(rowsIn, NA, inPos);
  const inIdx = inGeo.index.array.slice();
  for (let t = 0; t < inIdx.length; t += 3) { const tmp = inIdx[t + 1]; inIdx[t + 1] = inIdx[t + 2]; inIdx[t + 2] = tmp; }
  inGeo.setIndex(Array.from(inIdx));
  inGeo.computeVertexNormals();
  const intaglio = new THREE.Mesh(inGeo, intaglioMat());
  // Anillo marginal entre la superficie interna y la externa
  const ringP = [], ringI = [];
  const op = outerT.geo.attributes.position.array, lastRow = outerT.N - NA;
  for (let j = 0; j < NA; j++) {
    const a = inPos(marginRow, j); ringP.push(...a);
    ringP.push(op[(lastRow + j) * 3], op[(lastRow + j) * 3 + 1], op[(lastRow + j) * 3 + 2]);
  }
  for (let j = 0; j < NA; j++) { const j2 = (j + 1) % NA; ringI.push(j * 2, j2 * 2, j * 2 + 1, j2 * 2, j2 * 2 + 1, j * 2 + 1); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ringP, 3)); rg.setIndex(ringI); rg.computeVertexNormals();
  const ring = new THREE.Mesh(rg, restoMat(material)); ring.material.side = THREE.DoubleSide;

  const margin = [];
  for (let j = 0; j < NA; j += 4) margin.push(new THREE.Vector3(...pos(marginRow, j)).multiplyScalar(1.04).setY(0.03));
  return { toothMesh, zone, env: env.group, dam: env.dam, outer, intaglio, ring, margin, kind: 'molar', benchRot: new THREE.Euler(Math.PI, 0, 0) };
}

// ---------------------------------------------------------------------------
// Onlay (molar)
export function buildOnlayCase(material) {
  const T = new Tooth('onlay');
  const zone = new Uint8Array(T.N);
  const P = T.positions;
  for (let k = 0; k < T.NTOP; k++) {
    if (T.zone[k] === ZONE.OUTER) continue;
    const x = P[k * 3], z = P[k * 3 + 2];
    const r = Math.hypot(x, z) / outlineR(Math.atan2(z, x));
    if (T.inCav[k] <= 0.02) zone[k] = Z.ENAMEL;
    else zone[k] = (r > 0.86 || T.origY[k] > 1.52) ? Z.ENAMEL : Z.DENTIN;
  }
  T.filmMesh.visible = false;
  const toothMesh = T.mesh;
  const keep = new Uint8Array(T.N);
  for (const v of T.fillVerts) keep[v] = 1;
  const sh = shellFromSubset(T.geo.index.array, keep,
    v => [P[v * 3], T.origY[v], P[v * 3 + 2]],
    v => [P[v * 3], T.cavY[v] + 0.004, P[v * 3 + 2]]);
  const outer = new THREE.Mesh(sh.outer, restoMat(material));
  const intaglio = new THREE.Mesh(sh.inner, intaglioMat());
  const margin = [];
  T.fillVerts.forEach((v, i) => { if (T.inCav[v] < 0.3 && i % 3 === 0) margin.push(new THREE.Vector3(P[v * 3], T.origY[v] + 0.01, P[v * 3 + 2])); });
  // El envoltorio del diente es el grupo de Tooth (incluye encía, vecinos y dique)
  T.group.remove(T.mesh);
  return { toothMesh, zone, env: T.group, dam: T.dam, outer, intaglio, ring: null, margin, kind: 'molar', benchRot: new THREE.Euler(Math.PI, 0, 0) };
}

// ---------------------------------------------------------------------------
// Carilla (incisivo central)
function incisorPoint(y, th, scale = 1) {
  const s = Math.sin(th), c = Math.cos(th);
  let a = 0.36 + 0.10 * smooth(-0.1, 0.75, y);
  if (y < 0) a = 0.36 - 0.12 * clamp(-y / 0.45, 0, 1);
  a *= 1 - 0.22 * Math.pow(smooth(0.95, 1.2, y), 1.5) * (0.6 + 0.4 * Math.abs(c)); // ángulos incisales redondeados
  const bF = 0.035 + 0.27 * Math.pow(1 - smooth(0.05, 1.18, y), 0.9);
  const bL = bF * (0.85 - 0.45 * Math.sin(Math.PI * clamp((y - 0.15) / 0.95, 0, 1)));
  const x = a * c, z = s > 0 ? bF * s : bL * s;
  return [x * scale, y * scale, z * scale];
}

export function buildVeneerCase(material) {
  const NA = 160, NY = 56, y0 = 1.2, y1 = -0.45;
  const rows = NY + 1;
  const ys = Array.from({ length: rows }, (_, i) => y0 + (y1 - y0) * (i / NY));
  const orig = [], prep = [], w = [];
  const pos = (i, j) => {
    const y = ys[i], th = (j / NA) * Math.PI * 2;
    let p = i === 0 ? [incisorPoint(y, th)[0], y, 0] : incisorPoint(y, th);
    const s = Math.sin(th);
    const ww = i === 0 ? 0 : smooth(0.15, 0.55, s) * (y > 0.02 ? 1 : 0) * (1 - smooth(1.08, 1.18, y));
    const d = 0.045 + 0.025 * clamp(y / 1.1, 0, 1);
    orig.push(p.slice()); w.push(ww);
    const q = [p[0], p[1], p[2] - d * ww];
    prep.push(q);
    return q;
  };
  const geo = ringGrid(rows, NA, pos);
  const zone = new Uint8Array(rows * NA);
  for (let k = 0; k < rows * NA; k++) {
    const [x, y] = prep[k];
    if (w[k] > 0.3 && y >= 0.02) zone[k] = (y < 0.35 && Math.abs(x) < 0.17 && w[k] > 0.7) ? Z.DENTIN : Z.ENAMEL;
  }
  const toothMesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.3 }));

  const keep = new Uint8Array(rows * NA);
  for (let k = 0; k < keep.length; k++) keep[k] = w[k] > 0.28 && prep[k][1] >= 0.02 ? 1 : 0;
  const sh = shellFromSubset(geo.index.array, keep, v => orig[v], v => [prep[v][0], prep[v][1], prep[v][2] + 0.004]);
  const outer = new THREE.Mesh(sh.outer, restoMat(material));
  const intaglio = new THREE.Mesh(sh.inner, intaglioMat());
  const margin = [];
  sh.verts.forEach((v, i) => { if ((w[v] < 0.45 || prep[v][1] < 0.07) && i % 2 === 0) margin.push(new THREE.Vector3(...orig[v])); });

  // Entorno anterior
  const env = new THREE.Group();
  const gum = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: '#d4868c', roughness: 0.55 }));
  gum.position.set(0, -0.56, -0.2);
  env.add(gum);
  for (const sx of [-1, 1]) {
    const ng = ringGrid(rows, NA, (i, j) => { const th = (j / NA) * Math.PI * 2; return i === 0 ? [incisorPoint(ys[i], th, 0.82)[0], ys[i] * 0.82, 0] : incisorPoint(ys[i], th, 0.82); });
    const n = new THREE.Mesh(ng, new THREE.MeshPhysicalMaterial({ color: '#efe8d8', roughness: 0.4, clearcoat: 0.4 }));
    n.position.set(sx * 0.86, 0, -0.16); n.rotation.y = -sx * 0.45;
    env.add(n);
  }
  const dam = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ color: '#1f9e8f', roughness: 0.5, side: THREE.DoubleSide }));
  dam.rotation.x = -Math.PI / 2; dam.position.y = 0.05; dam.visible = false;
  env.add(dam);
  env.traverse(o => { if (o.isMesh) o.raycast = () => {}; });
  return { toothMesh, zone, env, dam, outer, intaglio, ring: null, margin, kind: 'incisor', benchRot: new THREE.Euler(Math.PI / 2, 0, 0) };
}

export function buildCase(c) {
  if (c.resto === 'crown') return buildCrownCase(c.material);
  if (c.resto === 'onlay') return buildOnlayCase(c.material);
  return buildVeneerCase(c.material);
}
