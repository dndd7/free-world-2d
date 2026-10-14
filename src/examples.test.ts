import { Composite, Engine } from 'matter-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLES, exampleExtent, extentOf, placeExample, type Example } from './examples';
import {
  applyInitialSpin,
  applyMaterial,
  applyMotors,
  deserializeScene,
  groupJoinedBodies,
  installSurfaceRules,
  serializeScene,
  watchGoals,
  type DriveInput,
  type LoadedScene,
  type Material,
  type SceneObject,
} from './scene';

beforeAll(() => installSurfaceRules());

const AREA = { x: 90, y: 90, w: 1000, h: 560 };

interface SimOptions {
  deltaMs?: number;
  limitSeconds?: number;
  /** Change the design before it is played, e.g. to swap a material. */
  tweak?: (scene: LoadedScene) => void;
  /** Held drive input. Defaults to forward for designs that are driven, otherwise none. */
  drive?: DriveInput;
}

/** Plays an example from its starting layout and returns the second its goal lit up, or null. */
function simulate(example: Example, options: SimOptions = {}): number | null {
  const { deltaMs = 1000 / 60, limitSeconds = 20 } = options;
  const scene = placeExample(example, AREA);
  options.tweak?.(scene);
  const { objects, joints } = scene;

  const engine = Engine.create();
  watchGoals(engine, () => objects);
  for (const o of objects) Composite.add(engine.world, o.bodies);
  for (const j of joints) Composite.add(engine.world, j.constraint);
  groupJoinedBodies(objects, joints);
  objects.forEach(applyInitialSpin);

  const input = options.drive ?? (example.controls === 'drive' ? 1 : 0);
  const goal = objects.find((o) => o.type === 'goal')!;
  const steps = Math.round((limitSeconds * 1000) / deltaMs);
  for (let i = 1; i <= steps; i++) {
    applyMotors(objects, input);
    Engine.update(engine, deltaMs);
    if (goal.reached) return (i * deltaMs) / 1000;
  }
  return null;
}

const each = EXAMPLES.map((e) => [e.id, e] as const);
const driven = (e: Example) => e.controls === 'drive';

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

  it.each(each)('%s has a goal and something to drop', (_id, example) => {
    const { objects } = example.build();
    expect(objects.filter((o) => o.type === 'goal')).toHaveLength(1);
    expect(objects.some((o) => !o.locked && o.type !== 'goal')).toBe(true);
  });

  it.each(each)('%s is a sensible size', (_id, example) => {
    const e = exampleExtent(example);
    // A driven design can be a long road: the camera follows the car along it.
    expect(e.w).toBeLessThanOrEqual(driven(example) ? 2600 : 640);
    expect(e.h).toBeLessThanOrEqual(520);
    expect(e.w).toBeGreaterThan(200);
  });

  it.each(each)('%s is centred in the free area it is loaded into', (_id, example) => {
    const e = extentOf(placeExample(example, AREA).objects);
    if (e.w > AREA.w) return; // wider than the screen: pinned to the left instead (tested below)
    expect((e.minX + e.maxX) / 2).toBeCloseTo(AREA.x + AREA.w / 2, 3);
    expect((e.minY + e.maxY) / 2).toBeCloseTo(AREA.y + AREA.h / 2, 3);
  });

  it.each(each)('%s is pinned to the top-left when the screen is too small', (_id, example) => {
    const tiny = { x: 80, y: 70, w: 100, h: 60 };
    const e = extentOf(placeExample(example, tiny).objects);
    expect(e.minX).toBeCloseTo(tiny.x, 3);
    expect(e.minY).toBeCloseTo(tiny.y, 3);
  });

  it.each(each)('%s survives export and import unchanged', (_id, example) => {
    const scene = example.build();
    const file = JSON.parse(JSON.stringify(serializeScene(scene.objects, scene.joints)));
    const rebuilt = deserializeScene(file);
    expect(rebuilt.objects.map((o) => o.type)).toEqual(scene.objects.map((o) => o.type));
    expect(rebuilt.objects.map((o) => o.locked)).toEqual(scene.objects.map((o) => o.locked));
    expect(rebuilt.objects.map((o) => o.material)).toEqual(scene.objects.map((o) => o.material));
    expect(rebuilt.objects.map((o) => o.motor)).toEqual(scene.objects.map((o) => o.motor));
    expect(rebuilt.joints.length).toBe(scene.joints.length);
  });
});

