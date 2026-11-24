// Pure 2D sketch transforms (Move / Copy / Rotate / Mirror / Offset). No DOM, no solver.
import { Entity, P, circle3 } from './geometry';

export type Tf = (p: P) => P;
export const moveTf = (dx: number, dy: number): Tf => (p) => ({ x: p.x + dx, y: p.y + dy });
/** Rotate counter-clockwise by deg degrees about c. */
export const rotateTf = (c: P, deg: number): Tf => { const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a); return (p) => ({ x: c.x + (p.x - c.x) * co - (p.y - c.y) * si, y: c.y + (p.x - c.x) * si + (p.y - c.y) * co }); };
/** Reflect across the line through p and q. */
export const mirrorTf = (p: P, q: P): Tf => { const dx = q.x - p.x, dy = q.y - p.y, L2 = dx * dx + dy * dy; return (v) => { const t = ((v.x - p.x) * dx + (v.y - p.y) * dy) / L2; const fx = p.x + t * dx, fy = p.y + t * dy; return { x: 2 * fx - v.x, y: 2 * fy - v.y }; }; };

const aligned = (a: P, b: P) => Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;

/** A transformed copy of one entity. A rectangle that stops being axis-aligned becomes a 4-point polygon. */
export function transformEntity(e: Entity, f: Tf): Entity {
  switch (e.t) {
    case 'line': return { t: 'line', a: f(e.a), b: f(e.b) };
    case 'arc': return { t: 'arc', a: f(e.a), b: f(e.b), m: f(e.m) };
    case 'circle': return { t: 'circle', c: f(e.c), r: e.r };
    case 'poly': return { t: 'poly', pts: e.pts.map(f), ...(e.segs ? { segs: e.segs.map((s) => ({ a: f(s.a), b: f(s.b), ...(s.m ? { m: f(s.m) } : {}) })) } : {}) };
    case 'rect': {
      const c = [{ x: e.a.x, y: e.a.y }, { x: e.b.x, y: e.a.y }, { x: e.b.x, y: e.b.y }, { x: e.a.x, y: e.b.y }].map(f);
      if (c.every((p, i) => aligned(p, c[(i + 1) % 4]))) return { t: 'rect', a: c[0], b: c[2] };
      return { t: 'poly', pts: c };
    }
  }
}

/** Offset one entity by d (mm). d > 0 moves away from a circle/arc centre and outward on a rectangle, and to the left of a line a -> b. Returns null when it cannot be offset. */
export function offsetEntity(e: Entity, d: number): Entity | null {
  if (e.t === 'line') { const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = Math.hypot(dx, dy); if (L < 1e-9) return null; const nx = (-dy / L) * d, ny = (dx / L) * d; return { t: 'line', a: { x: e.a.x + nx, y: e.a.y + ny }, b: { x: e.b.x + nx, y: e.b.y + ny } }; }
  if (e.t === 'circle') return e.r + d > 1e-9 ? { t: 'circle', c: { ...e.c }, r: e.r + d } : null;
  if (e.t === 'arc') { const c = circle3(e.a, e.b, e.m); if (!c || c.r + d <= 1e-9) return null; const k = (c.r + d) / c.r; const sc = (p: P): P => ({ x: c.c.x + (p.x - c.c.x) * k, y: c.c.y + (p.y - c.c.y) * k }); return { t: 'arc', a: sc(e.a), b: sc(e.b), m: sc(e.m) }; }
  if (e.t === 'rect') { const x0 = Math.min(e.a.x, e.b.x) - d, x1 = Math.max(e.a.x, e.b.x) + d, y0 = Math.min(e.a.y, e.b.y) - d, y1 = Math.max(e.a.y, e.b.y) + d; return x1 - x0 > 1e-9 && y1 - y0 > 1e-9 ? { t: 'rect', a: { x: x0, y: y0 }, b: { x: x1, y: y1 } } : null; }
  return null; // polygons: not supported yet
}

/** Uniform scale by k about c (k > 0). Circle radius scales too; a rectangle stays axis-aligned. */
export const scaleTf = (c: P, k: number): Tf => (p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k });
export function scaleEntity(e: Entity, c: P, k: number): Entity | null {
  if (!(k > 1e-9) || !Number.isFinite(k)) return null;
  const r = transformEntity(e, scaleTf(c, k));
  return r.t === 'circle' ? { ...r, r: e.t === 'circle' ? e.r * k : r.r } : r;
}

export type Win = { x0: number; y0: number; x1: number; y1: number };
const inWin = (w: Win, p: P) => p.x >= Math.min(w.x0, w.x1) - 1e-9 && p.x <= Math.max(w.x0, w.x1) + 1e-9 && p.y >= Math.min(w.y0, w.y1) - 1e-9 && p.y <= Math.max(w.y0, w.y1) + 1e-9;
/** Stretch: points inside the window move by (dx, dy), points outside stay. Returns the entity (same object when nothing is inside), or null when a part of an arc would be cut by the window (not supported). */
export function stretchEntity(e: Entity, w: Win, dx: number, dy: number): Entity | null {
  const f: Tf = (p) => (inWin(w, p) ? { x: p.x + dx, y: p.y + dy } : p);
  if (e.t === 'circle') return inWin(w, e.c) ? transformEntity(e, moveTf(dx, dy)) : e;
  if (e.t === 'arc') { const ia = inWin(w, e.a), ib = inWin(w, e.b); if (ia && ib) return transformEntity(e, moveTf(dx, dy)); return ia || ib ? null : e; }
  if (e.t === 'poly' && e.segs && e.segs.some((s) => s.m)) { const ins = e.pts.filter((p) => inWin(w, p)).length; return ins === 0 ? e : ins === e.pts.length ? transformEntity(e, moveTf(dx, dy)) : null; }
  const pts = e.t === 'line' ? [e.a, e.b] : e.t === 'rect' ? [e.a, e.b, { x: e.a.x, y: e.b.y }, { x: e.b.x, y: e.a.y }] : e.pts;
  return pts.some((p) => inWin(w, p)) ? transformEntity(e, f) : e;
}
