import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toOBJ, toSTEP, toDXF } from './exporters';
import { Entity, Feature, P, buildGeometry, snap, outline, toSTL, volume } from './geometry';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = (t: string) => ($('msg').textContent = t);
const mobile = () => innerWidth < 800;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

type Mode = 'model' | 'sketch';
let mode: Mode = 'model';
let tool: 'rect' | 'circle' | 'poly' = 'rect';
let sketch: Entity[] = [];
let pending: Entity[] | null = null; // finished sketch not yet used by a feature
let features: Feature[] = [];
let sel: number | null = null; // selected feature
let editing: number | null = null; // feature whose sketch is being edited
let dlgKind: 'extrude' | 'revolve' | null = null;
let drag: { start: P; cur: P } | null = null;
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
  for (const e of all) { path(outline(e), true); ctx.fillStyle = '#1f6fd11a'; ctx.fill(); ctx.stroke(); }
  if (polyPts.length) { path(polyPts, false); ctx.stroke(); ctx.fillStyle = '#1f6fd1'; polyPts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); }); }
  if (c && drag) { ctx.fillStyle = '#123'; ctx.font = `${13 * dpr}px sans-serif`; const s = toScreen(drag.cur); ctx.fillText(c.t === 'rect' ? `${Math.abs(c.b.x - c.a.x)} x ${Math.abs(c.b.y - c.a.y)} mm` : c.t === 'circle' ? `R ${c.r.toFixed(1)} mm` : '', s.x + 12, s.y - 12); }
}
function pt(e: PointerEvent): P { const r = sk.getBoundingClientRect(); const w = toWorld((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio); const g = grid(); return { x: snap(w.x, g), y: snap(w.y, g) }; }
let pan: { x: number; y: number } | null = null;
sk.addEventListener('pointerdown', (e) => {
  if (e.button === 1 || e.button === 2 || e.shiftKey) { pan = { x: e.clientX, y: e.clientY }; return; }
  sk.setPointerCapture(e.pointerId); const p = pt(e);
  if (tool === 'poly') {
    if (polyPts.length >= 3 && Math.hypot(p.x - polyPts[0].x, p.y - polyPts[0].y) < grid() * 0.5 + 1e-9) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; props(); } else polyPts.push(p);
    draw(); return;
  }
  drag = { start: p, cur: p };
});
sk.addEventListener('pointermove', (e) => {
  if (pan) { cam.x -= ((e.clientX - pan.x) * devicePixelRatio) / cam.s; cam.y += ((e.clientY - pan.y) * devicePixelRatio) / cam.s; pan = { x: e.clientX, y: e.clientY }; draw(); return; }
  const p = pt(e); $('coord').textContent = `X ${p.x}  Y ${p.y}  mm`;
  if (drag) { drag.cur = p; draw(); }
});
sk.addEventListener('pointerup', () => { pan = null; if (drag) { const c = current(); if (c) sketch.push(c); drag = null; draw(); props(); } });
sk.addEventListener('contextmenu', (e) => e.preventDefault());
sk.addEventListener('wheel', (e) => { e.preventDefault(); cam.s = Math.min(80, Math.max(1, cam.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw(); }, { passive: false });
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Enter' && polyPts.length >= 3) { sketch.push({ t: 'poly', pts: polyPts }); polyPts = []; draw(); props(); }
  if (e.key === 'Escape') { polyPts = []; drag = null; draw(); }
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
function rebuild() {
  group.clear();
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
  for (const id of ['stl', 'obj', 'step']) ($(id) as HTMLButtonElement).disabled = !features.length; ($('startsk') as HTMLButtonElement).disabled = !model;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}
function tree() {
  const t = $('tree'); t.innerHTML = '';
  const node = (label: string, d: number, cls: string, click?: () => void, dbl?: () => void, selected = false) => {
    const n = document.createElement('div'); n.className = 'node' + (selected ? ' sel' : ''); n.style.setProperty('--d', String(d));
    const i = document.createElement('i'); i.className = cls; n.append(i, document.createTextNode(label));
    if (click) n.onclick = click; if (dbl) n.ondblclick = dbl; t.append(n);
  };
  node('Part1', 0, 'p'); node(`Solid Bodies(${features.length})`, 1, ''); node('View: Master', 1, ''); node('Origin', 1, 'o'); node('XY Plane', 2, ''); node('X Axis', 2, ''); node('Y Axis', 2, '');
  features.forEach((f, i) => {
    node(`${f.kind === 'extrude' ? 'Extrusion' : 'Revolution'}${i + 1}  (${f.kind === 'extrude' ? f.depth + ' mm' : '360°'})`, 1, 'f', () => { sel = i; rebuild(); tree(); refreshButtons(); }, () => editFeature(i), sel === i);
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
    } else title(`Polygon ${i + 1} (${e.pts.length} points)`);
    const del = document.createElement('button'); del.textContent = 'Delete'; del.onclick = () => { sketch.splice(i, 1); draw(); props(); };
    r.append(g, del); p.append(r);
  });
}

// ---------- actions ----------
function startSketch(from?: Entity[]) { sketch = from ? clone(from) : pending ? clone(pending) : []; if (!from && pending) pending = null; polyPts = []; setMode('sketch'); msg('Sketch: draw shapes or enter exact sizes, then Finish Sketch.'); }
$('startsk').onclick = () => { editing = null; $('pp').classList.add('show'); };
$('ppxy').onclick = () => { $('pp').classList.remove('show'); startSketch(); };
$('ppx').onclick = () => $('pp').classList.remove('show');
function editFeature(i: number) { editing = i; sel = i; startSketch(features[i].sketch); msg(`Editing Sketch${i + 1}: change dimensions, then Finish Sketch.`); }
$('editft').onclick = () => sel !== null && editFeature(sel);
$('cancelsk').onclick = () => { if (editing === null && sketch.length) pending = null; editing = null; sketch = []; setMode('model'); msg('Sketch cancelled.'); };
$('clear').onclick = () => { sketch = []; polyPts = []; draw(); props(); };
$('fin2').onclick = () => $('finish').click();
$('finish').onclick = () => {
  if (!sketch.length) { editing = null; setMode('model'); msg('Empty sketch discarded.'); return; }
  try { buildGeometry('extrude', sketch, 1); } catch (e) { msg((e as Error).message); return; }
  const kind = editing !== null ? features[editing].kind : null;
  pending = clone(sketch); sketch = []; setMode('model');
  if (editing !== null && kind) openDlg(kind, features[editing].depth); else msg('Sketch finished. Choose Extrude or Revolve.');
};
function openDlg(kind: 'extrude' | 'revolve', depth = 20) {
  if (!pending) { msg('Start a 2D sketch first.'); return; }
  dlgKind = kind; $('dlgt').textContent = kind === 'extrude' ? 'Extrude' : 'Revolve';
  ($('depth') as HTMLInputElement).value = String(depth); ($('depth').parentElement as HTMLElement).style.display = kind === 'extrude' ? '' : 'none';
  $('dlgmsg').textContent = kind === 'extrude' ? 'Profile: finished sketch. Direction: +Z.' : 'Axis: vertical (Y) axis of the sketch, 360°. Keep the shape at X ≥ 0.';
  $('dlg').classList.add('show');
}
$('extrude').onclick = () => openDlg('extrude'); $('revolve').onclick = () => openDlg('revolve');
$('dcancel').onclick = () => { $('dlg').classList.remove('show'); dlgKind = null; if (editing !== null) { editing = null; pending = null; } };
function bbox(kind: string, geo: THREE.BufferGeometry) { const g = geo.clone(); if (kind === 'revolve') g.rotateX(Math.PI / 2); g.computeBoundingBox(); const b = g.boundingBox!.clone(); g.dispose(); return b; }
$('dok').onclick = () => {
  if (!dlgKind || !pending) return;
  try {
    const depth = parseFloat(($('depth') as HTMLInputElement).value);
    if (dlgKind === 'extrude' && !(depth > 0)) throw new Error('Distance must be greater than 0');
    const geo = buildGeometry(dlgKind, pending, depth || 1); const f: Feature = { kind: dlgKind, depth: depth || 1, sketch: clone(pending), geo };
    const nb = bbox(f.kind, geo).expandByScalar(-1e-6);
    const hit = features.findIndex((o, i) => i !== editing && bbox(o.kind, o.geo).intersectsBox(nb));
    if (hit >= 0) { geo.dispose(); throw new Error(`Overlaps ${features[hit].kind === 'extrude' ? 'Extrusion' : 'Revolution'}${hit + 1}. Joining or cutting solids is not supported yet. Place separate bodies apart, or put all shapes in one sketch.`); }
    if (editing !== null) { features[editing].geo.dispose(); features[editing] = f; sel = editing; editing = null; } else { features.push(f); sel = features.length - 1; }
    pending = null; $('dlg').classList.remove('show'); dlgKind = null; rebuild(); setView('home'); tree(); refreshButtons(); msg(`${features.length} feature(s). Volume of last: ${volume(f.geo).toFixed(1)} mm³`);
    if (mobile()) $('browser').classList.remove('open');
  } catch (err) { msg((err as Error).message); }
};
$('delft').onclick = () => { if (sel === null) return; features[sel].geo.dispose(); features.splice(sel, 1); sel = null; rebuild(); tree(); refreshButtons(); };
$('undo').onclick = () => { const f = features.pop(); f?.geo.dispose(); sel = null; rebuild(); tree(); refreshButtons(); };
const num = (id: string) => parseFloat(($(id) as HTMLInputElement).value);
$('addnum').onclick = () => {
  const x = num('dx') || 0, y = num('dy') || 0, a = num('d1'), b = num('d2');
  if (tool === 'circle' && a > 0) sketch.push({ t: 'circle', c: { x, y }, r: a });
  else if (tool === 'rect' && a > 0 && b > 0) sketch.push({ t: 'rect', a: { x, y }, b: { x: x + a, y: y + b } });
  else { msg('Pick Rectangle (W, H) or Circle (R) and enter positive values in mm'); return; }
  draw(); props();
};
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool as typeof tool; polyPts = []; refreshButtons(); draw(); }));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view!)));
$('bt').onclick = () => $('browser').classList.toggle('open');

