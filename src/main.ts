import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toOBJ, toSTEP, toDXF } from './exporters';
import { solveSketch, solveCircleSketch, dofSketch, dofLineMarks, getW, Con, L } from './solver';
import { LINE_KINDS } from './solver-core';
import { solveArcs } from './arc-solver-core';
import { computeBodies, stepOf, loadKernel, Body as KBody } from './kernel';
import type { Spec } from './kernel-core';
import { transformEntity, offsetEntity, moveTf, rotateTf, mirrorTf, scaleEntity, stretchEntity, isPt, PointE, arcConcentric, arcEqualRadius } from './sketch-ops';
import { SketchSrc, Entity, Feature, P, filletCorner, trimLine, extendLine, splitLine, buildGeometry, snap, outline, toSTL, volume, resolveLoops, circle3, incircleOfLines, arcTangentFrom, splineSample } from './geometry';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (t: string) => ($('msg').textContent = t);
const mobile = () => innerWidth < 800;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Mode = 'model' | 'sketch';
let mode: Mode = 'model';
let tool: 'cpt' | 'csym' | 'ccol' | 'point' | 'rect' | 'circle' | 'poly' | 'slot' | 'slotov' | 'slotcp' | 'ellipse' | 'rpoly' | 'cpoly' | 'circ3' | 'ctan3' | 'arct' | 'arcc' | 'rectc' | 'rect3' | 'spline' | 'line' | 'arc' | 'dim' | 'sfil' | 'trim' | 'extend' | 'split' | 'chor' | 'cver' | 'cpar' | 'cper' | 'ceq' | 'cfix' | 'ccoin' | 'crad' | 'ctanarc' | 'ctan' | 'cconc' | 'ceqr' | 'select' | 'none' = 'rect';
let conEnd: { l: Extract<Entity, { t: 'line' }>; e: number } | null = null; let cons: Con[] = []; let conPick: L | null = null; let symPick: L[] = []; let ptPick: PointE | null = null; let pendingSrc: SketchSrc | null = null; let matIdx = 0;
const MATS: [string, number, string][] = [['Generic (placeholder, not a real material)', 1.0, 'placeholder'], ['Aluminum 6061 (typical)', 2.70, 'MatWeb, AA typical value'], ['Steel AISI 1018', 7.87, 'MatWeb AISI 1018'], ['Stainless steel 304', 8.00, 'MatWeb UNS S30400'], ['Gray cast iron (typical)', 7.15, 'MatWeb, typical for gray cast iron; varies by class'], ['Copper (pure)', 8.96, 'Royal Society of Chemistry, element data'], ['Brass C26000', 8.53, 'MatWeb, cartridge brass UNS C26000'], ['Titanium Ti-6Al-4V', 4.43, 'ASM data sheet via MatWeb, annealed'], ['Gold (pure)', 19.32, 'NIST Star composition data'], ['Nylon 6 (average of grades)', 1.13, 'LookPolymers average of 526 grades; fillers change it']]; // g/cm3. Reference values for one specific alloy/grade each; real parts vary with alloy, temper, moisture and supplier. Check your own material data.
const matName = () => MATS[matIdx][0];
let filPt: P | null = null; let filR = 2;
type Dim = { e: Entity; w: 'len' | 'dia' | 'rad' | 'w' | 'h'; pos: P };
let dims: Dim[] = [];
let dimTarget: { e: Entity; w: Dim['w']; pos: P } | null = null;
let segPts: P[] = []; // line chain start / arc clicks in progress
let hover: P | null = null;
let sketch: Entity[] = [];
let winA: P | null = null, winB: P | null = null, winPx = { x: 0, y: 0 }; // window-select box (world corners, start pixel)
let selE: Entity[] = []; let hist: string[] = []; let redoS: string[] = []; let restoring = false;
type PlaneId = 'XY' | 'XZ' | 'YZ';
/** Where the sketch X, Y and normal point in world axes for a plane and orientation (same mapping as the kernel). */
function sketchAxesWorld(plane: PlaneId, o: { r?: number; f?: boolean }) {
  const rot = (v: number[]) => { let [x, y, z] = v; for (let i = 0; i < (o.r ?? 0); i++) [x, y] = [-y, x]; if (o.f) { y = -y; z = -z; } return [x, y, z]; };
  const map = (v: number[]) => (plane === 'XZ' ? [v[0], -v[2], v[1]] : plane === 'YZ' ? [v[2], v[0], v[1]] : v);
  const nm = (v: number[]) => { const i = v.findIndex((c) => Math.abs(c) > 0.5); return (v[i] > 0 ? '+' : '-') + 'XYZ'[i]; };
  return { x: nm(map(rot([1, 0, 0]))), y: nm(map(rot([0, 1, 0]))), n: nm(map(rot([0, 0, 1]))) };
}
type OrientV = { r?: 0 | 1 | 2 | 3; f?: boolean };
let curOrient: OrientV = {}; // sketch axis orientation of the current sketch
let curPlane: PlaneId = 'XY'; // plane of the sketch being drawn, edited or waiting for a feature
let pending: Entity[] | null = null; // finished sketch not yet used by a feature
let features: Feature[] = [];
let sel: number | null = null; // selected feature
let editing: number | null = null; // feature whose sketch is being edited
let dlgKind: 'extrude' | 'revolve' | null = null;
let drag: { start: P; cur: P; moved: boolean } | null = null;
let polyPts: P[] = [];
const cam = { x: 20, y: 15, s: 6 };

// ---------- 2D sketch canvas ----------
const sk = $<HTMLCanvasElement>('sk');
const ctx = sk.getContext('2d')!;
const grid = () => (cam.s > 12 ? 1 : cam.s > 4 ? 5 : 10);
const toWorld = (px: number, py: number): P => ({ x: (px - sk.width / 2) / cam.s + cam.x, y: -(py - sk.height / 2) / cam.s + cam.y });
const toScreen = (p: P) => ({ x: (p.x - cam.x) * cam.s + sk.width / 2, y: -(p.y - cam.y) * cam.s + sk.height / 2 });
/** Solve line constraints, then circle constraints (lines stay fixed). Nothing is written when either solve fails. */
/** Persistent arc Concentric / Equal radius: re-applied after every solve and after a reference size edit. Throws when a reference has no usable centre. */
function applyArcRels() {
  for (const c of cons) { const k = c.k as string; if (k !== 'aconc' && k !== 'aeqr') continue; const arc = c.l as unknown as Entity, ref = c.m as unknown as Entity; if (!sketch.includes(arc) || !sketch.includes(ref) || arc.t !== 'arc') continue;
    const rc = ref.t === 'arc' ? circle3(ref.a, ref.b, ref.m) : ref.t === 'circle' ? { c: ref.c, r: ref.r } : null; if (!rc) throw new Error('A reference of an arc constraint has no usable centre.');
    const nu = k === 'aconc' ? arcConcentric(arc, rc.c) : arcEqualRadius(arc, rc.r); if (!nu || nu.t !== 'arc') throw new Error('An arc constraint cannot be kept for this size.'); arc.a = nu.a; arc.b = nu.b; arc.m = nu.m; }
  // Check every relation on the result: two constraints on one arc can disagree, and the last transform must not hide that.
  for (const c of cons) { const k = c.k as string; if (k !== 'aconc' && k !== 'aeqr') continue; const arc = c.l as unknown as Entity, ref = c.m as unknown as Entity; if (!sketch.includes(arc) || !sketch.includes(ref) || arc.t !== 'arc') continue;
    const rc = ref.t === 'arc' ? circle3(ref.a, ref.b, ref.m) : ref.t === 'circle' ? { c: ref.c, r: ref.r } : null, ac = circle3(arc.a, arc.b, arc.m); if (!rc || !ac) throw new Error('An arc constraint cannot be checked.');
    const bad = k === 'aconc' ? Math.hypot(ac.c.x - rc.c.x, ac.c.y - rc.c.y) > 1e-6 * Math.max(1, rc.r) : Math.abs(ac.r - rc.r) > 1e-6 * Math.max(1, rc.r);
    if (bad) throw new Error('These arc constraints conflict: they cannot all be true for the same arc. Nothing was kept.'); }
}
let dofVal: number | null = null, dofSeq = 0, dofFixed = new Set<L>();
function refreshDof() { const ls = sketch.filter((e) => e.t === 'line') as L[]; const n = ++dofSeq; if (!ls.length) { if (dofVal !== null) { dofVal = null; draw(); } return; }
  const lc = cons.filter((c) => LINE_KINDS.includes(c.k));
  (lc.length ? dofLineMarks(ls, lc) : Promise.resolve(ls.map(() => false))).then((mk) => { if (n !== dofSeq) return; const nm = new Set<L>(); ls.forEach((l, i) => { if (mk[i]) nm.add(l); }); const same = nm.size === dofFixed.size && [...nm].every((x) => dofFixed.has(x)); if (!same) { dofFixed = nm; draw(); } }, () => undefined);
  dofSketch(ls, lc).then((d) => d >= 0 ? d : null, () => null).then((d) => { if (n !== dofSeq) return; if (d !== dofVal) { dofVal = d; draw(); } }); }
/** Persistent Point-on-end relation (kind 'pcoin'): the Point marker follows the chosen end point of a line, re-applied after every solve. */
function applyPointRels() {
  for (const c of cons) { const k = c.k as string; if (!PT_KINDS.includes(k)) continue; const pe = c.l as unknown as PointE, tg = c.m as unknown as Entity; if (!sketch.includes(pe as unknown as Entity) || !sketch.includes(tg)) continue;
    if (k === 'pcoin') { const ln = tg as unknown as { a: P; b: P }; const q = (c.v ?? 0) ? ln.b : ln.a; pe.p = { x: q.x, y: q.y }; }
    else if (k === 'pcol') { const ln = tg as unknown as { a: P; b: P }; const dx = ln.b.x - ln.a.x, dy = ln.b.y - ln.a.y, L2 = dx * dx + dy * dy; if (L2 > 1e-12) { const u = ((pe.p.x - ln.a.x) * dx + (pe.p.y - ln.a.y) * dy) / L2; pe.p = { x: ln.a.x + u * dx, y: ln.a.y + u * dy }; } }
    else { const ci = tg as unknown as { c: P; r: number }; const dx = pe.p.x - ci.c.x, dy = pe.p.y - ci.c.y, d = Math.hypot(dx, dy); if (d > 1e-9) pe.p = { x: ci.c.x + dx / d * ci.r, y: ci.c.y + dy / d * ci.r }; } } }
const PT_KINDS = ['pcoin', 'pcol', 'pcoc'];
async function solveAll(lines: L[], all: Con[]): Promise<void> { await solveAll0(lines, all); applyArcRels(); applyPointRels(); }
async function solveAll0(lines: L[], all: Con[]): Promise<void> {
  await solveSketch(lines, all.filter((c) => LINE_KINDS.includes(c.k)));
  const ac = all.filter((c) => (c.k as string) === 'tanla');
  if (ac.length) { const arcs = sketch.filter((e) => e.t === 'arc') as unknown as { a: P; b: P; m: P }[]; solveArcs((await getW()) as never, lines, arcs, ac.map((c) => ({ k: 'tanla' as const, arc: c.l as never, l: c.m as never })) as never); }
  const cc = all.filter((c) => !LINE_KINDS.includes(c.k) && (c.k as string) !== 'tanla' && (c.k as string) !== 'aconc' && (c.k as string) !== 'aeqr' && !PT_KINDS.includes(c.k as string)); if (!cc.length) return;
  const circles = sketch.filter((e) => e.t === 'circle') as unknown as { c: P; r: number }[];
  await solveCircleSketch(lines, circles, cc.map((c) => ({ k: c.k as 'tanlc' | 'tancc' | 'conc' | 'eqr' | 'rad', ...(c.v !== undefined ? { v: c.v } : {}), c: (c.k === 'tanlc' ? c.l : c.l) as never, ...(c.k === 'tanlc' ? { l: c.m } : c.m ? { d: c.m as never } : {}) })) as never);
}
const ringHit = (pr: P) => { let best: Extract<Entity, { t: 'circle' }> | null = null, bd = (10 * devicePixelRatio) / cam.s; for (const e of sketch) if (e.t === 'circle') { const d = Math.abs(Math.hypot(pr.x - e.c.x, pr.y - e.c.y) - e.r); if (d < bd) { bd = d; best = e; } } return best; };
let cirPick: Entity | null = null;
function path(pts: P[], close: boolean) { pts.forEach((p, i) => { const s = toScreen(p); i ? ctx.lineTo(s.x, s.y) : (ctx.beginPath(), ctx.moveTo(s.x, s.y)); }); if (close) ctx.closePath(); }
function current(): Entity | null {
  if (!drag) return null;
  if (tool === 'rect') return { t: 'rect', a: drag.start, b: drag.cur };
  if (tool === 'circle') return { t: 'circle', c: drag.start, r: Math.hypot(drag.cur.x - drag.start.x, drag.cur.y - drag.start.y) };
  return null;
}

