import { toWorld, fromWorld, extrudeEdges, projectEdges, projectFeature, projectionStatus } from './project';
import type { Entity } from './geometry';
const near = (a: number, b: number, tol: number, m: string) => { if (!(Math.abs(a - b) <= tol)) { console.error('FAIL', m, a, b); process.exit(1); } console.log('ok', m, +a.toFixed(4)); };
// mapping round trip for every plane and orientation
for (const pl of ['XY', 'XZ', 'YZ'] as const) for (const r of [0, 1, 2, 3]) for (const f of [false, true]) { const w = toWorld(pl, { r, f }, [3, 5, 7]); const b = fromWorld(pl, { r, f }, w); near(b[0] + b[1] + b[2], 15, 1e-9, `round trip ${pl} r${r} f${f} sum`); near(b[0], 3, 1e-9, `round trip ${pl} r${r} f${f} x`); near(b[2], 7, 1e-9, `round trip ${pl} r${r} f${f} z`); }
// hand-checked mapping: XZ sketch (2,3,0) is world (2,0,3); YZ sketch (2,3,0) is world (0,2,3); XY r1 turns x to y
let w = toWorld('XZ', {}, [2, 3, 0]); near(w[0], 2, 1e-9, 'XZ x'); near(w[1], 0, 1e-9, 'XZ y'); near(w[2], 3, 1e-9, 'XZ z');
w = toWorld('YZ', {}, [2, 3, 0]); near(w[0], 0, 1e-9, 'YZ x'); near(w[1], 2, 1e-9, 'YZ y'); near(w[2], 3, 1e-9, 'YZ z');
w = toWorld('XY', { r: 1 }, [2, 0, 0]); near(w[0], 0, 1e-9, 'XY r1 x'); near(w[1], 2, 1e-9, 'XY r1 y');
// a 40 x 20 rectangle extruded 10 on XY, projected onto an XZ sketch: a 40 wide, 10 tall rectangle (sketch y is world Z)
const sq: Entity = { t: 'poly', pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }] };
const ed = extrudeEdges({ kind: 'extrude', sketch: [sq], depth: 10, plane: 'XY' });
near(ed.segs.length, 12, 0, 'box has 12 edges');
const pr = projectEdges(ed, 'XZ', {}) as any[];
near(pr.length, 4, 0, 'XZ view of the box: 4 distinct lines (front and back coincide, verticals meet)');
const xs = pr.flatMap((e) => [e.a.x, e.b.x]), ys = pr.flatMap((e) => [e.a.y, e.b.y]);
near(Math.min(...xs), 0, 1e-9, 'min x'); near(Math.max(...xs), 40, 1e-9, 'max x'); near(Math.min(...ys), 0, 1e-9, 'min y'); near(Math.max(...ys), 10, 1e-9, 'max y (box height)');
near(pr.filter((e) => e.cn).length, 4, 0, 'projected lines are construction');
// same plane: back to the 4 profile edges plus nothing else
const same = projectEdges(ed, 'XY', {}) as any[]; near(same.length, 4, 0, 'XY view: 4 lines (top and bottom coincide)');
// flip direction goes below the plane: height range -10..0 in sketch y of XZ
const fl = projectEdges(extrudeEdges({ kind: 'extrude', sketch: [sq], depth: 10, dir: 'flip', plane: 'XY' }), 'XZ', {}) as any[];
near(Math.max(...fl.flatMap((e) => [e.a.y, e.b.y])), 0, 1e-9, 'flip: top at 0'); near(Math.min(...fl.flatMap((e) => [e.a.y, e.b.y])), -10, 1e-9, 'flip: bottom at -10');
const sy = projectEdges(extrudeEdges({ kind: 'extrude', sketch: [sq], depth: 10, dir: 'sym', plane: 'XY' }), 'XZ', {}) as any[];
near(Math.min(...sy.flatMap((e) => [e.a.y, e.b.y])), -5, 1e-9, 'sym: bottom -5'); near(Math.max(...sy.flatMap((e) => [e.a.y, e.b.y])), 5, 1e-9, 'sym: top 5');
// circle r5 at (10,10) extruded 8 on XY: top view is a circle, side view (XZ) is a 10 wide line pair plus vertical lines 8 tall
const ci: Entity = { t: 'circle', c: { x: 10, y: 10 }, r: 5 };
const ce = extrudeEdges({ kind: 'extrude', sketch: [ci], depth: 8, plane: 'XY' });
const top = projectEdges(ce, 'XY', {}) as any[]; near(top.length, 1, 0, 'circle top view: one circle (top and bottom coincide)'); near(top[0].r, 5, 1e-9, 'circle radius');
const side = projectEdges(ce, 'XZ', {}) as any[]; const sx = side.flatMap((e) => [e.a.x, e.b.x]); near(Math.min(...sx), 5, 1e-9, 'circle side view min x'); near(Math.max(...sx), 15, 1e-9, 'circle side view max x'); near(side.length, 2, 0, 'circle side view: 2 lines (bottom and top)');
// arcs are counted, not projected
const ar: Entity = { t: 'poly', pts: [], segs: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { a: { x: 10, y: 0 }, b: { x: 0, y: 0 }, m: { x: 5, y: 5 } }] };
near(extrudeEdges({ kind: 'extrude', sketch: [ar], depth: 4, plane: 'XY' }).skipped, 1, 0, 'arc span counted as skipped');
near(extrudeEdges({ kind: 'revolve', sketch: [sq], depth: 4 }).segs.length, 0, 0, 'revolve gives no edges');
console.log('project tests passed');
{
  const ck = (c: boolean, m: string) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
  const feat = (w: number, h: number) => ({ kind: 'extrude', depth: 10, sketch: [{ t: 'rect', a: { x: 0, y: 0 }, b: { x: w, y: h } }] }) as import('./project').FeatLike;
  const copy = projectFeature(feat(40, 10), 'XZ', undefined).ents.map((e) => ({ ...e, prj: 1 }));
  ck(copy.length === 4, 'XZ projection of a 40x10 profile is 4 lines');
  ck(projectionStatus(copy as never, [feat(40, 10)], 1, 'XZ', undefined).get(1)?.state === 'current', 'fresh copy is current');
  const s2 = projectionStatus(copy as never, [feat(50, 10)], 1, 'XZ', undefined).get(1)!;
  ck(s2.state === 'stale' && s2.missing > 0 && s2.extra > 0, 'source profile changed to 50 wide: stale (missing ' + s2.missing + ', extra ' + s2.extra + ')');
  const moved = copy.map((e, i) => (i === 0 && e.t === 'line' ? { ...e, a: { x: e.a.x + 1, y: e.a.y } } : e));
  ck(projectionStatus(moved as never, [feat(40, 10)], 1, 'XZ', undefined).get(1)?.state === 'stale', 'a projected line moved by hand: stale');
  ck(projectionStatus(copy.slice(1) as never, [feat(40, 10)], 1, 'XZ', undefined).get(1)?.missing === 1, 'one projected line deleted: 1 missing');
  ck(projectionStatus(copy as never, [], 1, 'XZ', undefined).get(1)?.state === 'source-missing', 'source feature gone: source-missing');
  ck(projectionStatus(copy as never, [feat(40, 10)], 0, 'XZ', undefined).get(1)?.state === 'source-missing', 'source not before the sketch: source-missing');
  ck(projectionStatus(copy as never, [{ ...feat(40, 10), op: 'cut' }], 1, 'XZ', undefined).get(1)?.state === 'source-missing', 'source became a Cut: source-missing');
  const rev = copy.map((e) => (e.t === 'line' ? { ...e, a: e.b, b: e.a } : e));
  ck(projectionStatus(rev as never, [feat(40, 10)], 1, 'XZ', undefined).get(1)?.state === 'current', 'line direction reversed is still current');
}
