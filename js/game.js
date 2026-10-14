// Lógica del procedimiento de cementación.
import * as THREE from 'three';
import { buildCase, Z } from './geometry.js';
import { Paintable, PRODUCT } from './paintable.js';
import { TOOLS, CEMENTS, MATERIALS, PRIMERS, matGroup, faceList, FACE_NAME, buildSteps, decisions, DECISION_PEN } from './data.js';
import { bondModel, scenarioRange, clamp } from './evaluate.js';
import { makeToolModel } from './tools3d.js';

const TOOTH_PRIMERS = ['toothprimer', 'mlprimer', 'adhese'];
const REST_PRIMERS = ['silano', 'ccpp', 'monobond'];

export class CemGame {
  constructor(scene, ui, cfg, plan, tray) {
    this.scene = scene; this.ui = ui; this.cfg = cfg; this.plan = plan; this.tray = tray;
    this.C = CEMENTS[cfg.cement];
    this.g = matGroup(cfg.case);
    this.M = MATERIALS[cfg.case.material];
    this.t = 0;
    this.root = new THREE.Group();
    scene.add(this.root);

    const o = buildCase(cfg.case);
    this.o = o;
    this.root.add(o.env, o.toothMesh);
    this.toothP = new Paintable(o.toothMesh, o.zone, { ids: cfg.ids });
    this.resto = new THREE.Group();
    this.resto.add(o.outer, o.intaglio);
    if (o.ring) this.resto.add(o.ring);
    this.restoP = new Paintable(o.intaglio, null, { base: this.M.color, glass: this.g === 'glass' });
    this.root.add(this.resto);
    // Mesa de trabajo
    const molar = o.kind === 'molar';
    this.benchPos = molar ? new THREE.Vector3(4.3, 0, 0.9) : new THREE.Vector3(2.1, 0, 0.5);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(molar ? 1.25 : 0.8, molar ? 1.3 : 0.85, 0.12, 48),
      new THREE.MeshStandardMaterial({ color: '#2a3a47', roughness: 0.8 }));
    pad.position.copy(this.benchPos).setY(-0.06);
    pad.raycast = () => {};
    this.root.add(pad);
    this.resto.rotation.copy(o.benchRot);
    this.resto.position.set(0, 0, 0);
    this.resto.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.resto);
    this.benchPos.y = -box.min.y + 0.02;
    this.resto.position.copy(this.benchPos);
    this.benchQuat = this.resto.quaternion.clone();
    this.anim = null;

    // Excesos de cemento
    const sg = new THREE.SphereGeometry(molar ? 0.045 : 0.03, 8, 6);
    this.excess = new THREE.InstancedMesh(sg, new THREE.MeshPhysicalMaterial({ color: '#f3ecdc', roughness: 0.25, clearcoat: 1 }), o.margin.length);
    this.excessAlive = new Uint8Array(o.margin.length).fill(1);
    const m4 = new THREE.Matrix4();
    o.margin.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); this.excess.setMatrixAt(i, m4); });
    this.excess.visible = false;
    this.excess.raycast = () => {};
    this.root.add(this.excess);
    this.glyc = null;

    // Lámpara
    this.lamp = { on: false, t: 0, face: null, side: null, model: makeToolModel('lampara'), light: new THREE.PointLight('#4d7bff', 0, 4) };
    this.lamp.model.visible = false;
    this.lamp.model.getObjectByName('beam').visible = true;
    this.root.add(this.lamp.model, this.lamp.light);

    this.flags = { isolated: false, cleaned: false, toothClean: null };
    this.tooth = { etchFinal: null, rinseT: 0, primer: null, primerStart: null, primerRub: 0, primerAir: 0, primerLight: 0, wetD: null, wrong: false, hfOnTooth: false, dentinGelSel: 0 };
    this.restoS = { tried: false, hfDone: false, rinsed: false, hfT: 0, hfCov: 0, apaCov: 0, primer: null, primerStart: null, primerAir: 0, contamAtPrimer: 0, h3po4: false, ivoclean: false, wetAtPrimer: 0 };
    this.cement = { loaded: false, loadedAt: null, cov: 0, curedEarly: false };
    this.seat = { seated: false, seatedAt: null, pressT: 0, tackT: 0, excessRemoved: 0, excessCured: false, glycerin: false, faceT: {} };
    this.finishedPolish = false;
    this.finished = false;
    this.mistakes = new Map();
    this.tips = new Set();
    this.requested = [];
    this.steps = buildSteps(cfg);
    this.range = scenarioRange(cfg);
    this._liveTimer = 0; this._evalTimer = 0;
    this.decisions = decisions(cfg);
    for (const d of this.decisions) if (DECISION_PEN[d.level]) this.mistakes.set('dec_' + d.key, { title: d.title, text: d.text, pen: DECISION_PEN[d.level] });
    if (plan && plan.pen > 0) this.mistakes.set('plan', { title: `Planificación de la bandeja (${plan.score}/100)`, text: '', pen: plan.pen });
    ui.renderSteps(this.steps, cfg.guided !== false);
    ui.renderMistakes(this.mistakes);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
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
  requestMaterial(id) {
    this.requested.push(id);
    this.mistake('ask_' + id, `Material pedido: ${TOOLS[id].name}`, 'No estaba en tu bandeja: interrumpir la técnica alarga el trabajo y arriesga la contaminación.', 2);
  }

  // ---- Destino del instrumento --------------------------------------------
  sideOf(hit) {
    const obj = hit.object;
    if (obj === this.o.toothMesh) return 'tooth';
    if (this.seat.seated) return 'tooth';
    return 'resto';
  }

  faceOf(hit) {
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (this.o.kind === 'incisor') return n.z >= 0 ? 'V' : 'P';
    if (n.y > 0.6) return 'O';
    return n.z >= 0 ? 'V' : 'L';
  }

  // ---- Aplicación continua -------------------------------------------------
  applyPaint(id, hit, dt, moving) {
    if (this.finished || this.anim) return;
    const side = this.sideOf(hit);
    const tool = TOOLS[id], p = hit.point;
    const T = this.toothP, R = this.restoP, ts = this.tooth, rs = this.restoS;
    const onIntaglio = hit.object === this.o.intaglio;

    if (id === 'excesos') return this.removeExcess(p, tool.radius);

    if (side === 'tooth') {
      if (this.seat.seated && id !== 'aire' && id !== 'agua') {
        this.tip('afterSeat', 'Restauración ya cementada', 'Retira los excesos, aplica glicerina y fotopolimeriza.', 'warn');
        return;
      }
      switch (id) {
        case 'fosforico': {
          if (!this.flags.isolated) this.mistake('noIso', 'Sin aislamiento', 'Aísla antes de grabar: la saliva y el fluido crevicular contaminan la superficie.', 6);
          if (this.cfg.strategy === 'self') this.tip('selfEtch', 'Estrategia autograbante', 'Elegiste no usar ácido fosfórico en el diente.', 'warn');
          let dNew = 0;
          T.forEach(p, tool.radius, (k) => { if (!T.s.gel[k]) { T.s.gel[k] = 1; T.s.gelOn[k] = this.t; if (T.zone[k] === Z.DENTIN) dNew++; } });
          if (this.cfg.strategy !== 'total' && dNew && !this.cfg.ids) {
            ts.dentinGelSel += dNew;
            if (ts.dentinGelSel > T.counts[Z.DENTIN] * 0.12) this.mistake('etchDentin', 'Ácido fosfórico en dentina',
              this.C.selfAdhesive ? 'Con un autoadhesivo, la dentina grabada queda con colágeno sin infiltrar: la adhesión cae a ≈6 MPa.' : 'El primer autograbante necesita la hidroxiapatita de la dentina para la unión química del MDP.', 8);
          }
          break;
        }
        case 'hf':
          ts.hfOnTooth = true;
          this.mistake('hfTooth', '¡Ácido fluorhídrico sobre el diente!', 'El HF es muy tóxico para los tejidos y no graba el esmalte de forma útil. Solo se usa sobre la cerámica, fuera de boca.', 20);
          break;
        case 'agua':
          if (ts.primer && this.cement.loaded === false && ts.primerAir > 0) this.mistake('waterPrimer', 'Agua sobre el primer', 'Lavaste el primer o adhesivo ya aplicado: hay que repetirlo.', 6);
          T.forEach(p, tool.radius, (k) => { if (T.s.gel[k]) { T.s.etchT[k] += this.t - T.s.gelOn[k]; T.s.gel[k] = 0; } T.s.wet[k] = 1; });
          ts.rinseT += dt;
          if (!ts.etchFinal && T.gelCount() === 0 && T.frac('etchT', 0, 0.5) > 0) this.finishToothEtch();
          break;
        case 'aire':
          if (T.gelCount() > 0) this.mistake('airGel', 'Secado sin lavar el ácido', 'Primero lava el gel con agua.', 3);
          if (ts.primer && ts.primerAir < 30 && !this.cement.loaded) {
            const P = PRIMERS[ts.primer];
            if (ts.primerAir === 0 && P && !P.rub && this.t - ts.primerStart < P.time - 2)
              this.mistake('tpShort', `Primer con solo ${(this.t - ts.primerStart).toFixed(0)} s de acción`, `${TOOLS[ts.primer].name} necesita ${P.time} s antes del aire.`, 4);
            if (ts.primerAir === 0) ts._dwellEnd = this.t;
            ts.primerAir += dt;
          } else {
            T.forEach(p, tool.radius, (k, w) => { T.s.wet[k] = Math.max(0, T.s.wet[k] - 0.4 * dt * (0.3 + 0.7 * w)); });
          }
          break;
        case 'arenado':
          this.flags.cleaned = true;
          this.flags.toothClean = 'arenado';
          if (this.cfg.ids) this.mistake('apaIds', 'Arenado sobre el sellado dentinario (IDS)', 'Sobre un IDS, el arenado reduce la adhesión del cemento: limpia con piedra pómez.', 3);
          else this.tip('apaTooth', 'Arenado intraoral', 'Limpia la dentina mejor que la pómez.', 'ok');
          T.forEach(p, tool.radius, (k, w) => { T.s.abr[k] = Math.min(1, T.s.abr[k] + w); });
          break;
        default:
          if (PRODUCT[id]) this.applyToothPrimer(id, p, dt, moving);
          else this.tip(null, 'No aplica aquí', `${tool.name} no se usa sobre el diente.`, 'warn');
      }
      return;
    }

    // ---- Restauración ----
    if (!onIntaglio) { this.tip('outerSurf', 'Superficie externa', 'Acondiciona la superficie interna (la que contacta el cemento).', 'warn'); return; }
    if (this.cement.loaded && id !== 'excesos') { this.tip('cemLoaded', 'Cemento ya cargado', 'Asienta la restauración.', 'warn'); return; }
    switch (id) {
      case 'hf': {
        if (this.g !== 'glass') {
          rs.hfCov = Math.max(rs.hfCov, 0.5);
          this.mistake('hfNonGlass', 'El HF no graba ' + (this.g === 'zirconia' ? 'la zirconia' : 'el metal'), 'No tiene fase vítrea que disolver. Se acondiciona con arenado y MDP.', 4);
          break;
        }
        R.forEach(p, tool.radius, (k) => { if (!R.s.gel[k]) { R.s.gel[k] = 2; R.s.gelOn[k] = this.t; } });
        break;
      }
      case 'fosforico':
        rs.h3po4 = true;
        if (this.g === 'zirconia') this.mistake('h3po4Zr', 'Ácido fosfórico sobre zirconia', 'El fosfato se adsorbe en la zirconia y ocupa los sitios donde se une el MDP. Para limpiarla usa arenado o una pasta limpiadora.', 6);
        R.forEach(p, tool.radius, (k) => { R.s.contam[k] = Math.max(0, R.s.contam[k] - 0.6); R.s.wet[k] = 0.8; });
        break;
      case 'agua':
        if (rs.primer && rs.primerAir > 0) this.mistake('waterRestPrimer', 'Agua sobre el primer de la restauración', 'Lavaste el primer: hay que repetirlo.', 5);
        R.forEach(p, tool.radius, (k) => {
          if (R.s.gel[k]) { R.s.etchT[k] += this.t - R.s.gelOn[k]; R.s.gel[k] = 0; R.s.contam[k] = 0; }
          R.s.wet[k] = 1;
        });
        if (R.frac('etchT', 0, 0.5) > 0 && R.gelCount() === 0 && !rs.rinsed) {
          rs.rinsed = true; rs.hfDone = true;
          const st = R.etchStats(Z.INTAGLIO, this.t);
          rs.hfT = st.avg; rs.hfCov = st.cov;
          const tgt = this.M.hfTarget;
          if (st.avg < tgt * 0.6) this.mistake('hfShort', `HF ${st.avg.toFixed(0)} s (objetivo ${tgt} s)`, 'Grabado insuficiente: menos microrretención.', 4);
          else if (st.avg > tgt * 3) this.mistake('hfLong', `HF ${st.avg.toFixed(0)} s (objetivo ${tgt} s)`, 'Grabado excesivo: debilita la cerámica.', 4);
          else this.ui.toast('ok', 'Cerámica grabada', `${st.avg.toFixed(1)} s · ${Math.round(st.cov * 100)}% de la superficie. Seca antes del silano.`);
        }
        break;
      case 'aire':
        if (R.gelCount() > 0) this.mistake('airGelR', 'Secado sin lavar el HF', 'Lava el ácido fluorhídrico con abundante agua.', 3);
        if (rs.primer) {
          const P = PRIMERS[rs.primer];
          if (rs.primerAir === 0 && P && this.t - rs.primerStart < P.time - 2)
            this.mistake('rpShort', `${TOOLS[rs.primer].name}: ${(this.t - rs.primerStart).toFixed(0)} s de reacción`, `Deja actuar ${P.time} s antes de secar.`, 4);
          if (rs.primerAir === 0) rs._airStart = this.t;
          rs.primerAir += dt;
        }
        R.forEach(p, tool.radius, (k, w) => { R.s.wet[k] = Math.max(0, R.s.wet[k] - 0.6 * dt * (0.3 + 0.7 * w)); });
        break;
      case 'arenado':
        if (this.g === 'glass') this.mistake('apaGlass', 'Arenado sobre cerámica vítrea', 'Daña la superficie y no reemplaza el grabado con ácido fluorhídrico.', 4);
        if (rs.primer) this.mistake('apaAfterPrimer', 'Arenado después del primer', 'Eliminaste el primer: hay que aplicarlo de nuevo.', 4);
        R.forEach(p, tool.radius, (k, w) => { R.s.abr[k] = Math.min(1, R.s.abr[k] + w * 1.5); R.s.contam[k] = 0; });
        rs.apaCov = R.frac('abr', 0, 0.5);
        break;
      case 'ivoclean':
        rs.ivoclean = true;
        R.forEach(p, tool.radius, (k) => { R.s.contam[k] = 0; R.s.clean[k] = 1; });
        break;
      default:
        if (PRODUCT[id]) this.applyRestPrimer(id, p, dt);
        else this.tip(null, 'No aplica aquí', `${tool.name} no se usa sobre la restauración.`, 'warn');
    }
  }

  applyToothPrimer(id, p, dt, moving) {
    const ts = this.tooth, T = this.toothP, want = this.C.toothPrimer;
    if (T.gelCount() > 0) this.mistake('primerGel', 'Primer sobre ácido sin lavar', 'Lava todo el gel antes del primer.', 5);
    if (!this.flags.isolated) this.mistake('noIso', 'Sin aislamiento', 'Aísla antes de aplicar el sistema adhesivo.', 6);
    if (id !== want) {
      ts.wrong = true;
      this.mistake('wrongTP_' + id, `${TOOLS[id].name} en el diente`, REST_PRIMERS.includes(id) ? 'Es un primer para la restauración: no se une al diente.' : `No corresponde al sistema ${this.C.name}.`, 4);
      return;
    }
    if (!ts.primer) {
      ts.primer = id; ts.primerStart = this.t;
      ts.wetD = T.avg('wet', Z.DENTIN);
      if (this.cfg.strategy === 'total' && !this.cfg.ids && ts.wetD < 0.15) this.mistake('desic', 'Dentina desecada', 'Con grabado total, la dentina seca hace colapsar el colágeno.', 5);
    }
    T.forEach(p, TOOLS[id].radius, (k) => { T.s.prod[k] = PRODUCT[id]; });
    if (moving) ts.primerRub += dt;
  }

  applyRestPrimer(id, p, dt) {
    const rs = this.restoS, R = this.restoP, want = this.C.restPrimer[this.g];
    if (TOOTH_PRIMERS.includes(id)) { this.mistake('tpOnResto', `${TOOLS[id].name} en la restauración`, 'Es un primer para el diente, no para la restauración.', 4); return; }
    if (this.g === 'glass' && !rs.hfDone) this.mistake('primerNoHF', 'Primer sin grabar la cerámica', 'Primero el ácido fluorhídrico, el lavado y el secado.', 5);
    if (this.g !== 'glass' && rs.apaCov < 0.5) this.tip('primerNoApa', 'Sin arenado previo', 'El MDP se une mejor a una superficie arenada y limpia.', 'warn');
    if (!rs.tried) this.tip('primerNoTry', 'Aún no hiciste la prueba clínica', 'Si pruebas después, contaminarás la superficie ya acondicionada.', 'warn');
    if (id === 'silano' && this.g !== 'glass') this.mistake('silaneZr', 'Silano sobre ' + (this.g === 'zirconia' ? 'zirconia' : 'metal'), 'El silano no aporta adhesión a este material: se necesita MDP.', 3);
    if (want && id !== want) this.tip('rpOther', `${TOOLS[id].name}`, `El primer del sistema ${this.C.name} es ${TOOLS[want].name}.`, 'warn');
    if (!rs.primer || rs.primer !== id || rs.contamLater) { rs.primer = id; rs.primerStart = this.t; rs.primerAir = 0; rs._airStart = undefined; rs.contamLater = false; }
    let n = 0, cont = 0, wet = 0;
    R.forEach(p, TOOLS[id].radius, (k) => { if (!R.s.prod[k]) { n++; cont += R.s.contam[k]; wet += R.s.wet[k]; } R.s.prod[k] = PRODUCT[id]; });
    if (n) {
      rs.contamAtPrimer = Math.max(rs.contamAtPrimer, cont / n);
      rs.wetAtPrimer = Math.max(rs.wetAtPrimer, wet / n);
      if (cont / n > 0.3) this.mistake('primerContam', 'Primer sobre superficie contaminada', 'La saliva de la prueba bloquea la unión química. Limpia antes (HF, arenado o pasta limpiadora).', 6);
      if (wet / n > 0.5) this.mistake('primerWet', 'Primer sobre superficie húmeda', 'Seca la restauración antes del silano o primer.', 3);
    }
  }

  finishToothEtch() {
    const T = this.toothP;
    const E = T.etchStats(Z.ENAMEL, this.t), D = T.etchStats(Z.DENTIN, this.t);
    this.tooth.etchFinal = { E, D };
    if (E.cov < 0.6) this.mistake('etchCovE', 'Esmalte grabado parcialmente', `Solo ${Math.round(E.cov * 100)}% del esmalte.`, 4);
    if (this.cfg.strategy === 'total' && !this.cfg.ids && D.avg > 14) this.mistake('overEtchD', `Dentina grabada ${D.avg.toFixed(1)} s`, 'Más de 10 s desmineraliza más de lo que el adhesivo infiltra.', 5);
    const msg = `Esmalte ${E.avg.toFixed(1)} s (${Math.round(E.cov * 100)}%)` + (D.cov > 0.05 ? ` · Dentina ${D.avg.toFixed(1)} s (${Math.round(D.cov * 100)}%)` : '');
    this.ui.toast('ok', 'Ácido retirado', msg);
  }

  removeExcess(p, radius) {
    if (!this.seat.seated) { this.tip('exNoSeat', 'Aún no hay excesos', 'Primero asienta la restauración.', 'warn'); return; }
    if (this.seat.tackT < 1 && this.C.cure !== 'light') this.tip('exNoTack', 'Excesos sin polimerización inicial', 'Una luz de 2–3 s deja el cemento en gel y facilita retirarlo en bloque.', 'warn');
    if (this.seat.excessCured) this.mistake('exHard', 'Excesos ya polimerizados', 'Con más de unos segundos de luz, el exceso se endurece: es difícil retirarlo y puedes dañar el margen.', 5);
    const m = this.o.margin;
    const local = this.root.worldToLocal(p.clone());
    let changed = false;
    for (let i = 0; i < m.length; i++) {
      if (this.excessAlive[i] && m[i].distanceTo(local) < radius) {
        this.excessAlive[i] = 0; changed = true;
        this.excess.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      }
    }
    if (changed) {
      this.excess.instanceMatrix.needsUpdate = true;
      this.seat.excessRemoved = 1 - this.excessAlive.reduce((a, b) => a + b, 0) / m.length;
    }
  }

  // ---- Mantener sobre el diente (asentar) ----------------------------------
  applyHold(id, hit, dt) {
    if (id !== 'asentar' || this.finished) return;
    if (!this.cement.loaded) { this.mistake('seatNoCement', 'Asentar sin cemento', 'Primero carga el cemento en la superficie interna de la restauración.', 3); return; }
    if (this.cement.curedEarly) return;
    if (!this.seat.seated && !this.anim) {
      const C = this.C;
      if (C.toothPrimer && this.tooth.primer !== C.toothPrimer) this.mistake('seatNoTP', 'Diente sin el primer del sistema', `${C.name} necesita ${TOOLS[C.toothPrimer].name} en el diente.`, 8);
      if (C.toothPrimer && this.tooth.primer && this.tooth.primerAir < 1) this.mistake('seatNoAir', 'Primer sin evaporar', 'Seca suavemente el primer o adhesivo antes de cementar.', 4);
      if (!this.flags.isolated) this.mistake('noIso', 'Sin aislamiento', 'Cementar sin control de la humedad contamina la interfase.', 6);
      this.startSeat();
      return;
    }
    if (this.seat.seated) this.seat.pressT += dt;
  }

  startSeat() {
    this.anim = { t: 0, dur: 0.7, fromP: this.resto.position.clone(), fromQ: this.resto.quaternion.clone(), toP: new THREE.Vector3(0, 0, 0), toQ: new THREE.Quaternion(), done: () => {
      this.seat.seated = true; this.seat.seatedAt = this.t;
      this.excess.visible = true;
      this.o.intaglio.visible = false;
      if (this.t - this.cement.loadedAt > 120) this.mistake('slowSeat', 'Asentamiento tardío', `Pasaron ${(this.t - this.cement.loadedAt).toFixed(0)} s desde la mezcla: el cemento empezó a fraguar.`, 4);
      this.ui.toast('info', 'Restauración asentada', 'Mantén la presión al menos 5 s, luego luz 2–3 s y retira los excesos.');
    } };
  }

  // ---- Instrumentos que se sueltan -----------------------------------------
  drop(id, hit) {
    if (this.finished || this.anim) return;
    const side = hit ? this.sideOf(hit) : 'tooth';
    const T = TOOLS[id];
    if (T.type === 'distractor') { this.mistake('used_' + id, `${T.name}: no indicado`, T.why, 6); return; }
    switch (id) {
      case 'prueba': {
        if (this.seat.seated) return;
        if (this.cement.loaded) { this.mistake('tryCement', 'Prueba con cemento cargado', 'La prueba se hace antes de acondicionar y cargar el cemento.', 6); return; }
        if (this.restoS.primer) this.restoS.contamLater = true;
        if (this.restoS.primer) this.mistake('tryAfterPrimer', 'Prueba después del primer', 'La saliva contamina la superficie ya acondicionada: hay que limpiarla y repetir el primer.', 5);
        this.restoS.tried = true;
        this.anim = { t: 0, dur: 1.6, tryIn: true, fromP: this.resto.position.clone(), fromQ: this.resto.quaternion.clone(), done: () => {
          for (let k = 0; k < this.restoP.N; k++) { this.restoP.s.contam[k] = 1; }
          this.restoS.contamFinal = 1;
          this.ui.toast('ok', 'Prueba clínica', 'Ajuste marginal y contactos correctos. La superficie interna quedó contaminada con saliva.');
        } };
        break;
      }
      case 'aislamiento':
        if (this.flags.isolated) return;
        this.flags.isolated = true; this.o.dam.visible = true;
        this.ui.toast('ok', 'Aislamiento', 'Campo seco: sin saliva ni fluido crevicular.');
        break;
      case 'pomez':
        if (this.seat.seated) return;
        this.flags.cleaned = true;
        if (!this.flags.toothClean) this.flags.toothClean = 'pomez';
        for (let k = 0; k < this.toothP.N; k++) if (this.toothP.zone[k]) this.toothP.s.wet[k] = Math.max(this.toothP.s.wet[k], 0.85);
        this.ui.toast('ok', 'Diente limpio', 'Restos del provisorio eliminados. Lava y seca.');
        break;
      case 'cemento': {
        if (side !== 'resto') { this.tip('cemTooth', 'Carga el cemento en la restauración', 'Se aplica en la superficie interna de la restauración.', 'warn'); return; }
        if (this.cement.loaded) return;
        const rs = this.restoS, want = this.C.restPrimer[this.g];
        if (this.g === 'glass' && !rs.hfDone) this.mistake('cemNoHF', 'Cerámica sin grabar', 'Falta el ácido fluorhídrico en la superficie interna.', 8);
        if (this.g !== 'glass' && rs.apaCov < 0.5) this.mistake('cemNoApa', 'Superficie interna sin arenar', 'El arenado limpia la contaminación y es la base de la unión del MDP.', 6);
        if (want && !rs.primer) this.mistake('cemNoRP', 'Restauración sin primer', `Falta ${TOOLS[want].name}.`, 8);
        if (!rs.tried) this.mistake('noTry', 'Sin prueba clínica', 'Antes de cementar se verifica el ajuste, los contactos y el color.', 3);
        this.cement.loaded = true; this.cement.loadedAt = this.t; this.cement.cov = 1;
        for (let k = 0; k < this.restoP.N; k++) this.restoP.s.cement[k] = 1;
        this.ui.toast('info', `${this.C.name} cargado`, this.C.cure === 'light' ? 'Cemento fotopolimerizable: tienes tiempo de trabajo, pero no lo expongas a la luz.' : 'Tiempo de trabajo limitado: asienta en menos de 2 minutos.');
        break;
      }
      case 'lampara': this.startLamp(hit, side); break;
      case 'glicerina':
        if (!this.seat.seated) { this.tip('glyNoSeat', 'Aún no', 'La glicerina va sobre los márgenes después de retirar los excesos.', 'warn'); return; }
        if (this.seat.excessRemoved < 0.85) this.mistake('glyBefore', 'Glicerina antes de retirar excesos', 'Primero retira los excesos; si no, quedan atrapados bajo el gel.', 3);
        if (Object.values(this.seat.faceT).some(v => v > 5)) this.tip('glyLate', 'Glicerina tardía', 'Debe ir antes de la fotopolimerización final.', 'warn');
        this.seat.glycerin = true;
        this.showGlycerin();
        this.ui.toast('ok', 'Glicerina en los márgenes', 'Barrera contra el oxígeno: el cemento polimeriza también en la superficie.');
        break;
      case 'pulido':
        if (!this.seat.seated) { this.tip('polNoSeat', 'Nada que pulir', 'Primero cementa la restauración.', 'warn'); return; }
        if (!faceList(this.cfg.case).every(f => (this.seat.faceT[f] || 0) >= 15)) this.mistake('polUncured', 'Pulido antes de terminar la polimerización', 'Fotopolimeriza cada cara antes del pulido.', 4);
        if (this.seat.excessRemoved < 0.85) this.mistake('polExcess', 'Quedaron excesos de cemento', 'Los excesos en el surco irritan la encía y acumulan placa.', 5);
        this.finishedPolish = true;
        this.ui.toast('ok', 'Márgenes pulidos', 'Procedimiento terminado.');
        setTimeout(() => this.finish(), 900);
        break;
    }
  }

  showGlycerin() {
    const g = new THREE.InstancedMesh(new THREE.SphereGeometry(this.o.kind === 'molar' ? 0.07 : 0.045, 8, 6),
      new THREE.MeshPhysicalMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, depthWrite: false }), this.o.margin.length);
    const m4 = new THREE.Matrix4();
    this.o.margin.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); g.setMatrixAt(i, m4); });
    g.raycast = () => {};
    this.root.add(g);
    this.glyc = g;
  }

  // ---- Lámpara --------------------------------------------------------------
  startLamp(hit, side) {
    if (this.lamp.on || !hit) return;
    const C = this.C;
    if (!this.seat.seated && side === 'resto' && this.cement.loaded) {
      this.cement.curedEarly = true;
      this.mistake('cureEarly', 'Cemento fotopolimerizado fuera de boca', 'El cemento endureció antes de asentar: la restauración no llegará a su posición. Hay que retirarlo y repetir.', 20);
    }
    if (!this.seat.seated && side === 'tooth' && !(this.tooth.primer && (C.toothPrimer === 'adhese' || C.toothPrimer === 'sbu')))
      this.tip('lampNothing', 'Nada que polimerizar en el diente', C.toothPrimer ? 'El primer de este sistema no se fotopolimeriza.' : 'Este cemento no usa adhesivo en el diente.', 'warn');
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const face = this.faceOf(hit);
    this.lamp.on = true; this.lamp.t = 0; this.lamp.face = face; this.lamp.side = side;
    const dir = n.clone().normalize();
    this.lamp.model.position.copy(hit.point).addScaledVector(dir, 0.55);
    this.lamp.model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.lamp.model.visible = true;
    this.lamp.light.position.copy(hit.point).addScaledVector(dir, 0.3);
    this.lamp.light.intensity = 3;
    this.ui.showLamp(true, this.seat.seated ? `Cara ${FACE_NAME[face]}` : (side === 'tooth' ? 'Adhesivo en el diente' : 'Restauración'));
  }

  stopLamp() {
    if (!this.lamp.on) return;
    this.lamp.on = false;
    this.lamp.model.visible = false; this.lamp.light.intensity = 0;
    this.ui.showLamp(false);
    const t = this.lamp.t;
    if (this.seat.seated) {
      if (this.seat.excessRemoved < 0.85) {
        if (t >= 1.5 && t <= 6) this.ui.toast('ok', `Polimerización inicial ${t.toFixed(1)} s`, 'Cemento en gel: retira los excesos con el explorador y el hilo.');
      } else {
        const ft = this.seat.faceT[this.lamp.face] || 0;
        if (ft < 19) this.tip(null, `Cara ${FACE_NAME[this.lamp.face]}: ${ft.toFixed(0)} s`, 'Se recomiendan 20 s por cara.', 'warn');
        else this.ui.toast('ok', `Cara ${FACE_NAME[this.lamp.face]} polimerizada`, `${ft.toFixed(0)} s.`);
      }
    } else if (this.tooth.primer === 'adhese' || this.tooth.primer === 'sbu') {
      if (this.tooth.primerAir < 1) this.mistake('lightNoAir', 'Luz sin evaporar el solvente', 'Aire suave antes de fotopolimerizar el adhesivo.', 4);
      this.ui.toast(this.tooth.primerLight >= 9 ? 'ok' : 'warn', 'Adhesivo fotopolimerizado', `${this.tooth.primerLight.toFixed(1)} s (objetivo 10 s).`);
    }
  }

  // ---- Bucle ----------------------------------------------------------------
  update(dt) {
    if (this.anim) {
      const a = this.anim; a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.tryIn) {
        const e = Math.sin(Math.PI * k);
        this.resto.position.lerpVectors(a.fromP, new THREE.Vector3(0, 0, 0), e);
        this.resto.quaternion.slerpQuaternions(a.fromQ, new THREE.Quaternion(), e);
      } else {
        const e = k * k * (3 - 2 * k);
        this.resto.position.lerpVectors(a.fromP, a.toP, e);
        this.resto.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      }
      if (k >= 1) { const done = a.done; this.anim = null; if (a.tryIn) { this.resto.position.copy(this.benchPos); this.resto.quaternion.copy(this.benchQuat); } done?.(); }
    }
    if (!this.finished) {
      this.t += dt;
      if (this.lamp.on) {
        this.lamp.t += dt;
        this.lamp.light.intensity = 2.6 + Math.sin(this.t * 30) * 0.3;
        if (this.seat.seated) {
          if (this.seat.excessRemoved < 0.85) {
            this.seat.tackT += dt;
            if (this.seat.tackT > 8 && !this.seat.excessCured) {
              this.seat.excessCured = true;
              this.mistake('exCured', 'Excesos polimerizados', 'Fotopolimerizaste demasiado antes de retirar los excesos: quedaron duros en el margen.', 5);
            }
          } else {
            this.seat.faceT[this.lamp.face] = (this.seat.faceT[this.lamp.face] || 0) + dt;
          }
        } else if (this.lamp.side === 'tooth' && this.tooth.primer) {
          this.tooth.primerLight += dt;
        }
        this.ui.updateLamp(this.lamp.t, this.lampTarget());
        if (this.lamp.t > 60) this.stopLamp();
      }
      this._liveTimer -= dt;
      if (this._liveTimer <= 0) {
        this._liveTimer = 0.2;
        let changed = false;
        for (const st of this.steps) if (!st.done && st.check(this)) { st.done = true; changed = true; }
        if (changed) this.ui.updateSteps(this.steps);
        this.ui.setReadouts(this.readouts());
        this.ui.setClock(this.t);
      }
      this._evalTimer -= dt;
      if (this._evalTimer <= 0) { this._evalTimer = 1; this.ui.setMetrics(this.evaluate(), this.range); }
    }
    this.toothP.updateColors(this.t);
    this.restoP.updateColors(this.t);
  }

  lampTarget() {
    if (this.seat.seated) {
      if (this.seat.excessRemoved < 0.85) return { label: 'Polimerización inicial (tack)', t: this.seat.tackT, req: 3, max: 6 };
      return { label: `Cara ${FACE_NAME[this.lamp.face]}`, t: this.seat.faceT[this.lamp.face] || 0, req: 20 };
    }
    if (this.lamp.side === 'tooth') return { label: 'Adhesivo', t: this.tooth.primerLight, req: 10 };
    return { label: '—', t: this.lamp.t, req: 0 };
  }

  readouts() {
    const out = [], T = this.toothP, R = this.restoP, rs = this.restoS, ts = this.tooth;
    const tc = (t, target) => Math.abs(t - target) <= Math.max(2, target * 0.15) ? 'ok' : t > target ? 'bad' : '';
    if (R.gelCount() > 0) { const st = R.etchStats(Z.INTAGLIO, this.t); out.push({ label: 'HF en la cerámica', value: `${st.avg.toFixed(1)} / ${this.M.hfTarget} s`, cls: tc(st.avg, this.M.hfTarget) }); }
    if (rs.primer && rs.primerAir < 1 && !this.cement.loaded) {
      const P = PRIMERS[rs.primer]; const dw = this.t - rs.primerStart;
      out.push({ label: `${TOOLS[rs.primer].name.split(' (')[0]}`, value: `${dw.toFixed(0)} / ${P.time} s`, cls: dw >= P.time ? 'ok' : '' });
    }
    if (T.gelCount() > 0) {
      const E = T.etchStats(Z.ENAMEL, this.t), D = T.etchStats(Z.DENTIN, this.t);
      if (E.cov > 0) out.push({ label: 'Ácido en esmalte', value: `${E.avg.toFixed(1)} / 15 s`, cls: tc(E.avg, 15) });
      if (D.cov > 0) out.push(this.cfg.strategy === 'total' ? { label: 'Ácido en dentina', value: `${D.avg.toFixed(1)} / 10 s`, cls: tc(D.avg, 10) } : { label: 'Ácido en dentina', value: `${D.avg.toFixed(1)} s ✖`, cls: 'bad' });
    }
    if (ts.primer && !this.cement.loaded) {
      const P = PRIMERS[ts.primer];
      if (P.rub) out.push({ label: 'Frotado activo', value: `${ts.primerRub.toFixed(0)} / ${P.time} s`, cls: ts.primerRub >= P.time ? 'ok' : '' });
      else out.push({ label: 'Primer actuando', value: `${(this.t - ts.primerStart).toFixed(0)} / ${P.time} s`, cls: this.t - ts.primerStart >= P.time ? 'ok' : '' });
      out.push({ label: 'Aire', value: `${ts.primerAir.toFixed(1)} / ${P.air} s`, cls: ts.primerAir >= P.air ? 'ok' : '' });
    }
    if (this.cement.loaded && !this.seat.seated) { const w = this.t - this.cement.loadedAt; out.push({ label: 'Tiempo desde la mezcla', value: `${w.toFixed(0)} s`, cls: w > 120 ? 'bad' : w > 90 ? 'warn' : '' }); }
    if (this.seat.seated) {
      out.push({ label: 'Presión de asentamiento', value: `${this.seat.pressT.toFixed(1)} / 5 s`, cls: this.seat.pressT >= 5 ? 'ok' : '' });
      out.push({ label: 'Excesos retirados', value: `${Math.round(this.seat.excessRemoved * 100)}%`, cls: this.seat.excessRemoved >= 0.85 ? 'ok' : '' });
      for (const f of faceList(this.cfg.case)) { const v = this.seat.faceT[f] || 0; out.push({ label: `Luz ${FACE_NAME[f]}`, value: `${v.toFixed(0)} / 20 s`, cls: v >= 19 ? 'ok' : '' }); }
    }
    return out;
  }

  // ---- Evaluación -----------------------------------------------------------
  summary() {
    const T = this.toothP, R = this.restoP, ts = this.tooth, rs = this.restoS;
    const ef = ts.etchFinal || { E: T.etchStats(Z.ENAMEL, this.t), D: T.etchStats(Z.DENTIN, this.t) };
    const P = this.C.toothPrimer ? PRIMERS[this.C.toothPrimer] : null;
    let tp = { id: ts.primer, cov: 0, timeQ: 0, airQ: 0, lightQ: 0 };
    if (ts.primer && P) {
      const zoneCov = (T.counts[Z.ENAMEL] * frac(T, Z.ENAMEL) + T.counts[Z.DENTIN] * frac(T, Z.DENTIN)) / Math.max(1, T.counts[Z.ENAMEL] + T.counts[Z.DENTIN]);
      const dwell = P.rub ? ts.primerRub : (ts.primerAir > 0 ? Math.min(this.t, ts._dwellEnd ?? this.t) - ts.primerStart : this.t - ts.primerStart);
      tp = { id: ts.primer, cov: zoneCov, timeQ: clamp(dwell / P.time, 0, 1), airQ: clamp(ts.primerAir / P.air, 0, 1), lightQ: clamp(ts.primerLight / 10, 0, 1) };
    }
    const rp = rs.primer;
    let rpCov = 0, rpTime = 0;
    if (rp) {
      rpCov = R.frac('prod', 0, 0.5);
      const RP = PRIMERS[rp];
      rpTime = clamp(((rs.primerAir > 0 ? rs._airStart ?? this.t : this.t) - rs.primerStart) / RP.time, 0, 1);
    }
    // Contaminación que quedó sin tratar: sin primer, o por una prueba posterior al primer.
    const contamFinal = (!rp || rs.contamLater) ? R.avg('contam') : 0;
    return {
      isolated: this.flags.isolated, toothClean: this.flags.toothClean,
      enamel: { etchT: ef.E.avg, cov: ef.E.cov }, dentin: { etchT: ef.D.avg, cov: ef.D.cov }, wetD: ts.wetD,
      tp, toothWrong: ts.wrong, hfOnTooth: ts.hfOnTooth,
      r: { hfT: rs.hfT, hfCov: rs.hfCov, apaCov: rs.apaCov, primer: rp, primerCov: rpCov, primerTimeQ: rpTime, primerAirQ: rp ? clamp(rs.primerAir / 1, 0, 1) : 0,
        contamAtPrimer: rs.contamAtPrimer, contamFinal, h3po4: rs.h3po4 },
      cem: { cov: this.cement.loaded ? 1 : 0, delay: this.seat.seatedAt != null && this.cement.loadedAt != null ? this.seat.seatedAt - this.cement.loadedAt : 0, curedEarly: this.cement.curedEarly },
      pressT: this.seat.pressT, faceT: { ...this.seat.faceT },
    };
  }

  evaluate() {
    const S = this.summary();
    const m = bondModel(this.cfg, S);
    // Calidad de los márgenes (no son MPa)
    let margin = 100;
    if (this.seat.excessRemoved < 0.85) margin -= 35 * (1 - this.seat.excessRemoved);
    if (this.seat.excessCured) margin -= 20;
    if (!this.seat.glycerin) margin -= 15;
    if (!this.flags.isolated) margin -= 15;
    if (!this.finishedPolish) margin -= 10;
    m.margin = clamp(margin, 0, 100);
    m.summary = S;
    return m;
  }

  finish() {
    if (this.finished) return;
    this.stopLamp();
    this.finished = true;
    this.ui.showReport(this.report(), this.decisions);
  }

  report() {
    const m = this.evaluate();
    const fb = [];
    const good = (t) => fb.push({ ok: true, text: t }), bad = (t) => fb.push({ ok: false, text: t });
    const cfg = this.cfg, C = this.C;
    if (this.plan) (this.plan.score >= 80 ? good : bad)(`Planificación de la bandeja: ${this.plan.score}/100`);
    for (const n of m.notes) bad(n);
    const rs = this.restoS, ts = this.tooth;
    rs.tried ? good('Prueba clínica antes de acondicionar') : bad('Sin prueba clínica');
    if (this.g === 'glass') rs.hfDone ? good(`HF ${rs.hfT.toFixed(0)} s (objetivo ${this.M.hfTarget} s)`) : bad('Cerámica sin grabar con HF');
    else rs.apaCov >= 0.7 ? good('Superficie interna arenada') : bad('Superficie interna sin arenar');
    const want = C.restPrimer[this.g];
    if (want) rs.primer === want ? good(`${TOOLS[want].name} en la restauración`) : bad(`Faltó ${TOOLS[want].name} en la restauración`);
    if (rs.contamAtPrimer > 0.3) bad('Primer aplicado sobre la contaminación de la prueba');
    if (C.toothPrimer) ts.primer === C.toothPrimer ? good(`${TOOLS[C.toothPrimer].name} en el diente`) : bad(`Faltó ${TOOLS[C.toothPrimer].name} en el diente`);
    this.seat.pressT >= 5 ? good(`Presión de asentamiento ${this.seat.pressT.toFixed(0)} s`) : bad(`Presión de asentamiento de solo ${this.seat.pressT.toFixed(1)} s`);
    this.seat.excessRemoved >= 0.85 ? good('Excesos retirados') : bad('Quedaron excesos de cemento');
    this.seat.glycerin ? good('Glicerina en los márgenes') : bad('Sin glicerina: capa inhibida por oxígeno en los márgenes');
    const faces = faceList(cfg.case), lit = faces.filter(f => (this.seat.faceT[f] || 0) >= 19);
    lit.length === faces.length ? good('Todas las caras fotopolimerizadas 20 s') : bad(`Caras sin la luz completa: ${faces.filter(f => !lit.includes(f)).map(f => FACE_NAME[f]).join(', ')}`);
    let pen = 0; for (const x of this.mistakes.values()) pen += x.pen;
    const best = this.range.best, worst = this.range.worst;
    const relOf = (v, lo, hi) => clamp((v - lo) / Math.max(1, hi - lo), 0, 1);
    const rel = (relOf(m.final24, worst.final24, best.final24) + relOf(m.aged, worst.aged, best.aged)) / 2;
    const score = Math.round(clamp(55 * rel + 0.2 * m.margin + (this.plan ? 0.15 * this.plan.score : 15) + 10 - pen, 0, 100));
    return { m, best, worst, fb, pen, score, stars: score >= 85 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0, cfg };
  }
}

function frac(T, zone) {
  const a = T.s.prod; let n = 0, c = 0;
  for (let k = 0; k < T.N; k++) { if (T.zone[k] !== zone) continue; n++; if (a[k]) c++; }
  return n ? c / n : 0;
}
