// Solid modelling with OpenCascade (replicad). The replicad module is injected so the same code runs in the browser and in Node tests.
import type * as Replicad from 'replicad';
import { Entity, outline, inside } from './geometry';

export type Op = 'new' | 'join' | 'cut' | 'intersect';
export type Dir = 'normal' | 'flip' | 'sym';
export type Edges = 'all' | 'vertical' | 'top' | 'bottom';
export type Spec = { kind: 'extrude' | 'revolve' | 'fillet' | 'chamfer' | 'shell' | 'hole'; sketch: Entity[]; depth: number; op?: Op; dir?: Dir; edges?: Edges };
type R = typeof Replicad;

const valid = (e: Entity) => (e.t === 'rect' ? Math.abs(e.a.x - e.b.x) > 1e-6 && Math.abs(e.a.y - e.b.y) > 1e-6 : e.t === 'circle' ? e.r > 1e-6 : e.t === 'poly');

/** Extruded solid of one sketch: nested loops alternate solid / hole. Spans z0..z0+h. */
export function extrudeSolid(R: R, sketch: Entity[], h: number, z0: number): Replicad.Shape3D {
  const ents = sketch.filter(valid); if (!ents.length) throw new Error('Draw a closed shape first');
  const outs = ents.map(outline);
  const depthOf = outs.map((l, i) => outs.filter((o, j) => j !== i && inside(l[0], o)).length);
  const make = (e: Entity): Replicad.Shape3D => {
    if (e.t === 'rect') return R.makeBox([Math.min(e.a.x, e.b.x), Math.min(e.a.y, e.b.y), z0], [Math.max(e.a.x, e.b.x), Math.max(e.a.y, e.b.y), z0 + h]);
    if (e.t === 'circle') return R.makeCylinder(e.r, h, [e.c.x, e.c.y, z0], [0, 0, 1]);
    let d: any;
    if (e.t === 'poly' && e.segs?.length) { // true arcs: keep arc edges exact
      d = R.draw([e.segs[0].a.x, e.segs[0].a.y]);
      for (const g of e.segs) d = g.m ? d.threePointsArcTo([g.b.x, g.b.y], [g.m.x, g.m.y]) : d.lineTo([g.b.x, g.b.y]);
    } else { const pts = outline(e); d = R.draw([pts[0].x, pts[0].y]); for (let i = 1; i < pts.length; i++) d = d.lineTo([pts[i].x, pts[i].y]); }
    return d.close().sketchOnPlane('XY', z0).extrude(h) as Replicad.Shape3D;
  };
  let solid: Replicad.Shape3D | null = null;
  const order = ents.map((_, i) => i).sort((a, b) => depthOf[a] - depthOf[b]);
  for (const i of order) {
    const s = make(ents[i]);
    if (depthOf[i] % 2 === 0) solid = solid ? solid.fuse(s) : s; else if (solid) solid = solid.cut(s);
  }
  if (!solid) throw new Error('Draw a closed shape first');
  return solid;
}

/** Revolve the first outline 360 degrees about the Z axis (profile x = radius, sketch y = height), matching the display. Profile must lie at x >= 0. */
export function revolveSolid(R: R, sketch: Entity[]): Replicad.Shape3D {
  const e = sketch.filter(valid)[0]; if (!e) throw new Error('Draw a closed shape first');
  if (outline(e).some((p) => p.x < -1e-9)) throw new Error('For revolve, keep the shape on the right of the vertical axis (x >= 0)');
  let sk: any;
  if (e.t === 'circle') sk = R.drawCircle(e.r).translate(e.c.x, e.c.y);
  else if (e.t === 'rect') sk = R.draw([e.a.x, e.a.y]).lineTo([e.b.x, e.a.y]).lineTo([e.b.x, e.b.y]).lineTo([e.a.x, e.b.y]).close();
  else if (e.t === 'poly' && e.segs?.length) { let d: any = R.draw([e.segs[0].a.x, e.segs[0].a.y]); for (const g of e.segs) d = g.m ? d.threePointsArcTo([g.b.x, g.b.y], [g.m.x, g.m.y]) : d.lineTo([g.b.x, g.b.y]); sk = d.close(); }
  else { const pts = outline(e); let d: any = R.draw([pts[0].x, pts[0].y]); for (let i = 1; i < pts.length; i++) d = d.lineTo([pts[i].x, pts[i].y]); sk = d.close(); }
  return sk.sketchOnPlane('XZ').revolve([0, 0, 1]) as Replicad.Shape3D;
}

const span = (depth: number, dir: Dir | undefined): [number, number] => (dir === 'flip' ? [-depth, depth] : dir === 'sym' ? [-depth / 2, depth] : [0, depth]);
const bb = (s: Replicad.Shape3D) => s.boundingBox.bounds as [number[], number[]];
const touches = (a: Replicad.Shape3D, b: Replicad.Shape3D, t = 1e-6) => { const A = bb(a), B = bb(b); return [0, 1, 2].every((k) => A[0][k] <= B[1][k] + t && B[0][k] <= A[1][k] + t); };
const vol = (R: R, s: Replicad.Shape3D) => R.measureVolume(s);