// ---------- Dimension tool (driving dimensions, applied directly: no constraint solver yet) ----------
const dseg = (p: P, a: P, b: P) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0; return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); };
function dimHit(p: P): { e: Entity; w: Dim['w'] } | null {
  const tol = 8 / cam.s; let best: { e: Entity; w: Dim['w'] } | null = null, bd = tol;
  for (const e of sketch) {
    if (e.t === 'line') { const d = dseg(p, e.a, e.b); if (d < bd) { bd = d; best = { e, w: 'len' }; } }
    else if (e.t === 'circle') { const d = Math.abs(Math.hypot(p.x - e.c.x, p.y - e.c.y) - e.r); if (d < bd) { bd = d; best = { e, w: 'dia' }; } }
    else if (e.t === 'arc') { const pts = outline(e); for (let i = 0; i + 1 < pts.length; i++) { const d = dseg(p, pts[i], pts[i + 1]); if (d < bd) { bd = d; best = { e, w: 'rad' }; } } }
    else if (e.t === 'rect') { const o = outline(e); for (let i = 0; i < 4; i++) { const d = dseg(p, o[i], o[(i + 1) % 4]); if (d < bd) { bd = d; best = { e, w: i % 2 === 0 ? 'w' : 'h' }; } } }
  }
  return best;
}
function dimValue(e: Entity, w: Dim['w']): number {
  if (e.t === 'line') return Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
  if (e.t === 'circle') return e.r * 2;
  if (e.t === 'arc') return circle3(e.a, e.b, e.m)?.r ?? 0;
  if (e.t === 'rect') return w === 'w' ? Math.abs(e.b.x - e.a.x) : Math.abs(e.b.y - e.a.y);
  return 0;
}
function dimApply(e: Entity, w: Dim['w'], v: number) {
  if (!(v > 0)) throw new Error('Dimension must be greater than 0.');
  if (e.t === 'circle') { e.r = v / 2; return; }
  if (e.t === 'rect') { if (w === 'w') e.b.x = e.a.x + Math.sign(e.b.x - e.a.x || 1) * v; else e.b.y = e.a.y + Math.sign(e.b.y - e.a.y || 1) * v; return; }
  if (e.t === 'line') {
    const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y); if (L < 1e-12) throw new Error('Zero-length line.');
    const old = { ...e.b }; const nb = { x: e.a.x + ((e.b.x - e.a.x) / L) * v, y: e.a.y + ((e.b.y - e.a.y) / L) * v };
    for (const o of sketch) { // keep connected end points joined
      if (o === e) continue;
      for (const k of ['a', 'b'] as const) if ((o.t === 'line' || o.t === 'arc') && Math.hypot(o[k].x - old.x, o[k].y - old.y) < 1e-6) o[k] = { ...nb };
    }
    e.b = nb; return;
  }
  if (e.t === 'arc') {
    const k = circle3(e.a, e.b, e.m); if (!k) throw new Error('Degenerate arc.');
    const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }; const half = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) / 2;
    if (v < half - 1e-9) throw new Error(`Radius must be at least half the chord (${half.toFixed(3)}).`);
    const h = Math.sqrt(Math.max(0, v * v - half * half)); let nx = k.c.x - mid.x, ny = k.c.y - mid.y; const nl = Math.hypot(nx, ny);
    if (nl < 1e-9) { nx = -(e.b.y - e.a.y); ny = e.b.x - e.a.x; const sgn = nx * (e.m.x - mid.x) + ny * (e.m.y - mid.y) > 0 ? -1 : 1; nx *= sgn; ny *= sgn; }
    const L2 = Math.hypot(nx, ny); nx /= L2; ny /= L2; const c2 = { x: mid.x + nx * h, y: mid.y + ny * h };
    const dx = e.m.x - c2.x, dy = e.m.y - c2.y, dl = Math.hypot(dx, dy) || 1; e.m = { x: c2.x + (dx / dl) * v, y: c2.y + (dy / dl) * v };
  }
}
const dimText = (d: Dim) => { const v = dimValue(d.e, d.w); return (d.w === 'dia' ? '\u00D8' : d.w === 'rad' ? 'R' : '') + (+v.toFixed(3)); };
function draw() {
  if (mode !== 'sketch') return;
  ck();
  const dpr = devicePixelRatio; ctx.clearRect(0, 0, sk.width, sk.height);
  const g = grid(); ctx.lineWidth = 1; ctx.strokeStyle = '#dfe3ea';
  const a = toWorld(0, sk.height), b = toWorld(sk.width, 0);
  for (let x = Math.floor(a.x / g) * g; x <= b.x; x += g) { const s = toScreen({ x, y: 0 }); ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, sk.height); ctx.stroke(); }
  for (let y = Math.floor(a.y / g) * g; y <= b.y; y += g) { const s = toScreen({ x: 0, y }); ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(sk.width, s.y); ctx.stroke(); }
  const o = toScreen({ x: 0, y: 0 }); ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d33'; ctx.beginPath(); ctx.moveTo(0, o.y); ctx.lineTo(sk.width, o.y); ctx.stroke();
  ctx.strokeStyle = '#2a2'; ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, sk.height); ctx.stroke();
  if (dofVal !== null) { ctx.font = `${12 * dpr}px sans-serif`; ctx.fillStyle = dofVal === 0 ? '#1a7f37' : '#34506f'; ctx.fillText(dofVal === 0 ? 'Lines: fully constrained (0 DOF)' : `Lines: ${dofVal} DOF left (end points; circles and arcs not counted)`, 10 * dpr, 20 * dpr); }
  ctx.fillStyle = '#d33'; ctx.font = `${11 * dpr}px sans-serif`; const ax = sketchAxesWorld(curPlane, curOrient); ctx.fillText('X (' + ax.x + ')', sk.width - 70 * dpr, o.y - 4 * dpr); ctx.fillStyle = '#2a2'; ctx.fillText('Y (' + ax.y + ')', o.x + 5 * dpr, 14 * dpr); ctx.fillStyle = '#34506f'; ctx.fillText(`${curPlane} plane, normal ${ax.n}`, 8 * dpr, sk.height - 8 * dpr);
  ctx.strokeStyle = '#1f6fd1'; ctx.lineWidth = 2 * dpr;
  const c = current(); const all = c ? [...sketch, c] : sketch;
  for (const e of all) { ctx.setLineDash(e.cn ? [8 * dpr, 5 * dpr] : []); ctx.strokeStyle = selE.includes(e) ? '#e8590c' : e.cn ? '#7a8794' : '#1f6fd1'; if (isPt(e)) { const q = toScreen((e as PointE).p); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(q.x - 6 * dpr, q.y); ctx.lineTo(q.x + 6 * dpr, q.y); ctx.moveTo(q.x, q.y - 6 * dpr); ctx.lineTo(q.x, q.y + 6 * dpr); ctx.stroke(); ctx.beginPath(); ctx.arc(q.x, q.y, 2.5 * dpr, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); } else if (e.t === 'line' || e.t === 'arc') { path(outline(e), false); ctx.stroke(); } else { path(outline(e), true); ctx.fillStyle = selE.includes(e) ? '#e8590c22' : '#1f6fd11a'; ctx.fill(); ctx.stroke(); } } ctx.strokeStyle = '#1f6fd1';
  ctx.setLineDash([]);
  for (const e of sketch) if (e.t === 'line' && dofFixed.has(e as L)) { const q = toScreen({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }); ctx.fillStyle = '#1a7f37'; ctx.fillRect(q.x - 4 * dpr, q.y - 4 * dpr, 8 * dpr, 8 * dpr); }
  if (winA && winB) { const a = toScreen(winA), b = toScreen(winB); const cross = winB.x < winA.x; ctx.save(); ctx.setLineDash(cross ? [6 * dpr, 4 * dpr] : []); ctx.strokeStyle = cross ? '#2a8a3a' : '#1f6fd1'; ctx.fillStyle = cross ? 'rgba(42,138,58,0.10)' : 'rgba(31,111,209,0.10)'; ctx.lineWidth = 1.2 * dpr; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)); ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y)); ctx.restore(); }
  if (segPts.length && hover) {
    ctx.setLineDash([6 * dpr, 4 * dpr]); const pv: Entity | null = tool === 'line' ? { t: 'line', a: segPts[0], b: hover } : tool === 'arc' ? (segPts.length === 1 ? { t: 'line', a: segPts[0], b: hover } : { t: 'arc', a: segPts[0], b: segPts[1], m: hover }) : null;
    if (pv) { path(outline(pv), false); ctx.stroke(); } ctx.setLineDash([]); ctx.fillStyle = '#1f6fd1'; segPts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
  }
  if (polyPts.length) { path(polyPts, false); ctx.stroke(); ctx.fillStyle = '#1f6fd1'; polyPts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }); }
  dims = dims.filter((d) => sketch.includes(d.e)); cons = cons.filter((c) => sketch.includes(c.l as Entity) && (!c.m || sketch.includes(c.m as Entity)) && (!c.n || sketch.includes(c.n as Entity)));
  for (const c of cons) { const mid = (l: L) => { const ci = l as unknown as { c?: P; r?: number }; const ang = 0.9 * cons.indexOf(c); const am = (l as unknown as { m?: P }).m; if (am) return toScreen(am); return ci.c ? toScreen({ x: ci.c.x + (ci.r ?? 0) * Math.cos(ang), y: ci.c.y + (ci.r ?? 0) * Math.sin(ang) }) : toScreen({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }); }; if (c.k === 'len') continue; if (PT_KINDS.includes(c.k as string)) { const s = toScreen((c.l as unknown as PointE).p); ctx.strokeStyle = '#b4531a'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.arc(s.x, s.y, 7 * dpr, 0, 7); ctx.stroke(); continue; } if (c.k === 'coin') { const v = c.v ?? 0; const q = (l: L, e: number) => toScreen(e ? l.b : l.a); ctx.strokeStyle = '#b4531a'; ctx.lineWidth = 2 * dpr; for (const s of [q(c.l, v >> 1 & 1), q(c.m!, v & 1)]) { ctx.beginPath(); ctx.arc(s.x, s.y, 6 * dpr, 0, 7); ctx.stroke(); } continue; } const lab = ({ h: 'H', v: 'V', par: '\u2225', perp: '\u22A5', eq: '=', fix: '\u2693', tanlc: 'T', tancc: 'T', conc: '\u25CE', eqr: '=', rad: 'R', tanla: 'T', aconc: '\u25CE', aeqr: '=', col: '\u2261', sym: '\u21D4' } as Record<string, string>)[c.k]; ctx.font = `bold ${12 * dpr}px sans-serif`; ctx.fillStyle = '#b4531a'; for (const l of c.m ? [c.l, c.m] : [c.l]) { const s = mid(l); ctx.fillText(lab, s.x + 6 * dpr, s.y - 6 * dpr); } }
  for (const d of dims) { const s = toScreen(d.pos); const t = dimText(d); ctx.font = `${12 * dpr}px sans-serif`; const w = ctx.measureText(t).width + 8 * dpr; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#34506f'; ctx.lineWidth = 1 * dpr; ctx.fillRect(s.x, s.y - 9 * dpr, w, 18 * dpr); ctx.strokeRect(s.x, s.y - 9 * dpr, w, 18 * dpr); ctx.fillStyle = '#123'; ctx.fillText(t, s.x + 4 * dpr, s.y + 4 * dpr); }
  ctx.strokeStyle = '#1f6fd1';
  if (hover && tool !== 'none' && Math.hypot(hover.x, hover.y) < 1e-9) { const o2 = toScreen({ x: 0, y: 0 }); ctx.fillStyle = '#2bb24c'; ctx.beginPath(); ctx.arc(o2.x, o2.y, 5 * dpr, 0, 7); ctx.fill(); }
  if (c && drag) { ctx.fillStyle = '#123'; ctx.font = `${13 * dpr}px sans-serif`; const s = toScreen(drag.cur); ctx.fillText(c.t === 'rect' ? `${Math.abs(c.b.x - c.a.x)} x ${Math.abs(c.b.y - c.a.y)} mm` : c.t === 'circle' ? `R ${c.r.toFixed(1)} mm` : '', s.x + 12, s.y - 12); }
}
function ptRaw(e: PointerEvent): P { const r = sk.getBoundingClientRect(); return toWorld((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio); }
function pt(e: PointerEvent): P { const r = sk.getBoundingClientRect(); const w = toWorld((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio); const g = grid(); const tg = snapTarget(w); if (tg) return tg; return { x: snap(w.x, g), y: snap(w.y, g) }; }
/** Snap to a Point marker, a line end point or a circle centre when the pointer is within 10 px of one. Points win over the others. */
const commitSpline = () => { if (polyPts.length < 3) return; const fit = polyPts.map((q) => ({ x: q.x, y: q.y })); sketch.push({ t: 'poly', pts: splineSample(fit), spl: fit }); polyPts = []; props(); msg(`Closed spline added (${fit.length} points). Not parametric.`); };
function snapTarget(w: P): P | null { const lim = (10 * devicePixelRatio) / cam.s; let best: P | null = null, bd = lim; const tryP = (q: P, bonus = 0) => { const d = Math.hypot(q.x - w.x, q.y - w.y) - bonus; if (d < bd) { bd = d; best = { x: q.x, y: q.y }; } };
  for (const e of sketch) { if (isPt(e)) tryP((e as PointE).p, lim * 0.5); else if (e.t === 'line') { tryP(e.a); tryP(e.b); tryP({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }); } else if (e.t === 'circle') tryP(e.c); else if (e.t === 'arc') { tryP(e.a); tryP(e.b); } }
  const ls = sketch.filter((e) => e.t === 'line') as Extract<Entity, { t: 'line' }>[];
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const p = ls[i], q = ls[j]; const r = { x: p.b.x - p.a.x, y: p.b.y - p.a.y }, s2 = { x: q.b.x - q.a.x, y: q.b.y - q.a.y }; const den = r.x * s2.y - r.y * s2.x; if (Math.abs(den) < 1e-12) continue; const tt = ((q.a.x - p.a.x) * s2.y - (q.a.y - p.a.y) * s2.x) / den, uu = ((q.a.x - p.a.x) * r.y - (q.a.y - p.a.y) * r.x) / den; if (tt > 1e-9 && tt < 1 - 1e-9 && uu > 1e-9 && uu < 1 - 1e-9) tryP({ x: p.a.x + tt * r.x, y: p.a.y + tt * r.y }); }
  return best; }
let pan: { x: number; y: number } | null = null;
sk.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return; // right click opens the Inventor-style OK / Cancel menu
  if (drag && (tool === 'rect' || tool === 'circle')) { sk.setPointerCapture(e.pointerId); drag.cur = pt(e); const c = current(); if (c) sketch.push(c); drag = null; draw(); props(); return; } // second click commits (lesson: click, move, click)
  if (e.button === 1 || e.shiftKey) { pan = { x: e.clientX, y: e.clientY }; return; }
  sk.setPointerCapture(e.pointerId); const p = pt(e); const pr = ptRaw(e);
  if (tool === 'select') { winA = null; winB = null; const had = pickEnt(pr, e.ctrlKey || e.metaKey); if (!had) { winA = pr; winB = pr; winPx = { x: e.clientX, y: e.clientY }; } return; }
  if (tool === 'crad') {
    const cir = ringHit(pr); if (!cir) { msg("Click a circle's outline to pin its radius."); return; }
    if (cons.some((x) => (x.k as string) === 'rad' && (x.l as unknown) === cir)) { msg('This circle already has a pinned radius.'); return; }
    const c: Con = { k: 'rad' as string as Con['k'], l: cir as unknown as L, v: cir.r }; cons.push(c); msg('Pinning radius...');
    solveAll(sketch.filter((e) => e.t === 'line') as L[], cons).then(() => { msg(`Radius pinned at ${+cir.r.toFixed(4)} mm (the circle keeps this size while other constraints move it).`); props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== c); msg((er as Error).message); draw(); });
    return;
  }
  if (tool === 'ctanarc') {
    let arc: Extract<Entity, { t: 'arc' }> | null = null, ln: Extract<Entity, { t: 'line' }> | null = null; let bd = (10 * devicePixelRatio) / cam.s, bl = bd;
    for (const e of sketch) { if (e.t === 'arc') { const d = distTo(e, pr); if (d < bd) { bd = d; arc = e; } } else if (e.t === 'line') { const d = dseg(pr, e.a, e.b); if (d < bl) { bl = d; ln = e; } } }
    const hit: Entity | null = arc && (!ln || bd <= bl) ? arc : ln; if (!hit) { msg('Click an arc, then a line (or the line first).'); return; }
    if (!cirPick || !sketch.includes(cirPick)) { cirPick = hit; msg(hit.t === 'arc' ? 'Now click the line. The line and the arc end points stay; the arc bulge changes.' : 'Now click the arc. The line and the arc end points stay; the arc bulge changes.'); return; }
    if (cirPick.t === hit.t) { msg('Pick one arc and one line.'); return; }
    const a2 = (cirPick.t === 'arc' ? cirPick : hit) as Entity, l2 = (cirPick.t === 'line' ? cirPick : hit) as Entity; cirPick = null;
    const c: Con = { k: 'tanla', l: a2 as unknown as L, m: l2 as unknown as L }; cons.push(c); msg('Solving...');
    solveAll(sketch.filter((e) => e.t === 'line') as L[], cons).then(() => { msg('Tangent applied: the line and the arc end points stayed; the arc bulge was adjusted.'); props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== c); msg((er as Error).message); draw(); });
    return;
  }
  if (tool === 'cconc' || tool === 'ceqr') {
    let arcH: Extract<Entity, { t: 'arc' }> | null = null, bdA = (10 * devicePixelRatio) / cam.s; for (const e of sketch) if (e.t === 'arc') { const d = distTo(e, pr); if (d < bdA) { bdA = d; arcH = e; } }
    const cirH = ringHit(pr);
    if ((cirPick && cirPick.t === 'arc') || (!cirPick && arcH && !cirH)) {
      const hit: Entity | null = arcH ?? cirH; if (!hit) { msg('Click an arc or a circle (click its outline).'); return; }
      if (!cirPick || !sketch.includes(cirPick)) { cirPick = hit; msg('Now click the reference arc or circle. It stays; the first arc is adjusted and the constraint is kept.'); return; }
      if (hit === cirPick) { msg('Pick a different second shape.'); return; }
      const first = cirPick as Extract<Entity, { t: 'arc' }>; cirPick = null;
      const ref = hit.t === 'arc' ? circle3(hit.a, hit.b, hit.m) : hit.t === 'circle' ? { c: hit.c, r: hit.r } : null; if (!ref) { msg('That reference shape has no usable centre. Nothing changed.'); return; }
      if (cons.some((c2) => (c2.l === (first as unknown) || c2.m === (first as unknown)) && (c2.k as string) !== 'aconc' && (c2.k as string) !== 'aeqr') || dims.some((d2) => d2.e === first)) { msg('The first arc has other constraints or dimensions, so it cannot be changed in place. Nothing changed.'); return; }
      const shared = sketch.some((o) => o !== first && (o.t === 'line' || o.t === 'arc') && [first.a, first.b].some((q) => [o.a, o.b].some((w2) => Math.hypot(w2.x - q.x, w2.y - q.y) < 1e-6)));
      if (shared) { msg('The arc shares an end point with another shape, which would not follow. Nothing changed.'); return; }
      const old0 = { a: first.a, b: first.b, m: first.m }; const con: Con = { k: (tool === 'cconc' ? 'aconc' : 'aeqr'), l: first as unknown as L, m: hit as unknown as L }; cons.push(con);
      try { applyArcRels(); } catch (er) { cons = cons.filter((x) => x !== con); first.a = old0.a; first.b = old0.b; first.m = old0.m; msg((er as Error).message); return; }
      ck(); props(); draw(); msg(tool === 'cconc' ? 'Arc concentric constraint applied and kept: the arc follows the reference when its size is changed (Dimension tool or side panel).' : 'Arc equal radius constraint applied and kept: the arc follows the reference radius when it is changed (Dimension tool or side panel).'); return;
    }
  }
  if (tool === 'ctan' || tool === 'cconc' || tool === 'ceqr') {
    const cir = ringHit(pr); let ln: Extract<Entity, { t: 'line' }> | null = null;
    if (tool === 'ctan' && !cir) { let bd = (10 * devicePixelRatio) / cam.s; for (const e of sketch) if (e.t === 'line') { const d = dseg(pr, e.a, e.b); if (d < bd) { bd = d; ln = e; } } }
    const hit: Entity | null = cir ?? ln; const need = tool === 'ctan' ? 'a circle or a line' : 'a circle';
    if (!hit) { msg(`Click ${need} (click the circle's outline).`); return; }
    if (!cirPick || !sketch.includes(cirPick)) { if (hit.t !== 'circle') { msg('Click the circle first, then the line or the second circle.'); return; } cirPick = hit; msg('Now click the second shape. The second shape stays where it is; the first circle moves (its centre and radius can change).'); return; }
    if (hit === cirPick) { msg('Pick a different second shape.'); return; }
    const first = cirPick; cirPick = null; if (hit.t === 'line' && tool !== 'ctan') { msg('This tool needs two circles.'); return; }
    const c: Con = { k: tool === 'ctan' ? (hit.t === 'line' ? 'tanlc' : 'tancc') : tool === 'cconc' ? 'conc' : 'eqr', l: first as unknown as L, m: hit as unknown as L };
    cons.push(c); msg('Solving...');
    solveAll(sketch.filter((e) => e.t === 'line') as L[], cons).then(() => { msg('Constraint applied: lines and the second shape stayed, the first circle was adjusted.'); props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== c); msg((er as Error).message); draw(); });
    return;
  }
  if (tool === 'ccoin') {
    let bd = (14 * devicePixelRatio) / cam.s, best: { l: Extract<Entity, { t: 'line' }>; e: number } | null = null;
    for (const en of sketch) if (en.t === 'line') for (const e2 of [0, 1]) { const q = e2 ? en.b : en.a; const d = Math.hypot(q.x - pr.x, q.y - pr.y); if (d < bd && !(conEnd && conEnd.l === en)) { bd = d; best = { l: en, e: e2 }; } }
    if (!best) { msg('Coincident: click near a line end point.'); return; }
    if (!conEnd) { conEnd = best; msg('Now click the end point to join it to.'); return; }
    const c: Con = { k: 'coin', l: conEnd.l, m: best.l, v: (conEnd.e << 1) | best.e }; conEnd = null; cons.push(c); msg('Solving...');
    solveAll(sketch.filter((x) => x.t === 'line') as L[], cons).then(() => { msg('Coincident applied.'); props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== c); msg((er as Error).message); draw(); });
    return;
  }
  if (tool === 'cpt') {
    if (!ptPick || !sketch.includes(ptPick as unknown as Entity)) { ptPick = null; let bp: PointE | null = null, bd = (10 * devicePixelRatio) / cam.s; for (const e of sketch) if (isPt(e)) { const d = Math.hypot((e as PointE).p.x - pr.x, (e as PointE).p.y - pr.y); if (d < bd) { bd = d; bp = e as PointE; } }
      if (!bp) { msg('Point on end: click a Point marker first.'); return; }
      if (cons.some((x) => PT_KINDS.includes(x.k as string) && (x.l as unknown) === bp)) { msg('This Point is already attached.'); return; }
      ptPick = bp; msg('Now click a line end point (follows that end), a line (stays on it) or a circle (stays on it).'); return; }
    let best: { l: Extract<Entity, { t: 'line' }>; e: number } | null = null, bd2 = (10 * devicePixelRatio) / cam.s;
    for (const e of sketch) if (e.t === 'line') for (const k of [0, 1]) { const q = k ? e.b : e.a; const d = Math.hypot(q.x - pr.x, q.y - pr.y); if (d < bd2) { bd2 = d; best = { l: e, e: k }; } }
    if (!best) {
      const tol = (10 * devicePixelRatio) / cam.s; let tg: Entity | null = null, kk = '', bd3 = tol;
      for (const e of sketch) { if (e.t === 'line') { const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L2 = dx * dx + dy * dy; if (L2 < 1e-12) continue; const u = Math.max(0, Math.min(1, ((pr.x - e.a.x) * dx + (pr.y - e.a.y) * dy) / L2)); const d = Math.hypot(pr.x - (e.a.x + u * dx), pr.y - (e.a.y + u * dy)); if (d < bd3) { bd3 = d; tg = e; kk = 'pcol'; } } else if (e.t === 'circle') { const d = Math.abs(Math.hypot(pr.x - e.c.x, pr.y - e.c.y) - e.r); if (d < bd3) { bd3 = d; tg = e; kk = 'pcoc'; } } }
      if (!tg) { msg('Click near a line end point, a line or a circle.'); return; }
      const c2: Con = { k: kk as Con['k'], l: ptPick as unknown as L, m: tg as unknown as L }; ptPick = null; cons.push(c2); applyPointRels(); ck(); msg(kk === 'pcol' ? 'Point on line: it is projected onto the line and follows it (one-way).' : 'Point on circle: it is moved onto the circle and follows it (one-way).'); props(); draw(); return;
    }
    const c: Con = { k: 'pcoin' as Con['k'], l: ptPick as unknown as L, m: best.l as unknown as L, v: best.e }; ptPick = null; cons.push(c); applyPointRels(); ck(); msg('Point attached: it now follows that line end (one-way: the line does not follow the Point).'); props(); draw(); return;
  }
  if (tool === 'csym') {
    let bi = -1, bd = (10 * devicePixelRatio) / cam.s;
    sketch.forEach((e, i) => { if (e.t === 'line') { const d = dseg(pr, e.a, e.b); if (d < bd) { bd = d; bi = i; } } });
    if (bi < 0) { msg('Symmetric: click a line.'); return; }
    const ln = sketch[bi] as Extract<Entity, { t: 'line' }>; symPick = symPick.filter((x) => sketch.includes(x as Entity));
    if (symPick.includes(ln)) { msg('Pick a different line.'); return; }
    symPick.push(ln); if (symPick.length === 1) { msg('Symmetric: now click the second line (it will mirror the first).'); return; } if (symPick.length === 2) { msg('Now click the axis line (the mirror line).'); return; }
    const c: Con = { k: 'sym', l: symPick[0], m: symPick[1], n: symPick[2] }; symPick = []; cons.push(c); msg('Solving...');
    solveAll(sketch.filter((e) => e.t === 'line') as L[], cons).then(() => { msg('Symmetric applied.'); props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== c); msg((er as Error).message); draw(); });
    return;
  }
  if (tool === 'ccol' || tool === 'chor' || tool === 'cver' || tool === 'cpar' || tool === 'cper' || tool === 'ceq' || tool === 'cfix') {
    let bi = -1, bd = (10 * devicePixelRatio) / cam.s;
    sketch.forEach((e, i) => { if (e.t === 'line') { const d = dseg(pr, e.a, e.b); if (d < bd) { bd = d; bi = i; } } });
    if (bi < 0) { msg('Constraint: click a line.'); return; }
    const ln = sketch[bi] as Extract<Entity, { t: 'line' }>; const two = tool === 'cpar' || tool === 'cper' || tool === 'ceq' || tool === 'ccol';
    if (two && (!conPick || !sketch.includes(conPick as Entity))) { conPick = ln; msg('Now click the second line.'); return; }
    if (two && conPick === ln) { msg('Pick a different second line.'); return; }
    const c: Con = { k: ({ chor: 'h', cver: 'v', cpar: 'par', cper: 'perp', ceq: 'eq', cfix: 'fix', ccol: 'col' } as const)[tool], l: ln, ...(two ? { m: conPick! } : {}) }; if (two) { c.l = conPick!; c.m = ln; } conPick = null;
    cons.push(c); msg('Solving...');
    solveAll(sketch.filter((e) => e.t === 'line') as L[], cons).then(() => { msg('Constraint applied.'); props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== c); msg((er as Error).message); draw(); });
    return;
  }
  if (tool === 'extend' || tool === 'split') {
    let bi = -1, bd = (10 * devicePixelRatio) / cam.s;
    sketch.forEach((e, i) => { if (e.t === 'line') { const d = dseg(pr, e.a, e.b); if (d < bd) { bd = d; bi = i; } } });
    if (bi < 0) { msg(`${tool === 'extend' ? 'Extend' : 'Split'}: click a line.`); return; }
    const l = sketch[bi] as Extract<Entity, { t: 'line' }>;
    if (usedByCon(l)) { msg('This line has constraints or dimensions, so it cannot be changed in place. Remove them first. Nothing changed.'); return; }
    if (tool === 'extend') {
      const others = sketch.filter((e, i) => i !== bi && e.t === 'line') as Extract<Entity, { t: 'line' }>[];
      const n = extendLine(l, others, pr); if (!n) { msg('Extend: no line in the way at that end. Nothing changed.'); return; }
      sketch[bi] = { t: 'line', a: n.a, b: n.b }; msg('Extended to the next line.');
    } else {
      const sp = splitLine(l, pr); if (!sp) { msg('Split: click away from the ends of the line. Nothing changed.'); return; }
      sketch.splice(bi, 1, { t: 'line', a: sp[0].a, b: sp[0].b }, { t: 'line', a: sp[1].a, b: sp[1].b }); msg('Split into two lines at that point.');
    }
    props(); draw(); return;
  }
  if (tool === 'trim') {
    let bi = -1, bd = (10 * devicePixelRatio) / cam.s;
    sketch.forEach((e, i) => { if (e.t === 'line') { const d = dseg(pr, e.a, e.b); if (d < bd) { bd = d; bi = i; } } });
    if (bi < 0) { msg('Trim: click a line (crossing lines only).'); return; }
    const l = sketch[bi] as Extract<Entity, { t: 'line' }>;
    const others = sketch.filter((e, i) => i !== bi && e.t === 'line') as Extract<Entity, { t: 'line' }>[];
    try { const parts = trimLine(l, others, pr); sketch.splice(bi, 1, ...parts.map((q) => ({ t: 'line' as const, a: q.a, b: q.b }))); msg(parts.length ? 'Trimmed.' : 'Line removed (it had no crossing).'); props(); draw(); } catch (er) { msg((er as Error).message); }
    return;
  }
  if (tool === 'sfil') {
    const tol = (14 * devicePixelRatio) / cam.s; let best: P | null = null; let bd = tol;
    for (const e of sketch) if (e.t === 'line') for (const q of [e.a, e.b]) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = { ...q }; } }
    if (!best) { msg('Fillet: click a corner where two lines meet.'); return; }
    const n = sketch.filter((e) => e.t === 'line' && [e.a, e.b].some((q) => Math.hypot(q.x - best!.x, q.y - best!.y) < 1e-6)).length;
    if (n !== 2) { msg(n < 2 ? 'Fillet: that point is not a corner of two lines.' : 'Fillet: more than two lines meet there.'); return; }
    filPt = best; dimTarget = null; const box = $('dimbox'); const gr = $('gfx').getBoundingClientRect(); box.style.display = 'flex'; box.style.left = Math.min(e.clientX - gr.left + 10, gr.width - 170) + 'px'; box.style.top = e.clientY - gr.top + 10 + 'px';
    const inp = $<HTMLInputElement>('dimin'); inp.value = String(filR); msg('Fillet radius (mm): type the value, then OK or Enter.'); setTimeout(() => { inp.focus(); inp.select(); }, 0); return;
  }
  if (tool === 'dim') {
    const h = dimHit(p); if (!h) { msg('Dimension: click a line, circle, arc or rectangle edge.'); return; }
    dimTarget = { e: h.e, w: h.w, pos: p }; const box = $('dimbox'); const gr = $('gfx').getBoundingClientRect(); box.style.display = 'flex'; box.style.left = Math.min(e.clientX - gr.left + 10, gr.width - 170) + 'px'; box.style.top = e.clientY - gr.top + 10 + 'px';
    const inp = $<HTMLInputElement>('dimin'); inp.value = String(+dimValue(h.e, h.w).toFixed(3)); setTimeout(() => { inp.focus(); inp.select(); }, 0); return;
  }
  if (tool === 'point') { sketch.push({ t: 'point', p: { x: p.x, y: p.y } } as unknown as Entity); ck(); props(); draw(); msg(`Point at X ${p.x} Y ${p.y} mm. It is a marker only and is not part of the profile.`); return; }
  if (tool === 'line') {
    if (!segPts.length) segPts = [p]; else if (Math.hypot(p.x - segPts[0].x, p.y - segPts[0].y) > 1e-9) { sketch.push({ t: 'line', a: segPts[0], b: p }); segPts = [p]; props(); }
    hover = p; draw(); return;
  }
  if (tool === 'arc') {
    segPts.push(p);
    if (segPts.length === 3) { const [a, b, mm] = segPts; if (circle3(a, b, mm)) { sketch.push({ t: 'arc', a, b, m: mm }); props(); } else msg('Arc points are on one line: pick a point off the line.'); segPts = []; }
    hover = p; draw(); return;
  }
  if (tool === 'ctan3') {
    let bi = -1, bd = (10 * devicePixelRatio) / cam.s; sketch.forEach((e, i) => { if (e.t === 'line' && !ctan3Pick.includes(i)) { const d = dseg(pr, e.a, e.b); if (d < bd) { bd = d; bi = i; } } });
    if (bi < 0) { msg(`Circle tangent: click line ${ctan3Pick.length + 1} of 3 (a different line).`); return; }
    ctan3Pick.push(bi);
    if (ctan3Pick.length < 3) { msg(`Circle tangent: line ${ctan3Pick.length} picked. Click line ${ctan3Pick.length + 1} of 3.`); draw(); return; }
    const [l1, l2, l3] = ctan3Pick.map((i) => sketch[i] as Extract<Entity, { t: 'line' }>); ctan3Pick = [];
    const cc = incircleOfLines(l1, l2, l3); if (!cc) { msg('Circle tangent: two of the lines are parallel or the three meet at one point. Pick three lines that make a triangle.'); draw(); return; }
    sketch.push({ t: 'circle', c: cc.c, r: cc.r }); props(); draw(); msg(`Circle added: tangent to the three lines, centre (${+cc.c.x.toFixed(3)}, ${+cc.c.y.toFixed(3)}), radius ${+cc.r.toFixed(3)} mm. Not linked to the lines: it does not follow if they move.`); return;
  }
  if (tool === 'arct') {
    if (!arctStart) {
      let best: { p: P; t: P } | null = null, bd = (14 * devicePixelRatio) / cam.s;
      for (const en of sketch) if (en.t === 'line') for (const e2 of [0, 1]) { const q = e2 ? en.b : en.a, o = e2 ? en.a : en.b; const d = Math.hypot(q.x - pr.x, q.y - pr.y); if (d < bd) { bd = d; best = { p: { ...q }, t: { x: q.x - o.x, y: q.y - o.y } }; } }
      if (!best) { msg('Arc tangent: click an end point of a line first.'); return; }
      arctStart = best; msg('Now click the end point of the arc. It leaves the line end tangent to the line.'); hover = pr; draw(); return;
    }
    const st = arctStart; arctStart = null; const ar = arcTangentFrom(st.p, st.t, p);
    if (!ar) { msg('Arc tangent: the end point is on the line direction. Click off the line.'); draw(); return; }
    sketch.push({ t: 'arc', a: ar.a, b: ar.b, m: ar.m }); props(); draw(); msg(`Arc added: tangent to the line at its end point, radius ${+ar.r.toFixed(3)} mm. Not linked to the line: no tangent constraint.`); return;
  }
  if (tool === 'circ3') {
    segPts.push(p);
    if (segPts.length === 3) { const [a, b, c3] = segPts; segPts = []; const cc = circle3(a, b, c3); if (cc) { sketch.push({ t: 'circle', c: cc.c, r: cc.r }); props(); msg(`Circle added: centre (${+cc.c.x.toFixed(3)}, ${+cc.c.y.toFixed(3)}), radius ${+cc.r.toFixed(3)} mm.`); } else msg('Circle: the three points are on one line. Pick points off the line.'); }
    hover = p; draw(); return;
  }
  if (tool === 'arcc') {
    segPts.push(p);
    if (segPts.length === 2) { if (Math.hypot(segPts[1].x - segPts[0].x, segPts[1].y - segPts[0].y) < 1e-9) { segPts = []; msg('Arc: the start point must differ from the centre.'); draw(); return; } msg('Now click the end direction (the arc runs counter-clockwise from the start).'); }
    if (segPts.length === 3) { const [c, s0, q] = segPts; segPts = []; const r = Math.hypot(s0.x - c.x, s0.y - c.y), a0 = Math.atan2(s0.y - c.y, s0.x - c.x), a1 = Math.atan2(q.y - c.y, q.x - c.x);
      if (Math.hypot(q.x - c.x, q.y - c.y) < 1e-9) { msg('Arc: the end direction cannot be the centre.'); draw(); return; }
      let sw = a1 - a0; while (sw <= 1e-9) sw += 2 * Math.PI; while (sw > 2 * Math.PI) sw -= 2 * Math.PI; if (Math.abs(sw - 2 * Math.PI) < 1e-9) { msg('Arc: the end direction equals the start. Use Circle for a full circle.'); draw(); return; }
      const at = (an: number): P => ({ x: c.x + r * Math.cos(an), y: c.y + r * Math.sin(an) });
      sketch.push({ t: 'arc', a: at(a0), b: at(a0 + sw), m: at(a0 + sw / 2) }); props(); msg(`Arc added: radius ${+r.toFixed(3)} mm, sweep ${+((sw * 180) / Math.PI).toFixed(3)} deg.`); }
    hover = p; draw(); return;
  }
  if (tool === 'rectc') {
    segPts.push(p);
    if (segPts.length === 2) { const [c, q] = segPts; segPts = []; const dx = Math.abs(q.x - c.x), dy = Math.abs(q.y - c.y); if (dx < 1e-9 || dy < 1e-9) { msg('Rectangle: the corner must differ from the centre in both X and Y.'); draw(); return; } sketch.push({ t: 'rect', a: { x: c.x - dx, y: c.y - dy }, b: { x: c.x + dx, y: c.y + dy } }); props(); msg(`Rectangle added: ${+(2 * dx).toFixed(3)} x ${+(2 * dy).toFixed(3)} mm about the centre.`); }
    hover = p; draw(); return;
  }
  if (tool === 'rect3') {
    segPts.push(p);
    if (segPts.length === 2) { if (Math.hypot(segPts[1].x - segPts[0].x, segPts[1].y - segPts[0].y) < 1e-9) { segPts = []; msg('Rectangle: the two side points must differ.'); draw(); return; } msg('Now click a point at the rectangle width from the first side.'); }
    if (segPts.length === 3) { const [a, b, q] = segPts; segPts = []; const L = Math.hypot(b.x - a.x, b.y - a.y), d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, nn = { x: -d.y, y: d.x }; const wd = (q.x - a.x) * nn.x + (q.y - a.y) * nn.y;
      if (Math.abs(wd) < 1e-9) { msg('Rectangle: the width point is on the first side line. Click off the line.'); draw(); return; }
      const o = { x: nn.x * wd, y: nn.y * wd }; sketch.push({ t: 'poly', pts: [{ ...a }, { ...b }, { x: b.x + o.x, y: b.y + o.y }, { x: a.x + o.x, y: a.y + o.y }] }); props(); msg(`Rectangle added: ${+L.toFixed(3)} x ${+Math.abs(wd).toFixed(3)} mm, rotated. Plain polygon, no dimensions.`); }
    hover = p; draw(); return;
  }
  if (tool === 'rpoly' || tool === 'cpoly') {
    segPts.push(p);
    if (segPts.length === 2) { const [c, v] = segPts; segPts = []; if (Math.hypot(v.x - c.x, v.y - c.y) < 1e-9) { msg('Polygon: the vertex must differ from the centre.'); draw(); return; }
      regPts = { c, v, circ: tool === 'cpoly' }; const box = $('dimbox'); const gr = $('gfx').getBoundingClientRect(); box.style.display = 'flex'; box.style.left = Math.min(e.clientX - gr.left + 10, gr.width - 170) + 'px'; box.style.top = e.clientY - gr.top + 10 + 'px';
      const inp = $<HTMLInputElement>('dimin'); inp.value = String(regN); msg('Polygon sides: type the number (3 to 100), then OK or Enter.'); setTimeout(() => { inp.focus(); inp.select(); }, 0); }
    hover = p; draw(); return;
  }
  if (tool === 'ellipse') {
    segPts.push(p);
    if (segPts.length === 2) { if (Math.hypot(segPts[1].x - segPts[0].x, segPts[1].y - segPts[0].y) < 1e-9) { segPts = []; msg('Ellipse: the major-axis end must differ from the centre.'); draw(); return; } msg('Now click a point at the semi-minor distance from the major axis.'); }
    if (segPts.length === 3) { const [c, e1, q] = segPts; const a = Math.hypot(e1.x - c.x, e1.y - c.y), u = { x: (e1.x - c.x) / a, y: (e1.y - c.y) / a }, v = { x: -u.y, y: u.x }; const b = Math.abs((q.x - c.x) * v.x + (q.y - c.y) * v.y); segPts = [];
      if (b < 1e-9) { msg('Ellipse: the minor point is on the major axis. Click off the axis.'); draw(); return; }
      const pts: P[] = []; for (let i = 0; i < 72; i++) { const t = (i / 72) * 2 * Math.PI; pts.push({ x: c.x + u.x * a * Math.cos(t) + v.x * b * Math.sin(t), y: c.y + u.y * a * Math.cos(t) + v.y * b * Math.sin(t) }); }
      sketch.push({ t: 'poly', pts, ell: { c: { ...c }, a, b, rot: (Math.atan2(u.y, u.x) * 180) / Math.PI } }); props(); msg(`Ellipse added: semi-axes ${a.toFixed(2)} and ${b.toFixed(2)} mm. Not parametric.`); }
    hover = p; draw(); return;
  }
  if (tool === 'slotov') {
    segPts.push(p);
    if (segPts.length === 2) { if (Math.hypot(segPts[1].x - segPts[0].x, segPts[1].y - segPts[0].y) < 1e-9) { segPts = []; msg('Slot: the two end points must be different points.'); draw(); return; } msg('Now click a point at the slot half-width from the centre line.'); }
    if (segPts.length === 3) { const [e1, e2, q] = segPts; segPts = []; const L = Math.hypot(e2.x - e1.x, e2.y - e1.y), d = { x: (e2.x - e1.x) / L, y: (e2.y - e1.y) / L }, nn = { x: -d.y, y: d.x }; const wd = Math.abs((q.x - e1.x) * nn.x + (q.y - e1.y) * nn.y);
      if (wd < 1e-9) { msg('Slot: the width point is on the centre line. Click off the line.'); draw(); return; }
      if (L < 2 * wd + 1e-9) { msg(`Slot: the overall length ${+L.toFixed(3)} mm must be longer than the width ${+(2 * wd).toFixed(3)} mm.`); draw(); return; }
      const c1 = { x: e1.x + d.x * wd, y: e1.y + d.y * wd }, c2 = { x: e2.x - d.x * wd, y: e2.y - d.y * wd };
      const A1 = { x: c1.x + nn.x * wd, y: c1.y + nn.y * wd }, A2 = { x: c2.x + nn.x * wd, y: c2.y + nn.y * wd }, B2 = { x: c2.x - nn.x * wd, y: c2.y - nn.y * wd }, B1 = { x: c1.x - nn.x * wd, y: c1.y - nn.y * wd };
      sketch.push({ t: 'line', a: A1, b: A2 }, { t: 'arc', a: A2, b: B2, m: { x: c2.x + d.x * wd, y: c2.y + d.y * wd } }, { t: 'line', a: B2, b: B1 }, { t: 'arc', a: B1, b: A1, m: { x: c1.x - d.x * wd, y: c1.y - d.y * wd } }); props(); draw(); msg(`Slot added: overall length ${L.toFixed(3)} mm, width ${(2 * wd).toFixed(3)} mm.`); }
    hover = p; draw(); return;
  }
  if (tool === 'slotcp') {
    segPts.push(p);
    if (segPts.length === 2) { if (Math.hypot(segPts[1].x - segPts[0].x, segPts[1].y - segPts[0].y) < 1e-9) { segPts = []; msg('Slot: the arc centre must differ from the slot centre.'); draw(); return; } msg('Now click a point at the slot half-width from the centre line.'); }
    if (segPts.length === 3) { const [cm, c2, q] = segPts; segPts = []; const c1 = { x: 2 * cm.x - c2.x, y: 2 * cm.y - c2.y }; const L = Math.hypot(c2.x - c1.x, c2.y - c1.y), d = { x: (c2.x - c1.x) / L, y: (c2.y - c1.y) / L }, nn = { x: -d.y, y: d.x }; const wd = Math.abs((q.x - cm.x) * nn.x + (q.y - cm.y) * nn.y);
      if (wd < 1e-9) { msg('Slot: the width point is on the centre line. Click off the line.'); draw(); return; }
      const A1 = { x: c1.x + nn.x * wd, y: c1.y + nn.y * wd }, A2 = { x: c2.x + nn.x * wd, y: c2.y + nn.y * wd }, B2 = { x: c2.x - nn.x * wd, y: c2.y - nn.y * wd }, B1 = { x: c1.x - nn.x * wd, y: c1.y - nn.y * wd };
      sketch.push({ t: 'line', a: A1, b: A2 }, { t: 'arc', a: A2, b: B2, m: { x: c2.x + d.x * wd, y: c2.y + d.y * wd } }, { t: 'line', a: B2, b: B1 }, { t: 'arc', a: B1, b: A1, m: { x: c1.x - d.x * wd, y: c1.y - d.y * wd } }); props(); draw(); msg(`Slot added: width ${(2 * wd).toFixed(3)} mm, centre distance ${L.toFixed(3)} mm, centred on the first click.`); }
    hover = p; draw(); return;
  }
  if (tool === 'slot') {
    segPts.push(p);
    if (segPts.length === 2) { if (Math.hypot(segPts[1].x - segPts[0].x, segPts[1].y - segPts[0].y) < 1e-9) { segPts = []; msg('Slot: the two centres must be different points.'); draw(); return; } msg('Now click a point at the slot half-width from the centre line.'); }
    if (segPts.length === 3) { const [c1, c2, q] = segPts; const L = Math.hypot(c2.x - c1.x, c2.y - c1.y), d = { x: (c2.x - c1.x) / L, y: (c2.y - c1.y) / L }, nn = { x: -d.y, y: d.x }; const wd = Math.abs((q.x - c1.x) * nn.x + (q.y - c1.y) * nn.y); segPts = [];
      if (wd < 1e-9) { msg('Slot: the width point is on the centre line. Click off the line.'); draw(); return; }
      const A1 = { x: c1.x + nn.x * wd, y: c1.y + nn.y * wd }, A2 = { x: c2.x + nn.x * wd, y: c2.y + nn.y * wd }, B2 = { x: c2.x - nn.x * wd, y: c2.y - nn.y * wd }, B1 = { x: c1.x - nn.x * wd, y: c1.y - nn.y * wd };
      sketch.push({ t: 'line', a: A1, b: A2 }, { t: 'arc', a: A2, b: B2, m: { x: c2.x + d.x * wd, y: c2.y + d.y * wd } }, { t: 'line', a: B2, b: B1 }, { t: 'arc', a: B1, b: A1, m: { x: c1.x - d.x * wd, y: c1.y - d.y * wd } }); props(); msg(`Slot added: width ${(2 * wd).toFixed(3)} mm, centre distance ${L.toFixed(3)} mm.`); }
    hover = p; draw(); return;
  }
  if (tool === 'spline') { if (polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < grid() * 0.5 + 1e-9) commitSpline(); else if (!polyPts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)) polyPts.push(p); draw(); return; }
  if (tool === 'poly') {
    if (polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < grid() * 0.5 + 1e-9) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; props(); } else polyPts.push(p);
    draw(); return;
  }
  downAt = { x: e.clientX, y: e.clientY };
  if (tool === 'rect' || tool === 'circle') drag = { start: p, cur: p, moved: false };
});
sk.addEventListener('pointermove', (e) => {
  if (pan) { cam.x -= ((e.clientX - pan.x) * devicePixelRatio) / cam.s; cam.y += ((e.clientY - pan.y) * devicePixelRatio) / cam.s; pan = { x: e.clientX, y: e.clientY }; draw(); return; }
  if (winA) { winB = ptRaw(e); draw(); }
  const p = pt(e); hover = p; if (segPts.length) draw(); $('coord').textContent = `X ${p.x}  Y ${p.y}  mm`;
  if (drag) { drag.cur = p; drag.moved = true; draw(); }
});
let downAt = { x: 0, y: 0 };
sk.addEventListener('pointerup', (ev) => { pan = null; if (winA && winB) { if (Math.hypot(ev.clientX - winPx.x, ev.clientY - winPx.y) > 8) windowSelect(winA, winB, ev.ctrlKey || ev.metaKey); winA = null; winB = null; draw(); } if (drag && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 8) { const c = current(); if (c) sketch.push(c); drag = null; draw(); props(); } });
const commitFillet = () => {
  const P0 = filPt!; const r = parseFloat($<HTMLInputElement>('dimin').value);
  try {
    const ls = sketch.filter((e) => e.t === 'line' && [e.a, e.b].some((q) => Math.hypot(q.x - P0.x, q.y - P0.y) < 1e-6)) as Extract<Entity, { t: 'line' }>[];
    const far = (l: Extrude_L) => (Math.hypot(l.a.x - P0.x, l.a.y - P0.y) < 1e-6 ? l.b : l.a);
    const f = filletCorner(P0, far(ls[0]), far(ls[1]), r);
    const set = (l: Extrude_L, q: P) => { if (Math.hypot(l.a.x - P0.x, l.a.y - P0.y) < 1e-6) l.a = { ...q }; else l.b = { ...q }; };
    set(ls[0], f.t1); set(ls[1], f.t2); sketch.push({ t: 'arc', ...f.arc }); filR = r; msg(`Fillet R${+r.toFixed(3)} mm added.`); props();
  } catch (er) { msg((er as Error).message); return; }
  filPt = null; $('dimbox').style.display = 'none'; draw();
};
type Extrude_L = Extract<Entity, { t: 'line' }>;
let ctan3Pick: number[] = [];
let arctStart: { p: P; t: P } | null = null;
let regPts: { c: P; v: P; circ?: boolean } | null = null; let regN = 6;
const commitRegular = () => {
  const q = regPts!; const n = Math.round(parseFloat($<HTMLInputElement>('dimin').value));
  if (!(n >= 3 && n <= 100)) { msg('Polygon: enter a whole number of sides from 3 to 100.'); return; }
  const r0 = Math.hypot(q.v.x - q.c.x, q.v.y - q.c.y), am = Math.atan2(q.v.y - q.c.y, q.v.x - q.c.x); const r = q.circ ? r0 / Math.cos(Math.PI / n) : r0, a0 = q.circ ? am - Math.PI / n : am; const pts: P[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: q.c.x + r * Math.cos(a0 + (2 * Math.PI * i) / n), y: q.c.y + r * Math.sin(a0 + (2 * Math.PI * i) / n) });
  sketch.push({ t: 'poly', pts }); regN = n; regPts = null; $('dimbox').style.display = 'none'; props(); draw(); msg(q.circ ? `Regular polygon added: ${n} sides, circumscribed about a circle of radius ${+r0.toFixed(3)} mm (circumradius ${+r.toFixed(3)} mm).` : `Regular polygon added: ${n} sides, circumradius ${+r.toFixed(3)} mm (inscribed, first vertex at the click).`);
};
const commitDim = () => {
  if (regPts) { commitRegular(); return; }
  if (filPt) { commitFillet(); return; }
  if (!dimTarget) return; const inp = $<HTMLInputElement>('dimin'); const t = dimTarget;
  try { dimApply(t.e, t.w, parseFloat(inp.value)); try { applyArcRels(); applyPointRels(); } catch (er2) { msg((er2 as Error).message); }
    if (t.e.t === 'line' && cons.some((c) => c.k !== 'len')) { const ln = t.e; cons = cons.filter((c) => !(c.k === 'len' && c.l === ln)); const lc: Con = { k: 'len', l: ln, v: parseFloat(inp.value) }; cons.push(lc); solveAll(sketch.filter((e) => e.t === 'line') as L[], cons).then(() => { props(); draw(); }).catch((er) => { cons = cons.filter((x) => x !== lc); msg((er as Error).message); }); } if (!dims.some((d) => d.e === t.e && d.w === t.w)) dims.push({ e: t.e, w: t.w, pos: t.pos }); msg(`Dimension set: ${dimText({ e: t.e, w: t.w, pos: t.pos })} mm`); props(); }
  catch (er) { msg((er as Error).message); return; }
  dimTarget = null; $('dimbox').style.display = 'none'; draw();
};
$('dimok').onclick = commitDim;
$('dimin').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commitDim(); if (ev.key === 'Escape') { dimTarget = null; filPt = null; regPts = null; $('dimbox').style.display = 'none'; } });
const ctxm = $('ctxm');
const endTool = (exitTool: boolean) => { polyPts = []; segPts = []; drag = null; if (exitTool) { tool = 'none'; refreshButtons(); } ctxm.style.display = 'none'; draw(); };
sk.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode !== 'sketch') return; const r = $('gfx').getBoundingClientRect(); ctxm.style.left = e.clientX - r.left + 'px'; ctxm.style.top = e.clientY - r.top + 'px'; ctxm.style.display = 'block'; });
$('ctxok').onclick = () => { if (tool === 'spline') commitSpline(); else if (tool === 'poly' && polyPts.length >= 3) { sketch.push({ t: 'poly', pts: polyPts }); props(); } endTool(true); };
$('ctxcancel').onclick = () => endTool(true);
addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('#ctxm')) ctxm.style.display = 'none'; });
sk.addEventListener('wheel', (e) => { e.preventDefault(); cam.s = Math.min(80, Math.max(1, cam.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw(); }, { passive: false });
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Enter' && tool === 'spline' && polyPts.length >= 3) { commitSpline(); draw(); }
  else if (e.key === 'Enter' && polyPts.length >= 3) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; draw(); props(); }
  if (e.key === 'Escape') endTool(!(polyPts.length || segPts.length || drag));
});

