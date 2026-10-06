// Preparación de la bandeja: el alumno elige los materiales del gabinete
// y los ordena según el momento en que los usará. Luego se corrige.
import { TOOLS, CATALOG, expectedTray, optionalTools, notIndicatedReason } from './tools.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Para qué se necesita cada material (se muestra cuando falta).
const NEED = {
  dique: 'Aislamiento absoluto: es el primer paso de todo procedimiento adhesivo.',
  matriz: 'Reconstruye las paredes proximales y el punto de contacto en la clase II.',
  limpieza: 'Limpia la cavidad antes de grabar.',
  acido: 'Graba el esmalte (y la dentina en el grabado total).',
  agua: 'Lava el ácido y detiene el grabado.',
  aire: 'Seca el esmalte y evapora el solvente del adhesivo.',
  microbrush: 'Retira el exceso de agua y deja la dentina húmeda, sin desecarla (técnica húmeda).',
  universal: 'Sistema adhesivo elegido.',
  primer: 'Primer autograbante: primer frasco del sistema elegido.',
  bond: 'Adhesivo hidrófobo: segundo frasco del sistema elegido.',
  lampara: 'Polimeriza el adhesivo, el resin coat y cada incremento.',
  fluida: 'Resin coat sobre la dentina hibridizada.',
  fibra: 'Refuerzo biomimético que planificaste en tu protocolo.',
  compDentina: 'Reemplaza la dentina hasta la UAD.',
  compEsmalte: 'Capa final que reproduce el esmalte.',
  pulido: 'Acabado y pulido de la restauración.',
};

