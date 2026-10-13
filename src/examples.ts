import {
  applyMaterial,
  createBall,
  createBox,
  createGoal,
  createPlank,
  createTrack,
  rotateObject,
  setLocked,
  translateObject,
  unionBounds,
  type Material,
  type Point,
  type SceneObject,
} from './scene';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  /** What to try changing once it works. */
  tip: string;
  /** Builds the design; where it sits is decided when it is placed on screen. */
  build(): SceneObject[];
}

// ---- Small helpers so each design reads like a drawing -------------------------

const BALL_RADIUS = 30;
const PLANK_HALF = 7;

function plank(from: Point, to: Point, material: Material = 'normal'): SceneObject {
  const p = createPlank(from, to)!;
  if (material !== 'normal') applyMaterial(p, material);
  setLocked(p, true);
  return p;
}

/** Centre of a ball resting on the top of a plank, `t` (0..1) of the way along it. */
function restOn(from: Point, to: Point, t: number, radius = BALL_RADIUS): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const lift = PLANK_HALF + radius + 1;
  // The up-facing normal of a plank drawn left to right is (dy, -dx) / len.
  const sign = dx >= 0 ? 1 : -1;
  return {
    x: from.x + dx * t + ((sign * dy) / len) * lift,
    y: from.y + dy * t + ((-sign * dx) / len) * lift,
  };
}

function ball(at: Point, spin = 0, material: Material = 'normal'): SceneObject {
  const b = createBall(at.x, at.y);
  b.spin = spin;
  if (material !== 'normal') applyMaterial(b, material);
  return b;
}

function box(at: Point, material: Material = 'normal'): SceneObject {
  const b = createBox(at.x, at.y);
  if (material !== 'normal') applyMaterial(b, material);
  return b;
}

/** A locked, turned box used as a peg. */
function peg(at: Point, turns = Math.PI / 4): SceneObject {
  const b = createBox(at.x, at.y);
  rotateObject(b, turns);
  setLocked(b, true);
  return b;
}

// ---- The designs ---------------------------------------------------------------

