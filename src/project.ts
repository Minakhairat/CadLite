// Project Geometry: derive edges of earlier extrude features and project them onto the current sketch plane.
// Uses the same mapping as the solid kernel: orient (r quarter turns about Z, f = half turn about X), then plane XY / XZ / YZ.
import type { Entity, P } from './geometry';
export type V3 = [number, number, number];
export type Plane = 'XY' | 'XZ' | 'YZ';
export type Orient = { r?: number; f?: boolean };
export type FeatLike = { kind: string; sketch: Entity[]; depth: number; dir?: 'normal' | 'flip' | 'sym'; plane?: Plane; orient?: Orient; op?: string };
export type Circle3 = { c: V3; r: number; n: V3 };
export type Edges3 = { segs: [V3, V3][]; circles: Circle3[]; skipped: number };

/** Sketch-local point (x, y, z along the sketch normal) to world. */
export function toWorld(plane: Plane | undefined, o: Orient | undefined, p: V3): V3 {
  let [x, y, z] = p;
  for (let i = 0; i < (o?.r ?? 0); i++) [x, y] = [-y, x];
  if (o?.f) { y = -y; z = -z; }
  if (plane === 'XZ') return [x, -z, y];
  if (plane === 'YZ') return [z, x, y];
  return [x, y, z];
}
/** World point to sketch-local coordinates of a plane and orientation (inverse of toWorld). */
export function fromWorld(plane: Plane | undefined, o: Orient | undefined, w: V3): V3 {
  let x: number, y: number, z: number;
  if (plane === 'XZ') { x = w[0]; y = w[2]; z = -w[1]; } else if (plane === 'YZ') { x = w[1]; y = w[2]; z = w[0]; } else { x = w[0]; y = w[1]; z = w[2]; }
  if (o?.f) { y = -y; z = -z; }
  for (let i = 0; i < (o?.r ?? 0); i++) [x, y] = [y, -x];
  return [x, y, z];
}
const span = (depth: number, dir?: string): [number, number] => (dir === 'flip' ? [-depth, 0] : dir === 'sym' ? [-depth / 2, depth / 2] : [0, depth]);
const key = (v: number[]) => v.map((q) => (Math.round(q * 1e6) / 1e6 + 0).toFixed(6)).join(',');

