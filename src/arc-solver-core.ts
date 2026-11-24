// S2 step 3 (core only): tangent between a line and a three-point arc (a -> m -> b), solved with planegcs. The arc end points and the line are held fixed; only the arc's centre/radius (so its middle point m) change.
import type { P } from './geometry';
import type { L } from './solver-core';
export type Arc3 = { a: P; b: P; m: P };
export type ArcCon = { k: 'tanla'; arc: Arc3; l: L };
type _W = { clear_data: () => void; push_primitives_and_params: (p: any[]) => void; solve: () => number; apply_solution: () => void; has_gcs_conflicting_constraints?: () => boolean; sketch_index: { get_primitives: () => any[] } };

function centre3(a: P, b: P, m: P): { c: P; r: number } | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y)); if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y, m2 = m.x * m.x + m.y * m.y, b2 = b.x * b.x + b.y * b.y;
  const c = { x: (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d, y: (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d };
  return { c, r: Math.hypot(a.x - c.x, a.y - c.y) };
}

/** Tangent between a line (taken as the infinite line through it) and a three-point arc, solved exactly: the centre lies on the perpendicular bisector of a-b, so |dist(centre, line)| = r is a quadratic in the centre's offset t. Of the (up to two) solutions the one whose middle point is nearest the current one is used, and the arc keeps its side of the chord. Writes the new middle point; a and b never move. Throws when no tangent circle through a and b exists. (The planegcs wrapper argument is kept for the call shape; it was not reliable here: it reported success on non-tangent results.) */
export function solveArcs(_w: unknown, lines: L[], arcs: Arc3[], cons: ArcCon[]): void {
  const res = new Map<Arc3, P>();
  for (const c of cons) {
    if (!arcs.includes(c.arc) || !lines.includes(c.l)) continue;
    const arc = c.arc, l = c.l; const cl = res.get(arc) ?? arc.m;
    const ch = Math.hypot(arc.b.x - arc.a.x, arc.b.y - arc.a.y); if (ch < 1e-9) throw new Error('A selected arc is degenerate.');
    const ux = (arc.b.x - arc.a.x) / ch, uy = (arc.b.y - arc.a.y) / ch, nx = -uy, ny = ux, h = ch / 2, M = { x: (arc.a.x + arc.b.x) / 2, y: (arc.a.y + arc.b.y) / 2 };
    const ll = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y); if (ll < 1e-9) throw new Error('The line is degenerate.');
    const vx = -(l.b.y - l.a.y) / ll, vy = (l.b.x - l.a.x) / ll; // unit normal of the line
    const s0 = vx * (M.x - l.a.x) + vy * (M.y - l.a.y), g = vx * nx + vy * ny, A = g * g - 1, B = 2 * s0 * g, C = s0 * s0 - h * h;
    let ts: number[] = [];
    if (Math.abs(A) < 1e-12) { if (Math.abs(B) < 1e-12) throw new Error('This arc cannot be tangent to that line (the line is parallel to its chord and passes through its end points).'); ts = [-C / B]; }
    else { let D = B * B - 4 * A * C; if (D < -1e-9 * (B * B + Math.abs(4 * A * C) + 1)) throw new Error('This arc cannot be made tangent to that line while keeping its end points. Nothing changed.'); D = Math.max(0, D); ts = [(-B + Math.sqrt(D)) / (2 * A), (-B - Math.sqrt(D)) / (2 * A)]; }
    const sg = ((cl.x - M.x) * nx + (cl.y - M.y) * ny) >= 0 ? 1 : -1;
    let best: P | null = null, bd = Infinity;
    for (const t of ts) { const r = Math.hypot(h, t); const cx = M.x + t * nx, cy = M.y + t * ny; const mid = { x: cx + sg * r * nx, y: cy + sg * r * ny };
      const resid = Math.abs(Math.abs(vx * (cx - l.a.x) + vy * (cy - l.a.y)) - r); if (!(resid < 1e-6 * Math.max(1, r)) || !isFinite(mid.x) || !isFinite(mid.y) || r > 1e6) continue;
      const d = Math.hypot(mid.x - cl.x, mid.y - cl.y); if (d < bd) { bd = d; best = mid; } }
    if (!best) throw new Error('This arc cannot be made tangent to that line while keeping its end points. Nothing changed.');
    res.set(arc, best);
  }
  res.forEach((m, arc) => { arc.m = m; });
}
