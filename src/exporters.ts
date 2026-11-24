import * as THREE from 'three';
import { Entity, P, outline, area, inside } from './geometry';

export type Body = { kind: 'extrude' | 'revolve'; depth: number; sketch: Entity[]; geo: THREE.BufferGeometry };

const EPS = 1e-9;
const validE = (e: Entity) => (e.t === 'rect' ? Math.abs(e.a.x - e.b.x) > 1e-6 && Math.abs(e.a.y - e.b.y) > 1e-6 : e.t === 'circle' ? e.r > 1e-6 : e.pts.length >= 3 && Math.abs(area(e.pts)) > 1e-6);

// ---------------- OBJ (mesh, world coordinates, mm) ----------------
export function toOBJ(bodies: Body[]): string {
  let s = '# MK CAD OBJ export, units: mm\n'; let base = 0;
  bodies.forEach((b, bi) => {
    const g = b.geo.clone(); if (b.kind === 'revolve') g.rotateX(Math.PI / 2);
    const ng = g.index ? g.toNonIndexed() : g; const p = ng.attributes.position;
    s += `o Body${bi + 1}\n`;
    for (let i = 0; i < p.count; i++) s += `v ${p.getX(i)} ${p.getY(i)} ${p.getZ(i)}\n`;
    for (let i = 0; i < p.count; i += 3) s += `f ${base + i + 1} ${base + i + 2} ${base + i + 3}\n`;
    base += p.count;
  });
  return s;
}

