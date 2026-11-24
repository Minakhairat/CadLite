import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { solveLines, L, Con } from './solver-core';
const near = (a: number, b: number, tol: number, m: string) => { if (Math.abs(a - b) > tol) { console.error('FAIL', m, a, b); process.exit(1); } console.log('ok', m, a.toFixed(4)); };
const w = (await make_gcs_wrapper()) as any;
const P = (x: number, y: number) => ({ x, y });
// 1) a tilted line made horizontal
{ const l: L = { a: P(0, 0), b: P(10, 3) }; solveLines(w, [l], [{ k: 'h', l }]); near(l.a.y, l.b.y, 1e-6, 'horizontal: end points share y'); }
// 2) a tilted line made vertical, joined chain stays joined
{ const l1: L = { a: P(0, 0), b: P(10, 3) }, l2: L = { a: P(10, 3), b: P(20, 0) }; solveLines(w, [l1, l2], [{ k: 'v', l: l1 }]); near(l1.a.x, l1.b.x, 1e-6, 'vertical'); near(l2.a.x, l1.b.x, 1e-6, 'joined end point still shared'); near(l2.a.y, l1.b.y, 1e-6, 'joined end point still shared (y)'); }
// 3) perpendicular + equal length turn a skewed 3 line chain into a square corner pair
{ const a: L = { a: P(0, 0), b: P(10, 1) }, b: L = { a: P(10, 1), b: P(11, 12) };
  solveLines(w, [a, b], [{ k: 'perp', l: a, m: b }]);
  const d1 = [a.b.x - a.a.x, a.b.y - a.a.y], d2 = [b.b.x - b.a.x, b.b.y - b.a.y]; near(d1[0] * d2[0] + d1[1] * d2[1], 0, 1e-6, 'perpendicular: dot product zero');
  solveLines(w, [a, b], [{ k: 'eq', l: a, m: b }]); near(Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y), Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), 1e-6, 'equal length'); }
// 4) parallel
{ const a: L = { a: P(0, 0), b: P(10, 0) }, b: L = { a: P(0, 5), b: P(10, 9) }; solveLines(w, [a, b], [{ k: 'par', l: a, m: b }]); near((a.b.x - a.a.x) * (b.b.y - b.a.y) - (a.b.y - a.a.y) * (b.b.x - b.a.x), 0, 1e-6, 'parallel: cross product zero'); }
// 5) conflicting constraints are reported
{ const a: L = { a: P(0, 0), b: P(10, 0) }; let t = false; try { solveLines(w, [a], [{ k: 'h', l: a }, { k: 'v', l: a }]); } catch { t = true; } if (!t) { console.error('FAIL conflict not reported'); process.exit(1); } console.log('ok horizontal + vertical on one line is reported as a conflict'); }
// 6) a driving length together with horizontal
{ const l: L = { a: P(0, 0), b: P(10, 3) }; solveLines(w, [l], [{ k: 'h', l }, { k: 'len', l, v: 25 }]); near(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y), 25, 1e-6, 'length 25 and horizontal'); near(l.a.y, l.b.y, 1e-6, 'still horizontal'); }
// 7) Fix pins a line while its neighbour moves with a driving length
{ const a: L = { a: P(0, 0), b: P(10, 0) }, b: L = { a: P(10, 0), b: P(15, 5) }; solveLines(w, [a, b], [{ k: 'fix', l: a }, { k: 'len', l: b, v: 20 }, { k: 'v', l: b }]); near(a.a.x, 0, 1e-9, 'fixed line start x'); near(a.b.x, 10, 1e-9, 'fixed line end x'); near(b.a.x, 10, 1e-6, 'neighbour still joined'); near(Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y), 20, 1e-6, 'neighbour length 20'); near(b.b.x, 10, 1e-6, 'neighbour vertical'); }
