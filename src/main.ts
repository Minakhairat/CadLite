import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toOBJ, toSTEP, toDXF } from './exporters';
import { computeBodies, stepOf, Body as KBody } from './kernel';
import type { Spec } from './kernel-core';
import { Entity, Feature, P, buildGeometry, snap, outline, toSTL, volume, resolveLoops, circle3 } from './geometry';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (t: string) => ($('msg').textContent = t);
const mobile = () => innerWidth < 800;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Mode = 'model' | 'sketch';
let mode: Mode = 'model';
let tool: 'rect' | 'circle' | 'poly' | 'line' | 'arc' | 'dim' | 'none' = 'rect';
type Dim = { e: Entity; w: 'len' | 'dia' | 'rad' | 'w' | 'h'; pos: P };
let dims: Dim[] = [];
let dimTarget: { e: Entity; w: Dim['w']; pos: P } | null = null;
let segPts: P[] = []; // line chain start / arc clicks in progress
let hover: P | null = null;
let sketch: Entity[] = [];
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
  const dpr = devicePixelRatio; ctx.clearRect(0, 0, sk.width, sk.height);
  const g = grid(); ctx.lineWidth = 1; ctx.strokeStyle = '#dfe3ea';
  const a = toWorld(0, sk.height), b = toWorld(sk.width, 0);
  for (let x = Math.floor(a.x / g) * g; x <= b.x; x += g) { const s = toScreen({ x, y: 0 }); ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, sk.height); ctx.stroke(); }
  for (let y = Math.floor(a.y / g) * g; y <= b.y; y += g) { const s = toScreen({ x: 0, y }); ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(sk.width, s.y); ctx.stroke(); }
  const o = toScreen({ x: 0, y: 0 }); ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d33'; ctx.beginPath(); ctx.moveTo(0, o.y); ctx.lineTo(sk.width, o.y); ctx.stroke();
  ctx.strokeStyle = '#2a2'; ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, sk.height); ctx.stroke();
  ctx.fillStyle = '#d33'; ctx.font = `${11 * dpr}px sans-serif`; ctx.fillText('X', sk.width - 16 * dpr, o.y - 4 * dpr); ctx.fillStyle = '#2a2'; ctx.fillText('Y', o.x + 5 * dpr, 14 * dpr);
  ctx.strokeStyle = '#1f6fd1'; ctx.lineWidth = 2 * dpr;
  const c = current(); const all = c ? [...sketch, c] : sketch;
  for (const e of all) { if (e.t === 'line' || e.t === 'arc') { path(outline(e), false); ctx.stroke(); } else { path(outline(e), true); ctx.fillStyle = '#1f6fd11a'; ctx.fill(); ctx.stroke(); } }
  if (segPts.length && hover) {
    ctx.setLineDash([6 * dpr, 4 * dpr]); const pv: Entity | null = tool === 'line' ? { t: 'line', a: segPts[0], b: hover } : tool === 'arc' ? (segPts.length === 1 ? { t: 'line', a: segPts[0], b: hover } : { t: 'arc', a: segPts[0], b: segPts[1], m: hover }) : null;
    if (pv) { path(outline(pv), false); ctx.stroke(); } ctx.setLineDash([]); ctx.fillStyle = '#1f6fd1'; segPts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
  }
  if (polyPts.length) { path(polyPts, false); ctx.stroke(); ctx.fillStyle = '#1f6fd1'; polyPts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }); }
  dims = dims.filter((d) => sketch.includes(d.e));
  for (const d of dims) { const s = toScreen(d.pos); const t = dimText(d); ctx.font = `${12 * dpr}px sans-serif`; const w = ctx.measureText(t).width + 8 * dpr; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#34506f'; ctx.lineWidth = 1 * dpr; ctx.fillRect(s.x, s.y - 9 * dpr, w, 18 * dpr); ctx.strokeRect(s.x, s.y - 9 * dpr, w, 18 * dpr); ctx.fillStyle = '#123'; ctx.fillText(t, s.x + 4 * dpr, s.y + 4 * dpr); }
  ctx.strokeStyle = '#1f6fd1';
  if (hover && tool !== 'none' && Math.hypot(hover.x, hover.y) < 1e-9) { const o2 = toScreen({ x: 0, y: 0 }); ctx.fillStyle = '#2bb24c'; ctx.beginPath(); ctx.arc(o2.x, o2.y, 5 * dpr, 0, 7); ctx.fill(); }
  if (c && drag) { ctx.fillStyle = '#123'; ctx.font = `${13 * dpr}px sans-serif`; const s = toScreen(drag.cur); ctx.fillText(c.t === 'rect' ? `${Math.abs(c.b.x - c.a.x)} x ${Math.abs(c.b.y - c.a.y)} mm` : c.t === 'circle' ? `R ${c.r.toFixed(1)} mm` : '', s.x + 12, s.y - 12); }
}
function pt(e: PointerEvent): P { const r = sk.getBoundingClientRect(); const w = toWorld((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio); const g = grid(); return { x: snap(w.x, g), y: snap(w.y, g) }; }
let pan: { x: number; y: number } | null = null;
sk.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return; // right click opens the Inventor-style OK / Cancel menu
  if (drag && (tool === 'rect' || tool === 'circle')) { sk.setPointerCapture(e.pointerId); drag.cur = pt(e); const c = current(); if (c) sketch.push(c); drag = null; draw(); props(); return; } // second click commits (lesson: click, move, click)
  if (e.button === 1 || e.shiftKey) { pan = { x: e.clientX, y: e.clientY }; return; }
  sk.setPointerCapture(e.pointerId); const p = pt(e);
  if (tool === 'dim') {
    const h = dimHit(p); if (!h) { msg('Dimension: click a line, circle, arc or rectangle edge.'); return; }
    dimTarget = { e: h.e, w: h.w, pos: p }; const box = $('dimbox'); const gr = $('gfx').getBoundingClientRect(); box.style.display = 'flex'; box.style.left = Math.min(e.clientX - gr.left + 10, gr.width - 170) + 'px'; box.style.top = e.clientY - gr.top + 10 + 'px';
    const inp = $<HTMLInputElement>('dimin'); inp.value = String(+dimValue(h.e, h.w).toFixed(3)); setTimeout(() => { inp.focus(); inp.select(); }, 0); return;
  }
  if (tool === 'line') {
    if (!segPts.length) segPts = [p]; else if (Math.hypot(p.x - segPts[0].x, p.y - segPts[0].y) > 1e-9) { sketch.push({ t: 'line', a: segPts[0], b: p }); segPts = [p]; props(); }
    hover = p; draw(); return;
  }
  if (tool === 'arc') {
    segPts.push(p);
    if (segPts.length === 3) { const [a, b, mm] = segPts; if (circle3(a, b, mm)) { sketch.push({ t: 'arc', a, b, m: mm }); props(); } else msg('Arc points are on one line: pick a point off the line.'); segPts = []; }
    hover = p; draw(); return;
  }
  if (tool === 'poly') {
    if (polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < grid() * 0.5 + 1e-9) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; props(); } else polyPts.push(p);
    draw(); return;
  }
  downAt = { x: e.clientX, y: e.clientY };
  if (tool === 'rect' || tool === 'circle') drag = { start: p, cur: p, moved: false };
});
sk.addEventListener('pointermove', (e) => {
  if (pan) { cam.x -= ((e.clientX - pan.x) * devicePixelRatio) / cam.s; cam.y += ((e.clientY - pan.y) * devicePixelRatio) / cam.s; pan = { x: e.clientX, y: e.clientY }; draw(); return; }
  const p = pt(e); hover = p; if (segPts.length) draw(); $('coord').textContent = `X ${p.x}  Y ${p.y}  mm`;
  if (drag) { drag.cur = p; drag.moved = true; draw(); }
});
let downAt = { x: 0, y: 0 };
sk.addEventListener('pointerup', (ev) => { pan = null; if (drag && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 8) { const c = current(); if (c) sketch.push(c); drag = null; draw(); props(); } });
const commitDim = () => {
  if (!dimTarget) return; const inp = $<HTMLInputElement>('dimin'); const t = dimTarget;
  try { dimApply(t.e, t.w, parseFloat(inp.value)); if (!dims.some((d) => d.e === t.e && d.w === t.w)) dims.push({ e: t.e, w: t.w, pos: t.pos }); msg(`Dimension set: ${dimText({ e: t.e, w: t.w, pos: t.pos })} mm`); props(); }
  catch (er) { msg((er as Error).message); return; }
  dimTarget = null; $('dimbox').style.display = 'none'; draw();
};
$('dimok').onclick = commitDim;
$('dimin').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commitDim(); if (ev.key === 'Escape') { dimTarget = null; $('dimbox').style.display = 'none'; } });
const ctxm = $('ctxm');
const endTool = (exitTool: boolean) => { polyPts = []; segPts = []; drag = null; if (exitTool) { tool = 'none'; refreshButtons(); } ctxm.style.display = 'none'; draw(); };
sk.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode !== 'sketch') return; const r = $('gfx').getBoundingClientRect(); ctxm.style.left = e.clientX - r.left + 'px'; ctxm.style.top = e.clientY - r.top + 'px'; ctxm.style.display = 'block'; });
$('ctxok').onclick = () => { if (tool === 'poly' && polyPts.length >= 3) { sketch.push({ t: 'poly', pts: polyPts }); props(); } endTool(true); };
$('ctxcancel').onclick = () => endTool(true);
addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('#ctxm')) ctxm.style.display = 'none'; });
sk.addEventListener('wheel', (e) => { e.preventDefault(); cam.s = Math.min(80, Math.max(1, cam.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw(); }, { passive: false });
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Enter' && polyPts.length >= 3) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; draw(); props(); }
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
const isMod = (k: string) => k === 'fillet' || k === 'chamfer' || k === 'shell';
const needsKernel = (fs: Feature[]) => fs.some((f) => (f.op ?? 'new') !== 'new' || isMod(f.kind));
const geoOf = (f: { kind: Feature['kind']; sketch: any; depth: number; dir?: any }) => (isMod(f.kind) ? new THREE.BufferGeometry() : buildGeometry(f.kind as 'extrude' | 'revolve', f.sketch, f.depth, f.dir));
const specOf = (f: Feature): Spec => ({ kind: f.kind, sketch: f.sketch, depth: f.depth, op: f.op, dir: f.dir, edges: f.edges });
/** Try a new feature list. Computes the solid when Join/Cut/Intersect is involved. Returns false (and a message) when it fails. */
async function applyFeatures(next: Feature[]): Promise<boolean> {
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
  for (const id of ['fil', 'cha', 'she']) ($(id) as HTMLButtonElement).disabled = !model || !features.length;
  for (const id of ['stl', 'obj', 'step']) ($(id) as HTMLButtonElement).disabled = !features.length; ($('startsk') as HTMLButtonElement).disabled = !model;
  document.querySelectorAll<HTMLButtonElement>('[data-proxy]').forEach((b) => (b.disabled = ($(b.dataset.proxy!) as HTMLButtonElement).disabled));
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}
function tree() {
  const t = $('tree'); t.innerHTML = '';
  const node = (label: string, d: number, cls: string, click?: () => void, dbl?: () => void, selected = false) => {
    const n = document.createElement('div'); n.className = 'node' + (selected ? ' sel' : ''); n.style.setProperty('--d', String(d));
    const i = document.createElement('i'); i.className = cls; n.append(i, document.createTextNode(label));
    if (click) n.onclick = click; if (dbl) n.ondblclick = dbl; t.append(n);
  };
  node('Part1', 0, 'p'); node(`Solid Bodies(${shown ? shown.length : features.length})`, 1, ''); node('View: Master', 1, ''); node('Origin', 1, 'o'); node('XY Plane', 2, ''); node('X Axis', 2, ''); node('Y Axis', 2, '');
  features.forEach((f, i) => {
    if (isMod(f.kind)) { node(`${f.kind[0].toUpperCase()}${f.kind.slice(1)}${i + 1}  (${f.depth} mm, ${f.edges ?? 'all'} ${f.kind === 'shell' ? 'open face' : 'edges'})`, 1, 'f', () => { sel = i; rebuild(); tree(); refreshButtons(); }, undefined, sel === i); return; }
    node(`Sketch${i + 1}`, 2, 's', () => { sel = i; rebuild(); tree(); refreshButtons(); }, () => editFeature(i), sel === i);
  });
  node('End of Part', 1, 'e');
  if (pending) node('Sketch (not used yet)', 1, 's');
  if (mode === 'sketch') node(editing !== null ? `Editing Sketch${editing + 1}` : 'Sketch in progress', 1, 's', undefined, undefined, true);
}
function numField(label: string, v: number, on: (n: number) => void) {
  const l = document.createElement('label'); l.textContent = label;
  const i = document.createElement('input'); i.type = 'number'; i.step = 'any'; i.value = String(+v.toFixed(4));
  i.onchange = () => { const n = parseFloat(i.value); if (isFinite(n)) { on(n); draw(); } };
  l.append(i); return l;
}
function props() {
  const p = $('props'); p.innerHTML = ''; p.classList.toggle('show', mode === 'sketch' && sketch.length > 0);
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
    else title(`Polygon ${i + 1} (${e.pts.length} points)`);
    const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = () => { sketch.splice(i, 1); draw(); props(); };
    r.append(g, del); p.append(r);
  });
}

