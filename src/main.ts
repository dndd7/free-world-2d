import { Composite, Engine, Events, Render, Runner } from 'matter-js';
import { startDemo, type DemoHost } from './demo';
import { EXAMPLES, exampleExtent, placeExample, type Example } from './examples';
import { SceneHistory } from './history';
import {
  MATERIAL_OPTIONS,
  OBJECT_LABELS,
  applyInitialSpin,
  applyMaterial,
  captureSnapshot,
  createBall,
  createBox,
  createGoal,
  createPlank,
  createTrack,
  createTriangle,
  deserializeScene,
  findObjectAtPoint,
  installSurfaceRules,
  resetGoals,
  restoreSnapshot,
  rotateObject,
  serializeScene,
  setLocked,
  translateObject,
  unionBounds,
  watchGoals,
  type Material,
  type Point,
  type SceneObject,
} from './scene';
import { hasSeenDemo, loadSavedScene, markDemoSeen, saveScene } from './storage';
import { drawThumbnail } from './thumbnail';
import './style.css';

type Tool = 'select' | 'draw' | 'plank' | 'ball' | 'box' | 'triangle' | 'goal';

const PLACERS: Partial<Record<Tool, (x: number, y: number) => SceneObject>> = {
  ball: createBall,
  box: createBox,
  triangle: createTriangle,
  goal: createGoal,
};

const ROTATE_STEP = (15 * Math.PI) / 180;

const HANDLE_RADIUS_PAD = 14;
const HANDLE_HIT_RADIUS = 14;
const HANDLE_HIT_RADIUS_TOUCH = 26;
const MAX_SPIN = 18; // radians per second

const canvas = document.getElementById('sim') as HTMLCanvasElement;
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.palette-btn[data-tool]'));
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const importFile = document.getElementById('import-file') as HTMLInputElement;
const toastEl = document.getElementById('toast') as HTMLDivElement;
const demoBtn = document.getElementById('demo-btn') as HTMLButtonElement;
const examplesBtn = document.getElementById('examples-btn') as HTMLButtonElement;
const examplesPanel = document.getElementById('examples-panel') as HTMLDivElement;
const examplesGrid = document.getElementById('examples-grid') as HTMLDivElement;
const demoPrompt = document.getElementById('demo-prompt') as HTMLDivElement;

installSurfaceRules();

const engine = Engine.create();
const world = engine.world;
const runner = Runner.create();

const render = Render.create({
  canvas,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
    wireframes: false,
    // Transparent so the grid layer (and the page's dark background) show through.
    background: 'transparent',
  },
});

let tool: Tool = 'select';
let isPlaying = false;
let demoActive = false; // while true, edits are not autosaved or added to undo history
const objects: SceneObject[] = [];
let selected: SceneObject | null = null;

watchGoals(engine, () => objects);

let activePointer: number | null = null;
let lastPointerType = 'mouse';

let dragging: { obj: SceneObject; lastX: number; lastY: number } | null = null;
let spinDragging: SceneObject | null = null;
let spinLastAngle = 0;
let spinLastTime = 0;

let isDrawingStroke = false;
let drawPoints: Point[] = [];
let plankStart: Point | null = null;
let plankEnd: Point | null = null;

function gestureActive(): boolean {
  return Boolean(dragging || spinDragging || isDrawingStroke || plankStart);
}

// ---- Toast ----------------------------------------------------------------

let toastTimer = 0;

function toast(message: string, ms = 2800): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), ms);
}

// ---- History + autosave ---------------------------------------------------

let history = new SceneHistory('');
let warnedAboutSaving = false;

function sceneJson(): string {
  return JSON.stringify(serializeScene(objects));
}

function persist(json: string): void {
  if (saveScene(json) || warnedAboutSaving) return;
  warnedAboutSaving = true;
  toast("Couldn't autosave in this browser. Use Export to keep your work.", 6000);
}

function refreshActions(): void {
  undoBtn.disabled = isPlaying || !history.canUndo;
  redoBtn.disabled = isPlaying || !history.canRedo;
}

