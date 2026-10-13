import { DEMO_SPIN, demoLayout, type Pt, type Rect } from './demoLayout';

/** What the demo needs from the app. The demo itself only drives the real UI. */
export interface DemoHost {
  /** Stash the user's scene, empty the canvas and pause autosave/undo history. */
  begin(): void;
  /** Empty the canvas again (for Replay). */
  clear(): void;
  /** Put the user's scene back, or keep the demo scene (undoable). */
  end(keepDemo: boolean): void;
  hasUserWork(): boolean;
  /** Screen position of the selected ball's spin handle, if a ball is selected. */
  handlePosition(): Pt | null;
  goalReached(): boolean;
}

type Choice = 'keep' | 'back' | 'replay';

const POINTER_ID = 4242;
const HANDLE_RADIUS = 44; // ball radius (30) + handle offset (14), as drawn by the app
const NARROW = 820; // matches the CSS breakpoint where panels collapse to icons

function abortError(): DOMException {
  return new DOMException('Demo skipped', 'AbortError');
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Calls onFrame every animation frame for `ms`, with progress 0..1 and elapsed milliseconds. */
function animate(ms: number, signal: AbortSignal, onFrame: (t: number, elapsed: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (signal.aborted) return reject(abortError());
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / ms);
      onFrame(t, elapsed);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function waitFor(condition: () => boolean, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (condition()) return true;
    await sleep(60, signal);
  }
  return condition();
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function centerOf(el: Element): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function isShown(el: HTMLElement): boolean {
  return !el.hidden && el.getClientRects().length > 0;
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

class Stage {
  readonly canvas = byId<HTMLCanvasElement>('sim');
  private readonly shield = byId<HTMLDivElement>('demo-shield');
  private readonly cursor = byId<HTMLDivElement>('demo-cursor');
  private readonly caption = byId<HTMLDivElement>('demo-caption');
  private readonly stepEl = byId<HTMLSpanElement>('demo-step');
  private readonly textEl = byId<HTMLParagraphElement>('demo-text');
  private readonly skipBtn = byId<HTMLButtonElement>('demo-skip');
  private readonly choicesEl = byId<HTMLDivElement>('demo-choices');
  private readonly signal: AbortSignal;

  constructor(signal: AbortSignal, onSkip: () => void) {
    this.signal = signal;
    this.skipBtn.onclick = onSkip;
  }

  show(): void {
    document.body.classList.add('demo-active');
    for (const el of [this.shield, this.cursor, this.caption]) el.hidden = false;
    this.skipBtn.hidden = false;
    this.skipBtn.focus({ preventScroll: true });
  }

  hide(): void {
    document.body.classList.remove('demo-active');
    for (const el of [this.shield, this.cursor, this.caption, this.choicesEl]) el.hidden = true;
    this.choicesEl.replaceChildren();
    this.stepEl.textContent = '';
    this.textEl.textContent = '';
    this.skipBtn.onclick = null;
  }

  say(step: string, text: string): void {
    this.stepEl.textContent = step;
    this.textEl.textContent = text;
  }

  /** The part of the screen not covered by the palette, the top-right panel, or the caption/bottom bar. */
  freeArea(): Rect {
    const palette = byId('palette').getBoundingClientRect();
    const actions = byId('actions').getBoundingClientRect();
    const reserveBottom = window.innerWidth < NARROW ? 290 : 240;
    const x = palette.right + 16;
    const y = actions.bottom + 16;
    return { x, y, w: window.innerWidth - x - 12, h: Math.max(0, window.innerHeight - reserveBottom - y) };
  }

  async moveTo(p: Pt, ms: number): Promise<void> {
    this.cursor.style.transition = ms > 0 ? `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none';
    this.cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
    if (ms > 0) await sleep(ms + 40, this.signal);
  }

  private ripple(): void {
    this.cursor.classList.remove('click');
    void this.cursor.offsetWidth; // restart the animation
    this.cursor.classList.add('click');
  }

  /** Move the cursor to a real button, highlight it and click it. */
  async press(id: string): Promise<void> {
    const el = byId<HTMLButtonElement>(id);
    el.classList.add('demo-highlight');
    try {
      await this.moveTo(centerOf(el), 700);
      this.ripple();
      await sleep(200, this.signal);
      el.click();
      await sleep(300, this.signal);
    } finally {
      el.classList.remove('demo-highlight');
    }
  }

  private fire(type: 'pointerdown' | 'pointermove' | 'pointerup', p: Pt): void {
    this.canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: POINTER_ID,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: p.x,
        clientY: p.y,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  /** A single click on the canvas. */
  async clickCanvas(p: Pt): Promise<void> {
    await this.moveTo(p, 700);
    this.ripple();
    await sleep(160, this.signal);
    this.fire('pointerdown', p);
    this.fire('pointerup', p);
  }

  /** Press at `from`, drag along `path(t)` for `ms`, release at the end. */
  async drag(from: Pt, ms: number, path: (t: number, elapsed: number) => Pt): Promise<void> {
    await this.moveTo(from, 700);
    this.ripple();
    await sleep(160, this.signal);
    this.fire('pointerdown', from);
    let last = from;
    try {
      await animate(ms, this.signal, (t, elapsed) => {
        last = path(t, elapsed);
        this.cursor.style.transition = 'none';
        this.cursor.style.transform = `translate(${last.x}px, ${last.y}px)`;
        this.fire('pointermove', last);
      });
    } finally {
      this.fire('pointerup', last); // never leave the app thinking a drag is still in progress
    }
  }

  /** Show buttons in the caption and wait for one to be chosen. */
  choose(options: { id: Choice; label: string; primary?: boolean }[]): Promise<Choice> {
    this.skipBtn.hidden = true;
    this.choicesEl.hidden = false;
    this.choicesEl.replaceChildren();
    return new Promise((resolve, reject) => {
      if (this.signal.aborted) return reject(abortError());
      this.signal.addEventListener('abort', () => reject(abortError()), { once: true });
      options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = opt.primary ? 'demo-btn primary' : 'demo-btn';
        btn.textContent = opt.label;
        btn.onclick = () => resolve(opt.id);
        this.choicesEl.append(btn);
        if (i === 0) btn.focus({ preventScroll: true });
      });
    });
  }

  resetChoices(): void {
    this.choicesEl.hidden = true;
    this.choicesEl.replaceChildren();
    this.skipBtn.hidden = false;
  }
}

async function runOnce(stage: Stage, host: DemoHost, signal: AbortSignal): Promise<Choice> {
  const layout = demoLayout(stage.freeArea());
  const ballCenter = layout.ball;

  stage.resetChoices();
  await stage.moveTo({ x: layout.goal.x, y: layout.ball.y - 40 }, 0);

  stage.say('Welcome', "Let's build a slide that rolls a ball into a goal. This is the real app, so you can do every step yourself.");
  await sleep(3600, signal);

  stage.say('Step 1 of 6', 'Pick the Plank tool, then drag on the canvas to lay down a slide.');
  await stage.press('tool-plank');
  await stage.drag(layout.plank.from, 1000, (t) => lerp(layout.plank.from, layout.plank.to, ease(t)));
  await sleep(1500, signal);

  stage.say('Step 2 of 6', 'Lock it so it stays put when the physics starts. Right-clicking an object does the same.');
  await waitFor(() => isShown(byId('props-lock')), 2000, signal);
  await stage.press('props-lock');
  await sleep(1700, signal);

  stage.say('Step 3 of 6', 'Pick the Ball tool and click to drop a ball at the top of the slide.');
  await stage.press('tool-ball');
  await stage.clickCanvas(ballCenter);
  await sleep(1300, signal);

  stage.say('Step 4 of 6', 'Drag the blue handle around the ball to give it a spin. The arrow shows direction and speed.');
  await waitFor(() => host.handlePosition() !== null, 2000, signal);
  const handle = host.handlePosition();
  if (handle) {
    const start = Math.atan2(handle.y - ballCenter.y, handle.x - ballCenter.x);
    // Angle follows real elapsed time, so the spin the app measures matches DEMO_SPIN.
    await stage.drag(handle, 650, (_t, elapsed) => {
      const a = start + DEMO_SPIN * (elapsed / 1000);
      return { x: ballCenter.x + Math.cos(a) * HANDLE_RADIUS, y: ballCenter.y + Math.sin(a) * HANDLE_RADIUS };
    });
  }
  await sleep(1800, signal);

  stage.say('Step 5 of 6', 'Add a Goal zone where you want the ball to end up.');
  await stage.press('tool-goal');
  await stage.clickCanvas(layout.goal);
  await sleep(1400, signal);

  stage.say('Step 6 of 6', 'Press Play and real physics takes over.');
  await stage.press('play-btn');
  const reached = await waitFor(() => host.goalReached(), 10000, signal);
  stage.say(
    reached ? 'Goal reached!' : 'Playing',
    'Stop puts everything back where you left it, so you can tweak it and try again.',
  );
  await sleep(2800, signal);
  const playBtn = byId<HTMLButtonElement>('play-btn');
  if (playBtn.classList.contains('playing')) await stage.press('play-btn');
  await sleep(700, signal);

  const hasWork = host.hasUserWork();
  stage.say(
    "That's the loop",
    hasWork
      ? "Build, lock, spin, Play. Keep this scene and Undo brings your own back, or return to it now."
      : 'Build, lock, spin, Play. Surfaces, Undo, Grid and Export are up top; Help explains every button.',
  );
  return stage.choose([
    { id: 'keep', label: 'Keep this scene', primary: true },
    { id: 'back', label: hasWork ? 'Back to my scene' : 'Start fresh' },
    { id: 'replay', label: 'Replay' },
  ]);
}

/**
 * Plays the walkthrough on the real app. Resolves when the user finishes or skips it;
 * their own scene is put back unless they choose to keep the demo scene.
 */
export async function startDemo(host: DemoHost): Promise<void> {
  const controller = new AbortController();
  const stage = new Stage(controller.signal, () => controller.abort());
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') controller.abort();
  };
  const onResize = () => controller.abort(); // the scene is laid out for this window size
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  host.begin();
  stage.show();
  let keep = false;
  try {
    for (;;) {
      const choice = await runOnce(stage, host, controller.signal);
      if (choice === 'replay') {
        host.clear();
        continue;
      }
      keep = choice === 'keep';
      break;
    }
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
  } finally {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    stage.hide();
    host.end(keep);
  }
}
