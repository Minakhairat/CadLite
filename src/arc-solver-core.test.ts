import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { solveArcs, Arc3 } from './arc-solver-core';
import type { L } from './solver-core';
import { writeFileSync } from 'node:fs';
const log: string[] = []; let fails = 0;
const near = (a: number, b: number, tol: number, m: string) => { const ok = Math.abs(a - b) <= tol; log.push(`${ok ? 'PASS' : 'FAIL'} ${m} got=${a} want=${b}`); if (!ok) fails++; };
const w = (await make_gcs_wrapper()) as any; const P = (x: number, y: number) => ({ x, y });
// Arc through (0,0) and (10,0) with middle (5,5) (centre (5,0), r5). Line y=6. Hand calc: centre (5,k), r^2 = 25+k^2, 6-k = r => k = 11/12, r = 6-11/12 = 5.08333, top point (5,6).
{ const arc: Arc3 = { a: P(0, 0), b: P(10, 0), m: P(5, 5) }, l: L = { a: P(-5, 6), b: P(15, 6) }; solveArcs(w, [l], [arc], [{ k: 'tanla', arc, l }]);
  near(arc.m.x, 5, 1e-6, 'tangent arc: middle x'); near(arc.m.y, 6, 1e-4, 'tangent arc: middle y = 6 (touches the line)'); near(arc.a.x, 0, 1e-12, 'arc start unchanged'); near(arc.b.x, 10, 1e-12, 'arc end unchanged'); near(l.a.y, 6, 1e-12, 'line unchanged'); }
// Same arc drawn the other way round (a and b swapped, clockwise): result must still touch the line
{ const arc: Arc3 = { a: P(10, 0), b: P(0, 0), m: P(5, 5) }, l: L = { a: P(-5, 6), b: P(15, 6) }; solveArcs(w, [l], [arc], [{ k: 'tanla', arc, l }]); near(arc.m.y, 6, 1e-4, 'clockwise arc: middle y = 6'); near(arc.m.x, 5, 1e-6, 'clockwise arc: middle x'); }
// 3) the case that planegcs got wrong (reported success with a non-tangent result): arc (0,10)-(10,0), line y=10 ending at the arc start. Hand calc: unique circle centre (0,0), r 10, middle (7.0711,7.0711).
{ const arc: Arc3 = { a: P(0, 10), b: P(10, 0), m: P(10, 10) }, l: L = { a: P(-10, 10), b: P(0, 10) }; solveArcs(w, [l], [arc], [{ k: 'tanla', arc, l }]); near(arc.m.x, 7.0710678, 1e-5, 'fillet-style: middle x'); near(arc.m.y, 7.0710678, 1e-5, 'fillet-style: middle y'); near(Math.hypot(arc.m.x, arc.m.y), 10, 1e-5, 'fillet-style: middle is 10 from origin (on the circle)'); }
// 4) impossible: the line is the arc's own chord. Must throw and leave the arc unchanged.
{ const arc: Arc3 = { a: P(0, 0), b: P(10, 0), m: P(5, 5) }, l: L = { a: P(0, 0), b: P(10, 0) }; let t = false; try { solveArcs(w, [l], [arc], [{ k: 'tanla', arc, l }]); } catch { t = true; } log.push(`${t ? 'PASS' : 'FAIL'} chord line: refused`); if (!t) fails++; near(arc.m.y, 5, 0, 'chord line: arc unchanged'); }
// 5) impossible: line far from the arc on the chord side gives no tangent circle? line y=-100 and arc ends (0,0),(10,0): a circle through both and tangent to y=-100 exists (large), so it must be accepted and tangent
{ const arc: Arc3 = { a: P(0, 0), b: P(10, 0), m: P(5, -5) }, l: L = { a: P(-50, -6), b: P(50, -6) }; solveArcs(w, [l], [arc], [{ k: 'tanla', arc, l }]); near(arc.m.y, -6, 1e-6, 'bulge down tangent to y=-6: middle y'); }
{ const { arcOwnDof } = await import('./arc-solver-core'); const A = {}, B = {}, l1 = {}, l2 = {};
  const eq = (g: number | undefined, want: number, m: string) => { const ok = g === want; log.push(`${ok ? 'PASS' : 'FAIL'} ${m} got=${g} want=${want}`); if (!ok) fails++; };
  eq(arcOwnDof([A], []).get(A), 5, 'free arc: 5');
  eq(arcOwnDof([A], [{ k: 'tanla', arc: A, other: l1 }]).get(A), 4, 'one tangent: 4');
  eq(arcOwnDof([A], [{ k: 'tanla', arc: A, other: l1 }, { k: 'tanla', arc: A, other: l2 }]).get(A), 3, 'two different tangent lines: 3');
  eq(arcOwnDof([A], [{ k: 'tanla', arc: A, other: l1 }, { k: 'tanla', arc: A, other: l1 }]).get(A), 4, 'same tangent twice counts once: 4');
  eq(arcOwnDof([A, B], [{ k: 'aconc', arc: A, other: B }, { k: 'aeqr', arc: A, other: B }]).get(A), 2, 'concentric (2) + equal radius (1): 2');
  eq(arcOwnDof([A, B], [{ k: 'aconc', arc: A, other: B }]).get(B), 5, 'the reference arc is not reduced: 5');
  eq(arcOwnDof([A], [{ k: 'tanla', arc: A, other: l1 }, { k: 'tanla', arc: A, other: l2 }, { k: 'aconc', arc: A, other: B }, { k: 'aeqr', arc: A, other: B }]).get(A), 0, 'floor at 0');
}
writeFileSync('/tmp/arc-solver-result.txt', log.join('\n') + '\n'); console.log(log.join('\n')); process.exit(fails ? 1 : 0);
