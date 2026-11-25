import { circle3, P } from './geometry';

type Arc = { a: P; b: P; m: P };
const TAU = 2 * Math.PI;
const norm = (x: number) => ((x % TAU) + TAU) % TAU;
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Round the corner where a line and an arc meet at p (p is an end point of both).
 * Finds the circle of radius r tangent to the line and to the arc's circle, touching both
 * inside the line and inside the arc, nearest to the corner. Returns the shortened line end,
 * the shortened arc and the fillet arc. Throws a readable message when no such circle exists.
 */
export function filletLineArc(p: P, lineFar: P, arc: Arc, r: number): { lineEnd: P; arc: Arc; fillet: Arc } {
  if (!(r > 0)) throw new Error('Fillet radius must be greater than 0.');
  const k = circle3(arc.a, arc.b, arc.m); if (!k) throw new Error('Arc is degenerate.');
  const atA = dist(arc.a, p) < 1e-6, atB = dist(arc.b, p) < 1e-6;
  if (!atA && !atB) throw new Error('The arc does not end at the corner.');
  const far = atA ? arc.b : arc.a;
  const L = dist(p, lineFar); if (L < 1e-9) throw new Error('Zero-length line.');
  const u = { x: (lineFar.x - p.x) / L, y: (lineFar.y - p.y) / L }, nrm = { x: -u.y, y: u.x };
  // arc span measured from the corner end
  const ccwFromA = norm(Math.atan2(arc.m.y - k.c.y, arc.m.x - k.c.x) - Math.atan2(arc.a.y - k.c.y, arc.a.x - k.c.x)) <= norm(Math.atan2(arc.b.y - k.c.y, arc.b.x - k.c.x) - Math.atan2(arc.a.y - k.c.y, arc.a.x - k.c.x));
  const angC = (q: P) => Math.atan2(q.y - k.c.y, q.x - k.c.x);
  const dirFromP = atA ? (ccwFromA ? 1 : -1) : (ccwFromA ? -1 : 1); // sign of angular travel from p toward the far end
  const span = norm(dirFromP * (angC(far) - angC(p)));
  type Cand = { F: P; t1: P; t2: P; s: number; d: number };
  const cands: Cand[] = [];
  for (const side of [1, -1]) {
    // centre lies on the line offset by r: F = p + u s + nrm side r
    for (const R2 of [k.r + r, Math.abs(k.r - r)]) {
      if (R2 < 1e-9) continue;
      const w = { x: p.x + nrm.x * side * r - k.c.x, y: p.y + nrm.y * side * r - k.c.y };
      const B = w.x * u.x + w.y * u.y, Cc = w.x * w.x + w.y * w.y - R2 * R2, disc = B * B - Cc;
      if (disc < 0) continue;
      for (const sg of [1, -1]) {
        const s = -B + sg * Math.sqrt(disc);
        const F = { x: p.x + u.x * s + nrm.x * side * r, y: p.y + u.y * s + nrm.y * side * r };
        if (s <= 1e-6 || s >= L - 1e-6) continue;
        const t1 = { x: p.x + u.x * s, y: p.y + u.y * s };
        const dc = dist(F, k.c); if (dc < 1e-9) continue;
        const t2 = { x: k.c.x + ((F.x - k.c.x) / dc) * k.r, y: k.c.y + ((F.y - k.c.y) / dc) * k.r };
        const along = norm(dirFromP * (angC(t2) - angC(p)));
        if (along <= 1e-6 || along >= span - 1e-6) continue;
        cands.push({ F, t1, t2, s, d: dist(F, p) });
      }
    }
  }
  if (!cands.length) throw new Error('No fillet of that radius fits between the line and the arc (try a smaller radius).');
  cands.sort((x, y) => x.d - y.d);
  const c = cands[0];
  // fillet arc a=t1, b=t2 through the middle of the short way round the fillet circle
  const a1 = Math.atan2(c.t1.y - c.F.y, c.t1.x - c.F.x), a2 = Math.atan2(c.t2.y - c.F.y, c.t2.x - c.F.x);
  let dlt = norm(a2 - a1); if (dlt > Math.PI) dlt -= TAU;
  const am = a1 + dlt / 2; const fm = { x: c.F.x + r * Math.cos(am), y: c.F.y + r * Math.sin(am) };
  // shortened arc from t2 to far end, mid point on that span
  const aT = angC(c.t2), sp = norm(dirFromP * (angC(far) - aT)); const amid = aT + dirFromP * (sp / 2);
  const mid = { x: k.c.x + k.r * Math.cos(amid), y: k.c.y + k.r * Math.sin(amid) };
  const newArc: Arc = atA ? { a: c.t2, b: arc.b, m: mid } : { a: arc.a, b: c.t2, m: mid };
  return { lineEnd: c.t1, arc: newArc, fillet: { a: c.t1, b: c.t2, m: fm } };
}