// ---------- 3D view ----------
const v3 = $<HTMLCanvasElement>('v3');
const renderer = new THREE.WebGLRenderer({ canvas: v3, antialias: true, alpha: true });
const scene = new THREE.Scene();
const camera3 = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera3.up.set(0, 0, 1);
const controls = new OrbitControls(camera3, v3);
scene.add(new THREE.AmbientLight(0xffffff, 0.75)); const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(50, -80, 100); scene.add(dl);
const gridH = new THREE.GridHelper(200, 20, 0x7f93b5, 0xaebfda); gridH.rotateX(Math.PI / 2); scene.add(gridH);
const group = new THREE.Group(); scene.add(group);
let shown: KBody[] | null = null; // kernel result (Join/Cut/Intersect); null = draw each feature
const isMod = (k: string) => k === 'hole' || k === 'fillet' || k === 'chamfer' || k === 'shell';
const needsKernel = (fs: Feature[]) => fs.some((f) => (f.op ?? 'new') !== 'new' || isMod(f.kind) || f.sketch.some((e) => e.t === 'poly' && !!(e.ell || e.spl)));
const geoOf = (f: { kind: Feature['kind']; sketch: any; depth: number; dir?: any; plane?: any; orient?: any }) => (isMod(f.kind) ? new THREE.BufferGeometry() : buildGeometry(f.kind as 'extrude' | 'revolve', f.sketch, f.depth, f.dir, f.plane, f.orient));
const specOf = (f: Feature): Spec => ({ kind: f.kind, sketch: f.sketch, depth: f.depth, op: f.op, dir: f.dir, edges: f.edges, plane: isMod(f.kind) ? undefined : f.plane, orient: isMod(f.kind) ? undefined : f.orient });
/** Try a new feature list. Computes the solid when Join/Cut/Intersect is involved. Returns false (and a message) when it fails. */
const mixedPlaneMsg = (fs: Feature[]) => (fs.some((f) => (f.plane && f.plane !== 'XY') || f.orient?.r || f.orient?.f) && fs.some((f) => isMod(f.kind)) ? 'Refused: Hole, Fillet, Chamfer and Shell are not verified on parts that have XZ or YZ features yet (they work in world axes). The model was not changed.' : '');
async function applyFeatures(next: Feature[]): Promise<boolean> {
  { const mm = mixedPlaneMsg(next); if (mm) { msg(mm); return false; } }
  let bodies: KBody[] | null = null;
  if (needsKernel(next)) {
    msg('Computing solid (the first time this loads the geometry kernel)...');
    try { bodies = await computeBodies(next.map(specOf)); } catch (e) { msg((e as Error).message); return false; }
  }
  shown?.forEach((b) => b.geo.dispose()); shown = bodies; features = next; return true;
}
function rebuild() {
  group.clear();
  if (shown) {
    shown.forEach((b, i) => {
      group.add(new THREE.Mesh(b.geo, new THREE.MeshStandardMaterial({ color: 0x5b9bf0, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide })), new THREE.LineSegments(new THREE.EdgesGeometry(b.geo, 30), new THREE.LineBasicMaterial({ color: 0x1c2533 })));
    });
    return;
  }
  features.forEach((f, i) => {
    const m = new THREE.Mesh(f.geo, new THREE.MeshStandardMaterial({ color: i === sel ? 0x5b9bf0 : 0x9fb3cf, metalness: 0.25, roughness: 0.55 }));
    const ed = new THREE.LineSegments(new THREE.EdgesGeometry(f.geo, 30), new THREE.LineBasicMaterial({ color: 0x1c2533 }));
    if (f.kind === 'revolve') { m.rotation.x = Math.PI / 2; ed.rotation.x = Math.PI / 2; }
    group.add(m, ed);
  });
}
function setView(v: string) {
  const box = new THREE.Box3().setFromObject(group);
  const c = box.isEmpty() ? new THREE.Vector3(20, 15, 5) : box.getCenter(new THREE.Vector3());
  const r = box.isEmpty() ? 40 : Math.max(box.getSize(new THREE.Vector3()).length() / 2, 5);
  const vf = (camera3.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera3.aspect);
  const d = (r / Math.sin(Math.min(vf, hf) / 2)) * 1.15;
  const dir: Record<string, [number, number, number]> = { home: [0.55, -0.55, 0.6], all: [0.55, -0.55, 0.6], top: [0, 0.0001, 1], front: [0, -1, 0.0001], right: [1, 0, 0.0001] };
  const [x, y, z] = dir[v] ?? dir.home; const n = new THREE.Vector3(x, y, z).normalize();
  controls.target.copy(c); camera3.position.copy(c).addScaledVector(n, d); camera3.near = d / 100; camera3.far = d * 10; camera3.updateProjectionMatrix(); controls.update();
}
(function loop() { requestAnimationFrame(loop); if (mode === 'model') { controls.update(); renderer.render(scene, camera3); } })();
function resize() {
  const r0 = $('gfx').getBoundingClientRect(); if (!r0.width) return; const r = { width: r0.width, height: r0.height - 22 };
  for (const c of [sk, v3]) { c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio; }
  renderer.setSize(r.width * devicePixelRatio, r.height * devicePixelRatio, false); camera3.aspect = r.width / r.height; camera3.updateProjectionMatrix(); draw();
}
new ResizeObserver(resize).observe($('gfx'));