// ---------------- DXF (2D sketch) ----------------
export function toDXF(sketch: Entity[]): string {
  const out: string[] = [];
  const g = (c: number, v: string | number) => out.push(String(c), String(v));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1015'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, 1);
  g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS'); g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const e of sketch.filter(validE)) {
    if (e.t === 'circle') { g(0, 'CIRCLE'); g(100, 'AcDbEntity'); g(8, '0'); g(100, 'AcDbCircle'); g(10, e.c.x); g(20, e.c.y); g(30, 0); g(40, e.r); }
    else {
      const pts = outline(e);
      g(0, 'LWPOLYLINE'); g(100, 'AcDbEntity'); g(8, '0'); g(100, 'AcDbPolyline'); g(90, pts.length); g(70, 1);
      for (const p of pts) { g(10, p.x); g(20, p.y); }
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}

// ---------------- STEP (exact B-rep: planes, cylinders, cones) ----------------
class Step {
  lines: string[] = []; n = 0;
  add(s: string) { this.lines.push(`#${++this.n}=${s};`); return this.n; }
}
const f = (v: number) => { const s = (Math.abs(v) < 1e-12 ? 0 : v).toString(); return /[.eE]/.test(s) ? (/e/i.test(s) ? s.replace(/e/i, 'E') : s) : s + '.'; };

class Brep {
  constructor(public s: Step) {}
  pt(x: number, y: number, z: number) { return this.s.add(`CARTESIAN_POINT('',(${f(x)},${f(y)},${f(z)}))`); }
  dir(x: number, y: number, z: number) { return this.s.add(`DIRECTION('',(${f(x)},${f(y)},${f(z)}))`); }
  ax(o: number[], z: number[], x: number[]) { return this.s.add(`AXIS2_PLACEMENT_3D('',#${this.pt(o[0], o[1], o[2])},#${this.dir(z[0], z[1], z[2])},#${this.dir(x[0], x[1], x[2])})`); }
  vtx(x: number, y: number, z: number) { return this.s.add(`VERTEX_POINT('',#${this.pt(x, y, z)})`); }
  line(a: number[], b: number[], va: number, vb: number) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(d[0], d[1], d[2]);
    const ln = this.s.add(`LINE('',#${this.pt(a[0], a[1], a[2])},#${this.s.add(`VECTOR('',#${this.dir(d[0] / L, d[1] / L, d[2] / L)},${f(L)})`)})`);
    return this.s.add(`EDGE_CURVE('',#${va},#${vb},#${ln},.T.)`);
  }
  /** full circle in a plane parallel to XY, axis +Z, starting at angle 0 */
  circle(cx: number, cy: number, z: number, r: number, v: number) {
    const c = this.s.add(`CIRCLE('',#${this.ax([cx, cy, z], [0, 0, 1], [1, 0, 0])},${f(r)})`);
    return this.s.add(`EDGE_CURVE('',#${v},#${v},#${c},.T.)`);
  }
  oe(edge: number, fwd: boolean) { return this.s.add(`ORIENTED_EDGE('',*,*,#${edge},${fwd ? '.T.' : '.F.'})`); }
  bound(edges: [number, boolean][], outer: boolean) {
    const loop = this.s.add(`EDGE_LOOP('',(${edges.map(([e, d]) => '#' + this.oe(e, d)).join(',')}))`);
    return this.s.add(`${outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',#${loop},.T.)`);
  }
  face(bounds: number[], surf: number, same: boolean) { return this.s.add(`ADVANCED_FACE('',(${bounds.map((b) => '#' + b).join(',')}),#${surf},${same ? '.T.' : '.F.'})`); }
  plane(o: number[], n: number[], xd: number[]) { return this.s.add(`PLANE('',#${this.ax(o, n, xd)})`); }
  cyl(r: number) { return this.s.add(`CYLINDRICAL_SURFACE('',#${this.ax([0, 0, 0], [0, 0, 1], [1, 0, 0])},${f(r)})`); }
  cylAt(cx: number, cy: number, r: number) { return this.s.add(`CYLINDRICAL_SURFACE('',#${this.ax([cx, cy, 0], [0, 0, 1], [1, 0, 0])},${f(r)})`); }
  solid(faces: number[]) {
    const sh = this.s.add(`CLOSED_SHELL('',(${faces.map((x) => '#' + x).join(',')}))`);
    return this.s.add(`MANIFOLD_SOLID_BREP('',#${sh})`);
  }
}

type Loop = { circ?: { c: P; r: number }; pts?: P[]; hole: boolean };

function extrudeLoops(sketch: Entity[]): { outer: Loop; holes: Loop[] }[] {
  const ents = sketch.filter(validE); const outs = ents.map(outline);
  const depthOf = outs.map((l, i) => outs.filter((o, j) => j !== i && inside(l[0], o)).length);
  const mk = (i: number, hole: boolean): Loop => {
    const e = ents[i];
    if (e.t === 'circle') return { circ: { c: e.c, r: e.r }, hole };
    let pts = outs[i].slice(); const ccw = area(pts) > 0; if (ccw === hole) pts = pts.reverse(); // outer CCW, hole CW
    return { pts, hole };
  };
  const res: { outer: Loop; holes: Loop[] }[] = []; const owner = new Map<number, number>();
  ents.forEach((_, i) => { if (depthOf[i] % 2 === 0) { owner.set(i, res.length); res.push({ outer: mk(i, false), holes: [] }); } });
  ents.forEach((_, i) => {
    if (depthOf[i] % 2 === 1) {
      const p = outs.findIndex((o, j) => j !== i && depthOf[j] === depthOf[i] - 1 && inside(outs[i][0], o));
      const k = owner.get(p); if (k !== undefined) res[k].holes.push(mk(i, true));
    }
  });
  return res;
}

function stepExtrude(b: Brep, sketch: Entity[], depth: number): number {
  const shapes = extrudeLoops(sketch); if (!shapes.length) throw new Error('No closed profile');
  const faces: number[] = [];
  for (const sh of shapes) {
    const loops = [sh.outer, ...sh.holes];
    type E = { bot: number; top: number; vert: number[]; kind: 'line'; pts: P[] } | { bot: number; top: number; seam: number; kind: 'circ'; l: Loop };
    const es: E[] = loops.map((l) => {
      if (l.circ) {
        const { c, r } = l.circ; const vb = b.vtx(c.x + r, c.y, 0), vt = b.vtx(c.x + r, c.y, depth);
        return { kind: 'circ' as const, l, bot: b.circle(c.x, c.y, 0, r, vb), top: b.circle(c.x, c.y, depth, r, vt), seam: b.line([c.x + r, c.y, 0], [c.x + r, c.y, depth], vb, vt) };
      }
      const pts = l.pts!; const vb = pts.map((p) => b.vtx(p.x, p.y, 0)), vt = pts.map((p) => b.vtx(p.x, p.y, depth));
      const bot = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return b.line([p.x, p.y, 0], [q.x, q.y, 0], vb[i], vb[(i + 1) % pts.length]); });
      const top = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return b.line([p.x, p.y, depth], [q.x, q.y, depth], vt[i], vt[(i + 1) % pts.length]); });
      const vert = pts.map((p, i) => b.line([p.x, p.y, 0], [p.x, p.y, depth], vb[i], vt[i]));
      return { kind: 'line' as const, pts, bot: 0, top: 0, vert, _b: bot, _t: top } as any;
    });
    const botE = (e: any): [number, boolean][] => (e.kind === 'circ' ? [[e.bot, !e.l.hole]] : e._b.map((x: number) => [x, true]));
    const topE = (e: any): [number, boolean][] => (e.kind === 'circ' ? [[e.top, !e.l.hole]] : e._t.map((x: number) => [x, true]));
    // bottom (normal -Z): reverse traversal of each loop
    const rev = (L: [number, boolean][]): [number, boolean][] => L.slice().reverse().map(([e, d]) => [e, !d]);
    const bb = es.map((e, i) => b.bound(rev(botE(e)), i === 0));
    faces.push(b.face(bb, b.plane([0, 0, 0], [0, 0, -1], [1, 0, 0]), true));
    const tb = es.map((e, i) => b.bound(topE(e), i === 0));
    faces.push(b.face(tb, b.plane([0, 0, depth], [0, 0, 1], [1, 0, 0]), true));
    // sides
    es.forEach((e: any) => {
      if (e.kind === 'circ') {
        const hole = e.l.hole as boolean; const { c, r } = e.l.circ;
        let seq: [number, boolean][] = [[e.bot, true], [e.seam, true], [e.top, false], [e.seam, false]];
        if (hole) seq = rev(seq);
        faces.push(b.face([b.bound(seq, true)], b.cylAt(c.x, c.y, r), !hole));
      } else {
        const pts: P[] = e.pts;
        pts.forEach((p, i) => {
          const j = (i + 1) % pts.length, q = pts[j]; const L = Math.hypot(q.x - p.x, q.y - p.y);
          const dx = (q.x - p.x) / L, dy = (q.y - p.y) / L;
          const seq: [number, boolean][] = [[e._b[i], true], [e.vert[j], true], [e._t[i], false], [e.vert[i], false]];
          faces.push(b.face([b.bound(seq, true)], b.plane([p.x, p.y, 0], [dy, -dx, 0], [dx, dy, 0]), true));
        });
      }
    });
  }
  return b.solid(faces);
}

