// Checks that the MK CAD service worker only deletes its own old caches ("mkcad-" prefix) and leaves other apps' caches alone.
// Usage: serve the built app (npx vite build, then npx vite preview --port 4181) and run: node browser-tests/sw-cache-isolation.mjs http://localhost:4181/
import puppeteer from 'puppeteer-core';
const url = process.argv[2]; let fails = 0; const ok = (n, c) => { if (!c) { fails++; console.log('ASSERT FAIL', n); } else console.log('ASSERT OK', n); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
// Page 1: remove any registration of this app and seed caches. Page 2 (fresh, no controlled clients): load, so the worker installs and activates anew.
let p = await b.newPage(); await p.goto(url, { waitUntil: 'networkidle0' });
await p.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); for (const n of ['workbox-precache-foreign-app', 'some-other-app-v3', 'mkcad-v0']) { const c = await caches.open(n); await c.put('/x-' + n, new Response('x')); } });
await p.close(); await new Promise((r) => setTimeout(r, 1500));
p = await b.newPage(); await p.goto(url, { waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 2500));
const hadReg = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
if (!hadReg) await p.evaluate(async () => { const r = await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; await new Promise((res) => { const w = r.active; if (w && w.state === 'activated') res(); else w.addEventListener('statechange', () => w.state === 'activated' && res()); }); });
await p.evaluate(async () => { await navigator.serviceWorker.ready; });
await new Promise((r) => setTimeout(r, 1500));
const keys = await p.evaluate(async () => (await caches.keys()).sort());
console.log('caches after activate', JSON.stringify(keys));
ok('foreign workbox cache kept', keys.includes('workbox-precache-foreign-app'));
ok('other app cache kept', keys.includes('some-other-app-v3'));
ok('old mkcad cache removed', !keys.includes('mkcad-v0'));
await b.close(); process.exit(fails ? 1 : 0);