// ---------- modes, ribbon, browser ----------
function showTab(t: string) {
  $('ribbon').scrollLeft = 0;
  document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.classList.toggle('act', b.dataset.tab === t));
  document.querySelectorAll<HTMLElement>('.tabpane').forEach((p) => p.classList.toggle('show', p.id === 'p-' + t));
}
document.querySelectorAll<HTMLButtonElement>('[data-proxy]').forEach((b) => (b.onclick = () => { $(b.dataset.proxy!).click(); showTab('model'); }));
document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab!)));
function setMode(m: Mode) {
  mode = m; $('sk').style.display = m === 'sketch' ? 'block' : 'none'; $('v3').style.display = m === 'sketch' ? 'none' : 'block';
  $('tabsk').style.display = m === 'sketch' ? '' : 'none'; $('vc').style.display = $('nav').style.display = m === 'sketch' ? 'none' : '';
  $('fin2').classList.toggle('show', m === 'sketch'); showTab(m === 'sketch' ? 'sketch' : 'model'); resize(); tree(); props(); refreshButtons();
}
function refreshButtons() {
  const model = mode === 'model';
  ($('extrude') as HTMLButtonElement).disabled = !model || !pending; ($('revolve') as HTMLButtonElement).disabled = !model || !pending;
  ($('editft') as HTMLButtonElement).disabled = !model || sel === null; ($('delft') as HTMLButtonElement).disabled = !model || sel === null;
  for (const id of ['hol', 'fil', 'cha', 'she']) ($(id) as HTMLButtonElement).disabled = !model || !features.length;
  for (const id of ['stl', 'obj', 'step']) ($(id) as HTMLButtonElement).disabled = !features.length; ($('startsk') as HTMLButtonElement).disabled = !model;
  document.querySelectorAll<HTMLButtonElement>('[data-proxy]').forEach((b) => (b.disabled = ($(b.dataset.proxy!) as HTMLButtonElement).disabled));
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}
function tree() {
  const t = $('tree'); t.innerHTML = '';
  const node = (label: string, d: number, cls: string, click?: () => void, dbl?: () => void, selected = false) => {
    const n = document.createElement('div'); n.title = label; n.className = 'node' + (selected ? ' sel' : ''); n.style.setProperty('--d', String(d));
    const i = document.createElement('i'); i.className = cls; n.append(i, document.createTextNode(label));
    if (click) n.onclick = click; if (dbl) n.ondblclick = dbl; t.append(n);
  };
  node('Part1', 0, 'p'); node(`Solid Bodies(${shown ? shown.length : features.length})`, 1, ''); node('View: Master', 1, ''); node('Origin', 1, 'o'); node('XY Plane', 2, ''); node('X Axis', 2, ''); node('Y Axis', 2, '');
  features.forEach((f, i) => {
    if (f.kind === 'hole') { const c = f.sketch[0] as any; node(`Hole${i + 1}  (Ø${(2 * c.r).toFixed(2)} mm at ${c.c.x}, ${c.c.y}; ${f.depth > 0 ? f.depth + ' mm deep' : 'through all'})`, 1, 'f', () => { sel = i; rebuild(); tree(); refreshButtons(); }, undefined, sel === i); return; }
    if (isMod(f.kind)) { node(`${f.kind[0].toUpperCase()}${f.kind.slice(1)}${i + 1}  (${f.depth} mm, ${f.edges ?? 'all'} ${f.kind === 'shell' ? 'open face' : 'edges'})`, 1, 'f', () => { sel = i; rebuild(); tree(); refreshButtons(); }, undefined, sel === i); return; }
    node(`${f.kind === 'extrude' ? 'Extrusion' : 'Revolution'}${i + 1}  (${f.kind === 'extrude' ? f.depth + ' mm' : '360\u00B0'}${f.op && f.op !== 'new' ? ', ' + f.op : ''})`, 1, 'f', () => { sel = i; rebuild(); tree(); refreshButtons(); }, () => editFeature(i), sel === i);
    node(`Sketch${i + 1}`, 2, 's', () => { sel = i; rebuild(); tree(); refreshButtons(); }, () => editFeature(i), sel === i);
  });
  node('End of Part', 1, 'e');
  if (pending) node('Sketch (not used yet)', 1, 's');
  if (mode === 'sketch') node(editing !== null ? `Editing Sketch${editing + 1}` : 'Sketch in progress', 1, 's', undefined, undefined, true);
}
function numField(label: string, v: number, on: (n: number) => void) {
  const l = document.createElement('label'); l.textContent = label;
  const i = document.createElement('input'); i.type = 'number'; i.step = 'any'; i.value = String(+v.toFixed(4));
  i.onchange = () => { const n = parseFloat(i.value); if (isFinite(n)) { on(n); try { applyPointRels(); } catch { /* ignore */ } if (cons.some((c) => (c.k as string) === 'aconc' || (c.k as string) === 'aeqr')) { try { applyArcRels(); } catch (er) { msg((er as Error).message); } } draw(); } };
  l.append(i); return l;
}
function props() {
  refreshDof(); const p = $('props'); p.innerHTML = ''; p.classList.toggle('show', mode === 'sketch' && sketch.length > 0);
  sketch.forEach((e, i) => {
    const r = document.createElement('div'); r.className = 'row'; const g = document.createElement('div'); g.className = 'g';
    const title = (t: string) => { const b = document.createElement('b'); b.textContent = t; r.append(b); };
    if (e.t === 'rect') {
      const x = Math.min(e.a.x, e.b.x), y = Math.min(e.a.y, e.b.y), w = Math.abs(e.b.x - e.a.x), h = Math.abs(e.b.y - e.a.y);
      const set = (nx: number, ny: number, nw: number, nh: number) => { e.a = { x: nx, y: ny }; e.b = { x: nx + nw, y: ny + nh }; };
      title(`Rectangle ${i + 1}`); g.append(numField('X (mm)', x, (n) => set(n, y, w, h)), numField('Y (mm)', y, (n) => set(x, n, w, h)), numField('Width (mm)', w, (n) => n > 0 && set(x, y, n, h)), numField('Height (mm)', h, (n) => n > 0 && set(x, y, w, n)));
    } else if (e.t === 'circle') {
      title(`Circle ${i + 1}`); g.append(numField('Center X (mm)', e.c.x, (n) => (e.c.x = n)), numField('Center Y (mm)', e.c.y, (n) => (e.c.y = n)), numField('Radius (mm)', e.r, (n) => n > 0 && (e.r = n)));
    } else if (e.t === 'line') title(`Line ${i + 1} (${Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y).toFixed(2)} mm)`);
    else if (e.t === 'arc') title(`Arc ${i + 1} (3-point)`);
    else if (isPt(e)) { const pe = e as PointE; title(`Point ${i + 1}`); g.append(numField('X (mm)', pe.p.x, (n) => (pe.p.x = n)), numField('Y (mm)', pe.p.y, (n) => (pe.p.y = n))); }
    else title(`Polygon ${i + 1} (${e.pts.length} points)`);
    const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = () => { sketch.splice(i, 1); draw(); props(); };
    r.append(g, del); p.append(r);
  });
}


