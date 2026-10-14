// Interfaz HTML: asistente (caso → protocolo → bandeja), paneles, avisos e informe.
import { TOOLS, CASES, CEMENTS } from './data.js';
import { THRESHOLDS } from './evaluate.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SCALE = 50; // MPa del eje
const pct = (v) => Math.max(0, Math.min(100, (v / SCALE) * 100));

export class UI {
  constructor() { this._buildMenu(); this.toasts = $('#toasts'); }

  _buildMenu() {
    const chips = (c) => c.findings.map(f => `<span class="chip">${esc(f)}</span>`).join('');
    $('#opt-case').innerHTML = CASES.map((c, i) => `
      <label class="opt case"><input type="radio" name="case" value="${c.id}" ${i === 0 ? 'checked' : ''}>
      <div><b>${esc(c.title)}</b><span class="pt">${esc(c.patient)}</span><small>${esc(c.story)}</small><div class="chips">${chips(c)}</div></div></label>`).join('');
    $('#opt-cement').innerHTML = Object.entries(CEMENTS).map(([k, c], i) => `
      <label class="opt"><input type="radio" name="cement" value="${k}" ${i === 0 ? 'checked' : ''}>
      <div><b>${esc(c.name)}</b><span class="pt">${esc(c.sub)}</span><small>${esc(c.protocol)}${c.note ? ' ' + esc(c.note) : ''}</small></div></label>`).join('');
    $('#wz-next1').addEventListener('click', () => {
      const c = this.readConfig().case;
      $('#case-brief').innerHTML = `<b>${esc(c.title)}</b><span class="pt">${esc(c.patient)}</span><div class="chips">${chips(c)}</div>`;
      this.gotoScreen(2);
    });
    $('#wz-back2').addEventListener('click', () => this.gotoScreen(1));
    $('#wz-next2').addEventListener('click', () => { this.gotoScreen(3); this._onPlan?.(this.readConfig()); });
    $('#wz-back3').addEventListener('click', () => this.gotoScreen(2));
  }

  gotoScreen(n) {
    document.querySelectorAll('#wizard .wz').forEach(s => s.classList.toggle('hidden', +s.dataset.screen !== n));
    document.querySelectorAll('.wz-steps span').forEach(s => { s.classList.toggle('active', +s.dataset.s === n); s.classList.toggle('past', +s.dataset.s < n); });
    $('#wizard').classList.toggle('xwide', n === 3);
    $('#wizard').scrollTop = 0;
  }

  readConfig() {
    const id = document.querySelector('input[name=case]:checked').value;
    return {
      case: CASES.find(c => c.id === id),
      cement: document.querySelector('input[name=cement]:checked').value,
      strategy: document.querySelector('input[name=strategy]:checked').value,
      ids: $('#opt-ids').checked,
      guided: $('#opt-guided').checked,
      fast: $('#opt-fast').checked,
    };
  }
  onPlan(cb) { this._onPlan = cb; }
  showMenu() { this.gotoScreen(1); $('#menu').classList.remove('hidden'); }
  hideMenu() { $('#menu').classList.add('hidden'); }

