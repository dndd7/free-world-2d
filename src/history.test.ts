import { describe, expect, it } from 'vitest';
import { SceneHistory } from './history';

describe('SceneHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const h = new SceneHistory('a');
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it('walks back and forward through pushed states', () => {
    const h = new SceneHistory('a');
    h.push('b');
    h.push('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    expect(h.redo()).toBe('c');
    expect(h.redo()).toBeNull();
  });

  it('ignores a push identical to the current state', () => {
    const h = new SceneHistory('a');
    expect(h.push('a')).toBe(false);
    expect(h.canUndo).toBe(false);
    h.push('b');
    expect(h.push('b')).toBe(false);
    expect(h.undo()).toBe('a');
  });

  it('drops redo steps when a new change is made after undoing', () => {
    const h = new SceneHistory('a');
    h.push('b');
    h.push('c');
    h.undo();
    h.push('d');
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe('b');
  });

  it('keeps only the most recent states beyond the limit', () => {
    const h = new SceneHistory('s0', 3);
    h.push('s1');
    h.push('s2');
    h.push('s3');
    expect(h.undo()).toBe('s2');
    expect(h.undo()).toBe('s1');
    expect(h.undo()).toBeNull();
  });
});
