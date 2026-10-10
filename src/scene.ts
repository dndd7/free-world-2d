import { Bodies, Body, Pair, Query } from 'matter-js';

export type ObjectType = 'ball' | 'box' | 'triangle' | 'plank' | 'track' | 'goal';
export type Material = 'normal' | 'ice' | 'rubber' | 'sticky';

export const OBJECT_LABELS: Record<ObjectType, string> = {
  ball: 'Ball',
  box: 'Box',
  triangle: 'Triangle',
  plank: 'Plank',
  track: 'Track',
  goal: 'Goal zone',
};

export const MATERIAL_OPTIONS: { value: Material; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'ice', label: 'Ice (slippery)' },
  { value: 'rubber', label: 'Rubber (bouncy)' },
  { value: 'sticky', label: 'Sticky (grippy)' },
];

export interface Point {
  x: number;
  y: number;
}

export interface SceneObject {
  id: string;
  type: ObjectType;
  bodies: Body[];
  locked: boolean;
  spin: number;
  handleAngle: number;
  material: Material;
  reached: boolean;
  snapshot: { x: number; y: number; angle: number }[];
}

interface Surface {
  friction: number;
  frictionStatic: number;
  restitution: number;
}

interface Style {
  fill: string;
  stroke: string;
  surface: Surface;
}

const BASE_STYLE: Record<ObjectType, Style> = {
  ball: {
    fill: '#e0a13a',
    stroke: '#f5c97a',
    surface: { friction: 0.05, frictionStatic: 0.5, restitution: 0.3 },
  },
  box: {
    fill: '#4a90d9',
    stroke: '#7fb3ea',
    surface: { friction: 0.4, frictionStatic: 0.5, restitution: 0.1 },
  },
  triangle: {
    fill: '#4fb39a',
    stroke: '#8fdcc8',
    surface: { friction: 0.4, frictionStatic: 0.5, restitution: 0.1 },
  },
  plank: {
    fill: '#b08a4f',
    stroke: '#d9b97f',
    surface: { friction: 0.3, frictionStatic: 0.5, restitution: 0 },
  },
  track: {
    fill: '#8a6d3b',
    stroke: '#c9a86a',
    surface: { friction: 0.3, frictionStatic: 0.5, restitution: 0 },
  },
  goal: {
    fill: 'rgba(63, 174, 92, 0.22)',
    stroke: '#3fae5c',
    surface: { friction: 0, frictionStatic: 0, restitution: 0 },
  },
};

const MATERIAL_STYLE: Record<Exclude<Material, 'normal'>, Style> = {
  ice: {
    fill: '#8fd8f0',
    stroke: '#d3f3fb',
    surface: { friction: 0, frictionStatic: 0, restitution: 0.05 },
  },
  rubber: {
    fill: '#e9589b',
    stroke: '#f59bc6',
    surface: { friction: 0.9, frictionStatic: 0.9, restitution: 0.95 },
  },
  sticky: {
    fill: '#8e6fd1',
    stroke: '#b9a4ea',
    surface: { friction: 1, frictionStatic: 5, restitution: 0 },
  },
};

const BALL_RADIUS = 30;
const BOX_SIZE = 70;
const TRIANGLE_W = 120;
const TRIANGLE_H = 80;
const GOAL_W = 140;
const GOAL_H = 90;
const TRACK_THICKNESS = 10;
const PLANK_THICKNESS = 14;
const MIN_PLANK_LENGTH = 20;
const TRACK_SIMPLIFY_DIST = 12;

const GOAL_FILL_REACHED = 'rgba(63, 174, 92, 0.6)';

let nextId = 1;

function makeObject(type: ObjectType, bodies: Body[]): SceneObject {
  const obj: SceneObject = {
    id: `obj-${nextId++}`,
    type,
    bodies,
    locked: false,
    spin: 0,
    handleAngle: type === 'ball' ? -Math.PI / 2 : 0,
    material: 'normal',
    reached: false,
    snapshot: [],
  };
  applyMaterial(obj, 'normal');
  return obj;
}

export function createBall(x: number, y: number): SceneObject {
  return makeObject('ball', [Bodies.circle(x, y, BALL_RADIUS)]);
}

export function createBox(x: number, y: number): SceneObject {
  return makeObject('box', [Bodies.rectangle(x, y, BOX_SIZE, BOX_SIZE)]);
}

export function createTriangle(x: number, y: number): SceneObject {
  // Right-angled wedge: the slope runs from the top-left corner down to the right.
  const body = Bodies.fromVertices(x, y, [
    [
      { x: 0, y: 0 },
      { x: TRIANGLE_W, y: 0 },
      { x: 0, y: -TRIANGLE_H },
    ],
  ]);
  Body.setPosition(body, { x, y });
  return makeObject('triangle', [body]);
}

export function createGoal(x: number, y: number): SceneObject {
  const body = Bodies.rectangle(x, y, GOAL_W, GOAL_H, {
    isStatic: true,
    isSensor: true,
    label: 'goal',
    render: { fillStyle: BASE_STYLE.goal.fill, strokeStyle: BASE_STYLE.goal.stroke, lineWidth: 2 },
  });
  return makeObject('goal', [body]);
}

