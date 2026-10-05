// Modelo de evaluación (valores ilustrativos con fines didácticos, no datos de laboratorio).
import { UNIT_MM, clamp } from './tooth.js';

export function moistureState(w, total = true) {
  if (w > 0.82) return { label: 'Encharcada', cls: 'bad' };
  if (!total) {
    // Dentina no grabada (modo autograbante): tolera estar seca, no encharcada.
    if (w > 0.6) return { label: 'Húmeda', cls: 'warn' };
    if (w >= 0.15) return { label: w >= 0.3 ? 'Ligeramente húmeda' : 'Seca', cls: 'ok' };
    return { label: 'Desecada', cls: 'warn' };
  }
  if (w >= 0.3) return { label: 'Húmeda brillante', cls: total ? 'ok' : 'warn' };
  if (w >= 0.15) return { label: 'Seca', cls: total ? 'warn' : 'ok' };
  return { label: 'Desecada', cls: total ? 'bad' : 'warn' };
}

export function evaluate(g) {
  const total = g.cfg.protocol === 'total';
  const univ = g.cfg.adhesive === 'universal';
  const lvl = g.cfg.level;
  const T = g.tooth, a = g.adh, L = g.live;
  const fb = [];
  const good = (text) => fb.push({ ok: true, text });
  const bad = (text) => fb.push({ ok: false, text });

  const ef = g.etch.final || g.etchSnapshot();
  const E = ef.E, D = ef.D;
  const dam = g.flags.isolated ? 1 : 0.78;
  const cureQ = a.cureQ ?? 0;

  // ---- Esmalte ----
  const qEt = E.avg < 1 ? 0.35 : clamp(1 - Math.max(0, Math.abs(E.avg - 15) - 3) / 15, 0.55, 1);
  const qEc = 0.35 + 0.65 * E.cov;
  const wetE = a.wetE ?? L.wetE;
  const qEw = wetE <= 0.5 ? 1 : clamp(1 - (wetE - 0.5) * 0.9, 0.55, 1);
  const enamelMPa = a.started ? 42 * qEt * qEc * qEw * (0.3 + 0.7 * L.adhE) * (0.25 + 0.75 * cureQ) * dam : 0;

  // ---- Dentina ----
  const wetD = a.wetD ?? L.wetD;
  const dentinEtched = D.cov > 0.15 && D.avg > 1;
  let qDt, qDw;
  if (total) {
    qDt = !dentinEtched ? 0.8
      : clamp(1 - Math.max(0, Math.abs(D.avg - 10) - 2) / 12, 0.45, 1) * (0.5 + 0.5 * Math.min(1, D.cov / 0.85));
    qDw = wetD < 0.15 ? 0.45 : wetD < 0.3 ? 0.72 : wetD <= 0.82 ? 1 : 0.7;
  } else {
    qDt = dentinEtched ? (univ ? 0.82 : 0.7) : 1;
    qDw = wetD <= 0.6 ? 1 : wetD <= 0.82 ? 0.85 : 0.65;
  }
  let qApp, qSolv;
  if (univ) {
    qApp = clamp(a.rub / 20, 0.4, 1);
    qSolv = clamp(0.5 + a.air / 10, 0.5, 1);
  } else {
    qApp = a.primerDwell == null ? 0.5 : clamp(a.primerDwell / 20, 0.4, 1);
    if (!a.bondStarted) qApp *= 0.5;
    qSolv = (a.primerAir >= 1.5 ? 1 : 0.75) * (a.bondAir >= 1 ? 1 : 0.88);
  }
  const covD = univ ? L.adhD : (L.adhD + L.primerD) / 2;
  const coatOK = g.coat.started && (g.coat.cureQ ?? 0) >= 0.9 && L.coatD >= 0.6;
  const dentinMPa = a.started
    ? 44 * qDt * qDw * qApp * qSolv * (0.3 + 0.7 * covD) * (0.25 + 0.75 * cureQ) * dam * (coatOK ? 1.08 : 1)
    : 0;

  // ---- Incrementos ----
  const incs = g.incs.map(i => ({ ...i, mm: (i.to - i.from) * UNIT_MM }));
  const target = T.fillTarget, dej = T.dejY;
  const filled = incs.length > 0 && g.level >= target - 0.05;
  const overfill = g.level > target + 0.2;

  // ---- Microfiltración ----
  let leak = 6;
  if (!a.started) leak += 60;
  leak += (1 - E.cov) * 35;
  if (E.avg < 1) leak += 15;
  if (a.started) leak += (1 - cureQ) * 25;
  if (!g.flags.isolated) leak += 14;
  leak += (1 - qDw) * 18;
  if (!coatOK) leak += 8;
  for (const i of incs) { if (i.mm > 2.25) leak += 4; if ((i.cureQ ?? 0) < 0.9) leak += 7; }
  if (!incs.length) leak += 20; else if (!filled) leak += 12;
  if (lvl.matrix && !g.flags.matrix && incs.length) leak += 18;
  if (!g.polished) leak += 4;
  leak = clamp(leak, 0, 100);

  // ---- Tensión de contracción ----
  let stress = 12;
  for (const i of incs) if (i.mm > 2) stress += (i.mm - 2) * 16;
  if (!coatOK) stress += 10;
  if (lvl.fiber) stress += g.fiber.placed ? -4 : 14;
  stress = clamp(stress, 0, 100);

  // ---- Índice biomimético ----
  let thick = 0, correct = 0;
  for (const i of incs) {
    const to = Math.min(i.to, target), from = Math.min(i.from, target);
    const th = Math.max(0, to - from);
    thick += th;
    if (i.shade === 'dentina') correct += Math.max(0, Math.min(to, dej + 0.1) - from);
    else correct += Math.max(0, to - Math.max(from, dej - 0.1));
  }
  const shading = thick > 0 ? clamp(correct / thick, 0, 1) : 0;
  const layering = incs.length ? incs.filter(i => i.mm <= 2.25).length / incs.length : 0;
  const fiberOK = lvl.fiber ? (g.fiber.placed && (g.fiber.cureQ ?? 0) >= 0.9 ? 1 : 0) : 1;
  const fillScore = filled ? (overfill ? 0.7 : 1) : incs.length ? clamp((g.level - T.floorMin) / (target - T.floorMin), 0, 1) * 0.6 : 0;
  const bio = clamp(100 * (0.35 * shading + 0.15 * layering + 0.2 * (coatOK ? 1 : 0) + 0.15 * fiberOK + 0.15 * fillScore * (g.polished ? 1 : 0.8)), 0, 100);

  // ---- Puntuación ----
  const bond = clamp((enamelMPa / 42 + dentinMPa / 44) / 2 * 100, 0, 100);
  let pen = 0;
  for (const m of g.mistakes.values()) pen += m.pen;
  const timed = !!g.cfg.timed;
  const left = timed ? Math.max(0, g.cfg.level.timeLimit - g.t) : 0;
  // La bonificación solo se gana con la restauración terminada y pulida dentro del tiempo.
  const timeBonus = timed && g.polished && !g.timedOut ? Math.round(15 * left / g.cfg.level.timeLimit) : 0;
  const score = Math.round(clamp(0.3 * bond + 0.25 * (100 - leak) + 0.15 * (100 - stress) + 0.3 * bio - pen + timeBonus, 0, 100));
  const stars = score >= 85 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0;

  // ---- Retroalimentación ----
  if (E.avg >= 1) {
    const msg = `Esmalte grabado ${E.avg.toFixed(1)} s (objetivo 15 s), cobertura ${Math.round(E.cov * 100)}%`;
    (Math.abs(E.avg - 15) <= 3 && E.cov >= 0.75) ? good(msg) : bad(msg);
  } else if (g.etch.applied || a.started) bad('El esmalte no fue grabado con ácido fosfórico');
  if (total) {
    if (dentinEtched) {
      const msg = `Dentina grabada ${D.avg.toFixed(1)} s (objetivo 10 s), cobertura ${Math.round(D.cov * 100)}%`;
      (Math.abs(D.avg - 10) <= 2 && D.cov >= 0.7) ? good(msg) : bad(msg);
    } else if (g.etch.final) bad('Grabado total sin grabar la dentina');
  } else if (g.etch.final) {
    dentinEtched ? bad('Ácido fosfórico sobre dentina en un protocolo de grabado selectivo') : good('Dentina preservada para el autograbante (hidroxiapatita disponible para el MDP)');
  }
  if (a.started) {
    const ms = moistureState(wetD, total);
    const msg = `Dentina al aplicar el adhesivo: ${ms.label.toLowerCase()}`;
    ms.cls === 'ok' ? good(msg) : bad(msg);
    if (univ) {
      (a.rub >= 18) ? good(`Frotado activo ${a.rub.toFixed(0)} s`) : bad(`Frotado activo de solo ${a.rub.toFixed(0)} s (objetivo 20 s)`);
      (a.air >= 4) ? good(`Evaporación del solvente ${a.air.toFixed(1)} s`) : bad(`Evaporación del solvente insuficiente (${a.air.toFixed(1)} s)`);
    } else {
      (a.primerDwell != null && a.primerDwell >= 18) ? good(`Primer: ${a.primerDwell.toFixed(0)} s de acción`) : bad(`Primer: tiempo de acción ${a.primerDwell != null ? a.primerDwell.toFixed(0) + ' s' : 'no completado'} (objetivo 20 s)`);
    }
    if (a.cureQ != null) (a.cureQ >= 0.9) ? good('Adhesivo bien polimerizado') : bad('Adhesivo subpolimerizado');
  }
  coatOK ? good('Resin coat aplicado y polimerizado: capa híbrida protegida') : bad('Sin resin coat completo y polimerizado');
  if (lvl.matrix) g.flags.matrix ? good('Matriz seccional y cuñas: paredes proximales y punto de contacto') : bad('Sin matriz: paredes proximales y punto de contacto comprometidos');
  if (lvl.fiber) fiberOK ? good('Fibra de polietileno en el piso (refuerzo biomimético)') : bad('Falta la fibra de refuerzo');
  if (incs.length) {
    const thickOnes = incs.filter(i => i.mm > 2.25);
    thickOnes.length ? bad(`${thickOnes.length} incremento(s) mayores a 2 mm`) : good(`${incs.length} incrementos de ≤ 2 mm`);
    shading >= 0.85 ? good(`Estratificación dentina/esmalte correcta (${Math.round(shading * 100)}%)`) : bad(`Estratificación dentina/esmalte imprecisa (${Math.round(shading * 100)}%)`);
    filled ? (overfill ? bad('Restauración sobreobturada') : good('Anatomía oclusal reconstruida')) : bad('Restauración incompleta');
  }
  if (g.polished) good('Acabado y pulido');
  if (timed) g.timedOut ? bad('Se agotó el tiempo antes de terminar') : g.polished ? good(`Terminado con ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} de sobra (+${timeBonus})`) : null;

  // ---- Parámetros para la vista microscópica ----
  const etchedSel = !total && dentinEtched;
  let demin = 0, infDepth = 0;
  const moistF = total ? (wetD < 0.15 ? 0.35 : wetD < 0.3 ? 0.7 : wetD <= 0.82 ? 1 : 0.85) : 1;
  if (a.started) {
    if (total || etchedSel) {
      demin = dentinEtched ? clamp(0.45 * D.avg, 0.8, 12) : (univ ? 0.8 : 1.0);
      const frac = clamp(moistF * (univ ? clamp(a.rub / 20, 0.5, 1) : qApp) * qSolv, 0, 1);
      infDepth = Math.min(demin, 5) * frac;
    } else {
      demin = univ ? 0.8 : 1.0;
      infDepth = demin * clamp(univ ? a.rub / 20 : qApp, 0.6, 1);
    }
  } else if (dentinEtched) {
    demin = clamp(0.45 * D.avg, 0.8, 12);
  }
  const micro = {
    total, univ, adhesive: a.started, demin, infDepth,
    collapsed: total && dentinEtched && a.started && wetD < 0.15,
    overwet: a.started && wetD > 0.82,
    solventLeft: a.started && (univ ? a.air < 3 : a.primerAir < 1),
    hap: a.started && !dentinEtched,
    tagLen: a.started ? (dentinEtched ? 14 * clamp(infDepth / Math.max(demin, 0.1), 0.2, 1) : 3) : 0,
    adhCure: cureQ,
    coat: g.coat.started, coatCure: g.coat.cureQ ?? 0,
    composite: incs.length > 0,
    enamelEtch: E.avg, enamelCov: E.cov, enamelAdh: L.adhE,
  };

  return { enamelMPa, dentinMPa, leak, stress, bio, bond, score, stars, pen, timed, timeBonus, feedback: fb, micro, incs, filled };
}
