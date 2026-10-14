// Modelo didáctico de resistencia adhesiva para cementación.
// Los valores base y los factores provienen de docs/literatura-cementacion.md
// (µTBS a 24 h como referencia; valores ilustrativos, no mediciones).
import { CEMENTS, MATERIALS, matGroup, faceList, PRIMERS } from './data.js';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const THRESHOLDS = [
  { v: 7, label: '≈ 6–8 MPa · riesgo de descementación' },
  { v: 18.5, label: '≈ 17–20 MPa · resiste la contracción' },
  { v: 25, label: '25 MPa · referencia ISO 9693 (metal-cerámica)' },
];

const timeQ = (t, target, over = 3) => {
  if (!t || t <= 0) return 0;
  if (t < target) return clamp(t / target, 0, 1);
  return t > target * over ? 0.9 : 1;
};

export function bondModel(cfg, S) {
  const C = CEMENTS[cfg.cement], g = matGroup(cfg.case), M = MATERIALS[cfg.case.material];
  const notes = [];

  // ---- Polimerización del cemento --------------------------------------------
  const faces = faceList(cfg.case);
  const lightDose = faces.reduce((a, f) => a + clamp((S.faceT[f] || 0) / 20, 0, 1), 0) / faces.length;
  const reach = lightDose * cfg.case.translucency;
  // Li 2025: en dentina, solo autopolimerización ≈ 56% de la fotopolimerizada; se usa un 70% como
  // compromiso, porque bajo una corona parte de la luz llega por los márgenes.
  let cure = C.cure === 'light' ? Math.pow(reach, 0.7) : 0.7 + 0.3 * reach;
  if (C.cure === 'light' && cfg.case.translucency < 0.3) notes.push('Cemento solo fotopolimerizable bajo un material opaco: casi no polimeriza.');
  if (S.cem.curedEarly) { cure *= 0.3; notes.push('El cemento se fotopolimerizó antes de asentar la restauración.'); }

  // ---- Lado diente -----------------------------------------------------------
  const eEtched = S.enamel.cov > 0.4 && S.enamel.etchT > 2;
  const eQ = eEtched ? clamp(1 - Math.max(0, Math.abs(S.enamel.etchT - 15) - 5) / 20, 0.7, 1) * (0.5 + 0.5 * Math.min(1, S.enamel.cov / 0.8)) : 0;
  const tp = S.tp;
  const tpOK = C.toothPrimer ? (tp.id === C.toothPrimer) : true;
  const P = C.toothPrimer ? PRIMERS[C.toothPrimer] : null;
  let tpQ = 1;
  if (C.toothPrimer) {
    tpQ = tpOK ? (0.4 + 0.6 * tp.cov) * (0.5 + 0.5 * tp.timeQ) * (0.75 + 0.25 * tp.airQ) : 0.35;
    if (tpOK && P.light && tp.lightQ < 0.9) { tpQ *= 0.38 + 0.62 * tp.lightQ; notes.push('Adhesivo sin fotopolimerizar antes del cemento.'); }
  }
  // Esmalte (Hikita 2007, Goracci 2006, Rodrigues 2014)
  let E;
  if (C.selfAdhesive) E = 15 + 20 * eQ;
  else E = (30 + 12 * eQ) * tpQ;

  // Dentina
  let D;
  const dEtched = S.dentin.cov > 0.15 && S.dentin.etchT > 1;
  if (cfg.ids) {
    // IDS: dentina ya hibridizada y sellada (Samimi 2024, Varadan 2022). Arenar el IDS reduce la adhesión (Santos 2025).
    D = 36 * (S.toothClean === 'pomez' ? 1 : S.toothClean === 'arenado' ? 0.85 : 0.85);
  } else if (C.selfAdhesive) {
    D = dEtched ? 6 : 15; // Hikita 2007; Viotti 2009
    if (dEtched) notes.push('Ácido fosfórico en dentina con un autoadhesivo.');
  } else {
    D = C.dentin * tpQ;
    if (dEtched) {
      if (cfg.cement === 'panavia' || cfg.cement === 'multilink') { D *= 0.75; notes.push('Primer autograbante sobre dentina grabada con ácido fosfórico.'); }
      else {
        const w = S.wetD ?? 0.5;
        D *= (w < 0.15 ? 0.55 : w < 0.3 ? 0.8 : w <= 0.85 ? 1 : 0.8) * clamp(1 - Math.max(0, Math.abs(S.dentin.etchT - 10) - 2) / 12, 0.5, 1);
      }
    }
    if (S.toothClean === 'arenado') D *= 1.05; // arenado limpia mejor que la pómez sin IDS (Santos 2025)
  }
  if (S.toothWrong) { E *= 0.85; D *= 0.85; notes.push('Se aplicó en el diente un producto que no corresponde al sistema.'); }
  if (S.hfOnTooth) { E *= 0.3; D *= 0.3; notes.push('Ácido fluorhídrico sobre el diente.'); }

  const ef = cfg.case.enamelFrac;
  let tooth = ef * E + (1 - ef) * D;
  if (!S.isolated) tooth *= 0.8;
  // Presión de asentamiento (Goracci 2006): más relevante en autoadhesivos.
  const pq = clamp(S.pressT / 5, 0, 1);
  const press = C.selfAdhesive ? 0.55 + 0.45 * pq : 0.75 + 0.25 * pq;
  const covF = 0.5 + 0.5 * clamp(S.cem.cov / 0.8, 0, 1);
  const delayF = S.cem.delay > 120 ? 0.8 : 1;
  tooth *= press * cure * covF * delayF;

  // ---- Lado restauración -----------------------------------------------------
  const r = S.r;
  const rp = r.primer;
  const rpQ = rp ? (0.5 + 0.5 * r.primerCov) * (0.6 + 0.4 * r.primerTimeQ) * (0.8 + 0.2 * r.primerAirQ) : 0;
  let R;
  if (g === 'glass') {
    const hfQ = timeQ(r.hfT, M.hfTarget) * (0.5 + 0.5 * Math.min(1, r.hfCov / 0.8));
    const sil = (rp === 'silano' || rp === 'monobond' || rp === 'ccpp') ? rpQ : rp === 'sbu' ? 0.5 * rpQ : 0; // Lima 2022
    R = 8 + 10 * hfQ + sil * (27 * hfQ + 7); // Simasetha 2022: HF sin silano ≈18, HF + silano ≈45
    if (r.apaCov > 0.3) { R *= 0.85; notes.push('Arenado sobre cerámica vítrea.'); }
    if (r.hfT > M.hfTarget * 3) notes.push('Grabado excesivo de la cerámica: debilita la restauración.');
  } else {
    const apa = clamp(r.apaCov / 0.8, 0, 1);
    const mdpP = (rp === 'ccpp' || rp === 'monobond' || rp === 'sbu') ? rpQ : 0;
    const mdp = Math.max(mdpP, C.mdp);
    if (g === 'zirconia') R = 5 + 10 * apa + mdp * (13 + 8 * apa); // Özcan 2015; Li 2024
    else R = 9 + 7.5 * apa + mdp * apa * 1.0; // Mohaghegh 2024; Stratos 2026
    if (r.hfCov > 0.3) notes.push('El ácido fluorhídrico no tiene efecto sobre ' + (g === 'zirconia' ? 'la zirconia.' : 'el metal.'));
    if (rp === 'silano') notes.push('El silano no aporta adhesión a ' + (g === 'zirconia' ? 'la zirconia.' : 'el metal.'));
    if (r.h3po4 && g === 'zirconia') { R *= 0.7; notes.push('Ácido fosfórico sobre zirconia: el fosfato ocupa los sitios donde se une el MDP.'); }
  }
  const contam = Math.max(r.contamAtPrimer, r.contamFinal);
  if (contam > 0.2) { R *= 1 - 0.4 * contam; notes.push('Superficie interna contaminada con saliva al acondicionarla o al cementar.'); }
  R *= (1 - 0.5 * (1 - cure)) * covF;

  // ---- Envejecimiento ---------------------------------------------------------
  const ageTooth = (cfg.ids ? 0.85 : C.selfAdhesive ? 0.65 : 0.73) * (reach < 0.3 && C.cure === 'dual' ? 0.9 : 1);
  let ageRest;
  if (g === 'glass') ageRest = rp && rp !== 'sbu' ? 0.8 : 0.55;
  else if (g === 'zirconia') ageRest = r.apaCov > 0.5 && (rp || C.mdp >= 1) ? 0.5 : 0.3;
  else ageRest = 0.8;

  const final24 = Math.min(tooth, R);
  const toothAged = tooth * ageTooth, restAged = R * ageRest;
  const aged = Math.min(toothAged, restAged);
  const weak = tooth <= R ? 'diente' : 'restauracion';
  const weakAged = toothAged <= restAged ? 'diente' : 'restauracion';
  return { E: E * press * cure, D: D * press * cure, tooth, rest: R, cure, reach, press, final24, aged, toothAged, restAged, weak, weakAged, notes };
}

