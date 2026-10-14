import { describe, expect, it } from 'vitest';
import { driveKey, followCamera, inputFromButtons } from './drive';

describe('drive input', () => {
  it('drives forward on right, reverses on left, and cancels when both or neither', () => {
    expect(inputFromButtons(false, true)).toBe(1);
    expect(inputFromButtons(true, false)).toBe(-1);
    expect(inputFromButtons(true, true)).toBe(0);
    expect(inputFromButtons(false, false)).toBe(0);
  });

  it('maps the arrow keys and A/D, by physical position', () => {
    expect(driveKey('ArrowRight')).toBe('right');
    expect(driveKey('KeyD')).toBe('right');
    expect(driveKey('ArrowLeft')).toBe('left');
    expect(driveKey('KeyA')).toBe('left');
  });

  it('ignores every other key so normal shortcuts keep working', () => {
    for (const code of ['Space', 'KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Delete', 'KeyZ', 'Escape']) {
      expect(driveKey(code), code).toBeNull();
    }
  });
});

describe('follow camera', () => {
  const W = 1000;
  const H = 600;

  it('stays put while the target is inside the comfortable zone', () => {
    const cam = { x: 0, y: 0 };
    expect(followCamera(cam, { x: 450, y: 300 }, W, H)).toEqual(cam);
  });

  it('does not jump when Play starts with the car anywhere on screen', () => {
    const cam = { x: 0, y: 0 };
    const next = followCamera(cam, { x: 200, y: 300 }, W, H); // left of the zone: eases, never snaps
    expect(next.x).toBeLessThanOrEqual(0);
    expect(Math.abs(next.x)).toBeLessThan(200);
  });

  it('moves right to keep up with a car driving off the right edge', () => {
    let cam = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) cam = followCamera(cam, { x: 3000, y: 300 }, W, H);
    expect(cam.x).toBeGreaterThan(2000);
    expect(3000 - cam.x).toBeLessThanOrEqual(W * 0.55 + 1);
    expect(3000 - cam.x).toBeGreaterThanOrEqual(W * 0.35 - 1);
  });

  it('follows up and down too', () => {
    let cam = { x: 0, y: 0 };
    for (let i = 0; i < 200; i++) cam = followCamera(cam, { x: 400, y: -900 }, W, H);
    expect(cam.y).toBeLessThan(-900 + H * 0.65 + 1);
    expect(cam.y).toBeLessThan(-500);
  });

  it('settles exactly on its target instead of creeping forever', () => {
    let cam = { x: 0, y: 0 };
    for (let i = 0; i < 400; i++) cam = followCamera(cam, { x: 2000, y: 300 }, W, H);
    const again = followCamera(cam, { x: 2000, y: 300 }, W, H);
    expect(again).toEqual(cam);
  });
});