// ---------- sketch editing: select, move, copy, rotate, mirror, offset, delete, undo/redo ----------
function fullSnap(): SketchSrc {
  const ix = (o: unknown) => sketch.indexOf(o as Entity);
  return { ents: clone(sketch), cons: cons.filter((c) => ix(c.l) >= 0 && (!c.m || ix(c.m) >= 0) && (!c.n || ix(c.n) >= 0)).map((c) => ({ k: c.k, l: ix(c.l), ...(c.m ? { m: ix(c.m) } : {}), ...(c.n ? { n: ix(c.n) } : {}), ...(c.v !== undefined ? { v: c.v } : {}) })), dims: dims.filter((d) => ix(d.e) >= 0).map((d) => ({ e: ix(d.e), w: d.w, pos: { ...d.pos } })) };
}
function ck() {
  if (restoring || mode !== 'sketch') return;
  const s = JSON.stringify(fullSnap());
  if (s !== hist[hist.length - 1]) { hist.push(s); redoS = []; if (hist.length > 100) hist.shift(); }
}
function applySnap(s: string) { restoring = true; try { restoreSrc(JSON.parse(s)); selE = []; } finally { restoring = false; } props(); draw(); }
function undoSk() { if (mode !== 'sketch') return; ck(); if (hist.length < 2) { msg('Nothing to undo.'); return; } redoS.push(hist.pop()!); applySnap(hist[hist.length - 1]); msg('Undone.'); }
function redoSk() { if (mode !== 'sketch' || !redoS.length) { msg('Nothing to redo.'); return; } const s = redoS.pop()!; hist.push(s); applySnap(s); msg('Redone.'); }
function distTo(e: Entity, p: P): number {
  const pts = outline(e); const closed = !(e.t === 'line' || e.t === 'arc'); let best = Infinity;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))); }
  return best;
}
/** Window select: left to right takes shapes fully inside the box, right to left (dashed green) takes any shape the box touches. */
function windowSelect(a: P, b: P, add: boolean) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); const crossing = b.x < a.x; lastWin = { x0, y0, x1, y1 };
  const inside = (q: P) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
  const segHit = (p: P, q: P) => { let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y; for (const [pp, qq] of [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]]) { if (pp === 0) { if (qq < 0) return false; } else { const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } } return true; };
  const hit = (e: Entity) => { const pts = outline(e); if (!crossing) return pts.every(inside); const closed = !(e.t === 'line' || e.t === 'arc'); for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) if (segHit(pts[i], pts[(i + 1) % pts.length])) return true; return pts.some(inside); };
  const got = sketch.filter(hit); selE = add ? [...new Set([...selE, ...got])] : got; props(); msg(`${selE.length} shape(s) selected (${crossing ? 'crossing' : 'window'}).`);
}
function pickEnt(p: P, add: boolean): boolean {
  const tol = (10 * devicePixelRatio) / cam.s; let best: Entity | null = null, bd = tol;
  for (const e of sketch) { const d = distTo(e, p); if (d < bd) { bd = d; best = e; } }
  if (!best) { if (!add) selE = []; } else if (add) selE = selE.includes(best) ? selE.filter((x) => x !== best) : [...selE, best]; else selE = [best];
  msg(selE.length ? `${selE.length} shape(s) selected.` : 'Nothing selected.'); draw(); return !!best;
}
const usedByCon = (e: Entity) => cons.some((c) => c.l === (e as unknown) || c.m === (e as unknown) || c.n === (e as unknown)) || dims.some((d) => d.e === e);
function toggleConstruction() { if (!selE.length) { msg('Select shapes first (Select tool), then press Construction.'); return; } const to = !selE.every((e) => e.cn); for (const e of selE) { if (to) e.cn = true; else delete e.cn; } ck(); props(); draw(); msg(to ? `${selE.length} shape(s) are now construction (dashed, not part of the profile).` : `${selE.length} shape(s) are normal again.`); }
const xconEl = document.getElementById('xcon'); if (xconEl) xconEl.onclick = toggleConstruction;
function deleteSel() { if (!selE.length) { msg('Select shapes first (Select tool).'); return; } const n = selE.length; sketch = sketch.filter((e) => !selE.includes(e)); selE = []; props(); draw(); msg(`Deleted ${n} shape(s).`); }
type XOp = 'move' | 'copy' | 'rot' | 'mir' | 'off' | 'scale' | 'stretch' | 'prect' | 'pcirc';
let lastWin = { x0: 0, y0: 0, x1: 10, y1: 10 };
let xop: XOp = 'move';
const xf = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement).value);
function xOpen(op: XOp) {
  if (mode !== 'sketch') return;
  if (!selE.length) { tool = 'select'; refreshButtons(); msg('Select the shapes first: click them with the Select tool (Ctrl+click adds), then press the command again.'); return; }
  xop = op; const L = (t: string, id: string, v: string) => `<label>${t}<input id="${id}" type="number" step="any" value="${v}"/></label>`;
  const T = { move: 'Move', copy: 'Copy', rot: 'Rotate', mir: 'Mirror', off: 'Offset', scale: 'Scale', stretch: 'Stretch', prect: 'Rectangular Pattern', pcirc: 'Circular Pattern' }[op]; $('xt').textContent = `${T} (${selE.length} selected)`;
  const keep = (on: boolean) => `<label style="display:flex;gap:6px;align-items:center"><input id="xkeep" type="checkbox" style="width:auto" ${on ? 'checked' : ''}/>Keep the original</label>`;
  $('xin').innerHTML = op === 'move' ? L('X distance (mm)', 'xa', '0') + L('Y distance (mm)', 'xb', '0')
    : op === 'copy' ? L('X offset (mm)', 'xa', '10') + L('Y offset (mm)', 'xb', '0') + L('Number of copies', 'xn', '1')
    : op === 'rot' ? L('Angle (deg, counter-clockwise)', 'xa', '90') + L('Centre X (mm)', 'xb', '0') + L('Centre Y (mm)', 'xc', '0') + keep(false)
    : op === 'mir' ? `<label>Axis<select id="xax"><option value="y">Y axis (x = 0)</option><option value="x">X axis (y = 0)</option><option value="c">Line through two points</option></select></label>` + L('Point 1 X', 'xa', '0') + L('Point 1 Y', 'xb', '0') + L('Point 2 X', 'xc', '0') + L('Point 2 Y', 'xd', '10') + keep(true)
    : op === 'prect' ? L('Direction 1: count (including the original)', 'xa', '3') + L('Direction 1: spacing X (mm)', 'xb', '10') + L('Direction 1: spacing Y (mm)', 'xc', '0') + L('Direction 2: count (including the original)', 'xd', '2') + L('Direction 2: spacing X (mm)', 'xe', '0') + L('Direction 2: spacing Y (mm)', 'xf2', '10')
    : op === 'pcirc' ? L('Count (including the original)', 'xa', '6') + L('Total angle (deg, 360 = full circle)', 'xb', '360') + L('Centre X (mm)', 'xc', '0') + L('Centre Y (mm)', 'xd', '0')
    : op === 'stretch' ? L('Window corner 1 X (mm)', 'xa', String(lastWin.x0)) + L('Window corner 1 Y (mm)', 'xb', String(lastWin.y0)) + L('Window corner 2 X (mm)', 'xc', String(lastWin.x1)) + L('Window corner 2 Y (mm)', 'xd', String(lastWin.y1)) + L('Move X (mm)', 'xe', '5') + L('Move Y (mm)', 'xf2', '0')
    : op === 'scale' ? L('Scale factor (greater than 0)', 'xa', '2') + L('Base point X (mm)', 'xb', '0') + L('Base point Y (mm)', 'xc', '0') + keep(false)
    : L('Distance (mm). Positive = outward / left of the line', 'xa', '5');
  $('xdlg').classList.add('show');
}
function xApply() {
  const sel0 = [...selE]; let out: Entity[] = []; let keepOrig = false; const bad = (m: string) => { msg(m); };
  try {
    if (xop === 'stretch') {
      const v = ['xa', 'xb', 'xc', 'xd', 'xe', 'xf2'].map(xf); if (!v.every(Number.isFinite)) return bad('Enter numbers.');
      const W = { x0: v[0], y0: v[1], x1: v[2], y1: v[3] }; const res = sel0.map((e) => stretchEntity(e, W, v[4], v[5]));
      if (res.some((r) => !r)) return bad('Stretch: the window cuts through an arc or an exact ellipse, which is not supported yet. Move the window so it holds the whole shape or none of it. Nothing changed.');
      const chg = sel0.map((e, i) => (res[i] !== e ? i : -1)).filter((i) => i >= 0); if (!chg.length) return bad('Stretch: no point of the selected shapes is inside the window. Nothing changed.');
      if (chg.some((i) => usedByCon(sel0[i]))) return bad('A shape to stretch has constraints or dimensions, so it cannot be changed in place. Remove them first. Nothing changed.');
      const outs = chg.map((i) => res[i] as Entity); sketch = sketch.filter((e) => !chg.some((i) => sel0[i] === e)); sketch.push(...outs); selE = outs; $('xdlg').classList.remove('show'); props(); draw(); msg(`Stretched ${outs.length} shape(s).`); return;
    }
    if (xop === 'prect') { const v = ['xa', 'xb', 'xc', 'xd', 'xe', 'xf2'].map(xf); const n1 = Math.round(v[0]), n2 = Math.round(v[3]); if (!v.every(Number.isFinite) || !(n1 >= 1 && n2 >= 1 && n1 * n2 >= 2 && n1 * n2 <= 201)) return bad('Enter numbers; the total number of copies must be between 1 and 200.'); keepOrig = true; for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) { if (!i && !j) continue; const dx = i * v[1] + j * v[4], dy = i * v[2] + j * v[5]; out.push(...sel0.map((e) => transformEntity(e, moveTf(dx, dy)))); } }
    else if (xop === 'pcirc') { const n = Math.round(xf('xa')), ang = xf('xb'), cx = xf('xc'), cy = xf('xd'); if (![ang, cx, cy].every(Number.isFinite) || !(n >= 2 && n <= 201) || ang === 0) return bad('Enter numbers; count 2 to 201 and an angle other than 0.'); keepOrig = true; const step = Math.abs(ang) >= 360 ? ang / n : ang / (n - 1); for (let k = 1; k < n; k++) out.push(...sel0.map((e) => transformEntity(e, rotateTf({ x: cx, y: cy }, step * k)))); }
    else if (xop === 'move') { const a = xf('xa'), b = xf('xb'); if (![a, b].every(Number.isFinite)) return bad('Enter numbers.'); out = sel0.map((e) => transformEntity(e, moveTf(a, b))); }
    else if (xop === 'copy') { const a = xf('xa'), b = xf('xb'), n = Math.round(xf('xn')); if (![a, b].every(Number.isFinite) || !(n >= 1 && n <= 200)) return bad('Enter numbers (copies 1 to 200).'); keepOrig = true; for (let k = 1; k <= n; k++) out.push(...sel0.map((e) => transformEntity(e, moveTf(a * k, b * k)))); }
    else if (xop === 'rot') { const a = xf('xa'), cx = xf('xb'), cy = xf('xc'); if (![a, cx, cy].every(Number.isFinite)) return bad('Enter numbers.'); keepOrig = (document.getElementById('xkeep') as HTMLInputElement).checked; out = sel0.map((e) => transformEntity(e, rotateTf({ x: cx, y: cy }, a))); }
    else if (xop === 'scale') { const k = xf('xa'), cx = xf('xb'), cy = xf('xc'); if (![k, cx, cy].every(Number.isFinite) || !(k > 0)) return bad('Enter a scale factor greater than 0 and numbers for the base point.'); keepOrig = (document.getElementById('xkeep') as HTMLInputElement).checked; out = sel0.map((e) => scaleEntity(e, { x: cx, y: cy }, k) as Entity); }
    else if (xop === 'mir') {
      const ax = (document.getElementById('xax') as HTMLSelectElement).value; keepOrig = (document.getElementById('xkeep') as HTMLInputElement).checked;
      const p1 = ax === 'y' ? { x: 0, y: 0 } : ax === 'x' ? { x: 0, y: 0 } : { x: xf('xa'), y: xf('xb') }; const p2 = ax === 'y' ? { x: 0, y: 1 } : ax === 'x' ? { x: 1, y: 0 } : { x: xf('xc'), y: xf('xd') };
      if (![p1.x, p1.y, p2.x, p2.y].every(Number.isFinite) || Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-9) return bad('Choose two different points for the axis.');
      out = sel0.map((e) => transformEntity(e, mirrorTf(p1, p2)));
    } else { const d = xf('xa'); if (!Number.isFinite(d) || d === 0) return bad('Enter a distance other than 0.'); keepOrig = true; const r = sel0.map((e) => offsetEntity(e, d)); const fail = r.findIndex((x) => !x); if (fail >= 0) return bad(`Offset is not possible for ${sel0[fail].t === 'poly' ? 'a polygon (not supported yet)' : 'this shape at that distance'}. Nothing changed.`); out = r as Entity[]; }
  } catch (er) { return bad((er as Error).message); }
  if (!keepOrig) { const locked = sel0.find(usedByCon); if (locked) return bad('A selected shape has constraints or dimensions, so it cannot be moved in place. Use Copy or Keep the original, or remove them. Nothing changed.'); sketch = sketch.filter((e) => !sel0.includes(e)); }
  sketch.push(...out); selE = out; $('xdlg').classList.remove('show'); props(); draw(); msg(`${{ move: 'Moved', copy: 'Copied', rot: 'Rotated', mir: 'Mirrored', off: 'Offset', scale: 'Scaled', stretch: 'Stretched', prect: 'Rectangular pattern of', pcirc: 'Circular pattern of' }[xop]} ${sel0.length} shape(s).`);
}
$('xmove').onclick = () => xOpen('move'); $('xcopy').onclick = () => xOpen('copy'); $('xrot').onclick = () => xOpen('rot'); $('xmir').onclick = () => xOpen('mir'); $('xoff').onclick = () => xOpen('off'); const xscEl = document.getElementById('xsc'); if (xscEl) xscEl.onclick = () => xOpen('scale'); const xprEl = document.getElementById('xpr'); if (xprEl) xprEl.onclick = () => xOpen('prect'); const xpcEl = document.getElementById('xpc'); if (xpcEl) xpcEl.onclick = () => xOpen('pcirc'); const xstEl = document.getElementById('xst'); if (xstEl) xstEl.onclick = () => xOpen('stretch');
$('xdel').onclick = deleteSel; $('xundo').onclick = undoSk; $('xredo').onclick = redoSk; $('xok').onclick = xApply; $('xcancel').onclick = () => $('xdlg').classList.remove('show');
addEventListener('keydown', (e) => {
  const t = (e.target as HTMLElement).tagName; if (t === 'INPUT' || t === 'SELECT' || mode !== 'sketch') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selE.length) { e.preventDefault(); deleteSel(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoSk() : undoSk(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoSk(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selE = [...sketch]; draw(); msg(`${selE.length} shape(s) selected.`); }
});

// ---------- actions ----------
function snapshotSrc(): SketchSrc | null {
  if (!sketch.some((e) => e.t === 'line' || e.t === 'arc' || isPt(e) || e.cn) && !cons.length && !dims.length) return null;
  const ix = (o: unknown) => sketch.indexOf(o as Entity);
  return { ents: clone(sketch), cons: cons.filter((c) => ix(c.l) >= 0 && (!c.m || ix(c.m) >= 0) && (!c.n || ix(c.n) >= 0)).map((c) => ({ k: c.k, l: ix(c.l), ...(c.m ? { m: ix(c.m) } : {}), ...(c.n ? { n: ix(c.n) } : {}), ...(c.v !== undefined ? { v: c.v } : {}) })), dims: dims.filter((d) => ix(d.e) >= 0).map((d) => ({ e: ix(d.e), w: d.w, pos: { ...d.pos } })) };
}
function restoreSrc(s: SketchSrc) {
  sketch = clone(s.ents); dims = s.dims.map((d) => ({ e: sketch[d.e], w: d.w as Dim['w'], pos: d.pos }));
  cons = s.cons.map((c) => ({ k: c.k as Con['k'], l: sketch[c.l] as unknown as L, ...(c.m !== undefined ? { m: sketch[c.m] as unknown as L } : {}), ...(c.n !== undefined ? { n: sketch[c.n] as unknown as L } : {}), ...(c.v !== undefined ? { v: c.v } : {}) }));
}
function startSketch(from?: Entity[], src?: SketchSrc | null) { selE = []; hist = []; redoS = []; cons = []; dims = []; conPick = null; conEnd = null; sketch = from ? clone(from) : pending ? clone(pending) : [];
  if (src) restoreSrc(src); else if (!from && pending && pendingSrc) restoreSrc(pendingSrc);
  if (!from) { /* keep pendingSrc only while the pending sketch stays */ } else pendingSrc = null; if (!from && pending) pending = null; polyPts = []; setMode('sketch'); msg('Sketch: draw shapes or enter exact sizes, then Finish Sketch.'); }
$('startsk').onclick = () => { editing = null; $('pp').classList.add('show'); };
const pickPlane = (p: PlaneId) => { $('pp').classList.remove('show'); const keptPlane = pending ? curPlane : null, keptOr = pending ? curOrient : null; if (!pending) { curPlane = p; const ro = document.getElementById('pprot') as HTMLSelectElement | null, fl = document.getElementById('ppflip') as HTMLInputElement | null; curOrient = { r: ((ro ? parseInt(ro.value, 10) || 0 : 0) % 4) as 0 | 1 | 2 | 3, f: !!fl?.checked }; } const asked = (document.getElementById('pprot') as HTMLSelectElement | null); const askOr = { r: asked ? (parseInt(asked.value, 10) || 0) % 4 : 0, f: !!(document.getElementById('ppflip') as HTMLInputElement | null)?.checked }; startSketch(); if (keptPlane && (keptPlane !== p || (keptOr && ((keptOr.r ?? 0) !== askOr.r || !!keptOr.f !== askOr.f)))) msg(`Resuming the saved unfinished sketch: it keeps its own plane (${keptPlane}${keptOr && (keptOr.r || keptOr.f) ? ', rotated/flipped' : ''}). The plane you picked was not used. Finish or cancel it first to start on a different plane.`); };
$('ppxy').onclick = () => pickPlane('XY');
const ppxz = document.getElementById('ppxz'), ppyz = document.getElementById('ppyz');
if (ppxz) ppxz.onclick = () => pickPlane('XZ');
if (ppyz) ppyz.onclick = () => pickPlane('YZ');
$('ppx').onclick = () => $('pp').classList.remove('show');
function editFeature(i: number) { if (isMod(features[i].kind)) { editMod(i); return; } editing = i; sel = i; curPlane = features[i].plane ?? 'XY'; curOrient = features[i].orient ?? {}; startSketch(features[i].sketch, features[i].src); msg(`Editing Sketch${i + 1}: change dimensions, then Finish Sketch.`); }
$('editft').onclick = () => sel !== null && editFeature(sel);
$('cancelsk').onclick = () => { if (editing === null && sketch.length) { pending = null; pendingSrc = null; } editing = null; sketch = []; setMode('model'); msg('Sketch cancelled.'); };
$('clear').onclick = () => { cons = []; sketch = []; polyPts = []; draw(); props(); };
$('fin2').onclick = () => $('finish').click();
$('finish').onclick = () => {
  if (!sketch.length) { editing = null; setMode('model'); msg('Empty sketch discarded.'); return; }
  let src: SketchSrc | null = null;
  try { src = snapshotSrc(); const prof = sketch.filter((e) => !e.cn && !isPt(e)); if (!prof.length) throw new Error('The sketch has only construction shapes or points. Draw at least one normal shape for the profile.'); const rl = resolveLoops(prof); buildGeometry('extrude', rl, 1); sketch = rl; } catch (e) { msg((e as Error).message); return; }
  const kind = editing !== null ? (features[editing].kind as 'extrude' | 'revolve') : null;
  pending = clone(sketch); pendingSrc = src; cons = []; dims = []; sketch = []; setMode('model');
  if (editing !== null && kind) openDlg(kind, features[editing].depth, features[editing].op, features[editing].dir); else msg('Sketch finished. Choose Extrude or Revolve.');
};
let dlgOp: 'new' | 'join' | 'cut' | 'intersect' = 'new'; let dlgDir: 'normal' | 'flip' | 'sym' = 'normal';
function syncDlg() {
  document.querySelectorAll<HTMLButtonElement>('#dlg [data-op]').forEach((b) => b.classList.toggle('on', b.dataset.op === dlgOp));
  document.querySelectorAll<HTMLButtonElement>('#dlg [data-dir]').forEach((b) => b.classList.toggle('on', b.dataset.dir === dlgDir));
}
document.querySelectorAll<HTMLButtonElement>('#dlg [data-op]').forEach((b) => (b.onclick = () => { dlgOp = b.dataset.op as typeof dlgOp; syncDlg(); }));
document.querySelectorAll<HTMLButtonElement>('#dlg [data-dir]').forEach((b) => (b.onclick = () => { dlgDir = dlgDir === b.dataset.dir ? 'normal' : (b.dataset.dir as typeof dlgDir); syncDlg(); }));
function openDlg(kind: 'extrude' | 'revolve', depth = 20, op: typeof dlgOp = 'new', dir: typeof dlgDir = 'normal') {
  dlgOp = kind === 'extrude' ? op : 'new'; dlgDir = dir; syncDlg();
  if (!pending) { msg('Start a 2D sketch first.'); return; }
  dlgKind = kind; $('dlgt').textContent = kind === 'extrude' ? 'Extrude' : 'Revolve';
  ($('depth') as HTMLInputElement).value = String(depth); ($('depth').parentElement as HTMLElement).style.display = kind === 'extrude' ? '' : 'none';
  $('dlgmsg').textContent = kind === 'extrude' ? 'Profile: finished sketch. Direction: +Z.' : 'Axis: vertical (Y) axis of the sketch, 360°. Keep the shape at X ≥ 0.';
  $('dlg').classList.add('show');
}
$('extrude').onclick = () => openDlg('extrude'); $('revolve').onclick = () => openDlg('revolve');
$('dcancel').onclick = () => { $('dlg').classList.remove('show'); dlgKind = null; if (editing !== null) { editing = null; pending = null; pendingSrc = null; } };
function bbox(kind: string, geo: THREE.BufferGeometry) { const g = geo.clone(); if (kind === 'revolve') g.rotateX(Math.PI / 2); g.computeBoundingBox(); const b = g.boundingBox!.clone(); g.dispose(); return b; }
$('dok').onclick = async () => {
  if (!dlgKind || !pending) return;
  try {
    const depth = parseFloat(($('depth') as HTMLInputElement).value);
    if (dlgKind === 'extrude' && !(depth > 0)) throw new Error('Distance must be greater than 0');
    const op = dlgKind === 'extrude' ? dlgOp : 'new'; const dir = dlgKind === 'extrude' ? dlgDir : 'normal';
    const geo = buildGeometry(dlgKind, pending, depth || 1, dir, curPlane, curOrient); const f: Feature = { kind: dlgKind, depth: depth || 1, sketch: clone(pending), geo, op, dir, ...(curPlane !== 'XY' ? { plane: curPlane } : {}), ...(curOrient.r || curOrient.f ? { orient: { ...curOrient } } : {}), ...(pendingSrc ? { src: pendingSrc } : {}) };
    const next = editing !== null ? features.map((o, i) => (i === editing ? f : o)) : [...features, f];
    if (!needsKernel(next)) {
      const nb = bbox(f.kind, geo).expandByScalar(-1e-6);
      const hit = features.findIndex((o, i) => i !== editing && bbox(o.kind, o.geo).intersectsBox(nb));
      if (hit >= 0) { geo.dispose(); throw new Error(`Overlaps ${features[hit].kind === 'extrude' ? 'Extrusion' : 'Revolution'}${hit + 1}. Choose Join, Cut or Intersect in the Extrude dialog, or place separate bodies apart.`); }
    }
    const old = editing !== null ? features[editing] : null; const ed = editing;
    if (!(await applyFeatures(next))) { geo.dispose(); return; }
    old?.geo.dispose(); sel = ed !== null ? ed : features.length - 1; editing = null;
    pending = null; pendingSrc = null; $('dlg').classList.remove('show'); dlgKind = null; rebuild(); setView('home'); tree(); refreshButtons();
    const vol = shown ? shown.reduce((s, x) => s + volume(x.geo), 0) : volume(f.geo);
    msg(`${features.length} feature(s). ${shown ? 'Total volume' : 'Volume of last'}: ${vol.toFixed(1)} mm³${op !== 'new' ? ` (${op})` : ''}`);
    if (mobile()) $('browser').classList.remove('open');
  } catch (err) { msg((err as Error).message); }
};
let modKind: 'fillet' | 'chamfer' | 'shell' | null = null; let modEdit: number | null = null;
const holeUI = (on: boolean) => document.querySelectorAll<HTMLElement>('#mdlg .holeonly').forEach((e) => (e.style.display = on ? '' : 'none'));
function openHole() {
  if (!features.length) { msg('Create a solid first.'); return; }
  modKind = 'hole' as never; $('mdlgt').textContent = 'Hole'; holeUI(true); ($('mdlg').querySelector('.notholeonly') as HTMLElement).style.display = 'none';
  $('mlabel').textContent = 'Depth (mm, 0 = through all)'; ($('msize') as HTMLInputElement).value = '0'; ($('msize') as HTMLInputElement).min = '0';
  $('mdlgmsg').textContent = 'Drilled from the top of the solid, along -Z. Position is on the sketch plane (mm).'; $('mdlg').classList.add('show');
}
$('hol').onclick = openHole;
function openMod(k: 'fillet' | 'chamfer' | 'shell') {
  if (!features.length) { msg('Create a solid first.'); return; }
  holeUI(false); ($('mdlg').querySelector('.notholeonly') as HTMLElement).style.display = ''; ($('msize') as HTMLInputElement).min = '0.01'; if (($('msize') as HTMLInputElement).value === '0') ($('msize') as HTMLInputElement).value = '2';
  modKind = k; $('mdlgt').textContent = k[0].toUpperCase() + k.slice(1);
  $('mlabel').textContent = k === 'fillet' ? 'Radius (mm)' : k === 'chamfer' ? 'Distance (mm)' : 'Wall thickness (mm)';
  $('mdlgmsg').textContent = k === 'shell' ? 'Hollows every solid inward. Edges choice picks which face is left open.' : 'Applies to every solid. Edges choice picks which edges.';
  $('mdlg').classList.add('show');
}
$('fil').onclick = () => openMod('fillet'); $('cha').onclick = () => openMod('chamfer'); $('she').onclick = () => openMod('shell');
$('mcancel').onclick = () => { $('mdlg').classList.remove('show'); modKind = null; modEdit = null; };
function editMod(i: number) {
  const f = features[i];
  if (f.kind === 'hole') { openHole(); const c = f.sketch[0] as Extract<Entity, { t: 'circle' }>; ($('hx') as HTMLInputElement).value = String(c.c.x); ($('hy') as HTMLInputElement).value = String(c.c.y); ($('hd') as HTMLInputElement).value = String(c.r * 2); ($('msize') as HTMLInputElement).value = String(f.depth); }
  else { openMod(f.kind as 'fillet' | 'chamfer' | 'shell'); ($('msize') as HTMLInputElement).value = String(f.depth); ($('medges') as HTMLSelectElement).value = f.edges ?? 'all'; }
  modEdit = i; msg(`Editing ${f.kind} ${i + 1}: change the values and press OK. Cancel keeps it as it was.`);
}
$('mok').onclick = async () => {
  if (!modKind) return;
  if ((modKind as string) === 'hole') {
    const hx = parseFloat(($('hx') as HTMLInputElement).value), hy = parseFloat(($('hy') as HTMLInputElement).value), hd = parseFloat(($('hd') as HTMLInputElement).value), dp = parseFloat(($('msize') as HTMLInputElement).value);
    if (!(hd > 0) || !(dp >= 0) || !isFinite(hx) || !isFinite(hy)) { msg('Hole: diameter must be greater than 0, depth 0 or more, X/Y numbers.'); return; }
    const hf: Feature = { kind: 'hole', depth: dp, sketch: [{ t: 'circle', c: { x: hx, y: hy }, r: hd / 2 }], geo: new THREE.BufferGeometry() };
    const hl = modEdit !== null ? features.map((x, k) => (k === modEdit ? hf : x)) : [...features, hf]; const hsel = modEdit ?? hl.length - 1;
    if (!(await applyFeatures(hl))) return;
    sel = hsel; modEdit = null; $('mdlg').classList.remove('show'); modKind = null; rebuild(); tree(); refreshButtons();
    msg(`Hole applied. Total volume: ${(shown ?? []).reduce((s, x) => s + volume(x.geo), 0).toFixed(1)} mm³`); return;
  }
  const size = parseFloat(($('msize') as HTMLInputElement).value); const edges = ($('medges') as HTMLSelectElement).value as Feature['edges'];
  if (!(size > 0)) { msg('Size must be greater than 0'); return; }
  const f: Feature = { kind: modKind, depth: size, sketch: [], geo: new THREE.BufferGeometry(), edges };
  const ml = modEdit !== null ? features.map((x, k) => (k === modEdit ? f : x)) : [...features, f]; const msel = modEdit ?? ml.length - 1;
  if (!(await applyFeatures(ml))) return;
  sel = msel; modEdit = null; $('mdlg').classList.remove('show'); const k = modKind; modKind = null; rebuild(); tree(); refreshButtons();
  msg(`${k[0].toUpperCase() + k.slice(1)} applied. Total volume: ${(shown ?? []).reduce((s, x) => s + volume(x.geo), 0).toFixed(1)} mm³`);
};
$('delft').onclick = async () => { if (sel === null) return; const i = sel; const next = features.filter((_, k) => k !== i); if (!(await applyFeatures(next))) return; sel = null; rebuild(); tree(); refreshButtons(); };
$('undo').onclick = async () => { if (!features.length) return; if (!(await applyFeatures(features.slice(0, -1)))) return; sel = null; rebuild(); tree(); refreshButtons(); };
const num = (id: string) => parseFloat(($(id) as HTMLInputElement).value);
$('addnum').onclick = () => {
  const x = num('dx') || 0, y = num('dy') || 0, a = num('d1'), b = num('d2');
  if (tool === 'circle' && a > 0) sketch.push({ t: 'circle', c: { x, y }, r: a });
  else if (tool === 'rect' && a > 0 && b > 0) sketch.push({ t: 'rect', a: { x, y }, b: { x: x + a, y: y + b } });
  else { msg('Pick Rectangle (W, H) or Circle (R) and enter positive values in mm'); return; }
  draw(); props();
};
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool as typeof tool; filPt = null; regPts = null; conPick = null; symPick = []; ptPick = null; cirPick = null; polyPts = []; segPts = []; ctan3Pick = []; arctStart = null; dimTarget = null; $('dimbox').style.display = 'none'; refreshButtons(); draw(); }));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view!)));
$('bt').onclick = () => $('browser').classList.toggle('open');

