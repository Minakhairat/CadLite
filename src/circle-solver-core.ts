// S2 step 1: constraints between circles and lines (tangent, concentric, equal radius, radius), solved with planegcs. Additive: the line-only solver is unchanged.
import type { P } from './geometry';
import type { L } from './solver-core';
export type C = { c: P; r: number };
export type CCon = { k: 'tanlc' | 'tancc' | 'conc' | 'eqr' | 'rad'; c: C; l?: L; d?: C; v?: number };
type W = { clear_data: () => void; push_primitives_and_params: (p: any[]) => void; solve: () => number; apply_solution: () => void; has_gcs_conflicting_constraints?: () => boolean; sketch_index: { get_primitives: () => any[] } };

/** Solve circle constraints. Each line end and circle centre is its own free point (no joining). Writes the solution back. Throws when the constraints cannot be met. */
export function solveCircles(w: W, lines: L[], circles: C[], cons: CCon[]): void {
  const prims: any[] = [];
  lines.forEach((l, i) => { prims.push({ id: `la${i}`, type: 'point', x: l.a.x, y: l.a.y, fixed: false }, { id: `lb${i}`, type: 'point', x: l.b.x, y: l.b.y, fixed: false }, { id: `l${i}`, type: 'line', p1_id: `la${i}`, p2_id: `lb${i}` }); });
  circles.forEach((c, i) => { prims.push({ id: `cc${i}`, type: 'point', x: c.c.x, y: c.c.y, fixed: false }, { id: `c${i}`, type: 'circle', c_id: `cc${i}`, radius: c.r }); });
  cons.forEach((k, n) => {
    const i = circles.indexOf(k.c), j = k.d ? circles.indexOf(k.d) : -1, li = k.l ? lines.indexOf(k.l) : -1;
    if (i < 0 || (k.d && j < 0) || (k.l && li < 0)) return;
    const id = `k${n}`;
    if (k.k === 'tanlc') prims.push({ id, type: 'tangent_lc', l_id: `l${li}`, c_id: `c${i}` });
    else if (k.k === 'tancc') prims.push({ id, type: 'tangent_cc', c1_id: `c${i}`, c2_id: `c${j}` });
    else if (k.k === 'conc') prims.push({ id, type: 'p2p_coincident', p1_id: `cc${i}`, p2_id: `cc${j}` });
    else if (k.k === 'eqr') prims.push({ id, type: 'equal_radius_cc', c1_id: `c${i}`, c2_id: `c${j}` });
    else prims.push({ id, type: 'circle_radius', c_id: `c${i}`, radius: k.v });
  });
  w.clear_data(); w.push_primitives_and_params(prims);
  const status = w.solve(); const bad = w.has_gcs_conflicting_constraints?.() ?? false; w.apply_solution();
  const out = w.sketch_index.get_primitives();
  const pt = (id: string) => out.find((p: any) => p.id === id), ci = (id: string) => out.find((p: any) => p.id === id);
  const ok = !(status !== 0 || bad) && circles.every((_, i) => { const p = pt(`cc${i}`), c = ci(`c${i}`); return p && c && isFinite(p.x) && isFinite(p.y) && isFinite(c.radius) && c.radius > 1e-6; }) && lines.every((_, i) => { const a = pt(`la${i}`), b = pt(`lb${i}`); return a && b && isFinite(a.x) && isFinite(b.x) && Math.hypot(b.x - a.x, b.y - a.y) > 1e-6; });
  if (!ok) throw new Error('These constraints conflict or cannot all be satisfied together.');
  lines.forEach((l, i) => { const a = pt(`la${i}`), b = pt(`lb${i}`); l.a = { x: a.x, y: a.y }; l.b = { x: b.x, y: b.y }; });
  circles.forEach((c, i) => { const p = pt(`cc${i}`); c.c = { x: p.x, y: p.y }; c.r = ci(`c${i}`).radius; });
}
