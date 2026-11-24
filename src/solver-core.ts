// 2D geometric constraints on sketch lines, solved with planegcs (FreeCAD's solver). The wrapper is injected so Node tests and the browser share this code.
import type { P } from './geometry';
export type L = { a: P; b: P };
export type Con = { k: 'h' | 'v' | 'par' | 'perp' | 'eq' | 'len' | 'fix' | 'coin' | 'tanlc' | 'tancc' | 'conc' | 'eqr' | 'rad' | 'tanla' | 'aconc' | 'aeqr' | 'col'; l: L; m?: L; v?: number };
export const LINE_KINDS: string[] = ['h', 'v', 'par', 'perp', 'eq', 'len', 'fix', 'coin', 'col'];
type W = { clear_data: () => void; push_primitives_and_params: (p: any[]) => void; solve: () => number; apply_solution: () => void; has_gcs_conflicting_constraints?: () => boolean; sketch_index: { get_primitives: () => any[] } };

/** Solve the constraints over all lines. Shared end points (same coordinates) stay joined. Writes the solution back into the lines. Throws when the constraints cannot all be met. */
export function solveLines(w: W, lines: L[], cons: Con[], tol = 1e-6): void {
  const pts: P[] = []; const key = (p: P) => { const i = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= tol); if (i >= 0) return i; pts.push({ x: p.x, y: p.y }); return pts.length - 1; };
  const ends = lines.map((l) => [key(l.a), key(l.b)]);
  const prims: any[] = pts.map((p, i) => ({ id: `p${i}`, type: 'point', x: p.x, y: p.y, fixed: false }));
  lines.forEach((_, i) => prims.push({ id: `l${i}`, type: 'line', p1_id: `p${ends[i][0]}`, p2_id: `p${ends[i][1]}` }));
  cons.forEach((c, n) => {
    if (!LINE_KINDS.includes(c.k)) return; // circle constraints are solved by circle-solver-core
    const i = lines.indexOf(c.l), j = c.m ? lines.indexOf(c.m) : -1; if (i < 0 || (c.m && j < 0)) return;
    const id = `c${n}`;
    if (c.k === 'coin') { const v = c.v ?? 0; const p1 = ends[i][v >> 1 & 1], p2 = ends[j][v & 1]; if (p1 !== p2) prims.push({ id, type: 'p2p_coincident', p1_id: `p${p1}`, p2_id: `p${p2}` }); return; } // v encodes which end of each line: bit1 = end of l, bit0 = end of m
    if (c.k === 'fix') { for (const q of ends[i]) prims[q].fixed = true; return; }
    if (c.k === 'col') { prims.push({ id: `${id}a`, type: 'point_on_line_pl', p_id: `p${ends[j][0]}`, l_id: `l${i}` }, { id: `${id}b`, type: 'point_on_line_pl', p_id: `p${ends[j][1]}`, l_id: `l${i}` }); return; }
    if (c.k === 'len') prims.push({ id, type: 'p2p_distance', p1_id: `p${ends[i][0]}`, p2_id: `p${ends[i][1]}`, distance: c.v });
    else if (c.k === 'h') prims.push({ id, type: 'horizontal_l', l_id: `l${i}` });
    else if (c.k === 'v') prims.push({ id, type: 'vertical_l', l_id: `l${i}` });
    else prims.push({ id, type: c.k === 'par' ? 'parallel' : c.k === 'perp' ? 'perpendicular_ll' : 'equal_length', l1_id: `l${i}`, l2_id: `l${j}` });
  });
  w.clear_data(); w.push_primitives_and_params(prims);
  const status = w.solve(); // 0 = success
  const bad = w.has_gcs_conflicting_constraints?.() ?? false;
  w.apply_solution();
  const out = w.sketch_index.get_primitives().filter((p: any) => p.type === 'point');
  const sol = pts.map((_, i) => out.find((p: any) => p.id === `p${i}`));
  if (status !== 0 || bad || sol.some((p) => !p || !isFinite(p.x) || !isFinite(p.y))) throw new Error('These constraints conflict or cannot all be satisfied together.');
  const len0 = lines.map((l) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y));
  const collapsed = lines.some((_, i) => len0[i] > 1e-6 && Math.hypot(sol[ends[i][1]].x - sol[ends[i][0]].x, sol[ends[i][1]].y - sol[ends[i][0]].y) < 1e-6);
  if (collapsed) throw new Error('These constraints would collapse a line to a point. Remove one of them.');
  lines.forEach((l, i) => { l.a = { x: sol[ends[i][0]].x, y: sol[ends[i][0]].y }; l.b = { x: sol[ends[i][1]].x, y: sol[ends[i][1]].y }; });
}
