import { Composite, Engine } from 'matter-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLES, exampleExtent, extentOf, placeExample, type Example } from './examples';
import {
  applyInitialSpin,
  applyMaterial,
  deserializeScene,
  installSurfaceRules,
  serializeScene,
  watchGoals,
  type Material,
  type SceneObject,
} from './scene';

beforeAll(() => installSurfaceRules());

const AREA = { x: 90, y: 90, w: 1000, h: 560 };

/** Plays an example from its starting layout and returns the second the goal lit up, or null. */
function secondsToGoal(example: Example, deltaMs = 1000 / 60, limitSeconds = 20): number | null {
  const objects = placeExample(example, AREA);
  const engine = Engine.create();
  watchGoals(engine, () => objects);
  for (const o of objects) Composite.add(engine.world, o.bodies);
  objects.forEach(applyInitialSpin);
  const goal = objects.find((o) => o.type === 'goal')!;
  const steps = Math.round((limitSeconds * 1000) / deltaMs);
  for (let i = 1; i <= steps; i++) {
    Engine.update(engine, deltaMs);
    if (goal.reached) return (i * deltaMs) / 1000;
  }
  return null;
}

describe('example gallery', () => {
  it('has a healthy set of uniquely named designs', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    expect(new Set(EXAMPLES.map((e) => e.title)).size).toBe(EXAMPLES.length);
    for (const e of EXAMPLES) {
      expect(e.title.length, e.id).toBeGreaterThan(2);
      expect(e.blurb.length, e.id).toBeGreaterThan(20);
      expect(e.tip.length, e.id).toBeGreaterThan(10);
    }
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s has a goal and something to drop', (_id, example) => {
    const objects = example.build();
    expect(objects.filter((o) => o.type === 'goal')).toHaveLength(1);
    expect(objects.some((o) => !o.locked && o.type !== 'goal')).toBe(true);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s is a sensible size for a laptop screen', (_id, example) => {
    const e = exampleExtent(example);
    expect(e.w).toBeLessThanOrEqual(640);
    expect(e.h).toBeLessThanOrEqual(520);
    expect(e.w).toBeGreaterThan(200);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s is centred in the free area it is loaded into', (_id, example) => {
    const e = extentOf(placeExample(example, AREA));
    expect((e.minX + e.maxX) / 2).toBeCloseTo(AREA.x + AREA.w / 2, 3);
    expect((e.minY + e.maxY) / 2).toBeCloseTo(AREA.y + AREA.h / 2, 3);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s is pinned to the top-left when the screen is too small', (_id, example) => {
    const tiny = { x: 80, y: 70, w: 100, h: 60 };
    const e = extentOf(placeExample(example, tiny));
    expect(e.minX).toBeCloseTo(tiny.x, 3);
    expect(e.minY).toBeCloseTo(tiny.y, 3);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s survives export and import unchanged', (_id, example) => {
    const objects = example.build();
    const file = JSON.parse(JSON.stringify(serializeScene(objects)));
    const rebuilt = deserializeScene(file);
    expect(rebuilt.map((o) => o.type)).toEqual(objects.map((o) => o.type));
    expect(rebuilt.map((o) => o.locked)).toEqual(objects.map((o) => o.locked));
    expect(rebuilt.map((o) => o.material)).toEqual(objects.map((o) => o.material));
  });
});

describe('every example solves itself when you press Play', () => {
  // Matter's runner always steps physics at a fixed 1/60 s; the other rates are a safety margin.
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s reaches its goal', (_id, example) => {
    const s = secondsToGoal(example);
    expect(s, 'goal reached').not.toBeNull();
    expect(s!).toBeGreaterThan(0.4); // not instant: there is something to watch
    expect(s!).toBeLessThan(8); // and nobody waits long
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s is not fragile to the step size', (_id, example) => {
    for (const delta of [1000 / 120, 1000 / 30]) {
      expect(secondsToGoal(example, delta), `${Math.round(1000 / delta)} Hz`).not.toBeNull();
    }
  });

  it('does not solve itself with the goal removed from the picture', () => {
    // sanity check that the goal check is meaningful: with the locked parts missing, the ball just falls
    const example = EXAMPLES[0];
    const objects = placeExample(example, AREA).filter((o) => !o.locked);
    const engine = Engine.create();
    watchGoals(engine, () => objects);
    for (const o of objects) Composite.add(engine.world, o.bodies);
    const goal = objects.find((o) => o.type === 'goal')!;
    for (let i = 0; i < 600; i++) Engine.update(engine, 1000 / 60);
    expect(goal.reached).toBe(false);
  });
});

describe('funnel', () => {
  it('lets every ball through instead of jamming', () => {
    const funnel = EXAMPLES.find((e) => e.id === 'funnel')!;
    const objects = placeExample(funnel, AREA);
    const engine = Engine.create();
    for (const o of objects) Composite.add(engine.world, o.bodies);
    for (let i = 0; i < 900; i++) Engine.update(engine, 1000 / 60);
    const throat = extentOf(objects.filter((o) => o.locked)).maxY;
    for (const ball of objects.filter((o) => o.type === 'ball')) {
      expect(ball.bodies[0].position.y, 'ball below the funnel').toBeGreaterThan(throat);
    }
  });
});

describe('what the tips promise is true', () => {
  const setAll = (m: Material, types: string[]) => (objs: SceneObject[]) =>
    objs.filter((o) => types.includes(o.type)).forEach((o) => applyMaterial(o, m));

  function play(id: string, tweak?: (objs: SceneObject[]) => void): number | null {
    const example = EXAMPLES.find((e) => e.id === id)!;
    const objects = placeExample(example, AREA);
    tweak?.(objects);
    const engine = Engine.create();
    watchGoals(engine, () => objects);
    for (const o of objects) Composite.add(engine.world, o.bodies);
    objects.forEach(applyInitialSpin);
    const goal = objects.find((o) => o.type === 'goal')!;
    for (let i = 1; i <= 60 * 25; i++) {
      Engine.update(engine, 1000 / 60);
      if (goal.reached) return i / 60;
    }
    return null;
  }

  it('ice run: the box stops short with everything Normal, but one icy surface is enough', () => {
    expect(play('ice-run')).not.toBeNull();
    expect(play('ice-run', setAll('normal', ['plank', 'box']))).toBeNull();
    expect(play('ice-run', setAll('normal', ['plank']))).not.toBeNull(); // box still icy
    expect(play('ice-run', setAll('normal', ['box']))).not.toBeNull(); // ramp and floor still icy
  });

  it('knock-down: Normal boxes are too much for the ball to push', () => {
    expect(play('knock-down')).not.toBeNull();
    expect(play('knock-down', setAll('normal', ['box']))).toBeNull();
  });

  it('roller coaster: an icy track is a faster ride', () => {
    expect(play('roller-coaster', setAll('ice', ['track']))!).toBeLessThan(play('roller-coaster')!);
  });

  it('first slide: spinning the right way is quicker than no spin or the wrong way', () => {
    const spin = (value: number) => (objs: SceneObject[]) =>
      objs.filter((o) => o.type === 'ball').forEach((b) => (b.spin = value));
    const forward = play('first-slide')!;
    expect(play('first-slide', spin(0))!).toBeGreaterThan(forward);
    expect(play('first-slide', spin(-7))!).toBeGreaterThan(forward);
  });
});