function shuffle(a, seed = Date.now()) {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Subsecuencia creciente más larga: los materiales que sí están en orden relativo.
function inOrderMask(idx) {
  const n = idx.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) {
    if (idx[j] < idx[i] && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
  }
  const mask = Array(n).fill(false);
  let k = n ? len.indexOf(Math.max(...len)) : -1;
  while (k >= 0) { mask[k] = true; k = prev[k]; }
  return mask;
}

export function gradePlan(tray, cfg) {
  const exp = expectedTray(cfg), opt = optionalTools(cfg);
  const missing = exp.filter(id => !tray.includes(id));
  const extra = tray.filter(id => !exp.includes(id) && !opt.includes(id));
  const seq = tray.filter(id => exp.includes(id));
  const mask = inOrderMask(seq.map(id => exp.indexOf(id)));
  const outOfOrder = seq.filter((_, i) => !mask[i]);
  const score = Math.max(0, 100 - missing.length * 12 - extra.length * 8 - outOfOrder.length * 6);
  const pen = Math.min(25, missing.length * 4 + extra.length * 3 + outOfOrder.length * 2);
  return { exp, missing, extra, outOfOrder, score, pen, tray: [...tray] };
}

// Decisión del protocolo frente a la indicación del caso.
export function fiberDecision(cfg) {
  if (cfg.level.fiberIndicated && !cfg.fiber) return { ok: false, pen: 6, text: 'No planificaste refuerzo con fibra en una MOD profunda sin rebordes marginales: el remanente queda sin refuerzo frente a las grietas.' };
  if (!cfg.level.fiberIndicated && cfg.fiber) return { ok: false, pen: 3, text: 'Planificaste fibra en una cavidad clase I poco profunda con rebordes intactos: no está indicada.' };
  if (cfg.fiber) return { ok: true, pen: 0, text: 'Refuerzo con fibra de polietileno indicado para una MOD profunda.' };
  return { ok: true, pen: 0, text: 'Sin fibra: correcto para una cavidad con rebordes marginales intactos.' };
}

export class Planner {
  constructor(root) {
    this.root = root;
    this.cabinet = root.querySelector('#cabinet');
    this.trayEl = root.querySelector('#plan-tray');
    this.resultEl = root.querySelector('#plan-result');
    this.countEl = root.querySelector('#tray-count');
    this._drag = null;
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
  }

  open(cfg, onDone) {
    this.cfg = cfg;
    this.onDone = onDone;
    this.order = shuffle(CATALOG);
    this.tray = [];
    this.first = null;
    this.resultEl.hidden = true;
    this.root.classList.remove('graded');
    this.render();
  }

  render() {
    this.cabinet.innerHTML = '';
    for (const id of this.order) {
      const b = this._card(id, 'cab');
      if (this.tray.includes(id)) b.classList.add('used');
      this.cabinet.appendChild(b);
    }
    this.trayEl.innerHTML = '';
    if (!this.tray.length) {
      this.trayEl.innerHTML = '<p class="pl-empty">Toca o arrastra materiales desde el gabinete. El primero que usarás va a la izquierda.</p>';
    }
    this.tray.forEach((id, i) => {
      const b = this._card(id, 'tray');
      b.insertAdjacentHTML('afterbegin', `<span class="pl-n">${i + 1}</span>`);
      this.trayEl.appendChild(b);
    });
    this.countEl.textContent = `${this.tray.length} materiales`;
  }

  _card(id, where) {
    const t = TOOLS[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl-card';
    b.dataset.id = id;
    b.dataset.where = where;
    b.style.setProperty('--tc', t.color);
    b.innerHTML = `<span class="pl-i">${t.icon}</span><span class="pl-t">${esc(t.name)}</span>`;
    b.title = where === 'tray' ? 'Toca para devolver al gabinete · arrastra para reordenar' : 'Toca para agregar a la bandeja';
    b.addEventListener('pointerdown', (e) => this._down(e, id, where, b));
    b.addEventListener('keydown', (e) => this._key(e, id, where));
    return b;
  }

  // ---- Interacción --------------------------------------------------------
  _key(e, id, where) {
    if (where !== 'tray') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.add(id); } return; }
    const i = this.tray.indexOf(id);
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); this.moveTo(id, i - 1); this._focus(id); }
    else if (e.key === 'ArrowRight' && i < this.tray.length - 1) { e.preventDefault(); this.moveTo(id, i + 1); this._focus(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.remove(id); }
  }
  _focus(id) { this.trayEl.querySelector(`[data-id="${id}"]`)?.focus(); }

  _down(e, id, where, el) {
    if (e.button !== 0) return;
    e.preventDefault();
    this._drag = { id, where, el, x0: e.clientX, y0: e.clientY, moved: false, ghost: null };
  }

  _move(e) {
    const d = this._drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    if (!d.moved) {
      d.moved = true;
      d.ghost = d.el.cloneNode(true);
      d.ghost.classList.add('pl-ghost');
      document.body.appendChild(d.ghost);
      d.el.classList.add('dragging');
    }
    d.ghost.style.transform = `translate(${e.clientX - 50}px, ${e.clientY - 30}px)`;
    const over = this._overTray(e);
    this.trayEl.classList.toggle('drop', over);
    this._marker(over ? this._insertIndex(e) : -1);
  }

  _up(e) {
    const d = this._drag;
    if (!d) return;
    this._drag = null;
    this.trayEl.classList.remove('drop');
    this._marker(-1);
    d.ghost?.remove();
    d.el.classList.remove('dragging');
    if (!d.moved) { d.where === 'tray' ? this.remove(d.id) : this.add(d.id); return; }
    if (this._overTray(e)) {
      let idx = this._insertIndex(e);
      if (d.where === 'tray') {
        const cur = this.tray.indexOf(d.id);
        if (idx > cur) idx--;
        this.moveTo(d.id, idx);
      } else this.add(d.id, idx);
    } else if (d.where === 'tray') this.remove(d.id);
  }

  _overTray(e) {
    const r = this.trayEl.getBoundingClientRect();
    return e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 20 && e.clientY <= r.bottom + 20;
  }

  _insertIndex(e) {
    const cards = [...this.trayEl.querySelectorAll('.pl-card')];
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      const cy = r.top + r.height / 2;
      if (e.clientY < r.top) return i;
      if (Math.abs(e.clientY - cy) <= r.height / 2 && e.clientX < r.left + r.width / 2) return i;
    }
    return cards.length;
  }

  _marker(i) {
    this.trayEl.querySelectorAll('.pl-card').forEach((c, k) => {
      c.classList.toggle('ins-before', k === i);
      c.classList.toggle('ins-after', i === this.tray.length && k === this.tray.length - 1);
    });
  }

  add(id, idx = this.tray.length) {
    if (this.tray.includes(id)) return;
    this.tray.splice(idx, 0, id);
    this.render();
  }
  remove(id) {
    this.tray = this.tray.filter(x => x !== id);
    this.render();
  }
  moveTo(id, idx) {
    this.tray = this.tray.filter(x => x !== id);
    this.tray.splice(Math.max(0, Math.min(idx, this.tray.length)), 0, id);
    this.render();
  }

  // ---- Corrección ---------------------------------------------------------
  verify() {
    const g = gradePlan(this.tray, this.cfg);
    if (!this.first) this.first = g;
    const fd = fiberDecision(this.cfg);
    const name = (id) => esc(TOOLS[id].name);
    const exp = g.exp;
    const rows = exp.map((id, i) => {
      const st = !this.tray.includes(id) ? ['miss', '✖ faltó'] : g.outOfOrder.includes(id) ? ['ooo', '↕ fuera de orden'] : ['ok', '✔'];
      return `<li class="${st[0]}"><span class="pl-n">${i + 1}</span><span>${TOOLS[id].icon} ${name(id)}</span><em>${st[1]}</em></li>`;
    }).join('');
    const extras = g.extra.map(id => `<li><b>${TOOLS[id].icon} ${name(id)}</b><span>${esc(notIndicatedReason(id, this.cfg))}</span></li>`).join('');
    const missing = g.missing.map(id => `<li><b>${TOOLS[id].icon} ${name(id)}</b><span>${esc(NEED[id] || '')}</span></li>`).join('');
    this.resultEl.innerHTML = `
      <div class="pl-score"><div><b>${this.first.score}</b><small>/100</small></div>
        <p>Planificación de la bandeja${this.first !== g ? ` · se evalúa tu primer intento (este: ${g.score}/100)` : ''}</p></div>
      <p class="pl-decision ${fd.ok ? 'ok' : 'bad'}">${fd.ok ? '✔' : '✖'} <b>Decisión de refuerzo:</b> ${esc(fd.text)}</p>
      <div class="pl-cols">
        <div><h5>Orden recomendado</h5><ol class="pl-order">${rows}</ol></div>
        <div>
          ${missing ? `<h5>Te faltó</h5><ul class="pl-why miss">${missing}</ul>` : ''}
          ${extras ? `<h5>No corresponden</h5><ul class="pl-why extra">${extras}</ul>` : ''}
          ${!missing && !extras && !g.outOfOrder.length ? '<p class="pl-perfect">¡Bandeja perfecta! Todos los materiales y en el orden correcto.</p>' : ''}
          ${g.outOfOrder.length ? `<p class="fine">↕ ${g.outOfOrder.length} material(es) fuera de orden. Puedes reordenar y volver a verificar.</p>` : ''}
        </div>
      </div>`;
    this.resultEl.hidden = false;
    this.root.classList.add('graded');
    this.resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  useRecommended() {
    this.tray = [...expectedTray(this.cfg)];
    this.render();
  }

  start() {
    if (!this.first) this.verify();
    this.onDone?.(this.tray.length ? [...this.tray] : [...expectedTray(this.cfg)], this.first, fiberDecision(this.cfg));
  }
}