function createBar(x: number, y: number, length: number, thickness: number, angle: number): Body {
  return Bodies.rectangle(x, y, length, thickness, { angle });
}

export function createPlank(a: Point, b: Point): SceneObject | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < MIN_PLANK_LENGTH) return null;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return makeObject('plank', [
    createBar((a.x + b.x) / 2, (a.y + b.y) / 2, length, PLANK_THICKNESS, angle),
  ]);
}

export function createTrack(points: Point[]): SceneObject | null {
  const simplified = simplifyPoints(points, TRACK_SIMPLIFY_DIST);
  if (simplified.length < 2) return null;

  const bodies: Body[] = [];
  for (let i = 0; i < simplified.length - 1; i++) {
    const a = simplified[i];
    const b = simplified[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) continue;
    bodies.push(
      createBar((a.x + b.x) / 2, (a.y + b.y) / 2, length, TRACK_THICKNESS, Math.atan2(dy, dx)),
    );
  }
  if (bodies.length === 0) return null;
  return makeObject('track', bodies);
}

function simplifyPoints(points: Point[], minDist: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  return out;
}

export function setLocked(obj: SceneObject, locked: boolean): void {
  if (obj.type === 'goal') return;
  obj.locked = locked;
  for (const b of obj.bodies) Body.setStatic(b, locked);
}

export function applyMaterial(obj: SceneObject, material: Material): void {
  if (obj.type === 'goal') return;
  const style = material === 'normal' ? BASE_STYLE[obj.type] : MATERIAL_STYLE[material];
  // Matter overwrites friction/bounce on static bodies and restores them on unlock,
  // so unlock first to make sure our values are what gets saved and restored.
  const wasLocked = obj.locked;
  if (wasLocked) setLocked(obj, false);
  for (const b of obj.bodies) {
    b.friction = style.surface.friction;
    b.frictionStatic = style.surface.frictionStatic;
    b.restitution = style.surface.restitution;
    b.render.fillStyle = style.fill;
    b.render.strokeStyle = style.stroke;
    b.render.lineWidth = obj.type === 'track' ? 1 : 2;
    b.plugin.surface = { ...style.surface };
    b.plugin.material = material;
  }
  if (wasLocked) setLocked(obj, true);
  obj.material = material;
}

function surfaceOf(body: Body): Surface {
  return (
    body.plugin?.surface ?? {
      friction: body.friction,
      frictionStatic: body.frictionStatic,
      restitution: body.restitution,
    }
  );
}

/**
 * Matter combines two touching bodies as min(friction) / max(bounce) and forces
 * static bodies to friction 1 / bounce 0. Re-derive the contact values from each
 * object's chosen material instead, so Ice, Rubber and Sticky work the same whether
 * the surface is locked or free: if either surface is Ice the contact is frictionless,
 * otherwise if either is Sticky it grips, and the bouncier of the two always wins.
 */
export function installSurfaceRules(): void {
  const patched = Pair as typeof Pair & { __fw2dPatched?: boolean };
  if (patched.__fw2dPatched) return;
  patched.__fw2dPatched = true;

  const originalUpdate = Pair.update;
  Pair.update = (pair, collision, timestamp) => {
    originalUpdate(pair, collision, timestamp);
    if (pair.isSensor) return;
    const bodyA = pair.bodyA.parent;
    const bodyB = pair.bodyB.parent;
    const a = surfaceOf(bodyA);
    const b = surfaceOf(bodyB);
    const hasMaterial = (m: Material) => bodyA.plugin?.material === m || bodyB.plugin?.material === m;
    if (hasMaterial('ice')) {
      pair.friction = 0;
      pair.frictionStatic = 0;
    } else if (hasMaterial('sticky')) {
      pair.friction = Math.max(a.friction, b.friction);
      pair.frictionStatic = Math.max(a.frictionStatic, b.frictionStatic);
    } else {
      pair.friction = Math.min(a.friction, b.friction);
      pair.frictionStatic = Math.max(a.frictionStatic, b.frictionStatic);
    }
    pair.restitution = Math.max(a.restitution, b.restitution);
  };
}

export function setGoalReached(obj: SceneObject, reached: boolean): void {
  obj.reached = reached;
  obj.bodies[0].render.fillStyle = reached ? GOAL_FILL_REACHED : BASE_STYLE.goal.fill;
}

export function resetGoals(objects: SceneObject[]): void {
  for (const obj of objects) {
    if (obj.type === 'goal') setGoalReached(obj, false);
  }
}

export function translateObject(obj: SceneObject, dx: number, dy: number): void {
  for (const b of obj.bodies) Body.translate(b, { x: dx, y: dy });
}

