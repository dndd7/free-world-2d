export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Footprint of the demo scene in pixels. Physics is not scale-invariant, so it never shrinks. */
export const DEMO_SIZE = { w: 280, h: 300 };

/** Spin (radians per second) the demo gives the ball by dragging its handle. */
export const DEMO_SPIN = 7;

export interface DemoLayout {
  plank: { from: Pt; to: Pt };
  ball: Pt;
  goal: Pt;
}

/**
 * Where the demo puts things, centred in the free part of the screen (the area not
 * covered by the tool palette, the top-right panel or the caption).
 */
export function demoLayout(area: Rect): DemoLayout {
  const ox = area.x + Math.max(0, (area.w - DEMO_SIZE.w) / 2);
  const oy = area.y + Math.max(0, (area.h - DEMO_SIZE.h) / 2);
  const at = (x: number, y: number): Pt => ({ x: ox + x, y: oy + y });

  // A slide down to the right; the goal sits below its end so the ball rolls the whole
  // slide, drops off the end and lands in the zone.
  return {
    plank: { from: at(0, 100), to: at(190, 180) },
    ball: at(66, 84),
    goal: at(210, 250),
  };
}
