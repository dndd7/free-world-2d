import { Bodies, Body, Query } from 'matter-js';

export type ObjectType = 'ball' | 'box' | 'track';

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
  snapshot: { x: number; y: number; angle: number }[];
}

let nextId = 1;

export function createBall(x: number, y: number): SceneObject {
  const body = Bodies.circle(x, y, 30, {
    restitution: 0.3,
    friction: 0.05,
    render: { fillStyle: '#e0a13a', strokeStyle: '#f5c97a', lineWidth: 2 },
  });
  return {
    id: `obj-${nextId++}`,
    type: 'ball',
    bodies: [body],
    locked: false,
    spin: 0,
    handleAngle: -Math.PI / 2,
    snapshot: [],
  };
}

export function createBox(x: number, y: number): SceneObject {
  const body = Bodies.rectangle(x, y, 70, 70, {
    restitution: 0.1,
    friction: 0.4,
    render: { fillStyle: '#4a90d9', strokeStyle: '#7fb3ea', lineWidth: 2 },
  });
  return {
    id: `obj-${nextId++}`,
    type: 'box',
    bodies: [body],
    locked: false,
    spin: 0,
    handleAngle: 0,
    snapshot: [],
  };
}

const TRACK_SIMPLIFY_DIST = 12;
const TRACK_THICKNESS = 10;

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
    bodies.push(createTrackSegment((a.x + b.x) / 2, (a.y + b.y) / 2, length, Math.atan2(dy, dx)));
  }
  if (bodies.length === 0) return null;

  return {
    id: `obj-${nextId++}`,
    type: 'track',
    bodies,
    locked: false,
    spin: 0,
    handleAngle: 0,
    snapshot: [],
  };
}

function createTrackSegment(x: number, y: number, length: number, angle: number): Body {
  return Bodies.rectangle(x, y, length, TRACK_THICKNESS, {
    angle,
    friction: 0.3,
    render: { fillStyle: '#8a6d3b', strokeStyle: '#c9a86a', lineWidth: 1 },
  });
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
  bodies: SerializedBody[];
}

export interface SceneFile {
  app: 'free-world-2d';
  version: 1;
  objects: SerializedObject[];
}

export function serializeScene(objects: SceneObject[]): SceneFile {
  return {
    app: 'free-world-2d',
    version: 1,
    objects: objects.map((obj) => ({
      type: obj.type,
      locked: obj.locked,
      spin: obj.spin,
      handleAngle: obj.handleAngle,
      bodies: obj.bodies.map((b) => ({
        x: b.position.x,
        y: b.position.y,
        angle: b.angle,
        ...(obj.type === 'track'
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

const OBJECT_TYPES: ObjectType[] = ['ball', 'box', 'track'];

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
      if (raw.type === 'track' && (!isFiniteNumber(b.length) || b.length <= 0)) {
        throw new Error(`${label} has an invalid track segment.`);
      }
    }

    let obj: SceneObject;
    if (raw.type === 'ball') {
      obj = createBall(raw.bodies[0].x, raw.bodies[0].y);
    } else if (raw.type === 'box') {
      obj = createBox(raw.bodies[0].x, raw.bodies[0].y);
    } else {
      obj = {
        id: `obj-${nextId++}`,
        type: 'track',
        bodies: raw.bodies.map((b) => createTrackSegment(b.x, b.y, b.length as number, b.angle)),
        locked: false,
        spin: 0,
        handleAngle: 0,
        snapshot: [],
      };
    }
    obj.bodies.forEach((body, j) => Body.setAngle(body, raw.bodies[j].angle));
    obj.spin = isFiniteNumber(raw.spin) ? raw.spin : 0;
    obj.handleAngle = isFiniteNumber(raw.handleAngle) ? raw.handleAngle : obj.handleAngle;
    setLocked(obj, raw.locked === true);
    return obj;
  });
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
  obj.locked = locked;
  for (const b of obj.bodies) Body.setStatic(b, locked);
}

export function translateObject(obj: SceneObject, dx: number, dy: number): void {
  for (const b of obj.bodies) Body.translate(b, { x: dx, y: dy });
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
