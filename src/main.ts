import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Entity, Feature, P, extrude, revolve, snap, outline, toSTL } from './geometry';

const sk = document.getElementById('sk') as HTMLCanvasElement;
const ctx = sk.getContext('2d')!;
const status = document.getElementById('status')!;
let tool: 'rect' | 'circle' | 'poly' = 'rect';
let sketch: Entity[] = [];
let features: Feature[] = [];
let drag: { start: P; cur: P } | null = null;
let polyPts: P[] = [];
let cam = { x: 0, y: 0, s: 6 }; // pixels per mm
const mobile = () => innerWidth < 800;
const panes = Array.from(document.querySelectorAll('.pane'));
function showPane(i: number) { panes.forEach((p, j) => p.classList.toggle('hide', mobile() && j !== i)); document.getElementById('tabsk')!.classList.toggle('on', i === 0); document.getElementById('tab3')!.classList.toggle('on', i === 1); resize(); }
document.getElementById('tabsk')!.onclick = () => showPane(0);
document.getElementById('tab3')!.onclick = () => showPane(1);
document.getElementById('tog')!.onclick = () => document.getElementById('bar')!.classList.toggle('collapsed');
if (mobile()) document.getElementById('bar')!.classList.add('collapsed');

const grid = () => (cam.s > 12 ? 1 : cam.s > 4 ? 5 : 10);
const toWorld = (px: number, py: number): P => ({ x: (px - sk.width / 2) / cam.s + cam.x, y: -(py - sk.height / 2) / cam.s + cam.y });
const toScreen = (p: P) => ({ x: (p.x - cam.x) * cam.s + sk.width / 2, y: -(p.y - cam.y) * cam.s + sk.height / 2 });

function resize() {
  for (const c of [sk, v3]) { const r = c.parentElement!.getBoundingClientRect(); c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio; }
  renderer.setSize(v3.width, v3.height, false); camera3.aspect = (v3.width || 1) / (v3.height || 1); camera3.updateProjectionMatrix();
  draw();
}
function path(pts: P[], close: boolean) { pts.forEach((p, i) => { const s = toScreen(p); i ? ctx.lineTo(s.x, s.y) : (ctx.beginPath(), ctx.moveTo(s.x, s.y)); }); if (close) ctx.closePath(); }
function draw() {
  ctx.clearRect(0, 0, sk.width, sk.height);
  const g = grid(); ctx.lineWidth = 1; ctx.strokeStyle = '#e2e2e2';
  const a = toWorld(0, sk.height), b = toWorld(sk.width, 0);
  for (let x = Math.floor(a.x / g) * g; x <= b.x; x += g) { const s = toScreen({ x, y: 0 }); ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, sk.height); ctx.stroke(); }
  for (let y = Math.floor(a.y / g) * g; y <= b.y; y += g) { const s = toScreen({ x: 0, y }); ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(sk.width, s.y); ctx.stroke(); }
  const o = toScreen({ x: 0, y: 0 }); ctx.strokeStyle = '#c33'; ctx.beginPath(); ctx.moveTo(0, o.y); ctx.lineTo(sk.width, o.y); ctx.stroke();
  ctx.strokeStyle = '#3a3'; ctx.beginPath(); ctx.moveTo(o.x, 0); ctx.lineTo(o.x, sk.height); ctx.stroke();
  ctx.strokeStyle = '#06c'; ctx.lineWidth = 2; ctx.fillStyle = '#06c';
  const all = drag ? [...sketch, current()!] : sketch;
  for (const e of all) { if (!e) continue; path(outline(e), true); ctx.stroke(); }
  if (polyPts.length) { path(polyPts, false); ctx.stroke(); polyPts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }); }
  if (drag) { const c = current()!; ctx.fillStyle = '#333'; ctx.font = `${14 * devicePixelRatio}px sans-serif`; const s = toScreen(drag.cur); ctx.fillText(c.t === 'rect' ? `${Math.abs(c.b.x - c.a.x)} x ${Math.abs(c.b.y - c.a.y)}` : c.t === 'circle' ? `R ${c.r.toFixed(1)}` : '', s.x + 10, s.y - 10); }
}
function current(): Entity | null {
  if (!drag) return null;
  if (tool === 'rect') return { t: 'rect', a: drag.start, b: drag.cur };
  if (tool === 'circle') return { t: 'circle', c: drag.start, r: Math.hypot(drag.cur.x - drag.start.x, drag.cur.y - drag.start.y) };
  return null;
}
function pt(e: PointerEvent): P { const r = sk.getBoundingClientRect(); const w = toWorld((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio); const g = grid(); return { x: snap(w.x, g), y: snap(w.y, g) }; }
let pan: { x: number; y: number } | null = null;
sk.addEventListener('pointerdown', (e) => {
  if (e.button === 1 || e.button === 2 || e.shiftKey) { pan = { x: e.clientX, y: e.clientY }; return; }
  sk.setPointerCapture(e.pointerId);
  const p = pt(e);
  if (tool === 'poly') {
    if (polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < grid() * 0.5 + 1e-9) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; }
    else polyPts.push(p);
    draw(); return;
  }
  drag = { start: p, cur: p };
});
sk.addEventListener('pointermove', (e) => {
  if (pan) { cam.x -= ((e.clientX - pan.x) * devicePixelRatio) / cam.s; cam.y += ((e.clientY - pan.y) * devicePixelRatio) / cam.s; pan = { x: e.clientX, y: e.clientY }; draw(); return; }
  if (drag) { drag.cur = pt(e); draw(); }
});
sk.addEventListener('pointerup', () => { pan = null; if (drag) { const c = current(); if (c) sketch.push(c); drag = null; draw(); } });
sk.addEventListener('contextmenu', (e) => e.preventDefault());
sk.addEventListener('wheel', (e) => { e.preventDefault(); cam.s = Math.min(80, Math.max(1, cam.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw(); }, { passive: false });
addEventListener('keydown', (e) => { if (e.key === 'Enter' && polyPts.length >= 3) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; draw(); } if (e.key === 'Escape') { polyPts = []; drag = null; draw(); } });

// 3D view
const v3 = document.getElementById('v3') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas: v3, antialias: true });
const scene = new THREE.Scene();
const camera3 = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
camera3.position.set(60, 60, 90); camera3.up.set(0, 0, 1);
const controls = new OrbitControls(camera3, v3);
scene.add(new THREE.AmbientLight(0xffffff, 0.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(50, -80, 100); scene.add(dl);
scene.add(new THREE.GridHelper(200, 20, 0x555555, 0x333333).rotateX(Math.PI / 2));
const group = new THREE.Group(); scene.add(group);
function rebuild() {
  group.clear();
  for (const f of features) {
    const m = new THREE.Mesh(f.geo, new THREE.MeshStandardMaterial({ color: 0x8aa4c8, metalness: 0.2, roughness: 0.5 }));
    if (f.kind === 'revolve') m.rotation.x = Math.PI / 2; // lathe axis Y -> world Z
    const ed = new THREE.LineSegments(new THREE.EdgesGeometry(f.geo, 30), new THREE.LineBasicMaterial({ color: 0x111111 }));
    ed.rotation.copy(m.rotation); group.add(m); group.add(ed);
  }
}
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera3); })();