/** Edges of one extrude feature in world space. Straight profile edges at both heights, a vertical edge at each profile vertex, circles at both heights. Arcs, ellipses and splines are counted in `skipped`, not projected. */
export function extrudeEdges(f: FeatLike): Edges3 {
  const out: Edges3 = { segs: [], circles: [], skipped: 0 };
  if (f.kind !== 'extrude') return out;
  const [z0, z1] = span(f.depth, f.dir); const W = (p: P, z: number) => toWorld(f.plane, f.orient, [p.x, p.y, z]);
  const verts = new Map<string, P>();
  const seg = (a: P, b: P) => { for (const z of [z0, z1]) out.segs.push([W(a, z), W(b, z)]); verts.set(key([a.x, a.y]), a); verts.set(key([b.x, b.y]), b); };
  for (const e of f.sketch) {
    if (e.cn || e.t === 'point') continue;
    if (e.t === 'line') seg(e.a, e.b);
    else if (e.t === 'rect') { const c = [e.a, { x: e.b.x, y: e.a.y }, e.b, { x: e.a.x, y: e.b.y }]; for (let i = 0; i < 4; i++) seg(c[i], c[(i + 1) % 4]); }
    else if (e.t === 'circle') { for (const z of [z0, z1]) out.circles.push({ c: W(e.c, z), r: e.r, n: sub(W({ x: 0, y: 0 }, 1), W({ x: 0, y: 0 }, 0)) }); }
    else if (e.t === 'poly') {
      if (e.ell || e.spl) { out.skipped++; continue; }
      if (e.segs?.length) { for (const s of e.segs) { if (s.m) out.skipped++; else seg(s.a, s.b); } }
      else for (let i = 0; i < e.pts.length; i++) seg(e.pts[i], e.pts[(i + 1) % e.pts.length]);
    } else out.skipped++;
  }
  for (const v of verts.values()) out.segs.push([W(v, z0), W(v, z1)]);
  return out;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Project world edges onto the sketch plane of (plane, orient). Zero-length and duplicate results are dropped; circles seen edge-on become a line. */
export function projectEdges(ed: Edges3, plane: Plane | undefined, o: Orient | undefined): Entity[] {
  const out: Entity[] = []; const seen = new Set<string>();
  const L = (w: V3): P => { const l = fromWorld(plane, o, w); return { x: l[0], y: l[1] }; };
  const line = (a: P, b: P) => { if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return; const k1 = key([a.x, a.y, b.x, b.y]), k2 = key([b.x, b.y, a.x, a.y]); if (seen.has(k1) || seen.has(k2)) return; seen.add(k1); out.push({ t: 'line', a, b, cn: true }); };
  for (const [a, b] of ed.segs) line(L(a), L(b));
  const nt = sub(toWorld(plane, o, [0, 0, 1]), toWorld(plane, o, [0, 0, 0]));
  for (const c of ed.circles) {
    const dot = Math.abs(c.n[0] * nt[0] + c.n[1] * nt[1] + c.n[2] * nt[2]); const ctr = L(c.c);
    if (dot > 0.999) { const k = key([ctr.x, ctr.y, c.r, 7]); if (!seen.has(k)) { seen.add(k); out.push({ t: 'circle', c: ctr, r: c.r, cn: true }); } }
    else if (dot < 0.001) { const d: V3 = [c.n[1] * nt[2] - c.n[2] * nt[1], c.n[2] * nt[0] - c.n[0] * nt[2], c.n[0] * nt[1] - c.n[1] * nt[0]]; line(L([c.c[0] - c.r * d[0], c.c[1] - c.r * d[1], c.c[2] - c.r * d[2]]), L([c.c[0] + c.r * d[0], c.c[1] + c.r * d[1], c.c[2] + c.r * d[2]])); ed.skipped += 0; }
    else ed.skipped++;
  }
  return out;
}

const rd6 = (v: number) => Math.round(v * 1e6) / 1e6;
/** The projection of one earlier feature onto a sketch plane, rounded the way stored copies are. Lines and circles only; `skipped` counts what is not projected. */
export function projectFeature(f: FeatLike, plane: Plane | undefined, o: Orient | undefined): { ents: Entity[]; skipped: number } {
  const ed = extrudeEdges(f); const ents: Entity[] = [];
  for (const e of projectEdges(ed, plane, o)) {
    if (e.t === 'line') ents.push({ ...e, a: { x: rd6(e.a.x), y: rd6(e.a.y) }, b: { x: rd6(e.b.x), y: rd6(e.b.y) } });
    else if (e.t === 'circle') ents.push({ ...e, c: { x: rd6(e.c.x), y: rd6(e.c.y) }, r: rd6(e.r) });
  }
  return { ents, skipped: ed.skipped };
}
const ekey = (e: Entity) => e.t === 'line' ? 'l:' + [`${rd6(e.a.x)},${rd6(e.a.y)}`, `${rd6(e.b.x)},${rd6(e.b.y)}`].sort().join('|') : e.t === 'circle' ? `c:${rd6(e.c.x)},${rd6(e.c.y)},${rd6(e.r)}` : `${e.t}`;
export type ProjState = { state: 'current' | 'stale' | 'source-missing'; missing: number; extra: number };
/** For every projected-copy tag (prj) in a sketch: is the stored copy still what the source feature projects to now? Stale = lines or circles were added, removed or changed on either side. Source features are those before `upto`; a tag that points at a missing or non-extrude feature is 'source-missing'. */
export function projectionStatus(ents: Entity[], features: FeatLike[], upto: number, plane: Plane | undefined, o: Orient | undefined): Map<number, ProjState> {
  const out = new Map<number, ProjState>(); const tags = new Set(ents.filter((e) => e.prj).map((e) => e.prj as number));
  for (const tag of tags) {
    const f = features[tag - 1];
    if (!f || tag - 1 >= upto || f.kind !== 'extrude' || f.op === 'cut' || f.op === 'intersect') { out.set(tag, { state: 'source-missing', missing: 0, extra: 0 }); continue; }
    const want = new Map<string, number>(); for (const e of projectFeature(f, plane, o).ents) want.set(ekey(e), (want.get(ekey(e)) ?? 0) + 1);
    const have = new Map<string, number>(); for (const e of ents) if (e.prj === tag) have.set(ekey(e), (have.get(ekey(e)) ?? 0) + 1);
    let missing = 0, extra = 0;
    for (const [k, n] of want) missing += Math.max(0, n - (have.get(k) ?? 0));
    for (const [k, n] of have) extra += Math.max(0, n - (want.get(k) ?? 0));
    out.set(tag, { state: missing || extra ? 'stale' : 'current', missing, extra });
  }
  return out;
}