// ---------- save / open / export ----------
/** The sketch being drawn right now, so Save and the autosave keep it. A new sketch is stored as the pending sketch; the edit of an existing Sketch feature is stored as an optional 'draft'. */
const liveSketch = () => { if (mode !== 'sketch' || !sketch.length) return null; let src: SketchSrc | null = null; try { src = snapshotSrc(); } catch { src = null; } return { ents: clone(sketch), src }; };
const serialize = () => { const live = liveSketch(); const liveNew = live && editing === null ? live : null; const draft = live && editing !== null ? { i: editing, sketch: live.ents, ...(live.src ? { src: live.src } : {}) } : null; const pend = liveNew ? liveNew.ents : pending; const pSrc = liveNew ? liveNew.src : pendingSrc; return serialize0(pend, pSrc, draft); };
const serialize0 = (pending: Entity[] | null, pendingSrc: SketchSrc | null, draft: { i: number; sketch: Entity[]; src?: SketchSrc } | null) => JSON.stringify({ version: 1, features: features.map((f) => ({ kind: f.kind, depth: f.depth, sketch: f.sketch, ...(f.edges ? { edges: f.edges } : {}), ...(f.src ? { src: f.src } : {}), ...(f.op && f.op !== 'new' ? { op: f.op } : {}), ...(f.dir && f.dir !== 'normal' ? { dir: f.dir } : {}), ...(f.plane && f.plane !== 'XY' ? { plane: f.plane } : {}), ...(f.orient && (f.orient.r || f.orient.f) ? { orient: f.orient } : {}) })), sketch: pending ?? [], ...(pending && curPlane !== 'XY' ? { pendingPlane: curPlane } : {}), ...(pending && (curOrient.r || curOrient.f) ? { pendingOrient: curOrient } : {}), ...(pending && pendingSrc ? { pendingSrc } : {}), ...(draft ? { draft } : {}), ...(matIdx ? { mat: matName() } : {}) });
async function load(text: string) {
  let d: any;
  try { d = JSON.parse(text); if (!d || !Array.isArray(d.features)) throw new Error('bad'); } catch { msg('Open failed: this is not a valid MK CAD file. The current model was kept.'); return; }
  const loaded: Feature[] = d.features.map((f: any) => ({ ...f, sketch: f.sketch ?? [], geo: geoOf(f) }));
  { const mm = mixedPlaneMsg(loaded); if (mm) { msg('Open failed. ' + mm.replace('The model was not changed.', 'The current model was kept.')); return; } }
  const oldFeatures = features, oldShown = shown;
  features = []; shown = null;
  if (needsKernel(loaded)) {
    msg('Computing solid (the first time this loads the geometry kernel)...');
    let bodies: KBody[] | null = null;
    try { bodies = await computeBodies(loaded.map(specOf)); } catch (e) {
      loaded.forEach((f) => f.geo.dispose()); features = oldFeatures; shown = oldShown;
      msg(`Open failed, the file was not loaded and the current model was kept. Reason: ${(e as Error).message}`); return;
    }
    shown = bodies; features = loaded;
  } else { features = loaded; }
  oldFeatures.forEach((f) => f.geo.dispose()); oldShown?.forEach((x) => x.geo.dispose());
  matIdx = Math.max(0, MATS.findIndex((x) => x[0] === d.mat));
  curOrient = d.pendingOrient && typeof d.pendingOrient === 'object' ? { r: ([0, 1, 2, 3].includes(d.pendingOrient.r) ? d.pendingOrient.r : 0) as 0 | 1 | 2 | 3, f: !!d.pendingOrient.f } : {}; curPlane = d.pendingPlane === 'XZ' || d.pendingPlane === 'YZ' ? d.pendingPlane : 'XY'; pending = d.sketch?.length ? d.sketch : null; pendingSrc = pending && d.pendingSrc ? d.pendingSrc : null; sketch = []; sel = null; editing = null; setMode('model'); rebuild(); setView('home'); tree(); refreshButtons(); const dr = d.draft; if (dr && Number.isInteger(dr.i) && features[dr.i] && Array.isArray(dr.sketch) && dr.sketch.length && !isMod(features[dr.i].kind)) { editing = dr.i; sel = dr.i; curPlane = features[dr.i].plane ?? 'XY'; curOrient = features[dr.i].orient ?? {}; startSketch(dr.sketch, dr.src ?? null); msg(`Opened with an unfinished edit of Sketch${dr.i + 1}. Change it, then Finish Sketch (nothing was committed).`); return; } const ov = shown ? null : overlapPair(); msg(ov ? `Opened with a warning: features ${ov[0] + 1} and ${ov[1] + 1} overlap (bounding boxes). They are separate meshes, not a joined part; export is blocked until fixed.` : `Opened: ${features.length} feature(s).`);
}
(window as any).__cad = { bbox: () => { const bb = new THREE.Box3(); for (const g of shown ? shown.map((x) => x.geo) : features.map((f) => f.geo)) { g.computeBoundingBox(); if (g.boundingBox) bb.union(g.boundingBox); } return [bb.min.toArray().map((v) => +v.toFixed(4)), bb.max.toArray().map((v) => +v.toFixed(4))]; }, cam: () => ({ ...cam }), sketchNow: () => JSON.parse(JSON.stringify(sketch)), serialize, load, volumes: () => (shown ? shown.map((b) => volume(b.geo)) : features.map((f) => volume(f.geo))), state: () => ({ mode, features: features.length, pending: !!pending, sel }) };
(window as any).__cad.pickAt = (x: number, y: number, add = false) => pickEnt({ x, y }, add);
(window as any).__cad.selCount = () => selE.length;
(window as any).__cad.consNow = () => cons.map((c) => ({ k: c.k, v: c.v }));
setInterval(() => { try { localStorage.setItem('cadlite', serialize()); } catch { /* ignore */ } }, 2000);
$('save').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([serialize()], { type: 'application/json' })); a.download = 'part.cadlite.json'; a.click(); };
$('open').onclick = () => $('file').click();
($('file') as HTMLInputElement).onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { try { load(await f.text()); } catch { msg('Invalid file'); } } };
function overlapPair(): [number, number] | null {
  const bs = features.map((f) => bbox(f.kind, f.geo).expandByScalar(-1e-6));
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (bs[i].intersectsBox(bs[j])) return [i, j];
  return null;
}
function download(name: string, text: string, type: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }
async function export3d(ext: 'stl' | 'obj' | 'step') {
  if (!features.length) return; let exactStep = false;
  const ov = shown ? null : overlapPair();
  if (ov) { msg(`Cannot export: Extrusion/Revolution ${ov[0] + 1} and ${ov[1] + 1} overlap (bounding boxes). Use Join/Cut/Intersect in the Extrude dialog, or edit one.`); return; }
  try {
    if (ext === 'step') {
      let kb: KBody[] | null = shown;
      if (!kb && features.every((f) => f.kind === 'extrude' || (f.kind === 'revolve' && (f.op ?? 'new') === 'new'))) { msg('Building the exact solid for STEP...'); try { kb = await computeBodies(features.map(specOf)); } catch { kb = null; } }
      if (kb) { exactStep = true; const blob = await stepOf(kb); if (kb !== shown) kb.forEach((b) => b.geo.dispose()); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'part.step'; a.click(); }
      else download('part.step', toSTEP(features), 'application/step');
    } else if (ext === 'obj') download('part.obj', toOBJ(shown ? shown.map((b) => ({ kind: 'extrude' as const, depth: 0, sketch: [], geo: b.geo })) : features), 'text/plain');
    else { const geos = shown ? shown.map((b) => b.geo.clone()) : features.map((f) => { const g = f.geo.clone(); if (f.kind === 'revolve') g.rotateX(Math.PI / 2); return g; }); download('part.stl', toSTL(geos), 'model/stl'); }
    msg(`Exported part.${ext} (mm)${exactStep ? ', exact solid from the OpenCascade kernel (true arcs and circles)' : ext === 'step' ? ', faceted solid (this part has features the exact kernel does not cover)' : ''}.`);
  } catch (e) { msg((e as Error).message); }
}
$('stl').onclick = () => export3d('stl'); $('obj').onclick = () => export3d('obj'); $('step').onclick = () => export3d('step');
function exportDxf() {
  const src = mode === 'sketch' ? sketch : sel !== null ? features[sel].sketch : pending ?? (features.length ? features[features.length - 1].sketch : []);
  if (!src.length) { msg('Nothing to export: draw a sketch or select a feature first.'); return; }
  download('sketch.dxf', toDXF(src), 'application/dxf'); msg('Exported sketch.dxf (2D, mm).');
}
$('dxf').onclick = exportDxf; $('dxf2').onclick = exportDxf;