function act(kind: 'extrude' | 'revolve') {
  try {
    const depth = parseFloat((document.getElementById('depth') as HTMLInputElement).value) || 10;
    const geo = kind === 'extrude' ? extrude(sketch, depth) : revolve(sketch);
    features.push({ kind, depth, sketch: [...sketch], geo });
    sketch = []; rebuild(); draw(); status.textContent = `${features.length} feature(s).`; if (mobile()) { document.getElementById('bar')!.classList.add('collapsed'); showPane(1); }
  } catch (err) { status.textContent = (err as Error).message; }
}
document.getElementById('extrude')!.onclick = () => act('extrude');
document.getElementById('revolve')!.onclick = () => act('revolve');
document.getElementById('undo')!.onclick = () => { features.pop(); rebuild(); };
document.getElementById('clear')!.onclick = () => { sketch = []; polyPts = []; draw(); };
const num = (id: string) => parseFloat((document.getElementById(id) as HTMLInputElement).value);
document.getElementById('addnum')!.onclick = () => {
  const x = num('dx') || 0, y = num('dy') || 0, a = num('d1'), b = num('d2');
  if (tool === 'circle' && a > 0) sketch.push({ t: 'circle', c: { x, y }, r: a });
  else if (tool === 'rect' && a > 0 && b > 0) sketch.push({ t: 'rect', a: { x, y }, b: { x: x + a, y: y + b } });
  else { status.textContent = 'Pick Rectangle (W,H) or Circle (R) and enter positive values'; return; }
  draw();
};
const serialize = () => JSON.stringify({ version: 1, features: features.map((f) => ({ kind: f.kind, depth: f.depth, sketch: f.sketch })), sketch });
function load(text: string) {
  const d = JSON.parse(text);
  features = d.features.map((f: any) => ({ ...f, geo: f.kind === 'extrude' ? extrude(f.sketch, f.depth) : revolve(f.sketch) }));
  sketch = d.sketch ?? []; rebuild(); draw(); status.textContent = `Opened: ${features.length} feature(s).`;
}
(window as any).__cad = { serialize, load };
const autosave = () => { try { localStorage.setItem('cadlite', serialize()); } catch {} };
setInterval(autosave, 2000);
try { const t = localStorage.getItem('cadlite'); if (t) load(t); } catch {}
document.getElementById('save')!.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([serialize()], { type: 'application/json' })); a.download = 'part.cadlite.json'; a.click(); };
document.getElementById('open')!.onclick = () => document.getElementById('file')!.click();
(document.getElementById('file') as HTMLInputElement).onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { try { load(await f.text()); } catch { status.textContent = 'Invalid file'; } } };
document.getElementById('stl')!.onclick = () => {
  if (!features.length) { status.textContent = 'Nothing to export yet'; return; }
  const geos = features.map((f) => { const g = f.geo.clone(); if (f.kind === 'revolve') g.rotateX(Math.PI / 2); return g; });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toSTL(geos)], { type: 'model/stl' })); a.download = 'part.stl'; a.click();
};
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => {
  tool = b.dataset.tool as typeof tool; polyPts = [];
  document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); draw();
}));
addEventListener('resize', resize); showPane(0);
