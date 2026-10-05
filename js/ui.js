// Interfaz HTML: menú, protocolo, bandeja, lecturas, métricas, avisos e informe final.
import { TOOLS } from './tools.js';
import { LEVELS } from './levels.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor() {
    this._buildMenu();
    this.toasts = $('#toasts');
  }

  // ---- Menú ---------------------------------------------------------------
  _buildMenu() {
    $('#opt-level').innerHTML = LEVELS.map((l, i) => `
      <label class="opt"><input type="radio" name="level" value="${l.id}" ${i === 0 ? 'checked' : ''}>
      <div><b>${esc(l.title)}</b><small>${esc(l.desc)}</small></div></label>`).join('');
    const sync = () => {
      const total = document.querySelector('input[name=protocol]:checked').value === 'total';
      const se2 = document.querySelector('input[name=adhesive][value=se2]');
      se2.disabled = total;
      se2.closest('.opt').classList.toggle('disabled', total);
      if (total && se2.checked) document.querySelector('input[name=adhesive][value=universal]').checked = true;
    };
    document.querySelectorAll('input[name=protocol]').forEach(r => r.addEventListener('change', sync));
    sync();
    $('#btn-start').addEventListener('click', () => {
      const cfg = this.readConfig();
      this.hideMenu();
      this._onStart?.(cfg);
    });
  }

  readConfig() {
    const id = +document.querySelector('input[name=level]:checked').value;
    return {
      level: LEVELS.find(l => l.id === id),
      protocol: document.querySelector('input[name=protocol]:checked').value,
      adhesive: document.querySelector('input[name=adhesive]:checked').value,
      timed: document.getElementById('opt-timed').checked,
    };
  }

  onStart(cb) { this._onStart = cb; }
  showMenu() { $('#menu').classList.remove('hidden'); }
  hideMenu() { $('#menu').classList.add('hidden'); }

  setConfigLabel(cfg) {
    const p = cfg.protocol === 'total' ? 'Grabado total' : 'Grabado selectivo';
    const a = cfg.adhesive === 'universal' ? 'Adhesivo universal' : 'Autograbante 2 frascos';
    $('#cfg-label').textContent = `${cfg.level.title} · ${p} · ${a}${cfg.timed ? ' · ⏱ Contrarreloj' : ''}`;
    $('#clock-label').textContent = cfg.timed ? 'Restante' : 'Tiempo';
    $('#clock').classList.remove('urgent');
  }

  setClock(t, urgent = false) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    $('#clock').classList.toggle('urgent', urgent);
    $('#clock').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ---- Protocolo ----------------------------------------------------------
  renderSteps(steps) {
    const ol = $('#steps');
    ol.innerHTML = '';
    for (const s of steps) {
      const li = document.createElement('li');
      li.innerHTML = `<div class="st-head"><span class="st-dot"></span><span class="st-label">${esc(s.label)}</span></div><div class="st-why">${esc(s.why)}</div>`;
      li.addEventListener('click', () => li.classList.toggle('open'));
      s.el = li;
      ol.appendChild(li);
    }
    this.updateSteps(steps);
  }

  updateSteps(steps) {
    let cur = false;
    for (const s of steps) {
      const isCur = !s.done && !cur;
      if (isCur) cur = true;
      if (s.done && !s.el.classList.contains('done')) s.el.classList.add('done', 'flash');
      s.el.classList.toggle('current', isCur);
    }
  }

  // ---- Bandeja ------------------------------------------------------------
  buildTray(ids, onPick) {
    const tray = $('#tray');
    tray.innerHTML = '';
    for (const id of ids) {
      const t = TOOLS[id];
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.id = id;
      b.style.setProperty('--tc', t.color);
      const hint = t.type === 'drop' ? 'soltar' : t.type === 'extrude' ? 'mantener' : 'aplicar';
      b.innerHTML = `<span class="ti">${t.icon}</span><span class="tn">${esc(t.name)}</span><span class="tt">${hint}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); onPick(id, e); });
      tray.appendChild(b);
    }
  }

  setHeld(id) {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('held', b.dataset.id === id));
    const h = $('#held'), g = $('#ghost');
    if (id) {
      const t = TOOLS[id];
      $('#held-name').textContent = `${t.icon} ${t.name}`;
      h.classList.remove('hidden');
      g.textContent = t.icon;
      g.classList.remove('hidden');
      $('#help-tip').textContent = t.type === 'drop'
        ? 'Suelta sobre el diente · Clic derecho para girar la vista'
        : t.type === 'extrude'
          ? 'Mantén presionado dentro de la cavidad para extruir (1 mm/s) · Suelta para terminar el incremento'
          : 'Mantén presionado y recorre la superficie · Clic derecho para girar · Esc para soltar';
    } else {
      h.classList.add('hidden');
      g.classList.add('hidden');
      $('#help-tip').textContent = 'Arrastra un instrumento desde la bandeja al diente · Arrastra el fondo para girar · Rueda para zoom';
    }
  }

  moveGhost(x, y) {
    const g = $('#ghost');
    g.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  }

  // ---- Lecturas y métricas ------------------------------------------------
  setReadouts(items) {
    $('#readouts').innerHTML = items.map(i =>
      `<div class="ro ${i.cls || ''}"><span>${esc(i.label)}</span><b>${esc(i.value)}</b></div>`).join('');
  }

  setMetrics(ev) {
    const bar = (label, val, max, unit, invert = false) => {
      const pct = Math.max(0, Math.min(100, (val / max) * 100));
      const q = invert ? 100 - pct : pct;
      const cls = q >= 70 ? 'ok' : q >= 40 ? 'warn' : 'bad';
      return `<div class="metric"><div class="m-head"><span>${label}</span><b>${val.toFixed(unit === 'MPa' ? 1 : 0)} ${unit}</b></div><div class="m-bar"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
    };
    $('#metrics').innerHTML =
      bar('Adhesión al esmalte', ev.enamelMPa, 45, 'MPa') +
      bar('Adhesión a la dentina', ev.dentinMPa, 45, 'MPa') +
      bar('Microfiltración', ev.leak, 100, '%', true) +
      bar('Tensión de contracción', ev.stress, 100, '%', true) +
      bar('Índice biomimético', ev.bio, 100, '%') +
      `<div class="score-line">Puntuación proyectada <b>${ev.score}</b></div>
       <p class="fine">Valores ilustrativos con fines didácticos.</p>`;
  }

  renderMistakes(map) {
    const ul = $('#mistakes');
    if (!map.size) { ul.innerHTML = '<li class="muted">Sin errores por ahora</li>'; return; }
    ul.innerHTML = [...map.values()].map(m => `<li><b>${esc(m.title)}</b><span>−${m.pen}</span></li>`).join('');
  }

  // ---- Lámpara ------------------------------------------------------------
  showLamp(on) { $('#lampbar').classList.toggle('hidden', !on); }
  updateLamp(time, items) {
    $('#lamp-time').textContent = `${time.toFixed(1)} s`;
    $('#lamp-items').innerHTML = items.map(i => {
      const pct = Math.min(100, (i.t / i.req) * 100);
      return `<div class="li"><span>${esc(i.label)} · ${i.req} s</span><div class="m-bar"><i class="${pct >= 100 ? 'ok' : 'warn'}" style="width:${pct}%"></i></div></div>`;
    }).join('');
  }

  // ---- Avisos -------------------------------------------------------------
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

  // ---- Vista microscópica -------------------------------------------------
  setView(view) {
    $('#btn-view').textContent = view === 'micro' ? '🦷 Vista clínica' : '🔬 Microscopio';
    $('#micro-ui').classList.toggle('hidden', view !== 'micro');
    $('#readouts').classList.toggle('hidden', view === 'micro');
    $('#help-tip').classList.toggle('hidden', view === 'micro');
    $('#tray').classList.toggle('dim', view === 'micro');
  }

  // ---- Informe final ------------------------------------------------------
  showReport(ev) {
    const stars = '★'.repeat(ev.stars) + '☆'.repeat(3 - ev.stars);
    const line = (l, v) => `<div class="r-metric"><span>${l}</span><b>${v}</b></div>`;
    $('#report-card').innerHTML = `
      <div class="r-top"><div class="stars">${stars}</div><div class="r-score">${ev.score}<small>/100</small></div></div>
      <div class="r-grid">
        ${line('Adhesión al esmalte', ev.enamelMPa.toFixed(1) + ' MPa')}
        ${line('Adhesión a la dentina', ev.dentinMPa.toFixed(1) + ' MPa')}
        ${line('Microfiltración', Math.round(ev.leak) + '%')}
        ${line('Tensión de contracción', Math.round(ev.stress) + '%')}
        ${line('Índice biomimético', Math.round(ev.bio) + '%')}
        ${line('Penalizaciones', '−' + ev.pen)}
        ${ev.timed ? line('Bonificación por tiempo', '+' + ev.timeBonus) : ''}
        ${ev.timed ? line('Récord (esta configuración)', ev.best + (ev.newBest ? ' 🏆 ¡nuevo!' : '')) : ''}
      </div>
      <h4>Análisis del procedimiento</h4>
      <ul class="fb">${ev.feedback.map(f => `<li class="${f.ok ? 'ok' : 'bad'}">${f.ok ? '✔' : '✖'} ${esc(f.text)}</li>`).join('')}</ul>
      <p class="fine">Los valores de MPa y los porcentajes provienen de un modelo didáctico simplificado; no son mediciones de laboratorio.</p>
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