// Escenarios de referencia para el cemento y material elegidos.
export function idealSummary(cfg) {
  const C = CEMENTS[cfg.cement], g = matGroup(cfg.case);
  const strat = C.selfAdhesive || cfg.cement === 'panavia' || cfg.cement === 'multilink' ? 'selective' : 'total';
  const faceT = Object.fromEntries(faceList(cfg.case).map(f => [f, 20]));
  return {
    isolated: true, toothClean: 'pomez',
    enamel: { etchT: 15, cov: 1 }, dentin: strat === 'total' ? { etchT: 10, cov: 1 } : { etchT: 0, cov: 0 },
    wetD: 0.5, tp: { id: C.toothPrimer, cov: 1, timeQ: 1, airQ: 1, lightQ: 1 }, toothWrong: false, hfOnTooth: false,
    r: { hfT: g === 'glass' ? MATERIALS[cfg.case.material].hfTarget : 0, hfCov: g === 'glass' ? 1 : 0, apaCov: g === 'glass' ? 0 : 1,
      primer: C.restPrimer[g], primerCov: 1, primerTimeQ: 1, primerAirQ: 1, contamAtPrimer: 0, contamFinal: 0, h3po4: false },
    cem: { cov: 1, delay: 30, curedEarly: false }, pressT: 6, faceT,
  };
}
export function worstSummary(cfg) {
  return {
    isolated: false, toothClean: null,
    enamel: { etchT: 0, cov: 0 }, dentin: { etchT: 0, cov: 0 }, wetD: null,
    tp: { id: null, cov: 0, timeQ: 0, airQ: 0, lightQ: 0 }, toothWrong: false, hfOnTooth: false,
    r: { hfT: 0, hfCov: 0, apaCov: 0, primer: null, primerCov: 0, primerTimeQ: 0, primerAirQ: 0, contamAtPrimer: 0, contamFinal: 1, h3po4: false },
    cem: { cov: 0.6, delay: 30, curedEarly: false }, pressT: 0, faceT: {},
  };
}
export function scenarioRange(cfg) {
  const best = bondModel({ ...cfg, ids: cfg.case.idsRecommended }, idealSummary(cfg));
  const worst = bondModel({ ...cfg, ids: false }, worstSummary(cfg));
  return { best, worst };
}
