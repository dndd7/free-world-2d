import {
  deserializeScene,
  translateObject,
  unionBounds,
  type LoadedScene,
  type SceneFile,
  type SceneObject,
} from './scene';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  /** What to try changing once it works. */
  tip: string;
  /** 'drive' for designs that need the drive keys held to reach their goal. */
  controls?: 'drive';
  /** A fresh copy of the design each time, ready to be placed on screen. */
  build(): LoadedScene;
}

/**
 * Every file in /examples is a normal scene file (the same format as Export and Import)
 * with an optional `meta` block (title, description, tip, order). Drop a new file in that
 * folder and it appears in the gallery. They are bundled at build time.
 */
const FILES = import.meta.glob('../examples/*.json', { eager: true, import: 'default' }) as Record<string, SceneFile>;

function toExample(path: string, file: SceneFile): Example | null {
  const id = path.split('/').pop()!.replace(/\.json$/, '');
  try {
    deserializeScene(file); // reject a broken file here, once, instead of when someone clicks it
  } catch (err) {
    console.warn(`Skipping example "${id}": ${err instanceof Error ? err.message : err}`);
    return null;
  }
  return {
    id,
    title: file.meta?.title ?? id,
    blurb: file.meta?.description ?? '',
    tip: file.meta?.tip ?? '',
    controls: file.meta?.controls,
    build: () => deserializeScene(file),
  };
}

export const EXAMPLES: Example[] = Object.entries(FILES)
  .map(([path, file]) => ({ example: toExample(path, file), order: file.meta?.order ?? Number.MAX_SAFE_INTEGER }))
  .filter((e): e is { example: Example; order: number } => e.example !== null)
  .sort((a, b) => a.order - b.order || a.example.id.localeCompare(b.example.id))
  .map((e) => e.example);

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
): LoadedScene {
  const scene = example.build();
  const e = extentOf(scene.objects);
  const dx = area.x + Math.max(0, (area.w - e.w) / 2) - e.minX;
  const dy = area.y + Math.max(0, (area.h - e.h) / 2) - e.minY;
  for (const obj of scene.objects) translateObject(obj, dx, dy); // pins follow their bodies
  return scene;
}

/** How big a design is, without keeping it around. */
export function exampleExtent(example: Example): Extent {
  return extentOf(example.build().objects);
}