setMode('model'); resize(); setView('home');
try { const t = localStorage.getItem('cadlite'); if (t) load(t); } catch { /* ignore */ }

// ---------- ribbon tooltips (replace native title with a styled box) ----------
(() => {
  const tip = $('tip'); let timer: number | undefined;
  const hide = () => { clearTimeout(timer); tip.style.display = 'none'; };
  document.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement).closest('#ribbon button, #title button, #tabs button, #nav button, #vc button') as HTMLElement | null;
    if (!t) return hide();
    if (t.title) { t.dataset.tt = t.title; t.removeAttribute('title'); }
    let raw = t.dataset.tt || ''; if (/in development/i.test(raw)) raw = ''; const pend = t.classList.contains('pend') || t.classList.contains('pendtab');
    const name = (t.textContent || '').trim() || raw.split(/ \(| –|:/)[0] || 'Command';
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const r = t.getBoundingClientRect();
      tip.innerHTML = '<b></b><span></span>' + (pend ? '<div class="st">In development / قيد التطوير</div>' : '');
      (tip.children[0] as HTMLElement).textContent = name; (tip.children[1] as HTMLElement).textContent = raw && raw !== name ? raw.replace(/\s*\(in development[^)]*\)/i, '') : '';
      tip.style.display = 'block'; tip.style.left = Math.min(r.left, innerWidth - 250) + 'px'; tip.style.top = r.bottom + 6 + 'px';
    }, 350);
  });
  document.addEventListener('mouseout', hide); document.addEventListener('click', hide);
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.hostname.match(/^(localhost|127\.)/)) addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
// Touch: two fingers on the sketch pinch to zoom and drag to pan. One finger keeps placing points like a mouse click.
const tpts = new Map<number, { x: number; y: number }>(); let pinch: { d: number; mx: number; my: number } | null = null;
const tinfo = () => { const a = [...tpts.values()]; return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 }; };
let replaying = false; let held: { id: number; init: PointerEventInit; t: number } | null = null;
const release = () => { if (!held) return; const h = held; held = null; clearTimeout(h.t); replaying = true; sk.dispatchEvent(new PointerEvent('pointerdown', h.init)); replaying = false; };
sk.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch' || replaying) return; tpts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (tpts.size >= 2) { if (held) { clearTimeout(held.t); held = null; } drag = null; pan = null; pinch = tinfo(); e.stopImmediatePropagation(); draw(); return; }
  // hold the first finger briefly: if a second finger lands it is a pinch, not a click
  e.stopImmediatePropagation(); held = { id: e.pointerId, init: { pointerId: e.pointerId, pointerType: 'touch', isPrimary: true, clientX: e.clientX, clientY: e.clientY, button: 0, buttons: 1, bubbles: true, cancelable: true }, t: window.setTimeout(release, 70) }; }, true);
