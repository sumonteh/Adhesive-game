// Punto de entrada: escena, cámara, arrastrar y soltar, bucle de render.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CemGame } from './game.js';
import { TOOLS, catalog, decisions } from './data.js';
import { makeToolModel, Spray } from './tools3d.js';
import { Planner } from './planner.js';
import { MicroView } from './micro.js';
import { UI } from './ui.js';

const canvas = document.getElementById('c');
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#14212c');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#3a4250', 0.5));
const key = new THREE.DirectionalLight('#fff6ea', 1.3); key.position.set(3, 6, 4); scene.add(key);
const rim = new THREE.DirectionalLight('#9fc3ff', 0.6); rim.position.set(-4, 3, -3); scene.add(rim);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.minDistance = 1.2; controls.maxDistance = 12; controls.maxPolarAngle = 1.5;

const ui = new UI();
const micro = new MicroView(renderer, viewport);
const spray = new Spray(scene);
const raycaster = new THREE.Raycaster();

let game = null, setup = null, view = 'clinic', microTab = 'dentina', trayIds = [];
let heldId = null, applying = false, toolModel = null, hit = null;
const pointer = { x: 0, y: 0, ndc: new THREE.Vector2(), inCanvas: false, moved: 0 };

function resetCamera() {
  if (game?.o.kind === 'incisor') { camera.position.set(1.05, 1.9, 5.3); controls.target.set(1.0, 0.45, 0.2); }
  else { camera.position.set(2.3, 7.4, 7.6); controls.target.set(2.3, 0.3, 0.4); }
  controls.update();
}
resetCamera();

function setControlsForHeld() {
  controls.mouseButtons = heldId ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = heldId ? { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
}
function pickTool(id, e) {
  if (!game || game.finished || view !== 'clinic') return;
  if (heldId === id && !applying) { releaseTool(); return; }
  endApplying();
  heldId = id; applying = true;
  if (toolModel) scene.remove(toolModel);
  toolModel = makeToolModel(id); toolModel.visible = false; scene.add(toolModel);
  updatePointer(e);
  ui.setHeld(id, setup.cfg); setControlsForHeld();
}
function releaseTool() { endApplying(); heldId = null; if (toolModel) { scene.remove(toolModel); toolModel = null; } ui.setHeld(null); setControlsForHeld(); }
function endApplying() { applying = false; }
function updatePointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer.moved += Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.inCanvas = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ui.moveGhost(e.clientX, e.clientY);
}
window.addEventListener('pointermove', updatePointer);
window.addEventListener('pointerup', () => {
  if (!heldId || !applying) return;
  const t = TOOLS[heldId].type;
  if ((t === 'drop' || t === 'distractor') && hit && game) { game.drop(heldId, hit); releaseTool(); return; }
  endApplying();
});
canvas.addEventListener('pointerdown', (e) => { if (view !== 'clinic' || !heldId || e.button !== 0) return; updatePointer(e); applying = true; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') releaseTool(); });
document.getElementById('btn-release').addEventListener('click', releaseTool);
document.getElementById('btn-lamp-off').addEventListener('click', () => game?.stopLamp());

function currentSummary() { const m = game.evaluate(); return { m, S: m.summary }; }
function setView(v) {
  view = v; releaseTool(); ui.setView(v);
  controls.enabled = v === 'clinic'; micro.setActive(v === 'micro');
  if (v === 'micro' && game) { const { m, S } = currentSummary(); micro.build(setup.cfg, m, S, microTab); }
}
document.getElementById('btn-view').addEventListener('click', () => setView(view === 'clinic' ? 'micro' : 'clinic'));
document.querySelectorAll('#micro-ui .tabs button').forEach(b => b.addEventListener('click', () => {
  microTab = b.dataset.tab;
  document.querySelectorAll('#micro-ui .tabs button').forEach(x => x.classList.toggle('active', x === b));
  if (game) { const { m, S } = currentSummary(); micro.build(setup.cfg, m, S, microTab); }
}));

function buildTray() {
  ui.buildTray(trayIds, setup.cfg, pickTool, () => {
    if (!game || game.finished) return;
    releaseTool();
    ui.showAskPicker(catalog().filter(id => !trayIds.includes(id)), setup.cfg, (id) => { trayIds.push(id); game.requestMaterial(id); buildTray(); });
  });
}

function startGame(cfg, tray, plan) {
  setup = { cfg, tray: [...tray], plan };
  releaseTool();
  if (game) game.dispose();
  setView('clinic');
  game = new CemGame(scene, ui, cfg, plan, tray);
  trayIds = [...tray];
  ui.setConfigLabel(cfg);
  buildTray();
  ui.setMetrics(game.evaluate(), game.range);
  resetCamera();
  window.cem = { game, scene, camera, controls, planner };
}

const planner = new Planner(document.getElementById('planner'));
ui.onPlan((cfg) => planner.open(cfg, (tray, plan) => { ui.hideMenu(); startGame(cfg, tray, plan); }));
document.getElementById('pl-verify').addEventListener('click', () => planner.verify(decisions(ui.readConfig())));
document.getElementById('pl-fix').addEventListener('click', () => planner.useRecommended());
document.getElementById('pl-start').addEventListener('click', () => planner.start());
ui.onReport((a) => { if (a === 'micro') setView('micro'); else if (a === 'retry') startGame(setup.cfg, setup.tray, setup.plan); else ui.showMenu(); });
document.getElementById('btn-menu').addEventListener('click', () => { releaseTool(); ui.showMenu(); });
const finishBtn = document.getElementById('btn-finish');
let armed = null;
finishBtn.addEventListener('click', () => {
  if (!game || game.finished) return;
  if (!armed) { finishBtn.textContent = '¿Confirmar?'; finishBtn.classList.add('armed'); armed = setTimeout(() => { armed = null; finishBtn.textContent = 'Terminar'; finishBtn.classList.remove('armed'); }, 3000); return; }
  clearTimeout(armed); armed = null; finishBtn.textContent = 'Terminar'; finishBtn.classList.remove('armed');
  releaseTool(); game.finish();
});

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); micro.setSize(w, h);
}
new ResizeObserver(resize).observe(viewport);
resize();

