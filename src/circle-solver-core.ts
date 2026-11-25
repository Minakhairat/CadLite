// S2 step 1: constraints between circles and lines (tangent, concentric, equal radius, radius), solved with planegcs. Additive: the line-only solver is unchanged.
import type { P } from './geometry';
import type { L } from './solver-core';
export type C = { c: P; r: number };
export type CCon = { k: 'tanlc' | 'tancc' | 'conc' | 'eqr' | 'rad'; c: C; l?: L; d?: C; v?: number };
type W = { clear_data: () => void; push_primitives_and_params: (p: any[]) => void; solve: () => number; apply_solution: () => void; has_gcs_conflicting_constraints?: () => boolean; sketch_index: { get_primitives: () => any[] } };

/** Solve circle constraints. Lines are held fixed (their ends and joins never move); only circle centres and radii move. Writes the solution back. Throws when the constraints cannot be met. */
export function solveCircles(w: W, lines: L[], circles: C[], cons: CCon[]): void {
  const prims: any[] = [];
  lines.forEach((l, i) => { prims.push({ id: `la${i}`, type: 'point', x: l.a.x, y: l.a.y, fixed: true }, { id: `lb${i}`, type: 'point', x: l.b.x, y: l.b.y, fixed: true }, { id: `l${i}`, type: 'line', p1_id: `la${i}`, p2_id: `lb${i}` }); });
  circles.forEach((c, i) => { prims.push({ id: `cc${i}`, type: 'point', x: c.c.x, y: c.c.y, fixed: false }, { id: `c${i}`, type: 'circle', c_id: `cc${i}`, radius: c.r }); });
  // The second circle of the LAST constraint is the reference: its centre and radius stay (earlier constraints are still enforced, so a conflict is reported instead of silently moved).
  const lastD = cons.length ? cons[cons.length - 1].d : undefined; const refs = new Set<C>(lastD ? [lastD] : []);
  refs.forEach((r) => { const i = circles.indexOf(r); if (i >= 0) { prims.find((p) => p.id === `cc${i}`).fixed = true; prims.push({ id: `kr${i}`, type: 'circle_radius', c_id: `c${i}`, radius: r.r }); } });
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
  // Do not trust the solver's success flag alone: check each constraint on the result.
  const cur = (c: C) => { const i = circles.indexOf(c); const p = pt(`cc${i}`), q = ci(`c${i}`); return { x: p.x, y: p.y, r: q.radius }; };
  const unmet = cons.some((k) => { if (!circles.includes(k.c)) return false; const a = cur(k.c);
    if (k.k === 'rad') return Math.abs(a.r - (k.v as number)) > 1e-5 * Math.max(1, a.r);
    if (k.k === 'tanlc' && k.l) { const l = k.l, ll = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y); const d = Math.abs((l.b.x - l.a.x) * (l.a.y - a.y) - (l.a.x - a.x) * (l.b.y - l.a.y)) / ll; return Math.abs(d - a.r) > 1e-5 * Math.max(1, a.r); }
    if (k.d && circles.includes(k.d)) { const b = cur(k.d); const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (k.k === 'conc') return d > 1e-5; if (k.k === 'eqr') return Math.abs(a.r - b.r) > 1e-5 * Math.max(1, a.r);
      if (k.k === 'tancc') return Math.abs(d - (a.r + b.r)) > 1e-5 * Math.max(1, d) && Math.abs(d - Math.abs(a.r - b.r)) > 1e-5 * Math.max(1, d); }
    return false; });
  if (unmet) throw new Error('The solver could not satisfy these constraints together. Nothing changed.');
  lines.forEach((l, i) => { const a = pt(`la${i}`), b = pt(`lb${i}`); l.a = { x: a.x, y: a.y }; l.b = { x: b.x, y: b.y }; });
  circles.forEach((c, i) => { const p = pt(`cc${i}`); c.c = { x: p.x, y: p.y }; c.r = ci(`c${i}`).radius; });
}

const BUMPS = [[0.31, 0.17, 1.07, 0.05], [-0.43, 0.29, 0.9, -0.02], [0.11, -0.52, 1.2, 0.08]];
function buildPrims(lines: L[], circles: C[], cons: CCon[], bump = -1, dir = 0): any[] {
  const bd = BUMPS[dir % BUMPS.length];
  const prims: any[] = [];
  lines.forEach((l, i) => { prims.push({ id: `la${i}`, type: 'point', x: l.a.x, y: l.a.y, fixed: true }, { id: `lb${i}`, type: 'point', x: l.b.x, y: l.b.y, fixed: true }, { id: `l${i}`, type: 'line', p1_id: `la${i}`, p2_id: `lb${i}` }); });
  circles.forEach((c, i) => { const b = i === bump; prims.push({ id: `cc${i}`, type: 'point', x: c.c.x + (b ? bd[0] : 0), y: c.c.y + (b ? bd[1] : 0), fixed: false }, { id: `c${i}`, type: 'circle', c_id: `cc${i}`, radius: b ? Math.max(0.1, c.r * bd[2] + bd[3]) : c.r }); });
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
  return prims;
}
type DW = W & { gcs?: { dof?: () => number } };
/** Degrees of freedom left in the circles (centre x, y and radius each) under the circle constraints, with lines held fixed. Works on the numbers only, nothing is written back. -1 when the solver gives none or the constraints conflict. */
export function dofCircles(w: DW, lines: L[], circles: C[], cons: CCon[]): number {
  w.clear_data(); w.push_primitives_and_params(buildPrims(lines, circles, cons));
  const status = w.solve(); const bad = w.has_gcs_conflicting_constraints?.() ?? false;
  const dof = w.gcs?.dof?.(); return status === 0 && !bad && typeof dof === 'number' && isFinite(dof) ? dof : -1;
}
const solved = (w: DW, lines: L[], circles: C[], cons: CCon[], bump: number, dir = 0): { x: number; y: number; r: number }[] | null => {
  w.clear_data(); w.push_primitives_and_params(buildPrims(lines, circles, cons, bump, dir));
  const status = w.solve(); const bad = w.has_gcs_conflicting_constraints?.() ?? false; w.apply_solution(); if (status !== 0 || bad) return null;
  const out = w.sketch_index.get_primitives();
  const r = circles.map((_, i) => { const p = out.find((q: any) => q.id === `cc${i}`), c = out.find((q: any) => q.id === `c${i}`); return p && c ? { x: p.x, y: p.y, r: c.radius } : null; });
  return r.every((q) => q && isFinite(q.x) && isFinite(q.y) && isFinite(q.r)) ? (r as { x: number; y: number; r: number }[]) : null;
};
/** Per circle: true when the circle constraints already fix its centre and radius. Test: start that circle slightly off in three different directions and solve again; a circle that comes back to the same centre and radius every time is fixed, one that stays where it was pushed is not. The lines (and any circle not being tested) are held where they are, so this is NOT a whole-sketch proof: the lines themselves may still move. Works on the numbers only. */
export function circleFixedMarks(w: DW, lines: L[], circles: C[], cons: CCon[]): boolean[] {
  const ref = solved(w, lines, circles, cons, -1); if (!ref) return circles.map(() => false);
  return circles.map((_, i) => BUMPS.every((_b, d) => { const t = solved(w, lines, circles, cons, i, d); if (!t) return false; const s = Math.max(1, ref[i].r); return Math.hypot(t[i].x - ref[i].x, t[i].y - ref[i].y) < 1e-6 * s && Math.abs(t[i].r - ref[i].r) < 1e-6 * s; }));
}
