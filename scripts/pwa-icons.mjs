// Writes the app icons (PNG) used by the web app manifest and iOS home screen. Own artwork, no third-party assets. Pure Node, no dependencies.
import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(w, px) { const raw = Buffer.alloc((w * 4 + 1) * w); for (let y = 0; y < w; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(w, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const hex = [[232, 700], [232, 420], [512, 270], [792, 420], [792, 700], [512, 850]]; // same cube outline as favicon.svg, in a 1024 box
const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 6], [3, 6], [6, 5]]; const pts = [...hex, [512, 570]];
const inPoly = (x, y) => { let r = false; for (let i = 0, j = hex.length - 1; i < hex.length; j = i++) { const [xi, yi] = hex[i], [xj, yj] = hex[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; };
const dseg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; let t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
function icon(size, maskable) {
  const px = Buffer.alloc(size * size * 4); const sc = maskable ? 0.62 : 0.86, off = (1 - sc) / 2; const S = 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = ((x + (sx + 0.5) / S) / size) * 1024, v = ((y + (sy + 0.5) / S) / size) * 1024;
      let col = [30, 33, 39], al = 255;
      if (!maskable) { const R = 200, cx = Math.min(Math.max(u, R), 1024 - R), cy = Math.min(Math.max(v, R), 1024 - R); if (Math.hypot(u - cx, v - cy) > R) al = 0; }
      const p = (u / 1024 - off) / sc * 1024, q = (v / 1024 - off) / sc * 1024;
      if (al && inPoly(p, q)) col = [47, 85, 160];
      if (al && edges.some(([i, j]) => dseg(p, q, pts[i], pts[j]) < 15)) col = [138, 164, 200];
      r += col[0] * al; g += col[1] * al; b += col[2] * al; a += al; }
    const n = S * S, i = (y * size + x) * 4; px[i] = a ? r / a : 0; px[i + 1] = a ? g / a : 0; px[i + 2] = a ? b / a : 0; px[i + 3] = a / n; }
  return png(size, px);
}
mkdirSync('public', { recursive: true });
writeFileSync('public/pwa-192x192.png', icon(192, false));
writeFileSync('public/pwa-512x512.png', icon(512, false));
writeFileSync('public/pwa-maskable-512x512.png', icon(512, true));
writeFileSync('public/apple-touch-icon.png', icon(180, true));
console.log('icons written');
