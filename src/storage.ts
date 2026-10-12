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