// ---------- actions ----------
function startSketch(from?: Entity[]) { sketch = from ? clone(from) : pending ? clone(pending) : []; if (!from && pending) pending = null; polyPts = []; setMode('sketch'); msg('Sketch: draw shapes or enter exact sizes, then Finish Sketch.'); }
$('startsk').onclick = () => { editing = null; $('pp').classList.add('show'); };
$('ppxy').onclick = () => { $('pp').classList.remove('show'); startSketch(); };
$('ppx').onclick = () => $('pp').classList.remove('show');
function editFeature(i: number) { if (isMod(features[i].kind)) { msg('Fillet/Chamfer/Shell: delete this feature and add it again to change it.'); return; } editing = i; sel = i; startSketch(features[i].sketch); msg(`Editing Sketch${i + 1}: change dimensions, then Finish Sketch.`); }
$('editft').onclick = () => sel !== null && editFeature(sel);
$('cancelsk').onclick = () => { if (editing === null && sketch.length) pending = null; editing = null; sketch = []; setMode('model'); msg('Sketch cancelled.'); };
$('clear').onclick = () => { sketch = []; polyPts = []; draw(); props(); };
$('fin2').onclick = () => $('finish').click();
$('finish').onclick = () => {
  if (!sketch.length) { editing = null; setMode('model'); msg('Empty sketch discarded.'); return; }
  try { const rl = resolveLoops(sketch); buildGeometry('extrude', rl, 1); sketch = rl; } catch (e) { msg((e as Error).message); return; }
  const kind = editing !== null ? (features[editing].kind as 'extrude' | 'revolve') : null;
  pending = clone(sketch); sketch = []; setMode('model');
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
$('dcancel').onclick = () => { $('dlg').classList.remove('show'); dlgKind = null; if (editing !== null) { editing = null; pending = null; } };
function bbox(kind: string, geo: THREE.BufferGeometry) { const g = geo.clone(); if (kind === 'revolve') g.rotateX(Math.PI / 2); g.computeBoundingBox(); const b = g.boundingBox!.clone(); g.dispose(); return b; }
$('dok').onclick = async () => {
  if (!dlgKind || !pending) return;
  try {
    const depth = parseFloat(($('depth') as HTMLInputElement).value);
    if (dlgKind === 'extrude' && !(depth > 0)) throw new Error('Distance must be greater than 0');
    const op = dlgKind === 'extrude' ? dlgOp : 'new'; const dir = dlgKind === 'extrude' ? dlgDir : 'normal';
    const geo = buildGeometry(dlgKind, pending, depth || 1, dir); const f: Feature = { kind: dlgKind, depth: depth || 1, sketch: clone(pending), geo, op, dir };
    const next = editing !== null ? features.map((o, i) => (i === editing ? f : o)) : [...features, f];
    if (!needsKernel(next)) {
      const nb = bbox(f.kind, geo).expandByScalar(-1e-6);
      const hit = features.findIndex((o, i) => i !== editing && bbox(o.kind, o.geo).intersectsBox(nb));
      if (hit >= 0) { geo.dispose(); throw new Error(`Overlaps ${features[hit].kind === 'extrude' ? 'Extrusion' : 'Revolution'}${hit + 1}. Choose Join, Cut or Intersect in the Extrude dialog, or place separate bodies apart.`); }
    }
    const old = editing !== null ? features[editing] : null; const ed = editing;
    if (!(await applyFeatures(next))) { geo.dispose(); return; }
    old?.geo.dispose(); sel = ed !== null ? ed : features.length - 1; editing = null;
    pending = null; $('dlg').classList.remove('show'); dlgKind = null; rebuild(); setView('home'); tree(); refreshButtons();
    const vol = shown ? shown.reduce((s, x) => s + volume(x.geo), 0) : volume(f.geo);
    msg(`${features.length} feature(s). ${shown ? 'Total volume' : 'Volume of last'}: ${vol.toFixed(1)} mm³${op !== 'new' ? ` (${op})` : ''}`);
    if (mobile()) $('browser').classList.remove('open');
  } catch (err) { msg((err as Error).message); }
};
let modKind: 'fillet' | 'chamfer' | 'shell' | null = null;
function openMod(k: 'fillet' | 'chamfer' | 'shell') {
  if (!features.length) { msg('Create a solid first.'); return; }
  modKind = k; $('mdlgt').textContent = k[0].toUpperCase() + k.slice(1);
  $('mlabel').textContent = k === 'fillet' ? 'Radius (mm)' : k === 'chamfer' ? 'Distance (mm)' : 'Wall thickness (mm)';
  $('mdlgmsg').textContent = k === 'shell' ? 'Hollows every solid inward. Edges choice picks which face is left open.' : 'Applies to every solid. Edges choice picks which edges.';
  $('mdlg').classList.add('show');
}
$('fil').onclick = () => openMod('fillet'); $('cha').onclick = () => openMod('chamfer'); $('she').onclick = () => openMod('shell');
$('mcancel').onclick = () => { $('mdlg').classList.remove('show'); modKind = null; };
$('mok').onclick = async () => {
  if (!modKind) return;
  const size = parseFloat(($('msize') as HTMLInputElement).value); const edges = ($('medges') as HTMLSelectElement).value as Feature['edges'];
  if (!(size > 0)) { msg('Size must be greater than 0'); return; }
  const f: Feature = { kind: modKind, depth: size, sketch: [], geo: new THREE.BufferGeometry(), edges };
  if (!(await applyFeatures([...features, f]))) return;
  sel = features.length - 1; $('mdlg').classList.remove('show'); const k = modKind; modKind = null; rebuild(); tree(); refreshButtons();
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
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool as typeof tool; polyPts = []; segPts = []; dimTarget = null; $('dimbox').style.display = 'none'; refreshButtons(); draw(); }));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view!)));
$('bt').onclick = () => $('browser').classList.toggle('open');

