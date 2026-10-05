// Lógica del procedimiento: aplica instrumentos sobre el diente, controla tiempos,
// registra errores y avanza el protocolo.
import * as THREE from 'three';
import { Tooth, ZONE, UNIT_MM, clamp } from './tooth.js';
import { TOOLS, makeToolModel } from './tools.js';
import { buildSteps } from './levels.js';
import { evaluate, moistureState } from './evaluate.js';

const GROW = 0.2; // velocidad de extrusión: 0.2 u/s = 1 mm/s
const SHADES = {
  dentina: { color: '#dcbd88', name: 'dentina A3' },
  esmalte: { color: '#efe7d6', name: 'esmalte A2' },
};

export class Game {
  constructor(scene, ui, cfg) {
    this.scene = scene; this.ui = ui; this.cfg = cfg;
    this.total = cfg.protocol === 'total';
    this.univ = cfg.adhesive === 'universal';
    this.tooth = new Tooth(cfg.level.cavity);
    scene.add(this.tooth.group);

    this.t = 0;
    this.flags = { isolated: false, matrix: false, cleaned: false };
    this.etch = { applied: false, rinseTime: 0, final: null };
    this.adh = {
      started: false, wetD: null, wetE: null, rub: 0, air: 0, cureQ: null,
      primerStart: null, primerDwell: null, primerAir: 0, bondStarted: false, bondAir: 0,
    };
    this.coat = { started: false, cureQ: null };
    this.fiber = { placed: false, cureQ: null };
    this.incs = [];
    this.level = this.tooth.floorMin;
    this.extruding = null;
    this.polished = false;
    this.finished = false;
    this.gelN = 0;
    this.dentinGelSel = 0;
    this.lamp = { on: false, time: 0, items: [], model: makeToolModel('lampara'), light: new THREE.PointLight('#4d7bff', 0, 4) };
    this.lamp.model.visible = false;
    this.lamp.model.getObjectByName('beam').visible = true;
    this.lamp.model.position.set(0.25, 2.05, 0.2);
    this.lamp.model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.25, 1.1, 0.2).normalize());
    this.lamp.light.position.set(0.1, 1.7, 0.1);
    scene.add(this.lamp.model, this.lamp.light);
    this.mistakes = new Map();
    this.tips = new Set();
    this.steps = buildSteps(cfg);
    this._liveTimer = 0;
    this._evalTimer = 0;
    this.computeLive();
    ui.renderSteps(this.steps);
    ui.renderMistakes(this.mistakes);
  }

  dispose() {
    this.tooth.dispose();
    this.scene.remove(this.tooth.group, this.lamp.model, this.lamp.light);
  }

  // ---- Retroalimentación --------------------------------------------------
  mistake(key, title, text, pen = 5) {
    if (this.mistakes.has(key)) return;
    this.mistakes.set(key, { title, text, pen });
    this.ui.toast('err', title, text);
    this.ui.renderMistakes(this.mistakes);
  }
  tip(key, title, text, type = 'info') {
    if (key && this.tips.has(key)) return;
    if (key) this.tips.add(key);
    this.ui.toast(type, title, text);
  }

  // ---- Estadísticas -------------------------------------------------------
  etchStats(zone) {
    const T = this.tooth, s = T.s;
    let n = 0, c = 0, sum = 0;
    for (let k = 0; k < T.NTOP; k++) {
      if (T.zone[k] !== zone) continue;
      n++;
      const te = s.etchT[k] + (s.gel[k] ? this.t - s.gelOn[k] : 0);
      if (te > 0.5) { c++; sum += te; }
    }
    return { cov: n ? c / n : 0, avg: c ? sum / c : 0 };
  }
  etchSnapshot() { return { E: this.etchStats(ZONE.ENAMEL), D: this.etchStats(ZONE.DENTIN) }; }

  computeLive() {
    const T = this.tooth, s = T.s;
    let nE = 0, nD = 0, wE = 0, wD = 0, aE = 0, aD = 0, pD = 0, cD = 0, gE = 0, gD = 0, tE = 0, tD = 0;
    for (let k = 0; k < T.NTOP; k++) {
      const z = T.zone[k];
      if (z === ZONE.OUTER) continue;
      if (z === ZONE.ENAMEL) {
        nE++; wE += s.wet[k]; aE += s.adh[k];
        if (s.gel[k]) { gE++; tE += this.t - s.gelOn[k]; }
      } else {
        nD++; wD += s.wet[k]; aD += s.adh[k]; pD += s.primer[k]; cD += s.coat[k];
        if (s.gel[k]) { gD++; tD += this.t - s.gelOn[k]; }
      }
    }
    this.live = {
      wetE: wE / nE, wetD: wD / nD, adhE: aE / nE, adhD: aD / nD, primerD: pD / nD, coatD: cD / nD,
      gelE: gE, gelD: gD, gelTimeE: gE ? tE / gE : 0, gelTimeD: gD ? tD / gD : 0,
    };
  }

  evaluate() { this.computeLive(); return evaluate(this); }

  // ---- Instrumentos de aplicación continua --------------------------------
  applyPaint(id, hit, dt, moving) {
    if (this.finished) return;
    const T = this.tooth, s = T.s, tool = TOOLS[id], p = hit.point;
    const k0 = hit.face.a;
    const inCavity = T.inCav[k0] > 0.02 || T.zone[k0] === ZONE.ENAMEL;

    switch (id) {
      case 'acido': {
        this.preEtchChecks();
        if (this.adh.started) this.mistake('etchAfterAdh', 'Ácido sobre el adhesivo', 'El grabado se realiza antes del sistema adhesivo. Aplicar ácido sobre el adhesivo destruye la capa formada.', 10);
        let dentinNew = 0;
        T.forEachInRadius(p, tool.radius, (k) => {
          if (!s.gel[k]) {
            s.gel[k] = 1; s.gelOn[k] = this.t; this.gelN++;
            if (T.zone[k] === ZONE.DENTIN) dentinNew++;
          }
        });
        if (!this.etch.applied) {
          this.etch.applied = true;
          this.tip('etchStart', 'Ácido aplicado: el tiempo corre',
            this.total ? 'Controla los cronómetros: esmalte 15 s, dentina 10 s. Lava con agua para detener el grabado.' : 'Solo esmalte, 15 s. Evita la dentina. Lava con agua para detener el grabado.');
        }
        if (!this.total && dentinNew) {
          this.dentinGelSel += dentinNew;
          if (this.dentinGelSel > T.counts[ZONE.DENTIN] * 0.12) this.mistake('etchDentinSel', 'Ácido fosfórico en dentina',
            'En el grabado selectivo la dentina se trata con el autograbante. El ácido fosfórico elimina la hidroxiapatita que el 10-MDP necesita para unirse químicamente.', 10);
        }
        break;
      }
      case 'agua': {
        if (this.adh.started && this.adh.cureQ === null) this.mistake('waterAdh', 'Agua sobre el adhesivo sin polimerizar', 'Lavaste la capa adhesiva: se diluye y pierde la infiltración.', 10);
        T.forEachInRadius(p, tool.radius, (k) => {
          if (s.gel[k]) { s.etchT[k] += this.t - s.gelOn[k]; s.gel[k] = 0; this.gelN--; }
          s.wet[k] = 1;
        });
        if (inCavity) this.etch.rinseTime += dt;
        if (this.gelN === 0 && this.etch.applied && !this.etch.final) this.finishEtch();
        break;
      }
      case 'aire': {
        if (this.gelN > 0) this.mistake('airGel', 'Secado sin lavar el ácido', 'Primero lava todo el gel con agua: el aire no detiene el grabado y solo esparce el ácido.', 4);
        const phase = this.airPhase();
        if (phase === 'dry') {
          T.forEachInRadius(p, tool.radius, (k, w) => { s.wet[k] = Math.max(0, s.wet[k] - 0.55 * dt * (0.3 + 0.7 * w)); });
        } else if (inCavity) {
          if (phase === 'univ') this.adh.air += dt;
          else if (phase === 'primer') {
            if (this.adh.primerDwell === null) this.closePrimer();
            this.adh.primerAir += dt;
          } else if (phase === 'bond') this.adh.bondAir += dt;
        }
        break;
      }
      case 'microbrush': {
        T.forEachInRadius(p, tool.radius, (k) => { if (s.wet[k] > 0.45) s.wet[k] = Math.max(0.45, s.wet[k] - 2.5 * dt); });
        break;
      }
      case 'universal': case 'primer': case 'bond':
        this.applyAdhesive(id, p, dt, moving, inCavity);
        break;
      case 'fluida': {
        if (this.adh.cureQ === null) this.mistake('coatNoCure', 'Resin coat sobre adhesivo sin polimerizar', 'Polimeriza primero el adhesivo (10 s) y luego coloca la capa de resina fluida.', 6);
        if (!this.coat.started) {
          this.coat.started = true;
          this.tip('coatStart', 'Resin coat', 'Cubre toda la dentina con una capa delgada (≤ 0.5 mm) de resina fluida.');
        }
        T.forEachInRadius(p, tool.radius, (k) => { if (T.inCav[k] > 0.02) s.coat[k] = 1; });
        break;
      }
    }
  }

  preEtchChecks() {
    if (!this.flags.isolated) this.mistake('noDam', 'Sin aislamiento absoluto', 'Coloca el dique antes de grabar: la saliva y la humedad contaminan la superficie.', 8);
    if (!this.flags.cleaned) this.mistake('noClean', 'Cavidad sin limpiar', 'Limpia con piedra pómez antes de grabar para eliminar biofilm y restos.', 3);
    if (this.cfg.level.matrix && !this.flags.matrix) this.tip('matrixFirst', 'Sugerencia', 'En clase II conviene colocar la matriz y las cuñas antes del grabado.', 'warn');
  }

  airPhase() {
    const a = this.adh;
    if (a.cureQ !== null) return 'none';
    if (this.univ) return a.started ? 'univ' : 'dry';
    if (a.bondStarted) return 'bond';
    if (a.started) return 'primer';
    return 'dry';
  }

  closePrimer() {
    const a = this.adh;
    a.primerDwell = this.t - a.primerStart;
    if (a.primerDwell < 17) this.mistake('primerShort', `Primer con solo ${a.primerDwell.toFixed(0)} s de acción`, 'El primer autograbante necesita 20 s para desmineralizar e infiltrar la dentina.', 5);
    else this.tip(null, 'Primer: ' + a.primerDwell.toFixed(0) + ' s', 'Buen tiempo de acción. Ahora evapora el solvente con aire suave.', 'ok');
  }

  applyAdhesive(id, p, dt, moving, inCavity) {
    const T = this.tooth, s = T.s, a = this.adh;
    if (a.cureQ !== null) { this.tip('adhCured', 'Adhesivo ya polimerizado', 'Continúa con el resin coat.'); return; }
    if (this.gelN > 0) this.mistake('adhGel', 'Adhesivo sobre ácido sin lavar', 'Lava todo el gel antes de aplicar el sistema adhesivo.', 8);
    if (!this.etch.final) this.mistake('noEtch', 'Esmalte sin grabar', 'En ambos protocolos el esmalte se graba con ácido fosfórico 37% durante 15 s antes del adhesivo.', 10);
    if (id === 'bond') {
      if (!a.started) this.mistake('bondNoPrimer', 'Adhesivo sin primer', 'En el sistema de 2 frascos primero va el primer autograbante (frasco 1).', 8);
      else if (a.primerDwell === null) { this.closePrimer(); this.mistake('bondNoAir', 'Sin evaporar el primer', 'Antes del frasco 2 seca el primer con aire suave para evaporar agua y solvente.', 4); }
      a.bondStarted = true;
    }
    if (!a.started && id !== 'bond') {
      a.started = true;
      this.computeLive();
      a.wetD = this.live.wetD; a.wetE = this.live.wetE;
      const ms = moistureState(a.wetD, this.total);
      if (this.total) {
        if (a.wetD < 0.15) this.mistake('desiccated', 'Dentina desecada', 'Con grabado total, la dentina seca hace colapsar la red de colágeno y el adhesivo no infiltra. Rehumedece o controla el secado.', 8);
        else if (a.wetD > 0.82) this.mistake('overwet', 'Dentina encharcada', 'El exceso de agua diluye el adhesivo y deja burbujas en la interfase. Retira los excesos con el microbrush seco.', 6);
        else this.tip(null, `Dentina: ${ms.label.toLowerCase()}`, 'Buen control de la humedad para la técnica húmeda.', ms.cls === 'ok' ? 'ok' : 'warn');
      } else if (a.wetD > 0.82) {
        this.mistake('overwetSE', 'Dentina encharcada', 'El agua sobrante diluye el autograbante. Seca suavemente antes de aplicarlo.', 5);
      }
      if (a.wetE > 0.5) this.mistake('wetEnamel', 'Esmalte húmedo', 'El esmalte grabado debe verse blanco tiza (seco) antes del adhesivo.', 4);
    }
    if (id === 'primer' && a.primerStart === null) a.primerStart = this.t;
    const arr = id === 'primer' ? s.primer : s.adh;
    T.forEachInRadius(p, TOOLS[id].radius, (k) => { if (T.zone[k] !== ZONE.OUTER) arr[k] = 1; });
    if (id === 'universal' && moving && inCavity) a.rub += dt;
  }

  finishEtch() {
    const f = this.etchSnapshot();
    this.etch.final = f;
    const { E, D } = f;
    if (E.cov < 0.7) this.mistake('etchCovE', 'Márgenes de esmalte sin grabar', `Solo grabaste el ${Math.round(E.cov * 100)}% del esmalte. Recorre todo el contorno y el ángulo cavosuperficial.`, 6);
    if (E.avg > 0 && E.avg < 11) this.mistake('underEtchE', `Esmalte grabado ${E.avg.toFixed(1)} s`, 'Menos de 15 s da un patrón de grabado incompleto y menos microrretención.', 4);
    if (E.avg > 20) this.mistake('overEtchE', `Esmalte grabado ${E.avg.toFixed(1)} s`, 'El protocolo indica 15 s. Más tiempo no mejora la adhesión al esmalte.', 2);
    if (this.total) {
      if (D.cov < 0.6) this.mistake('etchCovD', 'Dentina grabada parcialmente', `Solo grabaste el ${Math.round(D.cov * 100)}% de la dentina: quedan zonas con barrillo.`, 5);
      if (D.avg > 13) this.mistake('overEtchD', `Sobregrabado de dentina (${D.avg.toFixed(1)} s)`, 'La desmineralización supera lo que el adhesivo puede infiltrar: queda colágeno expuesto (nanofiltración) que se degrada con el tiempo.', 8);
      else if (D.avg > 0 && D.avg < 7) this.mistake('underEtchD', `Dentina grabada ${D.avg.toFixed(1)} s`, 'Con menos de 10 s, el barrillo dentinario puede no eliminarse por completo.', 3);
    }
    const msg = this.total
      ? `Esmalte ${E.avg.toFixed(1)} s (${Math.round(E.cov * 100)}%) · Dentina ${D.avg.toFixed(1)} s (${Math.round(D.cov * 100)}%)`
      : `Esmalte ${E.avg.toFixed(1)} s (${Math.round(E.cov * 100)}%)`;
    this.ui.toast('ok', 'Ácido retirado', msg + '. Ahora controla el secado.');
  }

  // ---- Instrumentos que se sueltan ----------------------------------------
  drop(id, hit) {
    if (this.finished) return;
    const T = this.tooth;
    switch (id) {
      case 'dique':
        if (this.flags.isolated) return;
        this.flags.isolated = true; T.dam.visible = true;
        if (this.etch.applied) this.mistake('damLate', 'Dique colocado tarde', 'El aislamiento debe ser el primer paso, antes de cualquier procedimiento adhesivo.', 4);
        else this.ui.toast('ok', 'Aislamiento absoluto', 'Campo operatorio libre de saliva y humedad.');
        break;
      case 'matriz':
        if (this.flags.matrix) return;
        this.flags.matrix = true; T.matrix.visible = true;
        if (this.incs.length) this.mistake('matrixLate', 'Matriz después de la resina', 'La matriz se coloca antes de restaurar las paredes proximales.', 5);
        else this.ui.toast('ok', 'Matriz seccional + cuñas', 'Pared proximal y punto de contacto asegurados.');
        break;
      case 'limpieza':
        if (this.etch.applied) this.mistake('cleanLate', 'Limpieza después del grabado', 'La profilaxis se hace antes de grabar; ahora contaminas la superficie grabada.', 4);
        this.flags.cleaned = true;
        for (let k = 0; k < T.NTOP; k++) if (T.inCav[k] > 0.02) T.s.wet[k] = Math.max(T.s.wet[k], 0.9);
        this.ui.toast('ok', 'Cavidad limpia', 'Biofilm y restos eliminados (queda húmeda).');
        break;
      case 'fibra':
        if (this.fiber.placed) return;
        if (this.adh.cureQ === null) this.mistake('fiberNoAdh', 'Fibra sin adhesivo polimerizado', 'La fibra se coloca sobre dentina ya hibridizada.', 6);
        if (!this.coat.started) this.mistake('fiberNoCoat', 'Fibra sin lecho de resina fluida', 'La fibra se asienta e impregna sobre una capa de resina fluida.', 3);
        this.fiber.placed = true; T.fiber.visible = true;
        this.ui.toast('ok', 'Fibra de polietileno', 'Asentada en el piso pulpar y las cajas. Polimeriza 20 s.');
        break;
      case 'lampara':
        this.startLamp();
        break;
      case 'pulido':
        this.polish();
        break;
    }
  }

  // ---- Lámpara ------------------------------------------------------------
  startLamp() {
    if (this.lamp.on) return;
    const a = this.adh, items = [];
    if (a.started && a.cureQ === null) {
      if (this.univ && a.air < 3) this.mistake('noAirUniv', 'Fotopolimerizado sin evaporar el solvente', 'El agua y el solvente atrapados dejan una capa porosa y débil. Usa aire suave 5 s antes de la luz.', 7);
      if (!this.univ && !a.bondStarted) this.mistake('cureNoBond', 'Fotopolimerizado sin el frasco 2', 'Falta la capa de adhesivo hidrófobo sobre el primer.', 8);
      if (this.univ && a.rub < 15) this.mistake('shortRub', `Adhesivo frotado ${a.rub.toFixed(0)} s`, 'Frota activamente 20 s: mejora la infiltración y la interacción química.', 5);
      items.push({ key: 'adh', label: 'Adhesivo', req: 10, t: 0 });
    }
    if (this.coat.started && this.coat.cureQ === null) items.push({ key: 'coat', label: 'Resin coat', req: 20, t: 0 });
    if (this.fiber.placed && this.fiber.cureQ === null) items.push({ key: 'fiber', label: 'Fibra + fluida', req: 20, t: 0 });
    const last = this.incs[this.incs.length - 1];
    if (last && last.cureQ === null && !this.extruding) items.push({ key: 'inc', inc: last, label: `Incremento ${this.incs.length}`, req: 20, t: 0 });
    if (!items.length) { this.tip(null, 'Nada que polimerizar', 'No hay material sin polimerizar en este momento.', 'warn'); return; }
    this.lamp.on = true; this.lamp.time = 0; this.lamp.items = items;
    this.lamp.model.visible = true; this.lamp.light.intensity = 3;
    this.ui.showLamp(true);
  }

  stopLamp() {
    if (!this.lamp.on) return;
    this.lamp.on = false;
    this.lamp.model.visible = false; this.lamp.light.intensity = 0;
    this.ui.showLamp(false);
    for (const it of this.lamp.items) {
      const q = clamp(it.t / it.req, 0, 1);
      if (it.key === 'adh') this.adh.cureQ = q;
      else if (it.key === 'coat') this.coat.cureQ = q;
      else if (it.key === 'fiber') this.fiber.cureQ = q;
      else if (it.key === 'inc') {
        it.inc.cureQ = q;
        const m = it.inc.mesh.material;
        m.opacity = 1; m.transparent = false; m.roughness = 0.45; m.clearcoat = 0.3; m.needsUpdate = true;
      }
      if (q < 0.9) this.mistake('under_' + it.label, `${it.label} subpolimerizado`, `Solo ${it.t.toFixed(1)} s de los ${it.req} s necesarios: queda monómero residual y menores propiedades mecánicas.`, 6);
      else this.ui.toast('ok', `${it.label} polimerizado`, `${it.t.toFixed(1)} s de luz.`);
    }
    this.lamp.items = [];
  }

  // ---- Composite ----------------------------------------------------------
  startExtrude(id, hit) {
    if (this.extruding || this.finished) return;
    const T = this.tooth, a = this.adh;
    if (T.inCav[hit.face.a] < 0.02) { this.tip('extrudeOut', 'Fuera de la cavidad', 'Coloca el composite dentro de la preparación.', 'warn'); return; }
    if (this.level >= T.fillTarget + 0.15) { this.tip('full', 'Cavidad completa', 'Pasa al acabado y pulido.', 'warn'); return; }
    if (this.lamp.on) { this.tip(null, 'Lámpara encendida', 'Apaga la lámpara antes de colocar más material.', 'warn'); return; }
    if (!a.started) this.mistake('compNoAdh', 'Composite sin sistema adhesivo', 'Sin adhesivo no hay unión: brecha marginal, microfiltración y caries secundaria.', 15);
    else if (a.cureQ === null) this.mistake('compAdhUncured', 'Composite sobre adhesivo sin polimerizar', 'Polimeriza el adhesivo antes de colocar resina.', 8);
    if (!this.coat.started) this.mistake('noCoat', 'Sin resin coat', 'Antes del composite, protege la dentina hibridizada con una capa delgada de resina fluida polimerizada.', 6);
    else if (this.coat.cureQ === null) this.mistake('coatUncuredInc', 'Resin coat sin polimerizar', 'Polimeriza la resina fluida 20 s antes de estratificar.', 4);
    if (this.cfg.level.fiber && !this.fiber.placed) this.mistake('noFiber', 'Sin fibra de refuerzo', 'En cavidades MOD profundas, la fibra de polietileno en el piso refuerza el remanente y frena las grietas.', 5);
    if (this.cfg.level.matrix && !this.flags.matrix) this.mistake('noMatrix', 'Sin matriz', 'Sin matriz no se pueden reconstruir las paredes proximales ni el punto de contacto.', 10);
    const last = this.incs[this.incs.length - 1];
    if (last && last.cureQ === null) this.mistake('incUncured' + this.incs.length, 'Incremento sin polimerizar', 'Polimeriza cada incremento 20 s antes de colocar el siguiente.', 5);
    const shade = TOOLS[id].shade;
    const inc = { shade, from: this.level, to: this.level, cureQ: null, mesh: T.makeFillMesh(SHADES[shade].color) };
    T.setFillLevel(inc.mesh, inc.to);
    this.incs.push(inc);
    this.extruding = inc;
  }

  updateExtrude(dt) {
    const inc = this.extruding, T = this.tooth;
    inc.to = Math.min(inc.to + GROW * dt, T.fillTarget + 0.25);
    this.level = inc.to;
    T.setFillLevel(inc.mesh, inc.to);
  }

  endExtrude() {
    const inc = this.extruding;
    if (!inc) return;
    this.extruding = null;
    const T = this.tooth, n = this.incs.length;
    const mm = (inc.to - inc.from) * UNIT_MM;
    if (mm < 0.15) {
      T.group.remove(inc.mesh); inc.mesh.geometry.dispose();
      this.incs.pop(); this.level = inc.from;
      return;
    }
    if (mm > 2.25) this.mistake('thick' + n, `Incremento ${n} de ${mm.toFixed(1)} mm`, 'Más de 2 mm: polimerización incompleta en profundidad y mayor tensión de contracción. Usa capas ≤ 2 mm.', 6);
    if (inc.shade === 'esmalte' && inc.from < T.dejY - 0.1) this.mistake('enamelDeep' + n, 'Composite de esmalte en zona de dentina', 'El composite translúcido en profundidad da un resultado grisáceo y sin opacidad. Reemplaza la dentina con composite de dentina hasta la UAD.', 4);
    if (inc.shade === 'dentina' && inc.to > T.dejY + 0.1) this.mistake('dentinHigh' + n, 'Composite de dentina sobrepasa la UAD', 'El composite opaco en superficie se ve sin vitalidad. Deja ≈2 mm para el composite de esmalte.', 4);
    const toDej = (T.dejY - inc.to) * UNIT_MM, toTop = (T.fillTarget - inc.to) * UNIT_MM;
    const where = toDej > 0.2 ? `faltan ${toDej.toFixed(1)} mm hasta la UAD` : toTop > 0.25 ? `faltan ${toTop.toFixed(1)} mm hasta la superficie` : 'superficie alcanzada';
    this.ui.toast('info', `Incremento ${n}: ${mm.toFixed(1)} mm de ${SHADES[inc.shade].name}`, `${where[0].toUpperCase() + where.slice(1)}. Polimeriza 20 s.`);
  }

  polish() {
    const T = this.tooth;
    if (!this.incs.length) { this.tip(null, 'Nada que pulir', 'Primero restaura la cavidad.', 'warn'); return; }
    if (this.extruding) return;
    if (this.incs[this.incs.length - 1].cureQ === null) this.mistake('polishUncured', 'Pulido sin polimerizar', 'Polimeriza el último incremento antes del acabado.', 5);
    if (this.level < T.fillTarget - 0.05) this.mistake('underfill', 'Restauración incompleta', 'La anatomía oclusal no se reconstruyó por completo: queda un escalón y se pierden contactos oclusales.', 8);
    this.polished = true;
    for (const i of this.incs) { const m = i.mesh.material; m.roughness = 0.12; m.clearcoat = 1; m.clearcoatRoughness = 0.05; m.needsUpdate = true; }
    this.ui.toast('ok', 'Acabado y pulido', 'Superficie lisa y brillante.');
    setTimeout(() => this.finish(), 1200);
  }

  finish() {
    if (this.finished) return;
    if (this.extruding) this.endExtrude();
    this.stopLamp();
    this.finished = true;
    this.ui.showReport(this.evaluate());
  }

  // ---- Bucle --------------------------------------------------------------
  update(dt) {
    if (!this.finished) {
      this.t += dt;
      if (this.lamp.on) {
        this.lamp.time += dt;
        for (const it of this.lamp.items) it.t += dt;
        this.ui.updateLamp(this.lamp.time, this.lamp.items);
        this.lamp.light.intensity = 2.5 + Math.sin(this.t * 30) * 0.3;
        if (this.lamp.time >= 60) this.stopLamp();
      }
      if (this.extruding) this.updateExtrude(dt);
      this._liveTimer -= dt;
      if (this._liveTimer <= 0) {
        this._liveTimer = 0.15;
        this.computeLive();
        let changed = false;
        for (const st of this.steps) if (!st.done && st.check(this)) { st.done = true; changed = true; }
        if (changed) this.ui.updateSteps(this.steps);
        this.ui.setReadouts(this.readouts());
        this.ui.setClock(this.t);
      }
      this._evalTimer -= dt;
      if (this._evalTimer <= 0) { this._evalTimer = 1; this.ui.setMetrics(evaluate(this)); }
    }
    this.tooth.updateColors(this.t);
  }

  readouts() {
    const L = this.live, a = this.adh, T = this.tooth, out = [];
    const tc = (t, target) => Math.abs(t - target) <= 2 ? 'ok' : t > target + 2 ? 'bad' : '';
    if (this.gelN > 0) {
      if (L.gelE) out.push({ label: 'Ácido en esmalte', value: `${L.gelTimeE.toFixed(1)} / 15 s`, cls: tc(L.gelTimeE, 15) });
      if (L.gelD) out.push(this.total
        ? { label: 'Ácido en dentina', value: `${L.gelTimeD.toFixed(1)} / 10 s`, cls: tc(L.gelTimeD, 10) }
        : { label: 'Ácido en dentina', value: `${L.gelTimeD.toFixed(1)} s ✖`, cls: 'bad' });
    }
    if (this.etch.final && !a.started) {
      out.push({ label: 'Lavado', value: `${this.etch.rinseTime.toFixed(1)} s`, cls: this.etch.rinseTime >= 5 ? 'ok' : '' });
      const mD = moistureState(L.wetD, this.total), mE = L.wetE < 0.35 ? { label: 'Blanco tiza', cls: 'ok' } : L.wetE < 0.5 ? { label: 'Casi seco', cls: 'warn' } : { label: 'Húmedo', cls: 'warn' };
      out.push({ label: 'Dentina', value: mD.label, cls: mD.cls });
      out.push({ label: 'Esmalte', value: mE.label, cls: mE.cls });
    }
    if (a.started && a.cureQ === null) {
      if (this.univ) {
        out.push({ label: 'Frotado activo', value: `${a.rub.toFixed(1)} / 20 s`, cls: a.rub >= 20 ? 'ok' : '' });
        out.push({ label: 'Aire (solvente)', value: `${a.air.toFixed(1)} / 5 s`, cls: a.air >= 5 ? 'ok' : '' });
      } else {
        const dwell = a.primerDwell ?? (a.primerStart !== null ? this.t - a.primerStart : 0);
        out.push({ label: 'Primer actuando', value: `${dwell.toFixed(1)} / 20 s`, cls: dwell >= 20 ? 'ok' : '' });
        if (a.primerDwell !== null) out.push({ label: 'Aire primer', value: `${a.primerAir.toFixed(1)} s`, cls: a.primerAir >= 1.5 ? 'ok' : '' });
        if (a.bondStarted) out.push({ label: 'Aire adhesivo', value: `${a.bondAir.toFixed(1)} s`, cls: a.bondAir >= 1 ? 'ok' : '' });
      }
    }
    if (this.coat.started && this.coat.cureQ === null) out.push({ label: 'Resin coat (dentina)', value: `${Math.round(L.coatD * 100)}%`, cls: L.coatD >= 0.75 ? 'ok' : '' });
    if (this.extruding) {
      const mm = (this.extruding.to - this.extruding.from) * UNIT_MM;
      out.push({ label: 'Incremento', value: `${mm.toFixed(1)} mm`, cls: mm > 2.25 ? 'bad' : mm >= 1 ? 'ok' : '' });
    }
    if (this.incs.length || this.coat.cureQ !== null) {
      const toDej = (T.dejY - this.level) * UNIT_MM, toTop = (T.fillTarget - this.level) * UNIT_MM;
      if (toDej > 0.1) out.push({ label: 'Hasta la UAD', value: `${toDej.toFixed(1)} mm`, cls: '' });
      out.push({ label: 'Hasta la superficie', value: toTop > 0.1 ? `${toTop.toFixed(1)} mm` : 'completo', cls: toTop <= 0.25 ? 'ok' : '' });
    }
    return out;
  }
}
