import { moveTf, rotateTf, mirrorTf, transformEntity, offsetEntity, scaleEntity } from './sketch-ops';
import { circle3, Entity } from './geometry';
const near = (a: number, b: number, tol: number, m: string) => { if (!(Math.abs(a - b) <= tol)) { console.error('FAIL', m, a, b); process.exit(1); } console.log('ok', m, a.toFixed(4)); };
const line: Entity = { t: 'line', a: { x: 1, y: 2 }, b: { x: 4, y: 6 } };
let r = transformEntity(line, moveTf(10, -5)) as any; near(r.b.x, 14, 1e-9, 'move line b.x'); near(r.b.y, 1, 1e-9, 'move line b.y');
r = transformEntity(line, rotateTf({ x: 0, y: 0 }, 90)) as any; near(r.a.x, -2, 1e-9, 'rotate 90 a.x'); near(r.a.y, 1, 1e-9, 'rotate 90 a.y');
near(Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y), 5, 1e-9, 'rotation keeps length');
r = transformEntity(line, mirrorTf({ x: 0, y: 0 }, { x: 0, y: 1 })) as any; near(r.a.x, -1, 1e-9, 'mirror about Y axis a.x'); near(r.a.y, 2, 1e-9, 'mirror about Y axis a.y');
r = transformEntity(line, mirrorTf({ x: 0, y: 0 }, { x: 1, y: 1 })) as any; near(r.a.x, 2, 1e-9, 'mirror about y=x a.x'); near(r.a.y, 1, 1e-9, 'mirror about y=x a.y');
const arc: Entity = { t: 'arc', a: { x: 5, y: 0 }, b: { x: -5, y: 0 }, m: { x: 0, y: 5 } };
const ra = transformEntity(arc, rotateTf({ x: 0, y: 0 }, 37)) as any; const c0 = circle3(ra.a, ra.b, ra.m)!; near(c0.r, 5, 1e-9, 'rotated arc radius'); near(c0.c.x, 0, 1e-9, 'rotated arc centre x');
const rm = transformEntity(arc, mirrorTf({ x: 0, y: 0 }, { x: 1, y: 0 })) as any; near(rm.m.y, -5, 1e-9, 'mirrored arc mid y');
const rect: Entity = { t: 'rect', a: { x: 0, y: 0 }, b: { x: 4, y: 2 } };
let rr = transformEntity(rect, moveTf(1, 1)) as any; if (rr.t !== 'rect') { console.error('FAIL move keeps rect'); process.exit(1); } near(rr.b.x, 5, 1e-9, 'moved rect b.x');
rr = transformEntity(rect, rotateTf({ x: 0, y: 0 }, 90)) as any; if (rr.t !== 'rect') { console.error('FAIL 90deg keeps rect'); process.exit(1); } console.log('ok 90 degree rotation keeps rect');
rr = transformEntity(rect, rotateTf({ x: 0, y: 0 }, 30)) as any; if (rr.t !== 'poly' || rr.pts.length !== 4) { console.error('FAIL 30deg rect becomes 4-point polygon'); process.exit(1); } console.log('ok 30 degree rotation turns rect into a 4-point polygon');
const poly = rr.pts; const side = Math.hypot(poly[1].x - poly[0].x, poly[1].y - poly[0].y); near(side, 4, 1e-9, 'rotated rect side length');
let o = offsetEntity(line, 1) as any; // line (1,2)->(4,6), left normal = (-4,3)/5
near(o.a.x, 1 - 0.8, 1e-9, 'line offset a.x'); near(o.a.y, 2 + 0.6, 1e-9, 'line offset a.y');
o = offsetEntity({ t: 'circle', c: { x: 1, y: 1 }, r: 3 }, 2) as any; near(o.r, 5, 1e-9, 'circle offset +2');
if (offsetEntity({ t: 'circle', c: { x: 1, y: 1 }, r: 3 }, -3) !== null) { console.error('FAIL offset to zero radius must be null'); process.exit(1); } console.log('ok circle offset to zero is refused');
o = offsetEntity(arc, 2) as any; const co = circle3(o.a, o.b, o.m)!; near(co.r, 7, 1e-9, 'arc offset radius'); near(co.c.y, 0, 1e-9, 'arc offset keeps centre');
o = offsetEntity(rect, 1) as any; near(o.b.x - o.a.x, 6, 1e-9, 'rect offset width'); near(o.b.y - o.a.y, 4, 1e-9, 'rect offset height');
if (offsetEntity(rect, -1.5) !== null) { console.error('FAIL rect collapse'); process.exit(1); } console.log('ok rect that would collapse is refused');

// Scale about (10,10) by 2 (hand values)
{ const c = { x: 10, y: 10 };
  let s = scaleEntity({ t: 'circle', c: { x: 12, y: 10 }, r: 3 }, c, 2) as any; near(s.c.x, 14, 1e-9, 'scale circle centre x (10+2*2)'); near(s.r, 6, 1e-9, 'scale circle radius 3 to 6');
  s = scaleEntity({ t: 'rect', a: { x: 10, y: 10 }, b: { x: 15, y: 14 } }, c, 2) as any; near(s.b.x - s.a.x, 10, 1e-9, 'scale rect width 5 to 10'); near(s.b.y - s.a.y, 8, 1e-9, 'scale rect height 4 to 8'); near(s.a.x, 10, 1e-9, 'scale rect corner on the base point stays');
  s = scaleEntity({ t: 'line', a: { x: 0, y: 0 }, b: { x: 3, y: 4 } }, c, 0.5) as any; near(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 2.5, 1e-9, 'scale line 5 to 2.5'); near(s.a.x, 5, 1e-9, 'scale line start (10+(0-10)*0.5)');
  s = scaleEntity({ t: 'arc', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: 10 } }, { x: 0, y: 0 }, 3) as any; const cc = circle3(s.a, s.b, s.m)!; near(cc.r, 30, 1e-9, 'scale arc radius 10 to 30'); near(cc.c.x, 0, 1e-9, 'scale arc keeps centre');
  if (scaleEntity({ t: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, c, 0) !== null || scaleEntity({ t: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, c, -2) !== null) { console.error('FAIL scale factor 0 or negative must be refused'); process.exit(1); } console.log('ok scale factor 0 or negative is refused'); }