function stepRevolve(b: Brep, sketch: Entity[]): number {
  const ents = sketch.filter(validE); if (!ents.length) throw new Error('No closed profile');
  if (ents[0].t === 'circle') throw new Error('STEP export of a revolved circle profile (torus/sphere) is not supported yet. Use a rectangle or polygon profile.');
  let pts = outline(ents[0]).map((p) => ({ x: Math.abs(p.x) < EPS ? 0 : p.x, y: p.y }));
  if (area(pts) < 0) pts = pts.reverse(); // CCW in (r,h): material on the left
  const n = pts.length;
  const vtx = pts.map((p) => b.vtx(p.x, 0, p.y));
  const circ = pts.map((p, i) => (p.x > EPS ? b.circle(0, 0, p.y, p.x, vtx[i]) : 0));
  const seam = pts.map((p, i) => { const q = pts[(i + 1) % n]; return b.line([p.x, 0, p.y], [q.x, 0, q.y], vtx[i], vtx[(i + 1) % n]); });
  const faces: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, A = pts[i], B = pts[j]; const dr = B.x - A.x, dh = B.y - A.y;
    if (A.x <= EPS && B.x <= EPS) continue; // on the axis
    const cA = circ[i], cB = circ[j];
    if (Math.abs(dh) < 1e-9) { // plane, normal +-Z
      const nz = dr > 0 ? -1 : 1; const bs: number[] = [];
      const bound = (c: number, fwd: boolean, outer: boolean) => bs.push(b.bound([[c, fwd]], outer));
      if (cA && cB) { const aOuter = A.x > B.x; bound(aOuter ? cA : cB, aOuter ? true : false, true); bound(aOuter ? cB : cA, aOuter ? false : true, false); }
      else if (cA) bound(cA, true, true); else bound(cB, false, true);
      // outer must be CCW about normal: +Z -> forward; -Z -> reversed. Rebuild with correct senses:
      bs.length = 0;
      const sgn = nz > 0;
      const mkb = (c: number, outer: boolean) => b.bound([[c, outer ? sgn : !sgn]], outer);
      if (cA && cB) { const aOuter = A.x > B.x; bs.push(mkb(aOuter ? cA : cB, true), mkb(aOuter ? cB : cA, false)); }
      else bs.push(mkb(cA || cB, true));
      faces.push(b.face(bs, b.plane([0, 0, A.y], [0, 0, nz], [1, 0, 0]), true));
      continue;
    }
    const seq: [number, boolean][] = [];
    if (cA) seq.push([cA, true]);
    seq.push([seam[i], true]);
    if (cB) seq.push([cB, false]);
    seq.push([seam[i], false]);
    let surf: number; let same = dh > 0;
    if (Math.abs(dr) < 1e-9) surf = b.cyl(A.x);
    else {
      const tan = dr / dh, up = tan > 0; const ang = Math.atan(Math.abs(tan));
      const axis = up ? [0, 0, 1] : [0, 0, -1];
      surf = b.s.add(`CONICAL_SURFACE('',#${b.ax([0, 0, A.y], axis, [1, 0, 0])},${f(A.x)},${f(ang)})`);
    }
    // For degenerate (axis) ends the seam-circle-seam loop above is already complete.
    faces.push(b.face([b.bound(seq, true)], surf, same));
  }
  return b.solid(faces);
}

