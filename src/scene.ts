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
    const angle = Math.atan2(dy, dx);
    bodies.push(
      Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, length, TRACK_THICKNESS, {
        angle,
        friction: 0.3,
        render: { fillStyle: '#8a6d3b', strokeStyle: '#c9a86a', lineWidth: 1 },
      }),
    );
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
