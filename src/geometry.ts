import * as THREE from 'three';

export type P = { x: number; y: number };
export type Entity =
  | { t: 'rect'; a: P; b: P }
  | { t: 'circle'; c: P; r: number }
  | { t: 'poly'; pts: P[] };
export type Feature = { kind: 'extrude' | 'revolve'; depth: number; sketch: Entity[]; geo: THREE.BufferGeometry };

export function snap(v: number, g = 1) { return Math.round(v / g) * g; }

/** Polygon points for an entity (circles are sampled). */
export function outline(e: Entity): P[] {
  if (e.t === 'rect') {
    const x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), y0 = Math.min(e.a.y, e.b.y), y1 = Math.max(e.a.y, e.b.y);
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  if (e.t === 'circle') return Array.from({ length: 64 }, (_, i) => ({ x: e.c.x + e.r * Math.cos((i / 64) * 2 * Math.PI), y: e.c.y + e.r * Math.sin((i / 64) * 2 * Math.PI) }));
  return e.pts;
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
const valid = (e: Entity) => (e.t === 'rect' ? Math.abs(e.a.x - e.b.x) > 1e-6 && Math.abs(e.a.y - e.b.y) > 1e-6 : e.t === 'circle' ? e.r > 1e-6 : e.pts.length >= 3 && Math.abs(area(e.pts)) > 1e-6);

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