export function toSTEP(bodies: Body[], name = 'MK CAD part'): string {
  const s = new Step(); const b = new Brep(s);
  const solids = bodies.map((bd) => (bd.kind === 'extrude' ? stepExtrude(b, bd.sketch, bd.depth) : stepRevolve(b, bd.sketch)));
  const ctxDims = s.add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )`);
  const ang = s.add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`);
  const sa = s.add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
  const unc = s.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#${ctxDims},'distance_accuracy_value','confusion accuracy')`);
  const ctx = s.add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${ctxDims},#${ang},#${sa})) REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY') )`);
  const org = s.add(`AXIS2_PLACEMENT_3D('',#${b.pt(0, 0, 0)},#${b.dir(0, 0, 1)},#${b.dir(1, 0, 0)})`);
  const rep = s.add(`ADVANCED_BREP_SHAPE_REPRESENTATION('${name}',(#${org},${solids.map((x) => '#' + x).join(',')}),#${ctx})`);
  const app = s.add(`APPLICATION_CONTEXT('automotive design')`);
  s.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2001,#${app})`);
  const pc = s.add(`PRODUCT_CONTEXT('',#${app},'mechanical')`);
  const prod = s.add(`PRODUCT('${name}','${name}','',(#${pc}))`);
  s.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
  const pdf = s.add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const dc = s.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${app},'design')`);
  const pd = s.add(`PRODUCT_DEFINITION('design','',#${pdf},#${dc})`);
  const pds = s.add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
  s.add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('MK CAD export'),'2;1');\nFILE_NAME('part.step','',(''),(''),'MK CAD','MK CAD','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${s.lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
