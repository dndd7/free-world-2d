import { Composite, Engine, Events, Render, Runner } from 'matter-js';
import {
  applyInitialSpin,
  captureSnapshot,
  createBall,
  createBox,
  createTrack,
  deserializeScene,
  findObjectAtPoint,
  restoreSnapshot,
  serializeScene,
  setLocked,
  translateObject,
  unionBounds,
  type Point,
  type SceneObject,
} from './scene';
import './style.css';

type Tool = 'select' | 'draw' | 'ball' | 'box';

const HANDLE_RADIUS_PAD = 14;
const HANDLE_HIT_RADIUS = 14;
const MAX_SPIN = 18;

const canvas = document.getElementById('sim') as HTMLCanvasElement;
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tool-btn[data-tool]'));
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
const importFile = document.getElementById('import-file') as HTMLInputElement;

const engine = Engine.create();
const world = engine.world;
const runner = Runner.create();

const render = Render.create({
  canvas,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    wireframes: false,
    background: '#1a1a1f',
  },
});

let tool: Tool = 'select';
let isPlaying = false;
const objects: SceneObject[] = [];
let selected: SceneObject | null = null;

let dragging: { obj: SceneObject; lastX: number; lastY: number } | null = null;
let spinDragging: SceneObject | null = null;
let spinLastAngle = 0;
let spinLastTime = 0;

let isDrawingStroke = false;
let drawPoints: Point[] = [];

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

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isPlaying) return;
    selectTool(btn.dataset.tool as Tool);
  });
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (isPlaying) return;
  const hit = findObjectAtPoint(objects, getCanvasPoint(e));
  if (hit) setLocked(hit, !hit.locked);
});

canvas.addEventListener('mousedown', (e) => {
  if (isPlaying || e.button !== 0) return;
  const p = getCanvasPoint(e);

  if (tool === 'draw') {
    isDrawingStroke = true;
    drawPoints = [p];
    return;
  }

  if (tool === 'ball') {
    const obj = createBall(p.x, p.y);
    addObject(obj);
    selected = obj;
    selectTool('select');
    return;
  }

  if (tool === 'box') {
    const obj = createBox(p.x, p.y);
    addObject(obj);
    selected = obj;
    selectTool('select');
    return;
  }

  if (selected && selected.type === 'ball') {
    const handle = getHandlePosition(selected);
    if (Math.hypot(p.x - handle.x, p.y - handle.y) <= HANDLE_HIT_RADIUS) {
      spinDragging = selected;
      spinLastTime = 0;
      return;
    }
  }

  const hit = findObjectAtPoint(objects, p);
  selected = hit;
  if (hit) dragging = { obj: hit, lastX: p.x, lastY: p.y };
});

window.addEventListener('mousemove', (e) => {
  if (isPlaying) return;
  const p = getCanvasPoint(e);

  if (isDrawingStroke) {
    drawPoints.push(p);
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

window.addEventListener('mouseup', () => {
  if (isDrawingStroke) {
    isDrawingStroke = false;
    const obj = createTrack(drawPoints);
    drawPoints = [];
    if (obj) {
      addObject(obj);
      selected = obj;
    }
    selectTool('select');
  }
  dragging = null;
  spinDragging = null;
});

playBtn.addEventListener('click', () => {
  if (!isPlaying) {
    objects.forEach(captureSnapshot);
    objects.forEach(applyInitialSpin);
    Runner.run(runner, engine);
    isPlaying = true;
    playBtn.textContent = 'Stop';
    setToolbarDisabled(true);
  } else {
    Runner.stop(runner);
    objects.forEach(restoreSnapshot);
    isPlaying = false;
    playBtn.textContent = 'Play';
    setToolbarDisabled(false);
  }
});

function clearScene(): void {
  objects.forEach((obj) => Composite.remove(world, obj.bodies));
  objects.length = 0;
  selected = null;
}

clearBtn.addEventListener('click', () => {
  if (isPlaying) return;
  clearScene();
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
    clearScene();
    imported.forEach(addObject);
  } catch (err) {
    alert(`Couldn't import that file: ${err instanceof Error ? err.message : 'invalid file'}`);
  }
});

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

Events.on(render, 'afterRender', () => {
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

  for (const obj of objects) {
    const bounds = unionBounds(obj);
    if (obj.locked) {
      const anchor = obj.bodies[Math.floor(obj.bodies.length / 2)].position;
      drawPadlock(ctx, anchor.x, anchor.y);
    }
    if (obj === selected) {
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
    ctx.arc(handle.x, handle.y, 7, 0, Math.PI * 2);
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
  render.canvas.width = window.innerWidth;
  render.canvas.height = window.innerHeight;
  render.options.width = window.innerWidth;
  render.options.height = window.innerHeight;
});

Render.run(render);
