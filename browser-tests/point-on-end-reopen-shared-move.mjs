import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const out=[];const log=(...a)=>{const t=a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ');out.push(t);console.log(t)};
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const url=process.argv[2];let bad=0;const ok=(n,c)=>{console.log(c?'ASSERT OK':'ASSERT FAIL',n);if(!c)bad=1;};
const w=(t=300)=>new Promise(r=>setTimeout(r,t));
const mk=async()=>{const p=await b.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>log('PAGEERR',e.message.slice(0,200)));await p.goto(url,{waitUntil:'networkidle0'});await p.evaluate(()=>localStorage.clear());await p.goto(url,{waitUntil:'networkidle0'});await w(1000);return p};
const api=(p)=>{const o={};o.box=async()=>p.$eval('#sk',e=>{const q=e.getBoundingClientRect();return {x:q.x,y:q.y,w:q.width,h:q.height}});
o.sc=async(wx,wy)=>{const q=await o.box();return [q.x+q.w/2+(wx-20)*6,q.y+q.h/2-(wy-15)*6]};
o.tool=async(t)=>{await p.click(`[data-tool="${t}"]`);await w(150)};
o.click=async(wx,wy)=>{const [x,y]=await o.sc(wx,wy);await p.mouse.click(x,y);await w(150)};
o.msg=()=>p.$eval('#msg',e=>e.textContent);
o.S=()=>p.evaluate(()=>window.__cad.sketchNow().map(e=>{const r=v=>+v.toFixed(3);return e.t==='circle'?['circle',r(e.c.x),r(e.c.y),r(e.r)]:e.t==='rect'?['rect',r(e.a.x),r(e.a.y),r(e.b.x),r(e.b.y)]:[e.t,r(e.a.x),r(e.a.y),r(e.b.x),r(e.b.y)]}));
o.C=()=>p.evaluate(()=>JSON.stringify(window.__cad.consNow()));
o.vol=()=>p.evaluate(()=>window.__cad.volumes());
o.txt=(re)=>p.evaluate((re)=>{const m=document.body.innerText.match(new RegExp(re));return m?m[0]:null},re);
return o};
let cdpDir='/tmp/dl5';fs.mkdirSync(cdpDir,{recursive:true});
const save=async(p,name)=>{const cdp=await p.target().createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:cdpDir});for(const f of fs.readdirSync(cdpDir))fs.unlinkSync(cdpDir+'/'+f);await p.click('#save');await w(1200);const f=fs.readdirSync(cdpDir)[0];fs.copyFileSync(cdpDir+'/'+f,'/tmp/'+name);return '/tmp/'+name};
const open=async(file)=>{const p=await mk();await (await p.$('#file')).uploadFile(file);await w(1800);return p};

const ext=async(d,op)=>{await p.$eval('#finish',e=>e.click());await w(800);const e1=await p.$$eval('button',bs=>bs.filter(x=>/Extrude/.test(x.textContent)).map(x=>x.id));await p.$eval('#'+e1[0],e=>e.click());await w(400);await p.$eval('#depth',(e,v)=>e.value=v,String(d));if(op)await p.$eval(`[data-op="${op}"]`,e=>e.click());await p.$eval('#dok',e=>e.click());await w(3500);};
const ent=()=>p.evaluate(()=>JSON.stringify(window.__cad.sketchNow().map(e=>e.pts?e.pts.map(q=>[+q.x.toFixed(3),+q.y.toFixed(3)]):e.t)));
const line=async(x1,y1,x2,y2)=>{await a.tool('line');await a.click(x1,y1);await a.click(x2,y2);await p.keyboard.press('Escape');await w(150)};
const circ=()=>p.evaluate(()=>JSON.stringify(window.__cad.sketchNow().map(e=>e.t==='circle'?['c',e.c.x,e.c.y,e.r]:e.t==='line'?['l',e.a.x,e.a.y,e.b.x,e.b.y]:[e.t])));
const fill=async(m)=>{for(const[k,v]of Object.entries(m)){await p.$eval('#'+k,(e,v)=>{e.value=v},String(v))}};
const setField=async(label,idx,val)=>{await p.evaluate((label,idx,val)=>{const ins=[...document.querySelectorAll('label')].filter(l=>l.firstChild&&l.firstChild.textContent===label).map(l=>l.querySelector('input'));const i=ins[idx];i.value=String(val);i.dispatchEvent(new Event('change'))},label,idx,val);await w(400)};
const S=()=>p.evaluate(()=>JSON.stringify(window.__cad.sketchNow().map(e=>e.t==='line'?['l',e.a.x,e.a.y,e.b.x,e.b.y]:e.t==='circle'?['c',+e.c.x.toFixed(4),+e.c.y.toFixed(4),+e.r.toFixed(4)]:[e.t])));
const D=async()=>{await w(1500);return p.evaluate(()=>JSON.stringify(window.__cad.dofMarks()))};


