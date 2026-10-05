// Punto de entrada: escena, cámara, arrastrar y soltar, bucle de render.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Game } from './game.js';
import { TOOLS, trayFor, makeToolModel, Spray } from './tools.js';
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
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#3a4250', 0.5));
const key = new THREE.DirectionalLight('#fff6ea', 1.3);
key.position.set(3, 6, 4);
scene.add(key);
const rim = new THREE.DirectionalLight('#9fc3ff', 0.6);
rim.position.set(-4, 3, -3);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 1.6;
controls.maxDistance = 9;
controls.maxPolarAngle = 1.45;

function resetCamera() {
  camera.position.set(1.7, 5.0, 3.0);
  controls.target.set(0, 0.85, 0);
  controls.update();
}
resetCamera();

const ui = new UI();
const micro = new MicroView(renderer, viewport);
const spray = new Spray(scene);
const raycaster = new THREE.Raycaster();

let game = null;
let lastCfg = null;
let view = 'clinic';
let microTab = 'dentina';

// ---- Estado de la herramienta en mano ---------------------------------------
let heldId = null;
let applying = false;
let toolModel = null;
let hit = null;
const pointer = { x: 0, y: 0, ndc: new THREE.Vector2(), inCanvas: false, moved: 0 };

function setControlsForHeld() {
  if (heldId) {
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
  } else {
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }
}

function pickTool(id, e) {
  if (!game || game.finished || view !== 'clinic') return;
  if (heldId === id && !applying) { releaseTool(); return; }
  endApplying();
  heldId = id;
  applying = true; // se presionó sobre la bandeja: arrastrar al diente
  if (toolModel) scene.remove(toolModel);
  toolModel = makeToolModel(id);
  toolModel.visible = false;
  scene.add(toolModel);
  updatePointer(e);
  ui.setHeld(id);
  setControlsForHeld();
}

function releaseTool() {
  endApplying();
  heldId = null;
  if (toolModel) { scene.remove(toolModel); toolModel = null; }
  ui.setHeld(null);
  setControlsForHeld();
}

function endApplying() {
  if (game?.extruding) game.endExtrude();
  applying = false;
}

function updatePointer(e) {
  const r = canvas.getBoundingClientRect();
  const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
  pointer.moved += Math.hypot(dx, dy);
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.inCanvas = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  pointer.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ui.moveGhost(e.clientX, e.clientY);
}

window.addEventListener('pointermove', updatePointer);
window.addEventListener('pointerup', () => {
  if (!heldId || !applying) return;
  const tool = TOOLS[heldId];
  if (tool.type === 'drop') {
    if (hit && game) { game.drop(heldId, hit); releaseTool(); return; }
  }
  endApplying();
});
canvas.addEventListener('pointerdown', (e) => {
  if (view !== 'clinic' || !heldId || e.button !== 0) return;
  updatePointer(e);
  applying = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') releaseTool(); });
document.getElementById('btn-release').addEventListener('click', releaseTool);
document.getElementById('btn-lamp-off').addEventListener('click', () => game?.stopLamp());

// ---- Vistas -----------------------------------------------------------------
function setView(v) {
  view = v;
  releaseTool();
  ui.setView(v);
  controls.enabled = v === 'clinic';
  micro.setActive(v === 'micro');
  if (v === 'micro' && game) micro.build(game.evaluate().micro, microTab);
}
document.getElementById('btn-view').addEventListener('click', () => setView(view === 'clinic' ? 'micro' : 'clinic'));
document.querySelectorAll('#micro-ui .tabs button').forEach(b => b.addEventListener('click', () => {
  microTab = b.dataset.tab;
  document.querySelectorAll('#micro-ui .tabs button').forEach(x => x.classList.toggle('active', x === b));
  if (game) micro.build(game.evaluate().micro, microTab);
}));

// ---- Partidas ---------------------------------------------------------------
function startGame(cfg) {
  lastCfg = cfg;
  releaseTool();
  if (game) game.dispose();
  setView('clinic');
  game = new Game(scene, ui, cfg);
  ui.setConfigLabel(cfg);
  ui.buildTray(trayFor(cfg), pickTool);
  ui.setMetrics(game.evaluate());
  resetCamera();
  window.bb = { game, scene, camera, controls };
}
ui.onStart(startGame);
ui.onReport((action) => {
  if (action === 'micro') setView('micro');
  else if (action === 'retry') startGame(lastCfg);
  else ui.showMenu();
});
document.getElementById('btn-menu').addEventListener('click', () => { releaseTool(); ui.showMenu(); });
// Confirmación en dos clics (sin confirm(), que algunos visores bloquean).
const finishBtn = document.getElementById('btn-finish');
let finishArmed = null;
finishBtn.addEventListener('click', () => {
  if (!game || game.finished) return;
  if (!finishArmed) {
    finishBtn.textContent = '¿Confirmar?';
    finishBtn.classList.add('armed');
    finishArmed = setTimeout(() => { finishArmed = null; finishBtn.textContent = 'Terminar'; finishBtn.classList.remove('armed'); }, 3000);
    return;
  }
  clearTimeout(finishArmed); finishArmed = null;
  finishBtn.textContent = 'Terminar'; finishBtn.classList.remove('armed');
  releaseTool();
  game.finish();
});

// ---- Tamaño -----------------------------------------------------------------
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  micro.setSize(w, h);
}
new ResizeObserver(resize).observe(viewport);
resize();

// ---- Bucle ------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  hit = null;
  if (game && heldId && view === 'clinic' && pointer.inCanvas) {
    raycaster.setFromCamera(pointer.ndc, camera);
    hit = raycaster.intersectObject(game.tooth.mesh, false)[0] || null;
  }
  if (toolModel) {
    toolModel.visible = !!hit;
    if (hit) {
      const n = hit.face.normal;
      tmpDir.copy(camera.position).sub(hit.point).normalize().multiplyScalar(0.45).addScaledVector(n, 0.55).normalize();
      toolModel.position.copy(hit.point).addScaledVector(n, 0.015);
      toolModel.quaternion.setFromUnitVectors(UP, tmpDir);
    }
  }
  if (game && applying && heldId && hit && view === 'clinic') {
    const tool = TOOLS[heldId];
    const moving = pointer.moved > 0.5;
    if (tool.type === 'paint') {
      game.applyPaint(heldId, hit, dt, moving);
      if (heldId === 'agua' || heldId === 'aire') {
        const from = toolModel.position.clone().addScaledVector(tmpDir, 0.45);
        spray.emit(from, hit.point, heldId === 'agua' ? '#9fd8ff' : '#ffffff', 3);
      }
    } else if (tool.type === 'extrude' && !game.extruding) {
      game.startExtrude(heldId, hit);
    }
  }
  pointer.moved = 0;
  spray.update(dt);
  if (game) game.update(dt);

  if (view === 'micro') {
    micro.render();
  } else {
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