/** Call after every finished edit: records an undo step and autosaves. */
function commit(): void {
  if (demoActive) return;
  dismissDemoPrompt(true);
  const json = sceneJson();
  if (!history.push(json)) return;
  persist(json);
  refreshActions();
}

function removeAllObjects(): void {
  objects.forEach((obj) => Composite.remove(world, obj.bodies));
  objects.length = 0;
  selected = null;
}

function loadState(json: string): void {
  const selectedIndex = selected ? objects.indexOf(selected) : -1;
  removeAllObjects();
  deserializeScene(JSON.parse(json)).forEach(addObject);
  selected = objects[selectedIndex] ?? null;
  persist(json);
  refreshActions();
}

function undo(): void {
  if (isPlaying || demoActive || gestureActive()) return;
  const state = history.undo();
  if (state !== null) loadState(state);
}

function redo(): void {
  if (isPlaying || demoActive || gestureActive()) return;
  const state = history.redo();
  if (state !== null) loadState(state);
}

// ---- Helpers --------------------------------------------------------------

function getCanvasPoint(e: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function setActiveToolButton(t: Tool): void {
  toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
}

function setToolbarDisabled(disabled: boolean): void {
  toolButtons.forEach((b) => (b.disabled = disabled));
  clearBtn.disabled = disabled;
  exportBtn.disabled = disabled;
  importBtn.disabled = disabled;
  demoBtn.disabled = disabled;
  examplesBtn.disabled = disabled;
  refreshActions();
}

function setPlayingUi(playing: boolean): void {
  playBtn.classList.toggle('playing', playing);
  playBtn.title = playing ? 'Stop and restore the layout' : 'Start the simulation';
  document.getElementById('play-label')!.textContent = playing ? 'Stop' : 'Play';
}

function selectTool(t: Tool): void {
  tool = t;
  setActiveToolButton(t);
}

function addObject(obj: SceneObject): void {
  objects.push(obj);
  Composite.add(world, obj.bodies);
}

function getHandlePosition(obj: SceneObject): Point {
  const body = obj.bodies[0];
  const r = (body.circleRadius ?? 30) + HANDLE_RADIUS_PAD;
  return {
    x: body.position.x + Math.cos(obj.handleAngle) * r,
    y: body.position.y + Math.sin(obj.handleAngle) * r,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function updateSpin(obj: SceneObject, p: Point): void {
  const body = obj.bodies[0];
  const angle = Math.atan2(p.y - body.position.y, p.x - body.position.x);
  const now = performance.now();
  if (spinLastTime > 0) {
    const rawDelta = angle - spinLastAngle;
    const delta = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta));
    const dt = Math.max((now - spinLastTime) / 1000, 1 / 120);
    const instantaneous = delta / dt;
    obj.spin = clamp(obj.spin * 0.5 + instantaneous * 0.5, -MAX_SPIN, MAX_SPIN);
  }
  obj.handleAngle = angle;
  spinLastAngle = angle;
  spinLastTime = now;
}

function toggleLock(obj: SceneObject): void {
  setLocked(obj, !obj.locked);
  commit();
}

// ---- Pointer input (mouse, touch and pen) ---------------------------------

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isPlaying) return;
    selectTool(btn.dataset.tool as Tool);
  });
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // A touch long-press also raises this event; locking is the Lock button there.
  if (isPlaying || lastPointerType === 'touch') return;
  const hit = findObjectAtPoint(objects, getCanvasPoint(e));
  if (hit) toggleLock(hit);
});

