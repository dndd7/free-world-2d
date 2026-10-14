import type { DriveInput, Point } from './scene';

// ---- Input ----------------------------------------------------------------------

/** Both pressed (or neither) cancel out; otherwise right is forward and left is reverse. */
export function inputFromButtons(left: boolean, right: boolean): DriveInput {
  if (left === right) return 0;
  return right ? 1 : -1;
}

/**
 * Arrow keys and A/D. Uses the physical key position (`code`) so it also works on
 * keyboard layouts where the letters sit somewhere else.
 */
export function driveKey(code: string): 'left' | 'right' | null {
  if (code === 'ArrowLeft' || code === 'KeyA') return 'left';
  if (code === 'ArrowRight' || code === 'KeyD') return 'right';
  return null;
}

/**
 * Reads the drive keys and the floating on-screen buttons. Listening only happens while
 * enabled (during Play with a motor in the scene), so the arrow keys keep their normal
 * behaviour the rest of the time.
 */
export class DriveControls {
  private readonly pad: HTMLElement;
  private readonly left = { key: false, pad: false };
  private readonly right = { key: false, pad: false };
  private enabled = false;

  constructor(pad: HTMLElement, leftButton: HTMLButtonElement, rightButton: HTMLButtonElement) {
    this.pad = pad;
    this.holdable(leftButton, this.left);
    this.holdable(rightButton, this.right);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** -1 reverse, 0 hold, 1 forward. */
  get input(): DriveInput {
    return inputFromButtons(this.left.key || this.left.pad, this.right.key || this.right.pad);
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.body.classList.add('driving');
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.body.classList.remove('driving');
    this.releaseAll();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const side = driveKey(e.code);
    if (!side) return;
    e.preventDefault(); // arrow keys would otherwise scroll the page
    this[side].key = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const side = driveKey(e.code);
    if (side) this[side].key = false;
  };

  private readonly releaseAll = (): void => {
    this.left.key = this.left.pad = false;
    this.right.key = this.right.pad = false;
  };

  /** A button that counts as held from touch-down until the finger lifts or is cancelled. */
  private holdable(button: HTMLButtonElement, side: { key: boolean; pad: boolean }): void {
    const release = () => {
      side.pad = false;
      button.classList.remove('held');
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        // without capture, leaving the button simply releases it
      }
      side.pad = true;
      button.classList.add('held');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on touch screens
    this.pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

// ---- Camera ---------------------------------------------------------------------

export interface View {
  x: number;
  y: number;
}

/**
 * Follows a target, but only once it leaves a comfortable zone of the screen, so the
 * view does not jump when Play starts. The car sits left of centre to show the road ahead.
 */
export function followCamera(cam: View, target: Point, viewW: number, viewH: number, smoothing = 0.15): View {
  const zone = { left: 0.35, right: 0.55, top: 0.3, bottom: 0.65 };
  const towards = (current: number, pos: number, lo: number, hi: number, size: number) => {
    if (pos < current + size * lo) return pos - size * lo;
    if (pos > current + size * hi) return pos - size * hi;
    return current;
  };
  const wantX = towards(cam.x, target.x, zone.left, zone.right, viewW);
  const wantY = towards(cam.y, target.y, zone.top, zone.bottom, viewH);
  const ease = (from: number, to: number) => (Math.abs(to - from) < 0.5 ? to : from + (to - from) * smoothing);
  return { x: ease(cam.x, wantX), y: ease(cam.y, wantY) };
}
