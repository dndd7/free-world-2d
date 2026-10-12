/** Linear undo/redo over serialized scene states. */
export class SceneHistory {
  private states: string[];
  private index = 0;
  private readonly limit: number;

  constructor(initial: string, limit = 100) {
    this.states = [initial];
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  /** Records a new state, dropping any redo steps. Returns false if nothing changed. */
  push(state: string): boolean {
    if (state === this.states[this.index]) return false;
    this.states.length = this.index + 1;
    this.states.push(state);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
    return true;
  }

  undo(): string | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.states[this.index];
  }

  redo(): string | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.states[this.index];
  }
}