sk.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch' || !tpts.has(e.pointerId)) return; tpts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (tpts.size >= 2 && pinch) { const n = tinfo(); cam.x -= ((n.mx - pinch.mx) * devicePixelRatio) / cam.s; cam.y += ((n.my - pinch.my) * devicePixelRatio) / cam.s; cam.s = Math.min(80, Math.max(1, cam.s * (n.d / pinch.d))); pinch = n; draw(); e.stopImmediatePropagation(); } else if (pinch) e.stopImmediatePropagation(); }, true);
const tend = (e: PointerEvent) => { if (e.pointerType !== 'touch') return; if (held && held.id === e.pointerId) release(); const was = pinch; tpts.delete(e.pointerId); if (tpts.size < 2) pinch = tpts.size ? pinch : null; if (was) e.stopImmediatePropagation(); if (!tpts.size) pinch = null; };
sk.addEventListener('pointerup', tend, true); sk.addEventListener('pointercancel', tend, true);
// Warm the 3D kernel once the page is idle (not on data saver) so the app also works offline later.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.hostname.match(/^(localhost|127\.)/)) addEventListener('load', () => setTimeout(() => { const c = (navigator as any).connection; if (navigator.onLine && !(c && c.saveData)) loadKernel().catch(() => {}); }, 5000));

// ---------- Inspect: physical properties (mass, volume, area, center of gravity) ----------

function physProps() {
  const geos = shown ? shown.map((b) => b.geo) : features.map((f) => f.geo);
  let V = 0, A = 0, cx = 0, cy = 0, cz = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const g of geos) { const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) { a.fromBufferAttribute(pos, idx ? idx.getX(i) : i); b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1); c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
      const v = a.dot(b.clone().cross(c)) / 6; V += v; cx += (v * (a.x + b.x + c.x)) / 4; cy += (v * (a.y + b.y + c.y)) / 4; cz += (v * (a.z + b.z + c.z)) / 4;
      A += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; } }
  const s = V < 0 ? -1 : 1; V *= s; return { bodies: geos.length, vol: V, area: A, cg: V > 1e-12 ? { x: (cx * s) / V, y: (cy * s) / V, z: (cz * s) / V } : null };
}
function physCard() {
  let box = document.getElementById('phys');
  if (!box) { box = document.createElement('div'); box.id = 'phys'; box.style.cssText = 'position:fixed;left:50%;top:150px;transform:translateX(-50%);z-index:30;width:min(340px,94vw);background:#f4f6fa;border:1px solid #8a93a5;box-shadow:0 4px 14px #0004;border-radius:4px;font-size:12px'; document.body.appendChild(box); }
  const p = physProps(); const d = MATS[matIdx][1]; const mass = (p.vol / 1000) * d / 1000; // mm3 -> cm3 -> g -> kg
  const f = (x: number, k = 3) => (Math.abs(x) >= 1e5 ? x.toExponential(4) : x.toFixed(k));
  box.innerHTML = `<h5 style="margin:0;padding:5px 8px;background:#cfd6e2;border-bottom:1px solid #b9c0cf;display:flex;justify-content:space-between">Physical properties<button id="physx" style="border:0;background:none;font-size:14px">\u2715</button></h5><div style="padding:8px;display:grid;gap:5px">`
    + `<label>Material <select id="physmat" style="width:100%;margin-top:2px">${MATS.map((m, i) => `<option value="${i}"${i === matIdx ? ' selected' : ''}>${m[0]} (${m[1]} g/cm\u00B3)</option>`).join('')}</select></label>`
    + (p.bodies ? `<div>Bodies: <b>${p.bodies}</b></div><div>Mass: <b>${f(mass, 5)} kg</b> (${f(mass * 1000, 2)} g, ${f(mass * 2.20462262, 5)} lb)</div><div>Volume: <b>${f(p.vol, 2)} mm\u00B3</b></div><div>Surface area: <b>${f(p.area, 2)} mm\u00B2</b></div>` + (p.cg ? `<div>Center of gravity (model axes, mm): X <b>${f(p.cg.x)}</b>  Y <b>${f(p.cg.y)}</b>  Z <b>${f(p.cg.z)}</b></div>` : '') : '<div>No solid in the part yet. Extrude or revolve a sketch first.</div>')
    + `<div style="color:#667;font-size:11px">Computed from the display mesh (a triangle approximation); no error bound is guaranteed. Curved faces are approximated, so volume, area and center of gravity are estimates. Density for the chosen material: ${MATS[matIdx][2]}. This is one reference value, real alloys, tempers and moisture differ, so check your own material data. Bodies that overlap are counted separately.</div></div>`;
  (document.getElementById('physx') as HTMLElement).onclick = () => box!.remove();
  (document.getElementById('physmat') as HTMLSelectElement).onchange = (e) => { matIdx = +(e.target as HTMLSelectElement).value; physCard(); try { localStorage.setItem('cadlite', serialize()); } catch { /* ignore */ } };
}
$('physbtn').onclick = physCard;
(window as any).__cad.phys = physProps;
(window as any).__cad.dof = () => dofVal;
(window as any).__cad.dofMarks = () => sketch.map((e, i) => e.t === 'line' ? [i, dofFixed.has(e as L)] : null).filter(Boolean);

// Ribbon scroll affordance: edge arrows appear only when the ribbon is wider than the window.
(() => {
  const rb = document.getElementById('ribbon'); if (!rb || !rb.parentElement) return;
  const wrap = document.createElement('div'); wrap.id = 'ribwrap'; wrap.style.cssText = 'position:relative';
  rb.parentElement.insertBefore(wrap, rb); wrap.appendChild(rb);
  const mk = (id: string, label: string, side: string, dir: number) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', dir < 0 ? 'Scroll ribbon left' : 'Scroll ribbon right');
    b.style.cssText = `position:absolute;top:0;${side}:0;height:100%;width:26px;border:0;background:rgba(30,60,110,.78);color:#fff;font-size:20px;cursor:pointer;display:none;z-index:5`;
    b.onclick = () => rb.scrollBy({ left: dir * Math.max(200, rb.clientWidth * 0.6), behavior: 'smooth' }); wrap.appendChild(b); return b; };
  const l = mk('ribL', '‹', 'left', -1), r = mk('ribR', '›', 'right', 1);
  const upd = () => { l.style.display = rb.scrollLeft > 2 ? 'block' : 'none'; r.style.display = rb.scrollLeft + rb.clientWidth < rb.scrollWidth - 2 ? 'block' : 'none'; };
  rb.addEventListener('scroll', upd); addEventListener('resize', upd); document.addEventListener('click', () => setTimeout(upd, 80)); setTimeout(upd, 300); setTimeout(upd, 1500);
})();
