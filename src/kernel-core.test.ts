import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import * as R from 'replicad';
import { buildBodies, Spec } from './kernel-core';
import { Entity, resolveLoops } from './geometry';
const init = require('replicad-opencascadejs');
R.setOC(await init());
const near = (a: number, b: number, tol: number, m: string) => { if (Math.abs(a - b) > tol) { console.error('FAIL', m, a, b); process.exit(1); } console.log('ok', m, a.toFixed(3)); };
const V = (bs: any[]) => bs.reduce((s, b) => s + R.measureVolume(b), 0);
const rect = (x0: number, y0: number, x1: number, y1: number): Entity => ({ t: 'rect', a: { x: x0, y: y0 }, b: { x: x1, y: y1 } });
const plate: Spec = { kind: 'extrude', sketch: [rect(0, 0, 40, 30)], depth: 10 };
const hole: Spec = { kind: 'extrude', sketch: [{ t: 'circle', c: { x: 20, y: 15 }, r: 5 }], depth: 10, op: 'cut' };
near(V(buildBodies(R, [plate, hole])), 12000 - Math.PI * 25 * 10, 0.01, 'cut cylinder hole (exact)');
let threw = false; try { buildBodies(R, [plate, { ...hole, dir: 'flip' }]); } catch { threw = true; }
if (!threw) { console.error('FAIL flipped cut away from the part should be rejected'); process.exit(1); } console.log('ok flipped cut that misses the part is rejected');
near(V(buildBodies(R, [plate, { ...hole, depth: 4, dir: 'sym' }])), 12000 - Math.PI * 25 * 2, 0.01, 'symmetric cut: 2 mm of the 4 mm lies inside the part');
const join: Spec = { kind: 'extrude', sketch: [rect(30, 20, 60, 40)], depth: 10, op: 'join' };
const j = buildBodies(R, [plate, join]); near(j.length, 1, 0, 'join gives one body'); near(V(j), 12000 + 30 * 20 * 10 - 10 * 10 * 10, 0.01, 'join volume (overlap counted once)');
near(V(buildBodies(R, [plate, { kind: 'extrude', sketch: [rect(30, 20, 60, 40)], depth: 10, op: 'intersect' }])), 10 * 10 * 10, 0.01, 'intersect volume');
near(V(buildBodies(R, [plate, { kind: 'extrude', sketch: [rect(10, 10, 20, 20), { t: 'circle', c: { x: 15, y: 15 }, r: 2 }], depth: 3, op: 'join' }])), 12000 + (100 - Math.PI * 4) * 3 * 0, 0.01, 'join inside the part adds nothing') ;
const ring = buildBodies(R, [{ kind: 'extrude', sketch: [rect(0, 0, 20, 20), { t: 'circle', c: { x: 10, y: 10 }, r: 4 }], depth: 5 }]);
near(V(ring), (400 - Math.PI * 16) * 5, 0.01, 'sketch with inner circle is a ring');
let t2 = false; try { buildBodies(R, [{ ...join }]); } catch { t2 = true; } if (!t2) { console.error('FAIL join without a body'); process.exit(1); } console.log('ok join without a body rejected');
// Fillet / chamfer / shell on a 40x30x10 plate
const fv = (k: any, size: number, edges: any) => V(buildBodies(R, [plate, { kind: k, sketch: [], depth: size, edges }]));
const cornerArea = (r: number) => r * r * (1 - Math.PI / 4);
near(fv('fillet', 3, 'vertical'), 12000 - 4 * cornerArea(3) * 10, 0.01, 'fillet 4 vertical edges r3');
near(fv('chamfer', 2, 'vertical'), 12000 - 4 * 2 * 2 / 2 * 10, 0.01, 'chamfer 4 vertical edges 2');
const all = fv('fillet', 1, 'all'); if (!(all < 12000 && all > 11500)) { console.error('FAIL fillet all', all); process.exit(1); } console.log('ok fillet all edges', all.toFixed(3));
const top = fv('chamfer', 1, 'top'); near(top, 12000 - (2 * (40 + 30) * 0.5), 1.5, 'chamfer top edges 1 (approx, corners)');
const sh = fv('shell', 2, 'top'); console.log('shell vol', sh.toFixed(3));
if (!(Math.abs(sh - (12000 - 36 * 26 * 8)) < 0.01 || Math.abs(sh - (44 * 34 * 12 - 40 * 30 * 10)) < 1)) { console.error('FAIL shell volume', sh); process.exit(1); }
let tOver = false; try { fv('fillet', 50, 'all'); } catch { tOver = true; } if (!tOver) { console.error('FAIL oversized fillet should throw'); process.exit(1); } console.log('ok oversized fillet rejected');
let tNo = false; try { buildBodies(R, [plate, { kind: 'fillet', sketch: [], depth: 3, edges: 'vertical' }, { kind: 'chamfer', sketch: [], depth: 1, edges: 'top' }, { kind: 'shell', sketch: [], depth: 1.5, edges: 'top' }]); } catch (e) { tNo = /no effect/.test((e as Error).message); }
console.log(tNo ? 'ok shell that the kernel cannot apply is reported, not silent' : 'NOTE shell after fillet+chamfer applied');
// True arcs: half disc from a line + 3-point arc. A sampled arc would be ~0.1 mm3 off; exact arcs match pi*r^2/2*h.
const half = resolveLoops([{ t: 'line', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, { t: 'arc', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: 10 } }]);
near(V(buildBodies(R, [{ kind: 'extrude', sketch: half, depth: 2 }])), (Math.PI * 100 / 2) * 2, 1e-6, 'half disc from line + arc is exact (true arc edge)');
const rev = resolveLoops([{ t: 'line', a: { x: 10, y: 0 }, b: { x: -10, y: 0 } }, { t: 'arc', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: -10 } }]);
near(V(buildBodies(R, [{ kind: 'extrude', sketch: rev, depth: 2 }])), (Math.PI * 100 / 2) * 2, 1e-6, 'arc below the line, reversed order, exact');
// Hole: through and blind, drilled from the top face
const H = (x: number, d: number, dp: number): Spec => ({ kind: 'hole', sketch: [{ t: 'circle', c: { x, y: 15 }, r: d / 2 }], depth: dp });
near(V(buildBodies(R, [plate, H(20, 5, 0)])), 12000 - Math.PI * 6.25 * 10, 0.01, 'through hole d5');
near(V(buildBodies(R, [plate, H(20, 5, 4)])), 12000 - Math.PI * 6.25 * 4, 0.01, 'blind hole d5 depth 4 from the top');
let tH = false; try { buildBodies(R, [plate, H(100, 5, 0)]); } catch { tH = true; } if (!tH) { console.error('FAIL hole off the part'); process.exit(1); } console.log('ok hole off the part rejected');