canvas.addEventListener('pointerdown', (e) => {
  setHelpOpen(false);
  setExamplesOpen(false);
  if (isPlaying || e.button !== 0 || activePointer !== null) return;
  activePointer = e.pointerId;
  lastPointerType = e.pointerType;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // capture is a nicety; dragging still works without it
  }
  const p = getCanvasPoint(e);

  if (tool === 'draw') {
    isDrawingStroke = true;
    drawPoints = [p];
    return;
  }

  if (tool === 'plank') {
    plankStart = p;
    plankEnd = p;
    return;
  }

  const place = PLACERS[tool];
  if (place) {
    const obj = place(p.x, p.y);
    addObject(obj);
    selected = obj;
    selectTool('select');
    commit();
    return;
  }

  if (selected && selected.type === 'ball') {
    const handle = getHandlePosition(selected);
    const reach = e.pointerType === 'touch' ? HANDLE_HIT_RADIUS_TOUCH : HANDLE_HIT_RADIUS;
    if (Math.hypot(p.x - handle.x, p.y - handle.y) <= reach) {
      spinDragging = selected;
      spinLastTime = 0;
      return;
    }
  }

  const hit = findObjectAtPoint(objects, p);
  selected = hit;
  if (hit) dragging = { obj: hit, lastX: p.x, lastY: p.y };
});

window.addEventListener('pointermove', (e) => {
  if (isPlaying || e.pointerId !== activePointer) return;
  const p = getCanvasPoint(e);

  if (isDrawingStroke) {
    drawPoints.push(p);
    return;
  }

  if (plankStart) {
    plankEnd = p;
    return;
  }

  if (spinDragging) {
    updateSpin(spinDragging, p);
    return;
  }

  if (dragging) {
    translateObject(dragging.obj, p.x - dragging.lastX, p.y - dragging.lastY);
    dragging.lastX = p.x;
    dragging.lastY = p.y;
  }
});

function endGesture(e: PointerEvent): void {
  if (e.pointerId !== activePointer) return;
  activePointer = null;

  let changed = false;
  if (isDrawingStroke) {
    isDrawingStroke = false;
    const obj = createTrack(drawPoints);
    drawPoints = [];
    if (obj) {
      addObject(obj);
      selected = obj;
      changed = true;
    }
    selectTool('select');
  }
  if (plankStart && plankEnd) {
    const obj = createPlank(plankStart, plankEnd);
    plankStart = null;
    plankEnd = null;
    if (obj) {
      addObject(obj);
      selected = obj;
      changed = true;
    }
    selectTool('select');
  }
  if (dragging || spinDragging) changed = true;
  dragging = null;
  spinDragging = null;
  if (changed) commit();
}

window.addEventListener('pointerup', endGesture);
window.addEventListener('pointercancel', endGesture);

// ---- Play / Stop ----------------------------------------------------------

playBtn.addEventListener('click', () => {
  if (!isPlaying) {
    objects.forEach(captureSnapshot);
    objects.forEach(applyInitialSpin);
    resetGoals(objects);
    Runner.run(runner, engine);
    isPlaying = true;
    setPlayingUi(true);
    setToolbarDisabled(true);
  } else {
    Runner.stop(runner);
    objects.forEach(restoreSnapshot);
    resetGoals(objects);
    isPlaying = false;
    setPlayingUi(false);
    setToolbarDisabled(false);
  }
});

// ---- Help + grid ----------------------------------------------------------

const helpBtn = document.getElementById('help-btn') as HTMLButtonElement;
const helpPanel = document.getElementById('help-panel') as HTMLDivElement;

let helpOpen = false;

function setHelpOpen(open: boolean): void {
  helpOpen = open;
  if (open) {
    setExamplesOpen(false);
    const actionsBottom = document.getElementById('actions')!.getBoundingClientRect().bottom;
    helpPanel.style.top = `${actionsBottom + 8}px`;
  }
  helpPanel.hidden = !open;
  helpBtn.setAttribute('aria-expanded', String(open));
  helpBtn.classList.toggle('active', open);
}

const gridBtn = document.getElementById('grid-btn') as HTMLButtonElement;
const GRID_PREF_KEY = 'free-world-2d:grid';