// ---------- save / open / export ----------
const serialize = () => JSON.stringify({ version: 1, features: features.map((f) => ({ kind: f.kind, depth: f.depth, sketch: f.sketch })), sketch: pending ?? [] });
function load(text: string) {
  const d = JSON.parse(text);
  features.forEach((f) => f.geo.dispose());
  features = d.features.map((f: any) => ({ ...f, geo: buildGeometry(f.kind, f.sketch, f.depth) }));
  pending = d.sketch?.length ? d.sketch : null; sketch = []; sel = null; editing = null; setMode('model'); rebuild(); setView('home'); tree(); refreshButtons(); const ov = overlapPair(); msg(ov ? `Opened with a warning: features ${ov[0] + 1} and ${ov[1] + 1} overlap (bounding boxes). They are separate meshes, not a joined part; export is blocked until fixed.` : `Opened: ${features.length} feature(s).`);
}
(window as any).__cad = { serialize, load, volumes: () => features.map((f) => volume(f.geo)), state: () => ({ mode, features: features.length, pending: !!pending, sel }) };
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
function export3d(ext: 'stl' | 'obj' | 'step') {
  if (!features.length) return;
  const ov = overlapPair();
  if (ov) { msg(`Cannot export: Extrusion/Revolution ${ov[0] + 1} and ${ov[1] + 1} overlap (bounding boxes). Joining solids is not supported, so export is blocked. Delete or edit one.`); return; }
  try {
    if (ext === 'step') download('part.step', toSTEP(features), 'application/step');
    else if (ext === 'obj') download('part.obj', toOBJ(features), 'text/plain');
    else { const geos = features.map((f) => { const g = f.geo.clone(); if (f.kind === 'revolve') g.rotateX(Math.PI / 2); return g; }); download('part.stl', toSTL(geos), 'model/stl'); }
    msg(`Exported part.${ext} (mm).`);
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
