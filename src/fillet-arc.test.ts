import { filletLineArc } from './fillet-arc';
import { circle3, P } from './geometry';
let fails = 0;
const chk = (c: boolean, m: string) => { if (!c) { fails++; console.error('FAIL', m); } else console.log('ok', m); };
const near = (a: number, b: number, t = 1e-6) => Math.abs(a - b) < t;
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
// quarter arc of radius 10 centred at (0,0): from (10,0) through (7.071,7.071) to (0,10); line from (10,0) to (30,0) at the corner (10,0)
const p = { x: 10, y: 0 };
const arc = { a: { x: 10, y: 0 }, b: { x: 0, y: 10 }, m: { x: 10 * Math.SQRT1_2, y: 10 * Math.SQRT1_2 } };
const f = filletLineArc(p, { x: 30, y: 0 }, arc, 2);
const fk = circle3(f.fillet.a, f.fillet.b, f.fillet.m)!;
chk(near(fk.r, 2, 1e-6), 'fillet arc has radius 2');
chk(near(Math.abs(f.lineEnd.y - fk.c.y), 2, 1e-6) && near(f.lineEnd.y, 0, 1e-9) && near(f.lineEnd.x, fk.c.x, 1e-6), 'tangent to the horizontal line (centre 2 mm above it, touch point under the centre)');
const ak = circle3(f.arc.a, f.arc.b, f.arc.m)!;
chk(near(ak.r, 10, 1e-6) && near(ak.c.x, 0, 1e-6) && near(ak.c.y, 0, 1e-6), 'shortened arc keeps radius 10 and centre');
chk(near(dist(fk.c, { x: 0, y: 0 }), 10 - 2, 1e-6) || near(dist(fk.c, { x: 0, y: 0 }), 10 + 2, 1e-6), 'fillet centre is r from the arc circle (tangent)');
chk(dist(f.fillet.b, { x: 0, y: 0 }) > 9.999 && dist(f.fillet.b, { x: 0, y: 0 }) < 10.001, 'arc touch point lies on the arc circle');
chk(dist(f.arc.a, f.fillet.b) < 1e-9 && dist(f.fillet.a, f.lineEnd) < 1e-9, 'pieces join end to end');
chk(dist(f.arc.b, arc.b) < 1e-9, 'far end of the arc is unchanged');
chk(dist(f.arc.m, { x: 0, y: 0 }) > 9.999 && dist(f.arc.m, f.arc.a) > 0.1, 'shortened arc mid point is on the circle and inside the span');
chk(near(f.lineEnd.x, Math.sqrt(140), 1e-6) && near(dist(fk.c, { x: 0, y: 0 }), 12, 1e-6), 'exact numbers: touch x = sqrt(140), centre 12 from the arc centre (outside corner)');
{ const q = filletLineArc(p, { x: 0, y: 0 }, arc, 2); const kk = circle3(q.fillet.a, q.fillet.b, q.fillet.m)!;
  chk(near(dist(kk.c, { x: 0, y: 0 }), 8, 1e-6) && near(Math.abs(q.lineEnd.y - kk.c.y), 2, 1e-6) && near(kk.r, 2, 1e-6), 'inside corner (line toward the arc centre): centre 8 from the arc centre, 2 from the line'); }
// reversed arc entity (corner at b)
const rev = { a: arc.b, b: arc.a, m: arc.m };
const g = filletLineArc(p, { x: 30, y: 0 }, rev, 2);
chk(dist(g.arc.b, g.fillet.b) < 1e-9 && dist(g.arc.a, rev.a) < 1e-9, 'reversed arc: corner end replaced, far end kept');
// errors
const bad = (fn: () => void, m: string) => { try { fn(); chk(false, m + ' (no error)'); } catch (e) { chk(true, m + ': ' + (e as Error).message); } };
bad(() => filletLineArc(p, { x: 30, y: 0 }, arc, 0), 'zero radius refused');
bad(() => filletLineArc(p, { x: 30, y: 0 }, arc, 60), 'huge radius refused');
bad(() => filletLineArc(p, { x: 11, y: 0 }, arc, 3), 'radius longer than the line refused');
bad(() => filletLineArc({ x: 3, y: 3 }, { x: 30, y: 0 }, arc, 2), 'corner not on the arc refused');
if (fails) process.exit(1);
console.log('fillet-arc tests passed');