function loadGridPref(): boolean {
  try {
    return localStorage.getItem(GRID_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

const gridLayer = document.getElementById('grid') as HTMLDivElement;
let gridOn = true;

function setGridOn(on: boolean): void {
  gridOn = on;
  gridLayer.hidden = !on;
  gridBtn.classList.toggle('active', on);
  gridBtn.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem(GRID_PREF_KEY, on ? 'on' : 'off');
  } catch {
    // preference just won't persist
  }
}

setGridOn(loadGridPref());
gridBtn.addEventListener('click', () => setGridOn(!gridOn));

helpBtn.addEventListener('click', () => setHelpOpen(!helpOpen));

// ---- Examples gallery -----------------------------------------------------

let examplesOpen = false;
let examplesBuilt = false;

function setExamplesOpen(open: boolean): void {
  examplesOpen = open;
  if (open) {
    setHelpOpen(false);
    if (!examplesBuilt) buildExampleCards();
    examplesPanel.style.top = `${document.getElementById('actions')!.getBoundingClientRect().bottom + 8}px`;
  }
  examplesPanel.hidden = !open;
  examplesBtn.setAttribute('aria-expanded', String(open));
  examplesBtn.classList.toggle('active', open);
}

function buildExampleCards(): void {
  examplesBuilt = true;
  for (const example of EXAMPLES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'example-card';

    const thumb = document.createElement('canvas');
    drawThumbnail(thumb, example.build());
    const title = document.createElement('strong');
    title.textContent = example.title;
    const blurb = document.createElement('span');
    blurb.textContent = example.blurb;

    card.append(thumb, title, blurb);
    card.addEventListener('click', () => loadExample(example));
    examplesGrid.append(card);
  }
}

function loadExample(example: Example): void {
  if (isPlaying || demoActive) return;
  if (
    objects.length > 0 &&
    !window.confirm(`Replace what's on the canvas with “${example.title}”? Undo will bring your scene back.`)
  ) {
    return;
  }

  const palette = document.getElementById('palette')!.getBoundingClientRect();
  const actions = document.getElementById('actions')!.getBoundingClientRect();
  const x = palette.right + 16;
  const y = actions.bottom + 16;
  const area = { x, y, w: window.innerWidth - x - 12, h: Math.max(0, window.innerHeight - y - 80) };
  const extent = exampleExtent(example);

  removeAllObjects();
  placeExample(example, area).forEach(addObject);
  selectTool('select');
  setExamplesOpen(false);
  commit(); // one undoable step

  const offScreen = extent.w > area.w + 20 || extent.h > area.h + 20;
  toast(
    `${example.title} is ready: press Play! ${example.tip}` +
      (offScreen ? ' Part of this design is off-screen, so it works best in a bigger window.' : ''),
    8000,
  );
}

examplesBtn.addEventListener('click', () => setExamplesOpen(!examplesOpen));

// ---- Selected-object bar --------------------------------------------------

const propsPanel = document.getElementById('props') as HTMLDivElement;
const propsTitle = document.getElementById('props-title') as HTMLSpanElement;
const propsMaterialWrap = document.getElementById('props-material-wrap') as HTMLLabelElement;
const propsMaterial = document.getElementById('props-material') as HTMLSelectElement;
const propsLock = document.getElementById('props-lock') as HTMLButtonElement;
const propsRotateLeft = document.getElementById('props-rotate-left') as HTMLButtonElement;
const propsRotateRight = document.getElementById('props-rotate-right') as HTMLButtonElement;
const propsDelete = document.getElementById('props-delete') as HTMLButtonElement;

for (const opt of MATERIAL_OPTIONS) {
  propsMaterial.add(new Option(opt.label, opt.value));
}

let propsKey = '';

function syncPropsPanel(): void {
  const key = selected && !isPlaying ? `${selected.id}|${selected.material}|${selected.locked}` : '';
  if (key === propsKey) return;
  propsKey = key;

  propsPanel.hidden = key === '';
  if (!selected || key === '') return;

  propsTitle.textContent = OBJECT_LABELS[selected.type];
  propsMaterialWrap.hidden = selected.type === 'goal';
  propsMaterial.value = selected.material;
  propsLock.hidden = selected.type === 'goal';
  propsLock.textContent = selected.locked ? 'Unlock' : 'Lock';
  propsLock.title = selected.locked ? 'Let this object move during Play' : 'Fix this object in place during Play';
  propsRotateLeft.hidden = propsRotateRight.hidden = selected.type === 'ball';
}

propsMaterial.addEventListener('change', () => {
  if (!selected || isPlaying) return;
  applyMaterial(selected, propsMaterial.value as Material);
  commit();
});
propsLock.addEventListener('click', () => {
  if (selected && !isPlaying) toggleLock(selected);
});
propsRotateLeft.addEventListener('click', () => {
  if (!selected || isPlaying) return;
  rotateObject(selected, -ROTATE_STEP);
  commit();
});
propsRotateRight.addEventListener('click', () => {
  if (!selected || isPlaying) return;
  rotateObject(selected, ROTATE_STEP);
  commit();
});

function deleteSelected(): void {
  if (!selected || isPlaying || demoActive) return;
  Composite.remove(world, selected.bodies);
  objects.splice(objects.indexOf(selected), 1);
  selected = null;
  commit();
}

propsDelete.addEventListener('click', deleteSelected);

// ---- Keyboard -------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setHelpOpen(false);
    setExamplesOpen(false);
    return;
  }

  if (demoActive) return; // the demo drives the app; Esc (handled above and by the demo) skips it

  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (key === 'y') {
      e.preventDefault();
      redo();
    }
    return;
  }

  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  deleteSelected();
});

