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


let p=await mk();let a=api(p);
const rows=()=>p.$$eval('#props .row b',e=>e.map(x=>x.textContent));
const lines=()=>p.evaluate(()=>window.__cad.sketchNow().filter(e=>e.t==='line').map(e=>[e.a.x,e.a.y,e.b.x,e.b.y]));
const finish=async()=>{await p.$eval('#finish',e=>e.click());await w(800)};
const extrude=async(d)=>{const e1=await p.$$eval('button',bs=>bs.filter(x=>/Extrude/.test(x.textContent)).map(x=>x.id));await p.$eval('#'+e1[0],e=>e.click());await w(400);await p.$eval('#depth',(e,v)=>e.value=v,String(d));await p.$eval('#dok',e=>e.click());await w(2500)};
const dbl=async(name)=>{await p.evaluate((name)=>{const n=[...document.querySelectorAll('*')].filter(x=>x.ondblclick&&x.textContent.trim()===name)[0];n.ondblclick(new MouseEvent('dblclick'))},name);await w(1500)};
// Feature 1: 40 x 10 rectangle on XY
await p.click('#startsk');await p.click('#ppxy');await w(300);
await a.tool('rect');await a.click(0,0);await a.click(40,10);await w(300);
await finish();await extrude(10);
// Sketch2 on XZ: project, add a circle so the sketch can be finished
await p.click('#startsk');await p.click('#ppxz');await w(300);
await p.click('#prjbtn');await w(500);
console.log('lines',JSON.stringify(await lines()));
let r=await rows();ok('4 projected lines labelled "matches the source now"',r.filter(t=>t.includes('matches the source now')).length===4);
await a.tool('circle');await a.click(10,25);await a.click(15,25);await w(300);
await finish();await extrude(5);
// edit Sketch1: make the rectangle 50 wide
await dbl('Sketch1');
const setW=async(v)=>{await p.evaluate((v)=>{const row=[...document.querySelectorAll('#props .row')].find(r=>r.querySelector('b')?.textContent.startsWith('Rectangle'));const ins=[...row.querySelectorAll('label')].find(l=>l.textContent.startsWith('Width')).querySelector('input');ins.value=String(v);ins.dispatchEvent(new Event('input',{bubbles:true}));ins.dispatchEvent(new Event('change',{bubbles:true}))},v);await w(800)};
console.log('S1html',(await p.$eval('#props',e=>e.innerHTML)).slice(0,900));await setW(50);await finish();await p.$eval('#dok',e=>e.click());await w(2500);console.log('BB',JSON.stringify(await p.evaluate(()=>window.__cad.bbox())));console.log('TREE',JSON.stringify(await p.$$eval('#tree .node',n=>n.map(x=>x.textContent))));
// edit Sketch2
await dbl('Sketch2');
r=await rows();console.log(JSON.stringify(r));
ok('after the source changed the projected rows say STALE',r.filter(t=>t.includes('STALE')).length===4);
await p.screenshot({path:'/tmp/prj-stale.png'});
await p.click('#prjbtn');await w(800);
console.log('msg',await a.msg());
const L2=await lines();console.log(JSON.stringify(L2));
r=await rows();ok('after Project Geometry the rows say matches the source now',r.filter(t=>t.includes('matches the source now')).length===4&&!r.some(t=>t.includes('STALE')));
ok('refreshed copy is 50 wide (x range 0..50)',Math.max(...L2.flat().filter((_,i)=>i%2===0))===50||L2.some(l=>l.includes(50)));
ok('still exactly 4 projected lines, no duplicates',L2.length===4);
await p.screenshot({path:'/tmp/prj-refreshed.png'});
await b.close();process.exit(bad);