const UP = new THREE.Vector3(0, 1, 0), tmpDir = new THREE.Vector3(), clock = new THREE.Clock();
function frame() {
  const real = Math.min(clock.getDelta(), 0.1);
  const dt = real * (setup?.cfg.fast ? 4 : 1);
  hit = null;
  if (game && heldId && view === 'clinic' && pointer.inCanvas) {
    raycaster.setFromCamera(pointer.ndc, camera);
    const targets = [game.o.toothMesh, game.o.outer];
    if (game.o.intaglio.visible) targets.push(game.o.intaglio);
    hit = raycaster.intersectObjects(targets, false)[0] || null;
  }
  if (toolModel) {
    toolModel.visible = !!hit;
    if (hit) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      tmpDir.copy(camera.position).sub(hit.point).normalize().multiplyScalar(0.45).addScaledVector(n, 0.55).normalize();
      toolModel.position.copy(hit.point).addScaledVector(n, 0.015);
      toolModel.quaternion.setFromUnitVectors(UP, tmpDir);
    }
  }
  if (game && applying && heldId && hit && view === 'clinic') {
    const t = TOOLS[heldId].type, moving = pointer.moved > 0.5;
    if (t === 'paint') {
      game.applyPaint(heldId, hit, dt, moving);
      if (['agua', 'aire', 'arenado'].includes(heldId)) spray.emit(toolModel.position.clone().addScaledVector(tmpDir, 0.45), hit.point, heldId === 'agua' ? '#9fd8ff' : heldId === 'arenado' ? '#e8dcc6' : '#ffffff', 3);
    } else if (t === 'hold') game.applyHold(heldId, hit, dt);
  }
  pointer.moved = 0;
  spray.update(real);
  if (game) game.update(dt);
  if (view === 'micro') micro.render(); else { controls.update(); renderer.render(scene, camera); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