// ---- Actions panel --------------------------------------------------------

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

clearBtn.addEventListener('click', () => {
  if (isPlaying) return;
  removeAllObjects();
  commit();
});

exportBtn.addEventListener('click', () => {
  if (isPlaying) return;
  if (objects.length === 0) {
    alert('Nothing to export yet — draw or place something first.');
    return;
  }
  const json = JSON.stringify(serializeScene(objects), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'free-world-2d-scene.json';
  link.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
  if (isPlaying) return;
  importFile.click();
});

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  importFile.value = '';
  if (!file || isPlaying) return;
  try {
    const imported = deserializeScene(JSON.parse(await file.text()));
    removeAllObjects();
    imported.forEach(addObject);
    commit();
  } catch (err) {
    alert(`Couldn't import that file: ${err instanceof Error ? err.message : 'invalid file'}`);
  }
});

// ---- Drawing overlays -----------------------------------------------------

function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(16, 18, 24, 0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#f2f2f5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -2.5, 3.5, Math.PI, 0);
  ctx.stroke();

  ctx.fillStyle = '#f2f2f5';
  ctx.fillRect(-5, -2, 10, 7.5);
  ctx.restore();
}

function drawGoalLabel(ctx: CanvasRenderingContext2D, goal: SceneObject): void {
  const { x, y } = goal.bodies[0].position;
  ctx.save();
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = goal.reached ? '#eafff0' : '#7fdc97';
  ctx.fillText(goal.reached ? 'GOAL REACHED!' : 'GOAL', x, y);
  ctx.restore();
}