  setConfigLabel(cfg) {
    const s = { total: 'Grabado total', selective: 'Grabado selectivo', self: 'Autograbante' }[cfg.strategy];
    $('#cfg-label').textContent = `${cfg.case.title} · ${CEMENTS[cfg.cement].name} · ${s}${cfg.ids ? ' · IDS' : ''}${cfg.fast ? ' · ⏩ ×4' : ''}`;
  }
  setClock(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); $('#clock').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }

  // ---- Pasos ----
  renderSteps(steps, guided = true) {
    const ol = $('#steps'); ol.innerHTML = '';
    ol.classList.toggle('blind', !guided);
    $('#steps-panel .hint').textContent = guided ? 'Toca un paso para ver el porqué.' : 'Modo sin guía: los pasos aparecen a medida que los completas.';
    for (const s of steps) {
      const li = document.createElement('li');
      li.innerHTML = `<div class="st-head"><span class="st-dot"></span><span class="st-label">${esc(s.label)}</span><span class="st-hidden">Paso por descubrir</span></div><div class="st-why">${esc(s.why)}</div>`;
      li.addEventListener('click', () => li.classList.toggle('open'));
      s.el = li; ol.appendChild(li);
    }
    this.updateSteps(steps);
  }
  updateSteps(steps) {
    let cur = false;
    for (const s of steps) {
      const isCur = !s.done && !cur; if (isCur) cur = true;
      if (s.done && !s.el.classList.contains('done')) s.el.classList.add('done', 'flash');
      s.el.classList.toggle('current', isCur);
    }
  }

  // ---- Bandeja ----
  buildTray(ids, cfg, onPick, onAsk) {
    const tray = $('#tray'); tray.innerHTML = '';
    for (const id of ids) {
      const t = TOOLS[id], b = document.createElement('button');
      b.className = 'tool'; b.dataset.id = id; b.style.setProperty('--tc', t.color);
      const hint = t.type === 'paint' ? 'aplicar' : t.type === 'hold' ? 'mantener' : 'soltar';
      const name = id === 'cemento' ? CEMENTS[cfg.cement].name : t.name;
      b.innerHTML = `<span class="ti">${t.icon}</span><span class="tn">${esc(name)}</span><span class="tt">${hint}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); onPick(id, e); });
      tray.appendChild(b);
    }
    const ask = document.createElement('button');
    ask.className = 'tool ask';
    ask.innerHTML = '<span class="ti">＋</span><span class="tn">Pedir material</span><span class="tt">−2 pts</span>';
    ask.addEventListener('click', onAsk);
    tray.appendChild(ask);
  }
  showAskPicker(ids, cfg, onChoose) {
    const ov = $('#ask');
    $('#ask-list').innerHTML = ids.map(id => `<button class="pl-card" data-id="${id}" style="--tc:${TOOLS[id].color}"><span class="pl-i">${TOOLS[id].icon}</span><span class="pl-t">${esc(id === 'cemento' ? CEMENTS[cfg.cement].name : TOOLS[id].name)}</span></button>`).join('');
    $('#ask-list').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { ov.classList.add('hidden'); onChoose(b.dataset.id); }));
    $('#ask-cancel').onclick = () => ov.classList.add('hidden');
    ov.classList.remove('hidden');
  }
  setHeld(id, cfg) {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('held', b.dataset.id === id));
    const h = $('#held'), g = $('#ghost');
    if (id) {
      const t = TOOLS[id];
      $('#held-name').textContent = `${t.icon} ${id === 'cemento' ? CEMENTS[cfg.cement].name : t.name}`;
      h.classList.remove('hidden'); g.textContent = t.icon; g.classList.remove('hidden');
      $('#help-tip').textContent = t.type === 'paint' ? 'Mantén presionado y recorre la superficie · Clic derecho para girar · Esc para soltar'
        : t.type === 'hold' ? 'Mantén presionado sobre el diente: asienta y sostiene la presión'
          : 'Suelta sobre el diente o la restauración · Clic derecho para girar';
    } else {
      h.classList.add('hidden'); g.classList.add('hidden');
      $('#help-tip').textContent = 'Arrastra un instrumento al diente o a la restauración (sobre la mesa) · Arrastra el fondo para girar';
    }
  }
  moveGhost(x, y) { $('#ghost').style.transform = `translate(${x + 14}px, ${y + 14}px)`; }

  // ---- Lecturas y métricas ----
  setReadouts(items) { $('#readouts').innerHTML = items.map(i => `<div class="ro ${i.cls || ''}"><span>${esc(i.label)}</span><b>${esc(i.value)}</b></div>`).join(''); }

  setMetrics(m, range) {
    const ticks = THRESHOLDS.map(t => `<i class="th" style="left:${pct(t.v)}%"></i>`).join('');
    const bar = (label, v, lo, hi) => {
      const cls = v >= 18 ? 'ok' : v >= 8 ? 'warn' : 'bad';
      const rng = lo != null ? `<i class="rng" style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></i>` : '';
      return `<div class="metric"><div class="m-head"><span>${label}</span><b>${v.toFixed(1)} MPa</b></div><div class="m-bar mpa">${rng}<i class="${cls}" style="width:${pct(v)}%"></i>${ticks}</div></div>`;
    };
    $('#metrics').innerHTML =
      bar('Diente – cemento', m.tooth) +
      bar('Cemento – restauración', m.rest) +
      bar('Adhesión final 24 h', m.final24, range.worst.final24, range.best.final24) +
      bar('Envejecida (termociclado)', m.aged, range.worst.aged, range.best.aged) +
      `<div class="metric"><div class="m-head"><span>Márgenes</span><b>${Math.round(m.margin)}%</b></div><div class="m-bar"><i class="${m.margin >= 70 ? 'ok' : m.margin >= 40 ? 'warn' : 'bad'}" style="width:${m.margin}%"></i></div></div>
       <p class="fine">Franja gris: del peor al mejor escenario con este cemento y material. Líneas: 7 · 18.5 · 25 MPa. Valores ilustrativos.</p>`;
  }
  renderMistakes(map) {
    const ul = $('#mistakes');
    if (!map.size) { ul.innerHTML = '<li class="muted">Sin errores por ahora</li>'; return; }
    ul.innerHTML = [...map.values()].map(m => `<li><b>${esc(m.title)}</b><span>−${m.pen}</span></li>`).join('');
  }

  showLamp(on, label = '') { $('#lampbar').classList.toggle('hidden', !on); if (on) $('#lamp-label').textContent = label; }
  updateLamp(t, target) {
    $('#lamp-time').textContent = `${t.toFixed(1)} s`;
    if (!target || !target.req) { $('#lamp-items').innerHTML = ''; return; }
    const p = Math.min(100, (target.t / target.req) * 100);
    const over = target.max && target.t > target.max;
    $('#lamp-items').innerHTML = `<div class="li"><span>${esc(target.label)} · ${target.t.toFixed(1)} / ${target.req} s${target.max ? ` (máx ${target.max} s)` : ''}</span><div class="m-bar"><i class="${over ? 'bad' : p >= 100 ? 'ok' : 'warn'}" style="width:${p}%"></i></div></div>`;
  }

  toast(type, title, text) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = { ok: '✔', err: '✖', warn: '⚠', info: 'ℹ' }[type] || 'ℹ';
    el.innerHTML = `<div class="t-title">${icon} ${esc(title)}</div>${text ? `<div class="t-text">${esc(text)}</div>` : ''}`;
    el.addEventListener('click', () => el.remove());
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, type === 'err' ? 9000 : 5500);
  }

  setView(view) {
    $('#btn-view').textContent = view === 'micro' ? '🦷 Vista clínica' : '🔬 Microscopio';
    $('#micro-ui').classList.toggle('hidden', view !== 'micro');
    $('#readouts').classList.toggle('hidden', view === 'micro');
    $('#help-tip').classList.toggle('hidden', view === 'micro');
    $('#tray').classList.toggle('dim', view === 'micro');
  }

  // ---- Informe ----
  showReport(R, decisions) {
    const { m, best, worst } = R;
    const stars = '★'.repeat(R.stars) + '☆'.repeat(3 - R.stars);
    const ticks = THRESHOLDS.map(t => `<i class="th" style="left:${pct(t.v)}%" title="${esc(t.label)}"></i>`).join('');
    const row = (label, v, lo, hi) => `
      <div class="sc-row"><span class="sc-l">${label}</span>
        <div class="sc-bar"><i class="rng" style="left:${pct(lo)}%;width:${Math.max(1, pct(hi) - pct(lo))}%"></i>${ticks}
          <i class="mk" style="left:${pct(v)}%"><b>${v.toFixed(1)}</b></i>
          <i class="lo" style="left:${pct(lo)}%">${lo.toFixed(0)}</i><i class="hi" style="left:${pct(hi)}%">${hi.toFixed(0)}</i></div></div>`;
    const weakTxt = (w) => w === 'diente' ? 'diente – cemento' : 'cemento – restauración';
    $('#report-card').innerHTML = `
      <div class="r-top"><div class="stars">${stars}</div><div class="r-score">${R.score}<small>/100</small></div></div>
      <h4>Resistencia adhesiva: tu resultado frente al peor y al mejor escenario</h4>
      <div class="scenario">
        ${row('24 h', m.final24, worst.final24, best.final24)}
        ${row('Envejecida', m.aged, worst.aged, best.aged)}
        <div class="sc-axis"><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50 MPa</span></div>
        <ul class="sc-legend">${THRESHOLDS.map(t => `<li>${esc(t.label)}</li>`).join('')}</ul>
      </div>
      <div class="r-grid">
        <div class="r-metric"><span>Diente – cemento</span><b>${m.tooth.toFixed(1)} MPa</b></div>
        <div class="r-metric"><span>Cemento – restauración</span><b>${m.rest.toFixed(1)} MPa</b></div>
        <div class="r-metric"><span>Falla esperada (24 h)</span><b>${weakTxt(m.weak)}</b></div>
        <div class="r-metric"><span>Falla esperada (envejecida)</span><b>${weakTxt(m.weakAged)}</b></div>
        <div class="r-metric"><span>Márgenes</span><b>${Math.round(m.margin)}%</b></div>
        <div class="r-metric"><span>Penalizaciones</span><b>−${R.pen}</b></div>
      </div>
      <p class="fine">${R.cfg.case.retentive ? 'Corona con altura axial y convergencia adecuadas: la geometría aporta retención mecánica además de la adhesión.' : 'Restauración no retentiva: su permanencia depende de la adhesión.'} Superar las líneas de referencia en laboratorio no garantiza el éxito clínico.</p>
      <h4>Decisiones clínicas</h4>
      <ul class="fb">${decisions.map(d => `<li class="${d.level === 'ideal' ? 'ok' : d.level === 'ok' ? 'mid' : 'bad'}">${d.level === 'ideal' ? '✔' : d.level === 'ok' ? '◐' : '✖'} <b>${esc(d.title)}</b> — ${esc(d.text)}</li>`).join('')}</ul>
      <h4>Análisis del procedimiento</h4>
      <ul class="fb">${R.fb.map(f => `<li class="${f.ok ? 'ok' : 'bad'}">${f.ok ? '✔' : '✖'} ${esc(f.text)}</li>`).join('')}</ul>
      <p class="fine">Modelo didáctico basado en la literatura de docs/literatura-cementacion.md (µTBS/SBS in vitro); no son mediciones.</p>
      <div class="r-actions">
        <button class="btn" id="r-micro">🔬 Ver la interfase</button>
        <button class="btn" id="r-retry">↻ Reintentar</button>
        <button class="btn primary" id="r-menu">Menú</button>
      </div>`;
    $('#report').classList.remove('hidden');
    $('#r-micro').onclick = () => { this.hideReport(); this._onReport?.('micro'); };
    $('#r-retry').onclick = () => { this.hideReport(); this._onReport?.('retry'); };
    $('#r-menu').onclick = () => { this.hideReport(); this._onReport?.('menu'); };
  }
  onReport(cb) { this._onReport = cb; }
  hideReport() { $('#report').classList.add('hidden'); }
}
