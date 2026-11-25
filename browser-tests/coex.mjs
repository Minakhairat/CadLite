import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const O='http://127.0.0.1:4190'; const w=(t)=>new Promise(r=>setTimeout(r,t)); let fails=0;
const ok=(n,c)=>{if(!c){fails++;console.log('ASSERT FAIL',n)}else console.log('ASSERT OK',n)};
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const page=async(path)=>{const p=await b.newPage();await p.goto(O+path,{waitUntil:'load'});return p};
const seed=async(p)=>p.evaluate(async()=>{for(const n of ['workbox-foreign','other-app-v3']){const c=await caches.open(n);await c.put('/x-'+n,new Response('x'))}});
const keys=async(p)=>p.evaluate(async()=>(await caches.keys()).sort());
const reg=async(p,scope,sw)=>p.evaluate(async(sw,scope)=>{const r=await navigator.serviceWorker.register(sw,{scope});await navigator.serviceWorker.ready;await new Promise(res=>{const x=r.installing||r.waiting||r.active;if(x.state==='activated')res();else x.addEventListener('statechange',()=>x.state==='activated'&&res())});return 1},sw,scope);
let p=await page('/old/');await reg(p,'/old/','/old/sw.js');await w(800);
await p.evaluate(async()=>{for(const k of await caches.keys())await caches.delete(k)});await seed(p);
// 1 baseline: a pre-fix worker deletes foreign caches when it activates
await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/old/');await r.unregister()});await p.close();await w(800);
p=await page('/old/');await seed(p);await reg(p,'/old/','/old/sw.js');await w(1200);
const k1=await keys(p);console.log('1 after pre-fix worker activates',JSON.stringify(k1));ok('baseline: pre-fix worker deletes foreign caches',!k1.includes('workbox-foreign'));
// 2 old worker stays active; new worker installs at /new/: foreign caches seeded after must survive
await seed(p);const p2=await page('/new/');await reg(p2,'/new/','/new/sw.js');await w(1200);
const k2=await keys(p2);console.log('2 after new worker activates with old one still registered',JSON.stringify(k2));ok('new worker leaves foreign caches',k2.includes('workbox-foreign')&&k2.includes('other-app-v3'));
// 3 old script now 404 (old URL gone): an update check must not re-activate it or delete caches
fs.writeFileSync('/tmp/coex/old404','1');
const st=await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/old/');let err=null;try{await r.update()}catch(e){err=String(e)}await new Promise(x=>setTimeout(x,1000));const rr=await navigator.serviceWorker.getRegistration('/old/');return {err,active:rr&&rr.active&&rr.active.state,waiting:!!(rr&&rr.waiting),installing:!!(rr&&rr.installing),stillRegistered:!!rr}});
console.log('3 old worker update check with 404 script',JSON.stringify(st));
const k3=await keys(p2);console.log('3 caches after',JSON.stringify(k3));ok('404 update check keeps foreign caches',k3.includes('workbox-foreign')&&k3.includes('other-app-v3'));
// 4 revisiting the old page while its worker is still active (page fetch 404) must not delete caches either
await p.reload({waitUntil:'load'});await w(1000);const k4=await keys(p);console.log('4 caches after revisit',JSON.stringify(k4));ok('revisit of old URL keeps foreign caches',k4.includes('workbox-foreign')&&k4.includes('other-app-v3'));
fs.unlinkSync('/tmp/coex/old404');
await b.close();process.exit(fails?1:0);