// Revolve on the exact kernel: rectangle 5..10 x 0..20 about the Z axis is a tube, volume pi (10^2 - 5^2) 20; a circle r3 at x=10 is a torus, volume 2 pi^2 R r^2
near(V(buildBodies(R, [{ kind: 'revolve', sketch: [rect(5, 0, 10, 20)], depth: 0 }])), Math.PI * 75 * 20, 0.001, 'revolve tube (exact)');
near(V(buildBodies(R, [{ kind: 'revolve', sketch: [{ t: 'circle', c: { x: 10, y: 0 }, r: 3 }], depth: 0 }])), 2 * Math.PI ** 2 * 10 * 9, 0.001, 'revolve torus (exact)');
{ let th = false; try { buildBodies(R, [{ kind: 'revolve', sketch: [rect(-2, 0, 4, 5)], depth: 0 }]); } catch { th = true; } if (!th) { console.error('FAIL revolve across the axis should be rejected'); process.exit(1); } console.log('ok revolve across the axis is rejected'); }
// Sphere: a half disc (true arc plus a line on the axis) revolved about Z is a sphere, volume 4/3 pi r^3
{ const r = 10, h = r * Math.SQRT1_2; const poly = { t: 'poly', pts: [{ x: 0, y: -r }, { x: h, y: -h }, { x: r, y: 0 }, { x: h, y: h }, { x: 0, y: r }], segs: [{ a: { x: 0, y: -r }, b: { x: 0, y: r }, m: { x: r, y: 0 } }, { a: { x: 0, y: r }, b: { x: 0, y: -r } }] } as any;
  near(V(buildBodies(R, [{ kind: 'revolve', sketch: [poly], depth: 0 }])), (4 / 3) * Math.PI * 1000, 0.001, 'revolve half disc = sphere (exact)'); }
// Regression: Shell after Hole + Chamfer used to return an invalid solid (volume 16275 instead of about 6.7k). It must be rejected.
{
  const blk: Spec = { kind: 'extrude', sketch: [rect(0, 0, 40, 35)], depth: 15 };
  const h: Spec = { kind: 'extrude', sketch: [{ t: 'circle', c: { x: 10, y: 10 }, r: 2.5 }], depth: 15, op: 'cut' };
  const sh: Spec = { kind: 'shell', sketch: [], depth: 2, edges: 'top' };
  const chm = (d: number): Spec => ({ kind: 'chamfer', sketch: [], depth: d, edges: 'bottom' });
  let bad = false; try { buildBodies(R, [blk, h, chm(3), sh]); } catch (e) { bad = /invalid/.test((e as Error).message); }
  if (!bad) { console.error('FAIL invalid shell after hole+chamfer must be rejected'); process.exit(1); } console.log('ok invalid Shell (hole+chamfer 3) rejected');
  const v2 = V(buildBodies(R, [blk, chm(2), sh])); if (!(v2 > 5000 && v2 < 6492)) { console.error('FAIL chamfer then shell volume', v2); process.exit(1); } console.log('ok chamfer 2 then shell volume', v2.toFixed(2), '(< plain shell 6492)');
}
// Concave (L-shaped) part: Shell must not be falsely rejected by the validity check.
{
  const L: Spec = { kind: 'extrude', sketch: [{ t: 'poly', pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 40 }, { x: 0, y: 40 }] }], depth: 12 };
  for (const t of [1, 2, 3]) { const v = V(buildBodies(R, [L, { kind: 'shell', sketch: [], depth: t, edges: 'top' }])); if (!(v > 1000 && v < 11700)) { console.error('FAIL L shell', t, v); process.exit(1); } console.log('ok concave L shell t', t, v.toFixed(1)); }
}

