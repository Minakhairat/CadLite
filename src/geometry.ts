import * as THREE from 'three';

export type P = { x: number; y: number };
/** The editable form of a sketch (lines, arcs, constraints, dimensions) kept next to the finished profile so it can be edited again. */
export type SketchSrc = { ents: Entity[]; cons: { k: string; l: number; m?: number; n?: number; v?: number }[]; dims: { e: number; w: string; pos: P }[] };
export type Seg = { a: P; b: P; m?: P }; // straight segment, or arc a -> m -> b
export type Entity = (
  | { t: 'rect'; a: P; b: P }
  | { t: 'circle'; c: P; r: number }
  | { t: 'poly'; pts: P[]; segs?: Seg[]; ell?: { c: P; a: number; b: number; rot: number }; spl?: P[] } // spl: closed fit-point spline (solid kernel builds the smooth curve; pts is the display sampling). ell: exact ellipse (centre, semi-axes, rotation in degrees) for the solid kernel; pts is its polygon for display
  | { t: 'line'; a: P; b: P }
  | { t: 'point'; p: P } // point: a marker, never part of the profile
  | { t: 'arc'; a: P; b: P; m: P } // arc: start a, end b, passing through m
) & { cn?: boolean }; // cn: construction shape, drawn dashed, never part of the profile
export type Feature = { kind: 'extrude' | 'revolve' | 'fillet' | 'chamfer' | 'shell' | 'hole'; edges?: 'all' | 'vertical' | 'top' | 'bottom'; src?: SketchSrc; depth: number; sketch: Entity[]; geo: THREE.BufferGeometry; op?: 'new' | 'join' | 'cut' | 'intersect'; dir?: 'normal' | 'flip' | 'sym'; plane?: 'XY' | 'XZ' | 'YZ'; orient?: { r?: 0 | 1 | 2 | 3; f?: boolean } };

export function snap(v: number, g = 1) { return Math.round(v / g) * g; }

/** Polygon points for an entity (circles are sampled). */
export function outline(e: Entity): P[] {
  if (e.t === 'rect') {
    const x0 = Math.min(e.a.x, e.b.x), x1 = Math.max(e.a.x, e.b.x), y0 = Math.min(e.a.y, e.b.y), y1 = Math.max(e.a.y, e.b.y);
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  if (e.t === 'circle') return Array.from({ length: 64 }, (_, i) => ({ x: e.c.x + e.r * Math.cos((i / 64) * 2 * Math.PI), y: e.c.y + e.r * Math.sin((i / 64) * 2 * Math.PI) }));
  if (e.t === 'point') return [e.p];
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
const valid = (e: Entity) => (e.t === 'line' || e.t === 'arc' || e.t === 'point' ? false : e.t === 'rect' ? Math.abs(e.a.x - e.b.x) > 1e-6 && Math.abs(e.a.y - e.b.y) > 1e-6 : e.t === 'circle' ? e.r > 1e-6 : e.pts.length >= 3 && Math.abs(area(e.pts)) > 1e-6);

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

/** Move geometry built in sketch space onto its sketch plane. XZ: sketch x to X, y to Z, extrusion to -Y. YZ: x to Y, y to Z, extrusion to +X. Same mapping as the kernel. */
export function toSketchPlane(g: THREE.BufferGeometry, plane?: 'XY' | 'XZ' | 'YZ'): THREE.BufferGeometry {
  if (plane === 'XZ') g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)));
  else if (plane === 'YZ') g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  return g;
}
/** Sketch axis orientation (same meaning as the kernel): r quarter turns about the normal, f flips the normal. Rotations only, so triangle winding stays valid. */
export function orientGeo(g: THREE.BufferGeometry, o?: { r?: number; f?: boolean }): THREE.BufferGeometry {
  if (o?.r) g.rotateZ((o.r * Math.PI) / 2);
  if (o?.f) g.rotateX(Math.PI);
  return g;
}
export function buildGeometry(kind: 'extrude' | 'revolve', sketch: Entity[], depth: number, dir?: 'normal' | 'flip' | 'sym', plane?: 'XY' | 'XZ' | 'YZ', orient?: { r?: 0 | 1 | 2 | 3; f?: boolean }): THREE.BufferGeometry {
  if (kind !== 'extrude') return toSketchPlane(orientGeo(revolve(sketch), orient), plane);
  const g = extrude(sketch, depth);
  if (dir === 'flip') g.translate(0, 0, -depth); else if (dir === 'sym') g.translate(0, 0, -depth / 2);
  return toSketchPlane(orientGeo(g, orient), plane);
}