export function rotateObject(obj: SceneObject, delta: number): void {
  const bounds = unionBounds(obj);
  const center = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 };
  // Matter's runtime accepts a pivot point here, but @types/matter-js doesn't declare it.
  const rotateAround = Body.rotate as (body: Body, rotation: number, point: Point) => void;
  for (const b of obj.bodies) rotateAround(b, delta, center);
}

export function captureSnapshot(obj: SceneObject): void {
  obj.snapshot = obj.bodies.map((b) => ({ x: b.position.x, y: b.position.y, angle: b.angle }));
}

export function restoreSnapshot(obj: SceneObject): void {
  obj.bodies.forEach((b, i) => {
    const s = obj.snapshot[i];
    if (!s) return;
    Body.setPosition(b, { x: s.x, y: s.y });
    Body.setAngle(b, s.angle);
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
  });
}

export function applyInitialSpin(obj: SceneObject): void {
  if (obj.type === 'ball' && obj.spin) {
    Body.setAngularVelocity(obj.bodies[0], obj.spin);
  }
}

export function findObjectAtPoint(objects: SceneObject[], point: Point): SceneObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (Query.point(obj.bodies, point).length > 0) return obj;
  }
  return null;
}

export function unionBounds(obj: SceneObject) {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const b of obj.bodies) {
    min.x = Math.min(min.x, b.bounds.min.x);
    min.y = Math.min(min.y, b.bounds.min.y);
    max.x = Math.max(max.x, b.bounds.max.x);
    max.y = Math.max(max.y, b.bounds.max.y);
  }
  return { min, max };
}

export interface SerializedBody {
  x: number;
  y: number;
  angle: number;
  length?: number;
}

export interface SerializedObject {
  type: ObjectType;
  locked: boolean;
  spin: number;
  handleAngle: number;
  material?: Material;
  bodies: SerializedBody[];
}

export interface SceneFile {
  app: 'free-world-2d';
  version: 1;
  objects: SerializedObject[];
}

const OBJECT_TYPES = Object.keys(OBJECT_LABELS) as ObjectType[];
const MATERIALS = MATERIAL_OPTIONS.map((m) => m.value);
const isBar = (type: ObjectType) => type === 'track' || type === 'plank';

export function serializeScene(objects: SceneObject[]): SceneFile {
  return {
    app: 'free-world-2d',
    version: 1,
    objects: objects.map((obj) => ({
      type: obj.type,
      locked: obj.locked,
      spin: obj.spin,
      handleAngle: obj.handleAngle,
      material: obj.material,
      bodies: obj.bodies.map((b) => ({
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        ...(isBar(obj.type)
          ? {
              length: Math.hypot(
                b.vertices[1].x - b.vertices[0].x,
                b.vertices[1].y - b.vertices[0].y,
              ),
            }
          : {}),
      })),
    })),
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function deserializeScene(data: unknown): SceneObject[] {
  const file = data as Partial<SceneFile> | null;
  if (!file || file.app !== 'free-world-2d' || file.version !== 1 || !Array.isArray(file.objects)) {
    throw new Error('Not a Free World 2D scene file.');
  }

  return file.objects.map((raw, i) => {
    const label = `Object ${i + 1}`;
    if (!raw || !OBJECT_TYPES.includes(raw.type) || !Array.isArray(raw.bodies) || raw.bodies.length === 0) {
      throw new Error(`${label} is malformed.`);
    }
    if (raw.type !== 'track' && raw.bodies.length !== 1) {
      throw new Error(`${label} should have exactly one body.`);
    }
    for (const b of raw.bodies) {
      if (!b || !isFiniteNumber(b.x) || !isFiniteNumber(b.y) || !isFiniteNumber(b.angle)) {
        throw new Error(`${label} has an invalid body.`);
      }
      if (isBar(raw.type) && (!isFiniteNumber(b.length) || b.length <= 0)) {
        throw new Error(`${label} has an invalid segment.`);
      }
    }

    const first = raw.bodies[0];
    let obj: SceneObject;
    switch (raw.type) {
      case 'ball':
        obj = createBall(first.x, first.y);
        break;
      case 'box':
        obj = createBox(first.x, first.y);
        break;
      case 'triangle':
        obj = createTriangle(first.x, first.y);
        break;
      case 'goal':
        obj = createGoal(first.x, first.y);
        break;
      case 'plank':
        obj = makeObject('plank', [
          createBar(first.x, first.y, first.length as number, PLANK_THICKNESS, first.angle),
        ]);
        break;
      case 'track':
        obj = makeObject(
          'track',
          raw.bodies.map((b) => createBar(b.x, b.y, b.length as number, TRACK_THICKNESS, b.angle)),
        );
        break;
    }
    obj.bodies.forEach((body, j) => Body.setAngle(body, raw.bodies[j].angle));
    obj.spin = isFiniteNumber(raw.spin) ? raw.spin : 0;
    obj.handleAngle = isFiniteNumber(raw.handleAngle) ? raw.handleAngle : obj.handleAngle;
    if (raw.material && MATERIALS.includes(raw.material)) applyMaterial(obj, raw.material);
    setLocked(obj, raw.locked === true);
    return obj;
  });
}
