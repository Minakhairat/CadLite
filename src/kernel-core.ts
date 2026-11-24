// Solid modelling with OpenCascade (replicad). The replicad module is injected so the same code runs in the browser and in Node tests.
import type * as Replicad from 'replicad';
import { Entity, outline, inside } from './geometry';

export type Op = 'new' | 'join' | 'cut' | 'intersect';
export type Dir = 'normal' | 'flip' | 'sym';
export type Spec = { kind: 'extrude' | 'revolve'; sketch: Entity[]; depth: number; op?: Op; dir?: Dir };
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
    const pts = outline(e); let d = R.draw([pts[0].x, pts[0].y]); for (let i = 1; i < pts.length; i++) d = d.lineTo([pts[i].x, pts[i].y]);
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

const span = (depth: number, dir: Dir | undefined): [number, number] => (dir === 'flip' ? [-depth, depth] : dir === 'sym' ? [-depth / 2, depth] : [0, depth]);
const bb = (s: Replicad.Shape3D) => s.boundingBox.bounds as [number[], number[]];
const touches = (a: Replicad.Shape3D, b: Replicad.Shape3D, t = 1e-6) => { const A = bb(a), B = bb(b); return [0, 1, 2].every((k) => A[0][k] <= B[1][k] + t && B[0][k] <= A[1][k] + t); };
const vol = (R: R, s: Replicad.Shape3D) => R.measureVolume(s);

/** Apply features in order. Returns the resulting solid bodies. */
export function buildBodies(R: R, feats: Spec[]): Replicad.Shape3D[] {
  let bodies: Replicad.Shape3D[] = [];
  feats.forEach((f, i) => {
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
