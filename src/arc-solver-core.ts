// S2 step 3 (core only): tangent between a line and a three-point arc (a -> m -> b), solved with planegcs. The arc end points and the line are held fixed; only the arc's centre/radius (so its middle point m) change.
import type { P } from './geometry';
import type { L } from './solver-core';
export type Arc3 = { a: P; b: P; m: P };
export type ArcCon = { k: 'tanla'; arc: Arc3; l: L };
type W = { clear_data: () => void; push_primitives_and_params: (p: any[]) => void; solve: () => number; apply_solution: () => void; has_gcs_conflicting_constraints?: () => boolean; sketch_index: { get_primitives: () => any[] } };

function centre3(a: P, b: P, m: P): { c: P; r: number } | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y)); if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y, m2 = m.x * m.x + m.y * m.y, b2 = b.x * b.x + b.y * b.y;
  const c = { x: (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d, y: (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d };
  return { c, r: Math.hypot(a.x - c.x, a.y - c.y) };
}

/** Solve the arc constraints. Writes the new middle point back into each arc (a and b never move). Throws when it cannot be met. */
export function solveArcs(w: W, lines: L[], arcs: Arc3[], cons: ArcCon[]): void {
  const prims: any[] = []; const geo = arcs.map((k) => centre3(k.a, k.b, k.m)); if (geo.some((g) => !g)) throw new Error('A selected arc is degenerate.');
  const ccw = arcs.map((k) => (k.b.x - k.a.x) * (k.m.y - k.a.y) - (k.b.y - k.a.y) * (k.m.x - k.a.x) < 0); // a -> m -> b counter-clockwise? (m on the right of a->b)
  lines.forEach((l, i) => prims.push({ id: `la${i}`, type: 'point', x: l.a.x, y: l.a.y, fixed: true }, { id: `lb${i}`, type: 'point', x: l.b.x, y: l.b.y, fixed: true }, { id: `l${i}`, type: 'line', p1_id: `la${i}`, p2_id: `lb${i}` }));
  arcs.forEach((k, i) => {
    const g = geo[i]!; const s = ccw[i] ? k.a : k.b, e = ccw[i] ? k.b : k.a;
    prims.push({ id: `ac${i}`, type: 'point', x: g.c.x, y: g.c.y, fixed: false }, { id: `as${i}`, type: 'point', x: s.x, y: s.y, fixed: true }, { id: `ae${i}`, type: 'point', x: e.x, y: e.y, fixed: true },
      { id: `a${i}`, type: 'arc', c_id: `ac${i}`, start_id: `as${i}`, end_id: `ae${i}`, radius: g.r, start_angle: Math.atan2(s.y - g.c.y, s.x - g.c.x), end_angle: Math.atan2(e.y - g.c.y, e.x - g.c.x) });
  });
  cons.forEach((c, n) => { const i = arcs.indexOf(c.arc), j = lines.indexOf(c.l); if (i < 0 || j < 0) return; prims.push({ id: `k${n}`, type: 'tangent_la', l_id: `l${j}`, a_id: `a${i}` }); });
  w.clear_data(); w.push_primitives_and_params(prims);
  const status = w.solve(); const bad = w.has_gcs_conflicting_constraints?.() ?? false; w.apply_solution();
  const out = w.sketch_index.get_primitives(); const get = (id: string) => out.find((p: any) => p.id === id);
  const res = arcs.map((k, i) => { const c = get(`ac${i}`), ar = get(`a${i}`); if (!c || !ar || !isFinite(c.x) || !isFinite(c.y) || !isFinite(ar.radius) || ar.radius < 1e-6) return null;
    const s = ccw[i] ? k.a : k.b, e = ccw[i] ? k.b : k.a; let t0 = Math.atan2(s.y - c.y, s.x - c.x), t1 = Math.atan2(e.y - c.y, e.x - c.x); while (t1 <= t0) t1 += 2 * Math.PI;
    const tm = (t0 + t1) / 2; return { x: c.x + ar.radius * Math.cos(tm), y: c.y + ar.radius * Math.sin(tm) }; });
  if (status !== 0 || bad || res.some((r) => !r || !isFinite(r.x) || !isFinite(r.y))) throw new Error('These constraints conflict or cannot all be satisfied together.');
  arcs.forEach((k, i) => { k.m = res[i] as P; });
}