Events.on(render, 'afterRender', () => {
  syncPropsPanel();
  const ctx = render.context;
  ctx.save();

  if (isDrawingStroke && drawPoints.length > 1) {
    ctx.strokeStyle = '#c9a86a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
    for (const pt of drawPoints.slice(1)) ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  }

  if (plankStart && plankEnd) {
    ctx.strokeStyle = '#d9b97f';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(plankStart.x, plankStart.y);
    ctx.lineTo(plankEnd.x, plankEnd.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const obj of objects) {
    const bounds = unionBounds(obj);
    if (obj.type === 'goal') drawGoalLabel(ctx, obj);
    if (obj.locked && !isPlaying) {
      const anchor = obj.bodies[Math.floor(obj.bodies.length / 2)].position;
      drawPadlock(ctx, anchor.x, anchor.y);
    }
    if (obj === selected && !isPlaying) {
      ctx.strokeStyle = '#5ad1e6';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        bounds.min.x - 6,
        bounds.min.y - 6,
        bounds.max.x - bounds.min.x + 12,
        bounds.max.y - bounds.min.y + 12,
      );
    }
  }

  if (selected && selected.type === 'ball' && tool === 'select' && !isPlaying) {
    const handle = getHandlePosition(selected);
    ctx.fillStyle = '#5ad1e6';
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, lastPointerType === 'touch' ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();

    if (Math.abs(selected.spin) > 0.05) {
      const dir = Math.sign(selected.spin);
      const tangentAngle = selected.handleAngle + (Math.PI / 2) * dir;
      const len = Math.min(Math.abs(selected.spin) * 3, 30);
      ctx.strokeStyle = '#5ad1e6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(handle.x, handle.y);
      ctx.lineTo(handle.x + Math.cos(tangentAngle) * len, handle.y + Math.sin(tangentAngle) * len);
      ctx.stroke();
    }
  }

  ctx.restore();
});

window.addEventListener('resize', () => {
  Render.setPixelRatio(render, window.devicePixelRatio);
  Render.setSize(render, window.innerWidth, window.innerHeight);
});

// ---- Demo -----------------------------------------------------------------

let promptVisible = false;

function showDemoPrompt(): void {
  promptVisible = true;
  demoPrompt.hidden = false;
}

function dismissDemoPrompt(markSeen: boolean): void {
  if (!promptVisible) return;
  promptVisible = false;
  demoPrompt.hidden = true;
  if (markSeen) markDemoSeen();
}

let stashedScene = '';

const demoHost: DemoHost = {
  begin() {
    setHelpOpen(false);
    setExamplesOpen(false);
    dismissDemoPrompt(true);
    stashedScene = sceneJson();
    demoActive = true;
    removeAllObjects();
    selectTool('select');
  },
  clear() {
    removeAllObjects();
    selectTool('select');
  },
  end(keepDemo) {
    try {
      if (isPlaying) playBtn.click(); // stop a run in progress so the layout is restored
      if (keepDemo) {
        demoActive = false;
        selected = null;
        commit(); // an undoable step, so the user's earlier scene is one Undo away
      } else {
        removeAllObjects();
        deserializeScene(JSON.parse(stashedScene)).forEach(addObject);
      }
    } finally {
      demoActive = false;
      selectTool('select');
      refreshActions();
    }
  },
  hasUserWork() {
    return (JSON.parse(stashedScene) as { objects: unknown[] }).objects.length > 0;
  },
  handlePosition() {
    return selected?.type === 'ball' ? getHandlePosition(selected) : null;
  },
  goalReached() {
    return objects.some((o) => o.type === 'goal' && o.reached);
  },
};

async function runDemo(): Promise<void> {
  if (demoActive || isPlaying) return;
  markDemoSeen();
  try {
    await startDemo(demoHost);
  } catch (err) {
    console.error('The demo stopped unexpectedly', err);
  }
}

demoBtn.addEventListener('click', () => void runDemo());
document.getElementById('demo-prompt-dismiss')!.addEventListener('click', () => dismissDemoPrompt(true));
document.getElementById('demo-prompt-start')!.addEventListener('click', () => {
  dismissDemoPrompt(true);
  void runDemo();
});

// ---- Start-up: restore the last autosaved scene ---------------------------

const savedScene = loadSavedScene();
if (savedScene) {
  try {
    deserializeScene(JSON.parse(savedScene)).forEach(addObject);
    if (objects.length > 0) toast('Restored your last scene');
  } catch {
    removeAllObjects(); // unreadable save: start fresh; the next edit overwrites it
  }
}
history = new SceneHistory(sceneJson());
refreshActions();

// First visit with an empty canvas: offer the demo once, never force it.
if (objects.length === 0 && !hasSeenDemo()) {
  window.setTimeout(() => {
    if (objects.length === 0 && !demoActive && !isPlaying) showDemoPrompt();
  }, 900);
}

Render.run(render);