// ---------- save / open / export ----------
const serialize = () => JSON.stringify({ version: 1, features: features.map((f) => ({ kind: f.kind, depth: f.depth, sketch: f.sketch, ...(f.edges ? { edges: f.edges } : {}), ...(f.op && f.op !== 'new' ? { op: f.op } : {}), ...(f.dir && f.dir !== 'normal' ? { dir: f.dir } : {}) })), sketch: pending ?? [] });
async function load(text: string) {
  const d = JSON.parse(text);
  features.forEach((f) => f.geo.dispose());
  const loaded: Feature[] = d.features.map((f: any) => ({ ...f, sketch: f.sketch ?? [], geo: geoOf(f) }));
  features = []; shown = null; if (!(await applyFeatures(loaded))) { features = loaded; }
  pending = d.sketch?.length ? d.sketch : null; sketch = []; sel = null; editing = null; setMode('model'); rebuild(); setView('home'); tree(); refreshButtons(); const ov = shown ? null : overlapPair(); msg(ov ? `Opened with a warning: features ${ov[0] + 1} and ${ov[1] + 1} overlap (bounding boxes). They are separate meshes, not a joined part; export is blocked until fixed.` : `Opened: ${features.length} feature(s).`);
}
(window as any).__cad = { serialize, load, volumes: () => (shown ? shown.map((b) => volume(b.geo)) : features.map((f) => volume(f.geo))), state: () => ({ mode, features: features.length, pending: !!pending, sel }) };
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
      if (!kb && features.every((f) => f.kind === 'extrude')) { msg('Building the exact solid for STEP...'); try { kb = await computeBodies(features.map(specOf)); } catch { kb = null; } }
      if (kb) { exactStep = true; const blob = await stepOf(kb); if (kb !== shown) kb.forEach((b) => b.geo.dispose()); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'part.step'; a.click(); }
      else download('part.step', toSTEP(features), 'application/step');
    } else if (ext === 'obj') download('part.obj', toOBJ(shown ? shown.map((b) => ({ kind: 'extrude' as const, depth: 0, sketch: [], geo: b.geo })) : features), 'text/plain');
    else { const geos = shown ? shown.map((b) => b.geo.clone()) : features.map((f) => { const g = f.geo.clone(); if (f.kind === 'revolve') g.rotateX(Math.PI / 2); return g; }); download('part.stl', toSTL(geos), 'model/stl'); }
    msg(`Exported part.${ext} (mm)${exactStep ? ', exact solid from the OpenCascade kernel (true arcs and circles)' : ext === 'step' ? ', faceted solid (Revolve is not on the kernel yet)' : ''}.`);
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
