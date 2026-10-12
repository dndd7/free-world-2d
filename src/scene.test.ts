import { Body, Composite, Engine } from 'matter-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyInitialSpin,
  applyMaterial,
  createBall,
  createBox,
  createGoal,
  createPlank,
  createTrack,
  createTriangle,
  deserializeScene,
  installSurfaceRules,
  resetGoals,
  rotateObject,
  serializeScene,
  setLocked,
  unionBounds,
  watchGoals,
  type Material,
  type SceneObject,
} from './scene';

beforeAll(() => installSurfaceRules());

function simulate(objects: SceneObject[], steps: number, each?: (step: number) => void) {
  const engine = Engine.create();
  watchGoals(engine, () => objects);
  for (const obj of objects) Composite.add(engine.world, obj.bodies);
  for (let i = 0; i < steps; i++) {
    Engine.update(engine, 1000 / 60);
    each?.(i);
  }
  return engine;
}

function lockedFloor(material: Material = 'normal', y = 500): SceneObject {
  const floor = createPlank({ x: 0, y }, { x: 4000, y })!;
  applyMaterial(floor, material);
  setLocked(floor, true);
  return floor;
}

function expectClose(actual: unknown, expected: unknown, path = 'root') {
  if (typeof expected === 'number') {
    expect(actual, path).toBeCloseTo(expected, 6);
  } else if (expected && typeof expected === 'object') {
    for (const key of Object.keys(expected)) {
      expectClose((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}

describe('export / import', () => {
  function sampleScene(): SceneObject[] {
    const ball = createBall(120, 80);
    ball.spin = 7.5;
    ball.handleAngle = 1.2;
    applyMaterial(ball, 'rubber');

    const box = createBox(300, 90);
    rotateObject(box, 0.4);
    setLocked(box, true);

    const triangle = createTriangle(450, 200);
    applyMaterial(triangle, 'ice');

    const plank = createPlank({ x: 100, y: 300 }, { x: 400, y: 380 })!;
    applyMaterial(plank, 'sticky');
    setLocked(plank, true);

    const track = createTrack([
      { x: 50, y: 50 },
      { x: 120, y: 90 },
      { x: 200, y: 100 },
      { x: 300, y: 160 },
    ])!;

    return [ball, box, triangle, plank, track, createGoal(600, 400)];
  }

  it('round-trips every object type with its material, lock state and spin', () => {
    const first = serializeScene(sampleScene());
    const second = serializeScene(deserializeScene(JSON.parse(JSON.stringify(first))));
    expect(second.objects.map((o) => o.type)).toEqual(first.objects.map((o) => o.type));
    expectClose(second, first);
  });

  it('restores materials and locks on the rebuilt objects', () => {
    const rebuilt = deserializeScene(JSON.parse(JSON.stringify(serializeScene(sampleScene()))));
    expect(rebuilt.map((o) => o.material)).toEqual(['rubber', 'normal', 'ice', 'sticky', 'normal', 'normal']);
    expect(rebuilt.map((o) => o.locked)).toEqual([false, true, false, true, false, false]);
    expect(rebuilt[0].spin).toBe(7.5);
  });

  it('loads files saved before materials existed', () => {
    const old = {
      app: 'free-world-2d',
      version: 1,
      objects: [{ type: 'ball', locked: false, spin: 1, handleAngle: 0, bodies: [{ x: 10, y: 20, angle: 0 }] }],
    };
    const [ball] = deserializeScene(old);
    expect(ball.material).toBe('normal');
    expect(ball.bodies[0].position).toMatchObject({ x: 10, y: 20 });
  });

  it.each([
    ['null', null],
    ['another app', { app: 'something-else', version: 1, objects: [] }],
    ['a future version', { app: 'free-world-2d', version: 2, objects: [] }],
    ['no object list', { app: 'free-world-2d', version: 1 }],
    ['an unknown object type', { app: 'free-world-2d', version: 1, objects: [{ type: 'rocket', bodies: [{ x: 0, y: 0, angle: 0 }] }] }],
    ['an object with no bodies', { app: 'free-world-2d', version: 1, objects: [{ type: 'ball', bodies: [] }] }],
    ['a ball with two bodies', { app: 'free-world-2d', version: 1, objects: [{ type: 'ball', bodies: [{ x: 0, y: 0, angle: 0 }, { x: 1, y: 1, angle: 0 }] }] }],
    ['a non-numeric position', { app: 'free-world-2d', version: 1, objects: [{ type: 'box', bodies: [{ x: 'a', y: 0, angle: 0 }] }] }],
    ['an infinite position', { app: 'free-world-2d', version: 1, objects: [{ type: 'box', bodies: [{ x: Infinity, y: 0, angle: 0 }] }] }],
    ['a plank with no length', { app: 'free-world-2d', version: 1, objects: [{ type: 'plank', bodies: [{ x: 0, y: 0, angle: 0 }] }] }],
  ])('rejects %s', (_name, data) => {
    expect(() => deserializeScene(data)).toThrow();
  });
});

describe('objects', () => {
  it('keeps goal zones static and unlockable', () => {
    const goal = createGoal(100, 100);
    setLocked(goal, true);
    expect(goal.locked).toBe(false);
    expect(goal.bodies[0].isStatic).toBe(true);
    expect(goal.bodies[0].isSensor).toBe(true);
  });

  it('rotates an object about its centre', () => {
    const plank = createPlank({ x: 100, y: 100 }, { x: 300, y: 100 })!;
    const before = unionBounds(plank);
    expect(before.max.x - before.min.x).toBeCloseTo(200, 3);
    rotateObject(plank, Math.PI / 2);
    const after = unionBounds(plank);
    expect(after.max.y - after.min.y).toBeCloseTo(200, 3);
    expect((after.min.x + after.max.x) / 2).toBeCloseTo(200, 3);
  });

  it('ignores planks that are too short to be intentional', () => {
    expect(createPlank({ x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull();
  });

  it('keeps a material when an object is locked and unlocked afterwards', () => {
    const box = createBox(0, 0);
    applyMaterial(box, 'rubber');
    setLocked(box, true);
    applyMaterial(box, 'ice');
    setLocked(box, false);
    expect(box.bodies[0].friction).toBe(0);
    expect(box.bodies[0].restitution).toBeCloseTo(0.05);
  });
});

describe('goal zones', () => {
  it('light up when a free ball falls into them and reset on demand', () => {
    const goal = createGoal(300, 450);
    const ball = createBall(300, 100);
    simulate([goal, ball], 200);
    expect(goal.reached).toBe(true);
    resetGoals([goal]);
    expect(goal.reached).toBe(false);
  });

  it('ignore locked objects', () => {
    const goal = createGoal(300, 450);
    const ball = createBall(300, 450);
    setLocked(ball, true);
    simulate([goal, ball], 60);
    expect(goal.reached).toBe(false);
  });
});

describe('surfaces', () => {
  function reboundHeight(material: Material): number {
    const ball = createBall(300, 200);
    let landed = false;
    let apex = Infinity;
    simulate([lockedFloor(material), ball], 500, () => {
      const b = ball.bodies[0];
      if (!landed && b.velocity.y > 0.5 && b.position.y > 440) landed = true;
      if (landed && b.velocity.y < 0) apex = Math.min(apex, b.position.y);
    });
    return 470 - apex;
  }

  it('rubber bounces much higher than a normal surface', () => {
    expect(reboundHeight('rubber')).toBeGreaterThan(reboundHeight('normal') * 3);
  });

  function slideDistance(material: Material): number {
    const box = createBox(200, 500 - 7 - 35);
    const bodies = [lockedFloor(material), box];
    const engine = simulate(bodies, 30);
    const start = box.bodies[0].position.x;
    Body.setVelocity(box.bodies[0], { x: 8, y: 0 });
    for (let i = 0; i < 300; i++) Engine.update(engine, 1000 / 60);
    return box.bodies[0].position.x - start;
  }

  it('ice lets a pushed box slide far further than a normal surface', () => {
    expect(slideDistance('ice')).toBeGreaterThan(slideDistance('normal') * 5);
  });

  it('applies materials to locked surfaces too', () => {
    const floor = lockedFloor('ice');
    expect(floor.bodies[0].isStatic).toBe(true);
    expect(floor.bodies[0].plugin.material).toBe('ice');
  });
});

describe('ball spin', () => {
  function driftAfterSpin(spin: number): number {
    const ball = createBall(300, 500 - 7 - 30);
    ball.spin = spin;
    const engine = simulate([lockedFloor(), ball], 30);
    applyInitialSpin(ball);
    const start = ball.bodies[0].position.x;
    for (let i = 0; i < 90; i++) Engine.update(engine, 1000 / 60);
    return ball.bodies[0].position.x - start;
  }

  it('converts the dial value from radians per second to Matter radians per step', () => {
    const ball = createBall(0, 0);
    ball.spin = 12;
    applyInitialSpin(ball);
    expect(ball.bodies[0].angularVelocity).toBeCloseTo(12 / 60, 6);
  });

  it('rolls a clockwise-spinning ball to the right and an anticlockwise one to the left', () => {
    expect(driftAfterSpin(10)).toBeGreaterThan(5);
    expect(driftAfterSpin(-10)).toBeLessThan(-5);
  });

  it('does nothing for a ball with no spin set', () => {
    expect(Math.abs(driftAfterSpin(0))).toBeLessThan(1);
  });
});
