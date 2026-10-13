import { extentOf } from './examples';
import type { SceneObject } from './scene';

export const THUMB_W = 220;
export const THUMB_H = 130;
const PAD = 12;

/** Draws a small picture of a design, using each shape's own colours. */
export function drawThumbnail(canvas: HTMLCanvasElement, objects: SceneObject[]): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(THUMB_W * dpr);
  canvas.height = Math.round(THUMB_H * dpr);
  canvas.style.width = `${THUMB_W}px`;
  canvas.style.height = `${THUMB_H}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx || objects.length === 0) return;
  ctx.scale(dpr, dpr);

  const e = extentOf(objects);
  const scale = Math.min((THUMB_W - 2 * PAD) / e.w, (THUMB_H - 2 * PAD) / e.h);
  const offsetX = (THUMB_W - e.w * scale) / 2 - e.minX * scale;
  const offsetY = (THUMB_H - e.h * scale) / 2 - e.minY * scale;
  const px = (x: number) => x * scale + offsetX;
  const py = (y: number) => y * scale + offsetY;

  ctx.lineJoin = 'round';
  ctx.lineWidth = 1;
  // goals first so shapes sit on top of them
  const ordered = [...objects].sort((a, b) => Number(b.type === 'goal') - Number(a.type === 'goal'));
  for (const obj of ordered) {
    for (const body of obj.bodies) {
      ctx.fillStyle = body.render.fillStyle ?? '#888';
      ctx.strokeStyle = body.render.strokeStyle ?? 'transparent';
      ctx.beginPath();
      if (body.circleRadius) {
        ctx.arc(px(body.position.x), py(body.position.y), body.circleRadius * scale, 0, Math.PI * 2);
      } else {
        body.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(px(v.x), py(v.y)) : ctx.lineTo(px(v.x), py(v.y))));
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    }
  }
}
