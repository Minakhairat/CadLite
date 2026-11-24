import * as THREE from 'three';

export type P = { x: number; y: number };
export type Seg = { a: P; b: P; m?: P }; // straight segment, or arc a -> m -> b
export type Entity =
  | { t: 'rect'; a: P; b: P }
  | { t: 'circle'; c: P; r: number }
  | { t: 'poly'; pts: P[]; segs?: Seg[] }
  | { t: 'line'; a: P; b: P }
  | { t: 'arc'; a: P; b: P; m: P }; // arc: start a, end b, passing through m
export type Feature = { kind: 'extrude' | 'revolve' | 'fillet' | 'chamfer' | 'shell'; edges?: 'all' | 'vertical' | 'top' | 'bottom'; depth: number; sketch: Entity[]; geo: THREE.BufferGeometry; op?: 'new' | 'join' | 'cut' | 'intersect'; dir?: 'normal' | 'flip' | 'sym' };

export function snap(v: number, g = 1) { return Math.round(v / g) * g; }

/** Polygon points for an entity (circles are sampled). */
export function outline(e: Entity): P[] {
  if (e.t === 'rect') {
    const x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), y0 = Math.min(e.a.y, e.b.y), y1 = Math.max(e.a.y, e.b.y);
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  if (e.t === 'circle') return Array.from({ length: 64 }, (_, i) => ({ x: e.c.x + e.r * Math.cos((i / 64) * 2 * Math.PI), y: e.c.y + e.r * Math.sin((i / 64) * 2 * Math.PI) }));
  if (e.t === 'line') return [e.a, e.b];
  if (e.t === 'arc') return arcPoints(e.a, e.b, e.m);
  return e.pts;
}
/** Circle through three points, or null when collinear. */
export function circle3(a: P, b: P, m: P): { c: P; r: number } | null {
  const d = 2 * (a.x * (m.y - b.y) + m.x * (b.y - a.y) + b.x * (a.y - m.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, m2 = m.x * m.x + m.y * m.y, b2 = b.x * b.x + b.y * b.y;
  const c = { x: (a2 * (m.y - b.y) + m2 * (b.y - a.y) + b2 * (a.y - m.y)) / d, y: (a2 * (b.x - m.x) + m2 * (a.x - b.x) + b2 * (m.x - a.x)) / d };
  return { c, r: Math.hypot(a.x - c.x, a.y - c.y) };
}
/** Points along the arc a -> m -> b (endpoints exact). */
export function arcPoints(a: P, b: P, m: P, seg = 48): P[] {
  const k = circle3(a, b, m); if (!k) return [a, b];
  const ang = (p: P) => Math.atan2(p.y - k.c.y, p.x - k.c.x);
  const a0 = ang(a), am = ang(m), a1 = ang(b);
  const tau = 2 * Math.PI; const norm = (x: number) => ((x % tau) + tau) % tau;
  const ccw = norm(am - a0) <= norm(a1 - a0); // is m reached before b going counter-clockwise
  const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
  const n = Math.max(2, Math.ceil((Math.abs(sweep) / tau) * seg));
  const pts: P[] = [a];
  for (let i = 1; i < n; i++) { const t = a0 + (sweep * i) / n; pts.push({ x: k.c.x + k.r * Math.cos(t), y: k.c.y + k.r * Math.sin(t) }); }
  pts.push(b); return pts;
}
const isSeg = (e: Entity) => e.t === 'line' || e.t === 'arc';
/** Join lines/arcs end to end into closed polygon entities. Throws if any chain stays open. */
export function resolveLoops(sketch: Entity[], tol = 1e-6): Entity[] {
  type S = { pts: P[]; seg: Seg };
  const toS = (e: Entity): S => (e.t === 'arc' ? { pts: outline(e), seg: { a: e.a, b: e.b, m: e.m } } : { pts: outline(e), seg: { a: (e as any).a, b: (e as any).b } });
  const rest = sketch.filter(isSeg).map(toS); const out = sketch.filter((e) => !isSeg(e));
  const same = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
  const open = () => new Error('Open profile: lines and arcs must form a closed loop (end points must meet).');
  while (rest.length) {
    const first = rest.shift()!; let chain = first.pts.slice(); const segs: Seg[] = [first.seg];
    for (let guard = 0; guard <= sketch.length; guard++) {
      if (chain.length > 2 && same(chain[0], chain[chain.length - 1])) break;
      const end = chain[chain.length - 1];
      const i = rest.findIndex((r) => same(r.pts[0], end) || same(r.pts[r.pts.length - 1], end));
      if (i < 0) throw open();
      const r = rest.splice(i, 1)[0]; let sg = r.seg;
      if (!same(r.pts[0], end)) { r.pts.reverse(); sg = { a: sg.b, b: sg.a, m: sg.m }; }
      chain = chain.concat(r.pts.slice(1)); segs.push(sg);
    }
    if (!(chain.length > 2 && same(chain[0], chain[chain.length - 1]))) throw open();
    chain.pop(); out.push({ t: 'poly', pts: chain, ...(segs.some((x) => x.m) ? { segs } : {}) });
  }
  return out;
}
export function area(pts: P[]) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
export function inside(p: P, poly: P[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
const valid = (e: Entity) => (e.t === 'line' || e.t === 'arc' ? false : e.t === 'rect' ? Math.abs(e.a.x - e.b.x) > 1e-6 && Math.abs(e.a.y - e.b.y) > 1e-6 : e.t === 'circle' ? e.r > 1e-6 : e.pts.length >= 3 && Math.abs(area(e.pts)) > 1e-6);

/** Build shapes: closed loops that sit inside another loop become holes. */
export function buildShapes(sketch: Entity[]): THREE.Shape[] {
  const loops = sketch.filter(valid).map(outline);
  const depthOf = loops.map((l, i) => loops.filter((o, j) => j !== i && inside(l[0], o)).length);
  const shapes: THREE.Shape[] = [];
  const owner = new Map<number, THREE.Shape>();
  loops.forEach((l, i) => {
    if (depthOf[i] % 2 === 0) { const s = new THREE.Shape(l.map((p) => new THREE.Vector2(p.x, p.y))); shapes.push(s); owner.set(i, s); }
  });
  loops.forEach((l, i) => {
    if (depthOf[i] % 2 === 1) {
      const parentIdx = loops.findIndex((o, j) => j !== i && depthOf[j] === depthOf[i] - 1 && inside(l[0], o));
      const s = owner.get(parentIdx);
      if (s) s.holes.push(new THREE.Path(l.map((p) => new THREE.Vector2(p.x, p.y))));
    }
  });
  return shapes;
}

export function extrude(sketch: Entity[], depth: number): THREE.BufferGeometry {
  const shapes = buildShapes(sketch);
  if (!shapes.length) throw new Error('Draw a closed shape first');
  return new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 32 });
}

/** Revolve the first outline around the Y axis. Profile must lie at x >= 0. */
export function revolve(sketch: Entity[]): THREE.BufferGeometry {
  const loops = sketch.filter(valid).map(outline);
  if (!loops.length) throw new Error('Draw a closed shape first');
  const pts = loops[0];
  if (pts.some((p) => p.x < -1e-9)) throw new Error('For revolve, keep the shape on the right of the vertical axis (x >= 0)');
  const v = pts.concat([pts[0]]).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  return new THREE.LatheGeometry(v, 64);
}

export function volume(g: THREE.BufferGeometry): number {
  const pos = g.attributes.position; const idx = g.index; let v = 0;
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(v);
}

export function toSTL(geos: THREE.BufferGeometry[]): string {
  let s = 'solid cadlite\n';
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0; const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      nrm.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      s += ` facet normal ${nrm.x} ${nrm.y} ${nrm.z}\n  outer loop\n`;
      for (const q of [a, b, c]) s += `   vertex ${q.x} ${q.y} ${q.z}\n`;
      s += '  endloop\n endfacet\n';
    }
  }
  return s + 'endsolid cadlite\n';
}

export function buildGeometry(kind: 'extrude' | 'revolve', sketch: Entity[], depth: number, dir?: 'normal' | 'flip' | 'sym'): THREE.BufferGeometry {
  if (kind !== 'extrude') return revolve(sketch);
  const g = extrude(sketch, depth);
  if (dir === 'flip') g.translate(0, 0, -depth); else if (dir === 'sym') g.translate(0, 0, -depth / 2);
  return g;
}
