import { Composite, Engine } from 'matter-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SIZE, DEMO_SPIN, demoLayout, type Rect } from './demoLayout';
import {
  applyInitialSpin,
  createBall,
  createGoal,
  createPlank,
  installSurfaceRules,
  setLocked,
  watchGoals,
} from './scene';

beforeAll(() => installSurfaceRules());

/**
 * Builds the demo scene exactly as the demo does and returns the step at which the goal lights up.
 * `deltaMs` is the physics step: browsers run Matter at a variable step that follows the frame rate.
 */
function stepsUntilGoal(area: Rect, spin: number, limit = 900, deltaMs: number | (() => number) = 1000 / 60): number | null {
  const layout = demoLayout(area);
  const plank = createPlank(layout.plank.from, layout.plank.to)!;
  setLocked(plank, true);
  const ball = createBall(layout.ball.x, layout.ball.y);
  ball.spin = spin;
  const goal = createGoal(layout.goal.x, layout.goal.y);
  const objects = [plank, ball, goal];

  const engine = Engine.create();
  watchGoals(engine, () => objects);
  for (const o of objects) Composite.add(engine.world, o.bodies);
  applyInitialSpin(ball);

  for (let i = 1; i <= limit; i++) {
    Engine.update(engine, typeof deltaMs === 'function' ? deltaMs() : deltaMs);
    if (goal.reached) return i;
  }
  return null;
}

const DESKTOP: Rect = { x: 90, y: 90, w: 1000, h: 560 };
const PHONE: Rect = { x: 82, y: 76, w: 281, h: 560 };

describe('demo layout', () => {
  it('centres the scene in the free area', () => {
    const l = demoLayout(DESKTOP);
    const left = Math.min(l.plank.from.x, l.goal.x - 70);
    expect(left).toBeGreaterThanOrEqual(DESKTOP.x);
    expect(l.goal.x + 70).toBeLessThanOrEqual(DESKTOP.x + DESKTOP.w);
    expect(l.ball.y - 30).toBeGreaterThanOrEqual(DESKTOP.y);
    expect(l.goal.y + 45).toBeLessThanOrEqual(DESKTOP.y + DESKTOP.h);
  });

  it('fits inside a phone-sized free area', () => {
    const l = demoLayout(PHONE);
    expect(l.plank.from.x).toBeGreaterThanOrEqual(PHONE.x);
    expect(l.goal.x + 70).toBeLessThanOrEqual(PHONE.x + PHONE.w + 1);
    expect(DEMO_SIZE.w).toBeLessThanOrEqual(PHONE.w);
  });

  it('does not depend on where on screen it is placed', () => {
    const a = demoLayout(DESKTOP);
    const b = demoLayout({ ...DESKTOP, x: DESKTOP.x + 37, y: DESKTOP.y + 11 });
    expect(b.ball.x - a.ball.x).toBeCloseTo(b.goal.x - a.goal.x);
    expect(b.ball.y - a.ball.y).toBeCloseTo(b.goal.y - a.goal.y);
  });
});

describe('demo physics', () => {
  it('rolls the ball into the goal with the demo spin', () => {
    const steps = stepsUntilGoal(DESKTOP, DEMO_SPIN);
    expect(steps).not.toBeNull();
    // long enough to watch, short enough not to bore
    expect(steps!).toBeGreaterThan(40);
    expect(steps!).toBeLessThan(500);
  });

  it('still reaches the goal if the dragged spin comes out a bit off', () => {
    for (const spin of [3, 5, 7, 9, 11, 14]) {
      expect(stepsUntilGoal(DESKTOP, spin), `spin ${spin}`).not.toBeNull();
    }
  });

  it.each([
    ['120 fps', 1000 / 120],
    ['30 fps', 1000 / 30],
    ['a slow 20 fps', 1000 / 20],
  ])('still reaches the goal when the display runs at %s', (_name, delta) => {
    for (const spin of [3, 7, 11]) {
      expect(stepsUntilGoal(DESKTOP, spin, 2000, delta), `spin ${spin}`).not.toBeNull();
    }
  });

  it('still reaches the goal when frame times are uneven', () => {
    let seed = 12345;
    const jitter = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296; // small deterministic generator
      return 10 + (seed / 4294967296) * 30; // 10-40 ms per frame
    };
    for (const spin of [3, 7, 11]) {
      expect(stepsUntilGoal(DESKTOP, spin, 2000, jitter), `spin ${spin}`).not.toBeNull();
    }
  });

  it('works the same on a phone-sized layout', () => {
    expect(stepsUntilGoal(PHONE, DEMO_SPIN)).toBe(stepsUntilGoal(DESKTOP, DEMO_SPIN));
  });

  it('would not reach the goal if the plank were missing, so the goal check is meaningful', () => {
    const layout = demoLayout(DESKTOP);
    const ball = createBall(layout.ball.x, layout.ball.y);
    const goal = createGoal(layout.goal.x, layout.goal.y);
    const objects = [ball, goal];
    const engine = Engine.create();
    watchGoals(engine, () => objects);
    for (const o of objects) Composite.add(engine.world, o.bodies);
    for (let i = 0; i < 400; i++) Engine.update(engine, 1000 / 60);
    // with nothing to roll on, the ball simply falls straight down past the zone
    expect(goal.reached).toBe(false);
  });
});