// Sketch planes. A 10 x 20 rectangle extruded 5 on each plane: hand-derived world bounding boxes.
{ const box = (plane: any) => { const b = buildBodies(R, [{ kind: 'extrude', sketch: [rect(0, 0, 10, 20)], depth: 5, plane }])[0]; return { bb: (b as any).boundingBox.bounds as number[][], v: R.measureVolume(b) }; };
  const xy = box('XY'); near(xy.bb[1][2], 5, 1e-6, 'XY: extrudes to +Z 5');
  const xz = box('XZ'); near(xz.bb[0][0], 0, 1e-6, 'XZ: x min 0'); near(xz.bb[1][0], 10, 1e-6, 'XZ: x max 10 (sketch x)'); near(xz.bb[0][2], 0, 1e-6, 'XZ: z min 0'); near(xz.bb[1][2], 20, 1e-6, 'XZ: z max 20 (sketch y)'); near(xz.bb[0][1], -5, 1e-6, 'XZ: y min -5 (normal is -Y)'); near(xz.bb[1][1], 0, 1e-6, 'XZ: y max 0'); near(xz.v, 1000, 1e-6, 'XZ volume 1000');
  const yz = box('YZ'); near(yz.bb[0][1], 0, 1e-6, 'YZ: y min 0'); near(yz.bb[1][1], 10, 1e-6, 'YZ: y max 10 (sketch x)'); near(yz.bb[1][2], 20, 1e-6, 'YZ: z max 20 (sketch y)'); near(yz.bb[0][0], 0, 1e-6, 'YZ: x min 0'); near(yz.bb[1][0], 5, 1e-6, 'YZ: x max 5 (normal is +X)'); near(yz.v, 1000, 1e-6, 'YZ volume 1000');
  // a feature on another plane joins an XY plate: plate 40x30x10 plus an XZ block 10x20x5 at y -5..0 that touches the plate's y=0 face
  near(V(buildBodies(R, [plate, { kind: 'extrude', sketch: [rect(0, 0, 10, 20)], depth: 5, plane: 'XZ', op: 'join' }])), 12000 + 1000 - 10 * 10 * 5 * 0 - 0, 0.01, 'XZ join onto the XY plate (overlap: z 0..10 at y -5..0 is outside the plate, so no overlap)'); }

// Sketch axis orientation on a 10 x 20 rectangle extruded 5 (hand bounding boxes). r = quarter turns about the normal, f = flip normal.
{ const bb = (plane: any, orient: any) => { const b = buildBodies(R, [{ kind: 'extrude', sketch: [rect(0, 0, 10, 20)], depth: 5, plane, orient }])[0]; return { bb: (b as any).boundingBox.bounds as number[][], v: R.measureVolume(b) }; };
  const chk = (n: string, got: number[][], want: number[][]) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) near(got[i][j], want[i][j], 1e-6, `${n} [${i}][${j}]`); };
  chk('XY r=1', bb('XY', { r: 1 }).bb, [[-20, 0, 0], [0, 10, 5]]);
  chk('XY r=2', bb('XY', { r: 2 }).bb, [[-10, -20, 0], [0, 0, 5]]);
  chk('XY r=3', bb('XY', { r: 3 }).bb, [[0, -10, 0], [20, 0, 5]]);
  chk('XY f', bb('XY', { f: true }).bb, [[0, -20, -5], [10, 0, 0]]);
  chk('XZ r=1', bb('XZ', { r: 1 }).bb, [[-20, -5, 0], [0, 0, 10]]);
  chk('YZ r=1', bb('YZ', { r: 1 }).bb, [[0, -20, 0], [5, 0, 10]]);
  near(bb('XY', { r: 1, f: true }).v, 1000, 1e-6, 'orientation keeps the volume'); }
// Exact ellipse (optional ell on a poly), rotated 30 degrees and cut from a plate
const ellE = (cx: number, cy: number, a: number, b: number, rot: number): Entity => ({ t: 'poly', pts: [{ x: cx + a, y: cy }, { x: cx, y: cy + b }, { x: cx - a, y: cy }, { x: cx, y: cy - b }], ell: { c: { x: cx, y: cy }, a, b, rot } });
near(V(buildBodies(R, [{ kind: 'extrude', sketch: [ellE(20, 15, 15, 5, 30)], depth: 4 }])), Math.PI * 15 * 5 * 4, 0.01, 'exact ellipse extrude volume (rotated 30 deg)');
near(V(buildBodies(R, [plate, { kind: 'extrude', sketch: [ellE(20, 15, 15, 5, 0)], depth: 10, op: 'cut' }])), 12000 - Math.PI * 15 * 5 * 10, 0.01, 'exact ellipse cut from a plate');