let p0,a;
const ents=()=>p0.evaluate(()=>window.__cad.sketchNow().map(e=>e.t==='point'?['pt',e.p.x,e.p.y]:[e.t,e.a.x,e.a.y,e.b.x,e.b.y]));
const setPt=async(x,y)=>{await p0.evaluate((x,y)=>{const r=[...document.querySelectorAll('#props .row')].find(r=>r.querySelector('b')?.textContent.startsWith('Point'));const ins=r.querySelectorAll('input');const f=(i,v)=>{i.value=String(v);i.dispatchEvent(new Event('change'))};f(ins[0],x);f(ins[1],y)},x,y);await w(1500)};
const near=(a,b)=>Math.abs(a-b)<1e-6;
const startPage=async()=>{if(p0){await p0.close().catch(()=>{});}p0=await mk();a=api(p0);await p0.click('#startsk');await p0.click('#ppxy');await w(300)};
const square=async()=>{await a.tool('line');await a.click(0,0);await a.click(20,0);await a.click(20,20);await a.click(0,20);await a.click(0,0);await p0.keyboard.press('Escape');await w(200)};
const attach=async()=>{await a.tool('point');await a.click(30,30);await w(150);await a.tool('cpt');await a.click(30,30);await a.click(20,20);await w(500)};
const E0=async()=>JSON.stringify(await ents());
// --- A: save, reopen, first edit
await startPage();await square();await attach();
console.log('A before',await E0());
await p0.$eval('#finish',e=>e.click());await w(800);
const e1=await p0.$$eval('button',bs=>bs.filter(x=>/Extrude/.test(x.textContent)).map(x=>x.id));await p0.$eval('#'+e1[0],e=>e.click());await w(400);await p0.$eval('#depth',(e,v)=>e.value=v,'5');await p0.$eval('#dok',e=>e.click()).catch(()=>{});await w(1500);
console.log('features',await p0.evaluate(()=>JSON.parse(window.__cad.serialize()).features.map(f=>f.kind+':'+(f.src?.cons||[]).map(c=>c.k).join(','))));
const file=await save(p0,'pcoin-reopen.json');
p0=await open(file);a=api(p0);
await p0.evaluate(()=>{const n=[...document.querySelectorAll('*')].filter(x=>x.ondblclick&&x.textContent.trim()==='Sketch1')[0];n.ondblclick(new MouseEvent('dblclick'))});await w(1500);
console.log('A reopened',await E0());
await setPt(25,25);const EA=await ents();console.log('A first edit after reopen',JSON.stringify(EA));
const ptA=EA.find(e=>e[0]==='pt');
const movedLine=EA.filter(e=>e[0]==='line'&&((near(e[1],25)&&near(e[2],25))||(near(e[3],25)&&near(e[4],25)))).length;
ok('after reopen the FIRST Point edit drives the line end (point '+ptA[1]+','+ptA[2]+', lines ending there '+movedLine+')',near(ptA[1],25)&&near(ptA[2],25)&&movedLine===1);
await setPt(30,30);const EA2=await ents();const ptA2=EA2.find(e=>e[0]==='pt');console.log('A second edit',JSON.stringify(EA2));
ok('second edit also drives the line end',near(ptA2[1],30)&&near(ptA2[2],30)&&EA2.filter(e=>e[0]==='line'&&((near(e[1],30)&&near(e[2],30))||(near(e[3],30)&&near(e[4],30)))).length===1);
// --- B: shared end with explicit Coincident
await startPage();await square();
await a.tool('ccoin');await a.click(20,20);await a.click(20,20);console.log('coin msg',await a.msg());
await attach();
console.log('B before',await E0());
await setPt(25,25);const EB=await ents();console.log('B after',JSON.stringify(EB));
const ends=EB.filter(e=>e[0]==='line').flatMap(e=>[[e[1],e[2]],[e[3],e[4]]]).filter(q=>near(q[0],25)&&near(q[1],25)).length;
ok('shared Coincident end: both line ends follow the Point to (25,25) ('+ends+' ends)',ends===2&&near(EB.find(e=>e[0]==='pt')[1],25));

// --- C: Move tool on the Point alone, with a shared Coincident end
await startPage();await square();
await a.tool('ccoin');await a.click(20,20);await a.click(20,20);
await attach();
await a.tool('select');await a.click(20,20);await w(200);
const nsel=await p0.evaluate(()=>document.querySelectorAll('#props .row').length);
await p0.click('#xmove');await w(300);
await p0.$eval('#xa',e=>{e.value='5'});await p0.$eval('#xb',e=>{e.value='5'});await p0.click('#xok');await w(1500);
const EC=await ents();console.log('C after Move',JSON.stringify(EC),'msg',await a.msg());
const ptC=EC.find(e=>e[0]==='pt');
ok('Move tool on an attached Point is refused with a message and nothing changes',/cannot be moved in place/.test(await a.msg())&&near(ptC[1],20)&&near(ptC[2],20)&&EC.length===5);
// --- D: mouse drag of the selected Point
await startPage();await square();await attach();
await a.tool('select');await a.click(20,20);await w(200);
const [x1,y1]=await a.sc(20,20),[x2,y2]=await a.sc(30,30);
await p0.mouse.move(x1,y1);await p0.mouse.down();await p0.mouse.move((x1+x2)/2,(y1+y2)/2,{steps:5});await p0.mouse.move(x2,y2,{steps:5});await p0.mouse.up();await w(1200);
const ED=await ents();ok('mouse drag with the Select tool does not move shapes (no drag-move exists): nothing changed',JSON.stringify(ED)===JSON.stringify([["line",0,0,20,0],["line",20,0,20,20],["line",20,20,0,20],["line",0,20,0,0],["pt",20,20]]));
await b.close();process.exit(bad);