export const EXAMPLES: Example[] = [
  {
    id: 'first-slide',
    title: 'First slide',
    blurb: 'A spinning ball rolls down a locked slide and drops into the goal.',
    tip: 'Give the ball no spin, or spin it the other way: it takes noticeably longer to reach the goal.',
    build() {
      const from = { x: 10, y: 80 };
      const to = { x: 280, y: 190 };
      return [plank(from, to), ball(restOn(from, to, 0.12), 7), createGoal(320, 280)];
    },
  },
  {
    id: 'zig-zag',
    title: 'Zig-zag',
    blurb: 'Two opposing slides send a ball one way, then back the other, into the goal.',
    tip: 'Change a slide’s surface to Ice or Sticky and see how the ball’s path changes.',
    build() {
      const a = { from: { x: 10, y: 30 }, to: { x: 290, y: 160 } };
      const b = { from: { x: 545, y: 175 }, to: { x: 190, y: 340 } };
      return [
        plank(a.from, a.to),
        plank(b.from, b.to),
        ball(restOn(a.from, a.to, 0.1), 6),
        createGoal(150, 420),
      ];
    },
  },
  {
    id: 'ice-run',
    title: 'Ice run',
    blurb: 'A box slides down an icy ramp and glides all the way into the goal.',
    tip: 'Set the box, ramp and floor all back to Normal and the box stops short. Ice on just one of them is enough to keep it sliding.',
    build() {
      const ramp = { from: { x: 10, y: 40 }, to: { x: 210, y: 120 } };
      return [
        plank(ramp.from, ramp.to, 'ice'),
        plank({ x: 205, y: 122 }, { x: 540, y: 122 }, 'ice'),
        box(restOn(ramp.from, ramp.to, 0.25, 35), 'ice'),
        createGoal(470, 70),
      ];
    },
  },
  {
    id: 'bounce-pad',
    title: 'Bounce pad',
    blurb: 'A ball drops onto a rubber pad and is flung across to the goal.',
    tip: 'Tilt the pad with the rotate buttons to change where the ball lands.',
    build() {
      return [
        plank({ x: 110, y: 360 }, { x: 250, y: 400 }, 'rubber'),
        ball({ x: 150, y: 30 }, 0, 'rubber'),
        createGoal(345, 385),
      ];
    },
  },
  {
    id: 'funnel',
    title: 'Funnel',
    blurb: 'Three balls fall into a funnel and are squeezed out into the goal.',
    tip: 'Widen the gap by moving one side, or add a box to jam it.',
    build() {
      return [
        plank({ x: 40, y: 130 }, { x: 205, y: 240 }),
        plank({ x: 500, y: 130 }, { x: 335, y: 240 }),
        ball({ x: 150, y: 40 }),
        ball({ x: 270, y: 20 }),
        ball({ x: 390, y: 40 }),
        createGoal(270, 350),
      ];
    },
  },
  {
    id: 'knock-down',
    title: 'Knock-down',
    blurb: 'A ball rolls down a ramp and crashes into a stack of icy boxes, sending them off the edge.',
    tip: 'Switch the boxes to Normal: the ball is no longer enough to push them off the edge.',
    build() {
      const ramp = { from: { x: 10, y: 20 }, to: { x: 180, y: 170 } };
      return [
        plank(ramp.from, ramp.to),
        plank({ x: 175, y: 172 }, { x: 400, y: 172 }),
        ball(restOn(ramp.from, ramp.to, 0.1), 8),
        box({ x: 320, y: 130 }, 'ice'),
        box({ x: 320, y: 60 }, 'ice'),
        createGoal(430, 310),
      ];
    },
  },
  {
    id: 'roller-coaster',
    title: 'Roller coaster',
    blurb: 'A hand-drawn track: the ball swoops down a hill, coasts over a bump and swoops down again into the goal.',
    tip: 'Switch the track to Ice for a faster ride, or draw your own with the Draw tool.',
    build() {
      // Smooth S-shaped drops with a small bump between them. The bump has to stay small:
      // a ball loses a lot of speed to air resistance and to every joint in the track.
      const smooth = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
      const pts: Point[] = [];
      for (let x = 0; x <= 540; x += 20) {
        let y: number;
        if (x <= 200) y = 75 + 110 * smooth(x / 200);
        else if (x <= 260) y = 185 - 14 * Math.sin((Math.PI * (x - 200)) / 60);
        else if (x <= 460) y = 185 + 110 * smooth((x - 260) / 200);
        else y = 295;
        pts.push({ x, y });
      }
      const track = createTrack(pts)!;
      setLocked(track, true);
      return [track, ball({ x: 40, y: 48 }, 8), createGoal(480, 250)];
    },
  },
  {
    id: 'peg-board',
    title: 'Peg board',
    blurb: 'A ball ricochets down through rows of pegs and into a funnel.',
    tip: 'Nudge a peg sideways to send the ball a different way.',
    build() {
      return [
        peg({ x: 100, y: 110 }),
        peg({ x: 280, y: 110 }),
        peg({ x: 460, y: 110 }),
        peg({ x: 190, y: 220 }),
        peg({ x: 370, y: 220 }),
        plank({ x: 30, y: 330 }, { x: 230, y: 395 }),
        plank({ x: 530, y: 330 }, { x: 330, y: 395 }),
        ball({ x: 270, y: 20 }),
        createGoal(280, 440),
      ];
    },
  },
];

export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

/** The smallest box that holds every object. */
export function extentOf(objects: SceneObject[]): Extent {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    const b = unionBounds(obj);
    minX = Math.min(minX, b.min.x);
    minY = Math.min(minY, b.min.y);
    maxX = Math.max(maxX, b.max.x);
    maxY = Math.max(maxY, b.max.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Builds an example and moves it to the middle of `area`. If the design is bigger than the
 * area it is pinned to the top-left instead, so the start of the action stays on screen.
 */
export function placeExample(
  example: Example,
  area: { x: number; y: number; w: number; h: number },
): SceneObject[] {
  const objects = example.build();
  const e = extentOf(objects);
  const dx = area.x + Math.max(0, (area.w - e.w) / 2) - e.minX;
  const dy = area.y + Math.max(0, (area.h - e.h) / 2) - e.minY;
  for (const obj of objects) translateObject(obj, dx, dy);
  return objects;
}

/** How big a design is, without keeping it around. */
export function exampleExtent(example: Example): Extent {
  return extentOf(example.build());
}
