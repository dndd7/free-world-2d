const SCENE_KEY = 'free-world-2d:scene';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

// Reading `localStorage` itself can throw (blocked cookies, some private modes).
function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Saves the serialized scene. Returns false if the browser refused (full or unavailable). */
export function saveScene(json: string, store: Store | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(SCENE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function loadSavedScene(store: Store | null = defaultStore()): string | null {
  if (!store) return null;
  try {
    return store.getItem(SCENE_KEY);
  } catch {
    return null;
  }
}

const DEMO_SEEN_KEY = 'free-world-2d:demo-seen';

/**
 * Whether the first-visit demo prompt has already been handled. If the browser gives us
 * nowhere to remember it, report "seen" so we never nag on every visit.
 */
export function hasSeenDemo(store: Store | null = defaultStore()): boolean {
  if (!store) return true;
  try {
    return store.getItem(DEMO_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markDemoSeen(store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(DEMO_SEEN_KEY, '1');
  } catch {
    // nothing to do: the prompt may show again next visit
  }
}
