import { make_gcs_wrapper } from '@salusoft89/planegcs';
import { solveCircles, C } from './circle-solver-core';
import type { L } from './solver-core';
import { writeFileSync } from 'node:fs';
const log: string[] = []; let fails = 0;
const near = (a: number, b: number, tol: number, m: string) => { const ok = Math.abs(a - b) <= tol; log.push(`${ok ? 'PASS' : 'FAIL'} ${m} got=${a} want=${b}`); if (!ok) fails++; };
const w = (await make_gcs_wrapper()) as any; const P = (x: number, y: number) => ({ x, y });
const dist = (l: L, c: C) => Math.abs((l.b.x - l.a.x) * (l.a.y - c.c.y) - (l.a.x - c.c.x) * (l.b.y - l.a.y)) / Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
// 1) line tangent to circle: distance centre-to-line equals radius, after
{ const l: L = { a: P(-20, 8), b: P(20, 9) }, c: C = { c: P(0, 0), r: 5 }; log.push(`before dist=${dist(l, c)} r=${c.r}`); solveCircles(w, [l], [c], [{ k: 'tanlc', c, l }]); near(dist(l, c), c.r, 1e-6, "tangent line-circle: distance equals radius"); near(l.a.x, -20, 1e-9, "line start x unchanged (fixed)"); near(l.b.y, 9, 1e-9, "line end y unchanged (fixed)"); }
// 2) concentric
{ const a: C = { c: P(0, 0), r: 5 }, b: C = { c: P(3, 4), r: 8 }; solveCircles(w, [], [a, b], [{ k: 'conc', c: a, d: b }]); near(Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y), 0, 1e-6, 'concentric: centres coincide'); }
// 3) equal radius
{ const a: C = { c: P(0, 0), r: 5 }, b: C = { c: P(30, 0), r: 8 }; solveCircles(w, [], [a, b], [{ k: 'eqr', c: a, d: b }]); near(a.r, b.r, 1e-6, 'equal radius'); }
// 4) radius
{ const a: C = { c: P(0, 0), r: 5 }; solveCircles(w, [], [a], [{ k: 'rad', c: a, v: 12 }]); near(a.r, 12, 1e-6, 'radius 12'); }
// 5) circle tangent to circle: centre distance = r1 + r2 (external) or |r1-r2| (internal)
{ const a: C = { c: P(0, 0), r: 5 }, b: C = { c: P(20, 0), r: 8 }; solveCircles(w, [], [a, b], [{ k: 'tancc', c: a, d: b }]); const d = Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y); const okk = Math.abs(d - (a.r + b.r)) < 1e-6 || Math.abs(d - Math.abs(a.r - b.r)) < 1e-6; log.push(`${okk ? 'PASS' : 'FAIL'} tangent circles d=${d} r1=${a.r} r2=${b.r}`); if (!okk) fails++; }
// 6) conflict reported: radius 5 and radius 6 on one circle
{ const a: C = { c: P(0, 0), r: 5 }; let t = false; try { solveCircles(w, [], [a], [{ k: 'rad', c: a, v: 5 }, { k: 'rad', c: a, v: 6 }]); } catch { t = true; } log.push(`${t ? 'PASS' : 'FAIL'} conflicting radii reported`); if (!t) fails++; }
// 7) the second circle is the reference: concentric moves only the first; equal radius changes only the first
{ const a: C = { c: P(0, 0), r: 5 }, b: C = { c: P(30, 7), r: 8 }; solveCircles(w, [], [a, b], [{ k: 'conc', c: a, d: b }, { k: 'eqr', c: a, d: b }]); near(a.c.x, 30, 1e-6, 'first circle moved onto second (x)'); near(a.c.y, 7, 1e-6, 'first circle moved onto second (y)'); near(a.r, 8, 1e-6, 'first took second radius'); near(b.c.x, 30, 1e-9, 'second centre unchanged x'); near(b.c.y, 7, 1e-9, 'second centre unchanged y'); near(b.r, 8, 1e-9, 'second radius unchanged'); }
writeFileSync('/tmp/circle-solver-result.txt', log.join('\n') + '\n'); console.log(log.join('\n')); process.exit(fails ? 1 : 0);
