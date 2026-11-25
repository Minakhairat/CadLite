import { moveTf, rotateTf, mirrorTf, transformEntity, offsetEntity, scaleEntity, stretchEntity, arcConcentric, arcEqualRadius } from './sketch-ops';
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
{ const W = { x0: 8, y0: -1, x1: 12, y1: 1 }; const s = stretchEntity({ t: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, W, 5, 0) as any; near(s.a.x, 0, 1e-9, 'stretch line a stays'); near(s.b.x, 15, 1e-9, 'stretch line b moves'); }
{ const W = { x0: -5, y0: 5, x1: 25, y1: 15 }; const s = stretchEntity({ t: 'rect', a: { x: 0, y: 0 }, b: { x: 20, y: 10 } }, W, 0, 5) as any; near(s.t === 'rect' ? 1 : 0, 1, 0, 'stretch top side keeps a rect'); near(s.a.y, 0, 1e-9, 'stretch rect bottom stays'); near(s.b.y, 15, 1e-9, 'stretch rect top moves'); near(s.b.x, 20, 1e-9, 'stretch rect x unchanged'); }
{ const c: Entity = { t: 'circle', c: { x: 50, y: 50 }, r: 3 }; if (stretchEntity(c, { x0: 0, y0: 0, x1: 10, y1: 10 }, 5, 5) !== c) { console.error('FAIL untouched circle'); process.exit(1); } const arc: Entity = { t: 'arc', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, m: { x: 5, y: 5 } }; if (stretchEntity(arc, { x0: 8, y0: -1, x1: 12, y1: 1 }, 5, 0) !== null) { console.error('FAIL partial arc must be refused'); process.exit(1); } console.log('ok stretch leaves untouched and refuses half an arc'); }
{ const pt = { t: 'point', p: { x: 3, y: 4 } } as unknown as Entity; const m = transformEntity(pt, moveTf(10, -5)) as any; near(m.p.x, 13, 1e-9, 'move point x'); near(m.p.y, -1, 1e-9, 'move point y'); const s1 = stretchEntity(pt, { x0: 0, y0: 0, x1: 5, y1: 5 }, 2, 0) as any; near(s1.p.x, 5, 1e-9, 'stretch point inside moves'); const s2 = stretchEntity(pt, { x0: 10, y0: 10, x1: 20, y1: 20 }, 2, 0); if (s2 !== pt) { console.error('FAIL point outside window must stay'); process.exit(1); } console.log('ok point outside window unchanged'); }
{ const arc = { t: 'arc', a: { x: 10, y: 0 }, b: { x: 0, y: 10 }, m: { x: Math.SQRT1_2 * 10, y: Math.SQRT1_2 * 10 } } as Entity; if (arc.t !== 'arc') process.exit(1);
  const c1 = arcConcentric(arc, { x: 5, y: 5 }) as any; const k1 = circle3(c1.a, c1.b, c1.m)!; near(k1.c.x, 5, 1e-9, 'concentric arc centre x'); near(k1.c.y, 5, 1e-9, 'concentric arc centre y'); near(k1.r, 10, 1e-9, 'concentric keeps radius');
  const e1 = arcEqualRadius(arc, 20) as any; const k2 = circle3(e1.a, e1.b, e1.m)!; near(k2.r, 20, 1e-9, 'equal radius sets 20'); near(k2.c.x, 0, 1e-9, 'equal radius keeps centre x'); near(Math.hypot(e1.a.x - e1.b.x, e1.a.y - e1.b.y), 20 * Math.SQRT2, 1e-9, 'equal radius keeps the 90 degree sweep (chord = r*sqrt2)');
  if (arcEqualRadius(arc, 0) !== null) { console.error('FAIL radius 0'); process.exit(1); } console.log('ok arc equal radius 0 refused'); }
// Exact ellipse (optional ell on a poly) survives move, rotate, mirror and scale; refuses a distorting stretch
const el: Entity = { t: 'poly', pts: [{ x: 25, y: 10 }, { x: 20, y: 12 }, { x: 15, y: 10 }, { x: 20, y: 8 }], ell: { c: { x: 20, y: 10 }, a: 5, b: 2, rot: 0 } };
let q = transformEntity(el, moveTf(3, -4)) as any; near(q.ell.c.x, 23, 1e-9, 'ellipse move centre x'); near(q.ell.c.y, 6, 1e-9, 'ellipse move centre y'); near(q.ell.a, 5, 1e-9, 'ellipse move keeps a');
q = transformEntity(el, rotateTf({ x: 0, y: 0 }, 90)) as any; near(q.ell.c.x, -10, 1e-9, 'ellipse rotate 90 centre x'); near(q.ell.c.y, 20, 1e-9, 'ellipse rotate 90 centre y'); near(q.ell.rot, 90, 1e-9, 'ellipse rotate 90 angle'); near(q.ell.b, 2, 1e-9, 'ellipse rotate keeps b');
q = transformEntity(el, mirrorTf({ x: 0, y: 0 }, { x: 1, y: 0 })) as any; near(q.ell.c.y, -10, 1e-9, 'ellipse mirror centre y'); near(q.ell.a, 5, 1e-9, 'ellipse mirror keeps a');
q = scaleEntity(el, { x: 0, y: 0 }, 2) as any; near(q.ell.a, 10, 1e-9, 'ellipse scale a'); near(q.ell.b, 4, 1e-9, 'ellipse scale b'); near(q.ell.c.x, 40, 1e-9, 'ellipse scale centre x');
let thrown = false; try { transformEntity(el, (p) => ({ x: p.x * 2, y: p.y })); } catch { thrown = true; } if (!thrown) { console.error('FAIL non-uniform transform must not silently distort an ellipse'); process.exit(1); } console.log('ok non-similar transform of an ellipse is refused');
if (stretchEntity(el, { x0: 22, y0: 0, x1: 30, y1: 20 }, 3, 0) !== null) { console.error('FAIL partial stretch of an ellipse should be refused'); process.exit(1); } console.log('ok partial stretch of an ellipse is refused');
near((stretchEntity(el, { x0: 0, y0: 0, x1: 50, y1: 50 }, 3, 1) as any).ell.c.x, 23, 1e-9, 'stretch window around the whole ellipse moves it');
