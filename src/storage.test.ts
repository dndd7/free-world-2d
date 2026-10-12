import { describe, expect, it } from 'vitest';
import { loadSavedScene, saveScene } from './storage';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('scene storage', () => {
  it('returns nothing before anything is saved', () => {
    expect(loadSavedScene(memoryStore())).toBeNull();
  });

  it('loads back exactly what was saved', () => {
    const store = memoryStore();
    expect(saveScene('{"hello":1}', store)).toBe(true);
    expect(loadSavedScene(store)).toBe('{"hello":1}');
  });

  it('overwrites the previous save', () => {
    const store = memoryStore();
    saveScene('one', store);
    saveScene('two', store);
    expect(loadSavedScene(store)).toBe('two');
  });

  it('reports failure instead of throwing when the browser refuses to save', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    expect(saveScene('x', full)).toBe(false);
  });

  it('copes with storage being unavailable', () => {
    expect(saveScene('x', null)).toBe(false);
    expect(loadSavedScene(null)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(loadSavedScene(broken)).toBeNull();
  });
});