/** Round the corner where two lines meet at p with radius r. Returns the two new end points and the arc. */
export function filletCorner(p: P, a: P, b: P, r: number): { t1: P; t2: P; arc: { a: P; b: P; m: P } } {
  if (!(r > 0)) throw new Error('Fillet radius must be greater than 0.');
  const la = Math.hypot(a.x - p.x, a.y - p.y), lb = Math.hypot(b.x - p.x, b.y - p.y); if (la < 1e-9 || lb < 1e-9) throw new Error('Zero-length line.');
  const u = { x: (a.x - p.x) / la, y: (a.y - p.y) / la }, v = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
  const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)); const th = Math.acos(cos);
  if (th < 1e-3 || Math.abs(th - Math.PI) < 1e-3) throw new Error('The two lines are parallel: no corner to round.');
  const t = r / Math.tan(th / 2);
  if (t >= la - 1e-9 || t >= lb - 1e-9) throw new Error(`Radius too large: the tangent length ${t.toFixed(3)} must be shorter than both lines (${Math.min(la, lb).toFixed(3)}).`);
  const bis = { x: u.x + v.x, y: u.y + v.y }; const bl = Math.hypot(bis.x, bis.y); bis.x /= bl; bis.y /= bl;
  const d = r / Math.sin(th / 2); const c = { x: p.x + bis.x * d, y: p.y + bis.y * d };
  const t1 = { x: p.x + u.x * t, y: p.y + u.y * t }, t2 = { x: p.x + v.x * t, y: p.y + v.y * t };
  return { t1, t2, arc: { a: t1, b: t2, m: { x: c.x - bis.x * r, y: c.y - bis.y * r } } };
}

/** Trim a line at the crossings with other lines: removes the piece under the click between its two nearest crossings
 * (or the end). Returns the lines that replace it. No crossing at all removes the whole line. */
export function trimLine(l: { a: P; b: P }, others: { a: P; b: P }[], click: P): { a: P; b: P }[] {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L2 = dx * dx + dy * dy; if (L2 < 1e-18) throw new Error('Zero-length line.');
  const tc = Math.max(0, Math.min(1, ((click.x - l.a.x) * dx + (click.y - l.a.y) * dy) / L2));
  const ts: number[] = [];
  for (const o of others) {
    const ex = o.b.x - o.a.x, ey = o.b.y - o.a.y, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((o.a.x - l.a.x) * ey - (o.a.y - l.a.y) * ex) / den, s = ((o.a.x - l.a.x) * dy - (o.a.y - l.a.y) * dx) / den;
    if (t > 1e-9 && t < 1 - 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
  }
  const lo = Math.max(0, ...ts.filter((t) => t <= tc)), hi = Math.min(1, ...ts.filter((t) => t >= tc), 1);
  const at = (t: number): P => ({ x: l.a.x + dx * t, y: l.a.y + dy * t });
  const out: { a: P; b: P }[] = [];
  if (lo > 1e-9) out.push({ a: l.a, b: at(lo) });
  if (hi < 1 - 1e-9) out.push({ a: at(hi), b: l.b });
  return out;
}

/** Extend the end of line l that is nearer to `click` along its own direction until it meets the first of the other segments. Returns null when nothing is in the way. */
export function extendLine(l: { a: P; b: P }, others: { a: P; b: P }[], click: P): { a: P; b: P } | null {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y; if (dx * dx + dy * dy < 1e-18) return null;
  const endB = Math.hypot(click.x - l.b.x, click.y - l.b.y) <= Math.hypot(click.x - l.a.x, click.y - l.a.y);
  const o0 = endB ? l.b : l.a; const d = endB ? { x: dx, y: dy } : { x: -dx, y: -dy };
  let best = Infinity;
  for (const o of others) {
    const ex = o.b.x - o.a.x, ey = o.b.y - o.a.y, den = d.x * ey - d.y * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((o.a.x - o0.x) * ey - (o.a.y - o0.y) * ex) / den, s = ((o.a.x - o0.x) * d.y - (o.a.y - o0.y) * d.x) / den;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t;
  }
  if (!isFinite(best)) return null;
  const n = { x: o0.x + d.x * best, y: o0.y + d.y * best };
  return endB ? { a: l.a, b: n } : { a: n, b: l.b };
}
/** Split line l at the point of it nearest to `click`. Returns null when that point is within 1e-6 of an end. */
export function splitLine(l: { a: P; b: P }, click: P): [{ a: P; b: P }, { a: P; b: P }] | null {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L2 = dx * dx + dy * dy; if (L2 < 1e-18) return null;
  const t = ((click.x - l.a.x) * dx + (click.y - l.a.y) * dy) / L2; if (t * Math.sqrt(L2) < 1e-6 || (1 - t) * Math.sqrt(L2) < 1e-6) return null;
  const p = { x: l.a.x + dx * t, y: l.a.y + dy * t }; return [{ a: l.a, b: p }, { a: p, b: l.b }];
}

/** Closed Catmull-Rom spline through fit points as cubic Bezier spans. The sketch, selection and solid kernel all use these same spans. */
export type Bez = { a: P; c1: P; c2: P; b: P };
export function splineBeziers(fit: P[]): Bez[] {
  const n = fit.length; const out: Bez[] = [];
  for (let i = 0; i < n; i++) { const p0 = fit[(i + n - 1) % n], p1 = fit[i], p2 = fit[(i + 1) % n], p3 = fit[(i + 2) % n]; out.push({ a: p1, c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, b: p2 }); }
  return out;
}
export function splineSample(fit: P[], per = 24): P[] {
  const out: P[] = [];
  for (const s of splineBeziers(fit)) for (let k = 0; k < per; k++) { const t = k / per, u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t; out.push({ x: w0 * s.a.x + w1 * s.c1.x + w2 * s.c2.x + w3 * s.b.x, y: w0 * s.a.y + w1 * s.c1.y + w2 * s.c2.y + w3 * s.b.y }); }
  return out;
}