describe('every example solves itself when you press Play', () => {
  // Matter's runner always steps physics at a fixed 1/60 s; the other rates are a safety margin.
  it.each(each)('%s reaches its goal', (_id, example) => {
    const s = simulate(example);
    expect(s, 'goal reached').not.toBeNull();
    expect(s!).toBeGreaterThan(0.4); // not instant: there is something to watch
    expect(s!).toBeLessThan(driven(example) ? 14 : 8); // and nobody waits long
  });

  it.each(each)('%s is not fragile to the step size', (_id, example) => {
    for (const deltaMs of [1000 / 120, 1000 / 30]) {
      expect(simulate(example, { deltaMs }), `${Math.round(1000 / deltaMs)} Hz`).not.toBeNull();
    }
  });

  it.each(EXAMPLES.filter(driven).map((e) => [e.id, e] as const))(
    '%s does not solve itself without the drive keys',
    (_id, example) => {
      expect(simulate(example, { drive: 0, limitSeconds: 15 }), 'goal reached without driving').toBeNull();
    },
  );

  it('does not solve itself with the locked parts removed', () => {
    // sanity check that the goal check is meaningful: without the slide the ball just falls
    const example = EXAMPLES[0];
    const objects = placeExample(example, AREA).objects.filter((o) => !o.locked);
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
    const { objects } = placeExample(funnel, AREA);
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
  const setAll = (m: Material, types: string[]) => (scene: LoadedScene) =>
    scene.objects.filter((o) => types.includes(o.type)).forEach((o) => applyMaterial(o, m));

  function play(id: string, tweak?: (scene: LoadedScene) => void): number | null {
    return simulate(EXAMPLES.find((e) => e.id === id)!, { tweak, limitSeconds: 25 });
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
    const spin = (value: number) => (scene: LoadedScene) =>
      scene.objects.filter((o: SceneObject) => o.type === 'ball').forEach((b) => (b.spin = value));
    const forward = play('first-slide')!;
    expect(play('first-slide', spin(0))!).toBeGreaterThan(forward);
    expect(play('first-slide', spin(-7))!).toBeGreaterThan(forward);
  });
});

describe('the examples folder', () => {
  // The raw text of every file, exactly as the Import button would receive it.
  const RAW = import.meta.glob('../examples/*.json', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;
  const files = Object.entries(RAW).map(([path, text]) => ({ name: path.split('/').pop()!, text }));
  const parsed = files.map((f) => ({ name: f.name, file: JSON.parse(f.text) }));
  const idOf = (name: string) => name.replace(/\.json$/, '');

  it('is picked up completely, with nothing silently skipped', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(EXAMPLES.map((e) => e.id).sort()).toEqual(files.map((f) => idOf(f.name)).sort());
  });

  it('contains valid scene files that the Import button accepts', () => {
    for (const { name, file } of parsed) {
      expect(file.app, name).toBe('free-world-2d');
      expect(file.version, name).toBe(1);
      expect(() => deserializeScene(file), name).not.toThrow();
      expect(deserializeScene(file).objects.length, name).toBeGreaterThan(1);
    }
  });

  it('gives every design a title, description, tip and order', () => {
    for (const { name, file } of parsed) {
      expect(file.meta?.title, name + ' title').toBeTruthy();
      expect(file.meta?.description, name + ' description').toBeTruthy();
      expect(file.meta?.tip, name + ' tip').toBeTruthy();
      expect(typeof file.meta?.order, name + ' order').toBe('number');
    }
  });

  it('gives every design its own position in the gallery, in that order', () => {
    const orders = parsed.map((p) => p.file.meta.order as number);
    expect(new Set(orders).size).toBe(orders.length);
    const byId = new Map(parsed.map((p) => [idOf(p.name), p.file.meta.order as number]));
    const listed = EXAMPLES.map((e) => byId.get(e.id)!);
    expect(listed).toEqual([...listed].sort((a, b) => a - b));
  });
});
