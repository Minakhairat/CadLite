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
writeFileSync('/tmp/arc-solver-result.txt', log.join('\n') + '\n'); console.log(log.join('\n')); process.exit(fails ? 1 : 0);