/** Apply features in order. Returns the resulting solid bodies. */
export function buildBodies(R: R, feats: Spec[]): Replicad.Shape3D[] {
  measure = (s) => R.measureVolume(s); R_area = (s) => (R as any).measureArea(s);
  let bodies: Replicad.Shape3D[] = [];
  feats.forEach((f, i) => {
    if (f.kind === 'hole') {
      if (!bodies.length) throw new Error(`Feature ${i + 1}: Hole needs an existing solid.`);
      const c = f.sketch[0]; if (!c || c.t !== 'circle' || !(c.r > 0)) throw new Error('Hole: diameter must be greater than 0.');
      const hi = Math.max(...bodies.map((b) => bb(b)[1][2])), lo = Math.min(...bodies.map((b) => bb(b)[0][2]));
      const h = f.depth > 0 ? f.depth : hi - lo + 2; const cyl = R.makeCylinder(c.r, h, [c.c.x, c.c.y, hi - h + (f.depth > 0 ? 0 : 1)], [0, 0, 1]);
      const out: Replicad.Shape3D[] = []; let changed = false;
      for (const b of bodies) { if (!touches(b, cyl)) { out.push(b); continue; } const r = b.cut(cyl); if (Math.abs(vol(R, b) - vol(R, r)) > 1e-6) changed = true; out.push(r); }
      if (!changed) throw new Error('Hole: the hole is not on the solid (check the X/Y position).');
      bodies = out; return;
    }
    if (f.kind === 'fillet' || f.kind === 'chamfer' || f.kind === 'shell') {
      const nm = f.kind === 'fillet' ? 'Fillet' : f.kind === 'chamfer' ? 'Chamfer' : 'Shell';
      if (!bodies.length) throw new Error(`Feature ${i + 1}: ${nm} needs an existing solid.`);
      if (!(f.depth > 0)) throw new Error(`${nm}: the size must be greater than 0.`);
      bodies = bodies.map((b) => modify(b, f, nm));
      return;
    }
    if (f.kind === 'revolve') { if ((f.op ?? 'new') !== 'new') throw new Error('Revolve together with Join/Cut/Intersect is not supported yet.'); bodies.push(revolveSolid(R, f.sketch)); return; }
    if (f.kind !== 'extrude') throw new Error('Revolve together with Join/Cut/Intersect is not supported yet.');
    const [z0, h] = span(f.depth, f.dir); const s = extrudeSolid(R, f.sketch, h, z0); const op = f.op ?? 'new'; const n = `Feature ${i + 1}`;
    if (op === 'new') { bodies.push(s); return; }
    if (!bodies.length) throw new Error(`${n}: ${op === 'join' ? 'Join' : op === 'cut' ? 'Cut' : 'Intersect'} needs an existing solid. Create a New Solid first.`);
    if (op === 'join') {
      let acc = s; const rest: Replicad.Shape3D[] = []; let joined = 0;
      for (const b of bodies) { if (touches(b, acc)) { acc = acc.fuse(b); joined++; } else rest.push(b); }
      if (!joined) throw new Error(`${n}: Join: the new shape must touch an existing solid.`);
      bodies = [...rest, acc]; return;
    }
    const out: Replicad.Shape3D[] = []; let changed = false;
    for (const b of bodies) {
      if (!touches(b, s)) { if (op === 'cut') out.push(b); continue; }
      const r = op === 'cut' ? b.cut(s) : b.intersect(s); const vb = vol(R, b), vr = vol(R, r);
      if (op === 'cut' ? Math.abs(vb - vr) > 1e-6 : vr > 1e-6) changed = true;
      if (vr > 1e-6) out.push(r);
    }
    if (!changed) throw new Error(`${n}: ${op === 'cut' ? 'Cut' : 'Intersect'}: the shape does not overlap any solid.`);
    bodies = out;
  });
  return bodies;
}

let measure: (s: Replicad.Shape3D) => number = () => 0;
let R_area: (s: Replicad.Shape3D) => number = () => 0;
const T = 1e-6;
/** Fillet / chamfer / shell one body. Edge sets: all edges, vertical (Z) edges, or the edges on the top or bottom face plane. */
function modify(b: Replicad.Shape3D, f: Spec, nm: string): Replicad.Shape3D {
  const [lo, hi] = bb(b); const z = f.edges === 'bottom' ? lo[2] : hi[2]; const k = f.edges ?? 'all';
  const sel = k === 'all' ? undefined : (e: any) => (k === 'vertical' ? e.inDirection('Z') : e.inPlane('XY', z));
  const v0 = measure(b);
  const out = (() => { try {
    if (f.kind === 'shell') return (b as any).shell(f.depth, (fc: any) => fc.inPlane('XY', k === 'bottom' ? lo[2] : hi[2])) as Replicad.Shape3D;
    return (f.kind === 'fillet' ? (b as any).fillet(f.depth, sel) : (b as any).chamfer(f.depth, sel)) as Replicad.Shape3D;
  } catch (e) { throw new Error(`${nm} failed: the size is too large for this shape, or the selected edges do not exist.`); } })();
  if (f.kind === 'shell' && measure(out) > R_area(b) * f.depth * 1.02) throw new Error('Shell produced an invalid solid on this shape (the kernel could not hollow it correctly), so it was rejected. Try a different size, or shell before adding other features.');
  if (!(Math.abs(measure(out) - v0) > 1e-6)) throw new Error(`${nm} had no effect on this shape (the geometry kernel could not apply it here). Try different edges or size.`);
  return out;
}
void T;
