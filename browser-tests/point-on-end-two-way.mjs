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


const ents=()=>p0.evaluate(()=>window.__cad.sketchNow().map(e=>e.t==='point'?['pt',e.p.x,e.p.y]:[e.t,e.a.x,e.a.y,e.b.x,e.b.y]));
const setPt=async(x,y)=>{await p0.evaluate((x,y)=>{const r=[...document.querySelectorAll('#props .row')].find(r=>r.querySelector('b')?.textContent.startsWith('Point'));const ins=r.querySelectorAll('input');const f=(i,v)=>{i.value=String(v);i.dispatchEvent(new Event('change'))};f(ins[0],x);f(ins[1],y)},x,y);await w(1500)};
const near=(a,b)=>Math.abs(a-b)<1e-6;
// case 1: free line
let p0=await mk();let a=api(p0);const p=p0;
await p0.click('#startsk');await p0.click('#ppxy');await w(300);
await a.tool('line');await a.click(0,0);await a.click(20,0);await p0.keyboard.press('Escape');await w(150);
await a.tool('point');await a.click(10,10);await w(150);
await a.tool('cpt');await a.click(10,10);await a.click(20,0);await w(500);
let E=await ents();console.log(JSON.stringify(E));
ok('Point sits on the line end (20,0)',E.some(e=>e[0]==='pt'&&near(e[1],20)&&near(e[2],0)));
await setPt(25,10);E=await ents();console.log(JSON.stringify(E));
const ln=E.find(e=>e[0]==='line'),pt=E.find(e=>e[0]==='pt');
ok('free line: moving the Point to (25,10) moves the line end there',near(ln[3],25)&&near(ln[4],10)&&near(pt[1],25)&&near(pt[2],10)&&near(ln[1],0)&&near(ln[2],0));
await p0.screenshot({path:'/tmp/pcoin-free.png'});
// case 2: horizontal constraint on that line: the solver wins, the Point follows the result
await a.tool('chor');await a.click(12,5);await w(1500);console.log(await a.msg());
await setPt(30,15);E=await ents();console.log(JSON.stringify(E));
const l2=E.find(e=>e[0]==='line'),p2=E.find(e=>e[0]==='pt');
ok('horizontal line stays horizontal after the Point is moved',near(l2[2],l2[4]));
ok('Point equals the line end after the solve',near(p2[1],l2[3])&&near(p2[2],l2[4]));
// case 3: a dimension locks the line: the Point goes back
let q=await mk();a=api(q);const pp=q;
await q.click('#startsk');await q.click('#ppxy');await w(300);
await a.tool('line');await a.click(0,0);await a.click(20,0);await q.keyboard.press('Escape');await w(150);
await a.tool('point');await a.click(10,10);await w(150);
await a.tool('cpt');await a.click(10,10);await a.click(20,0);await w(500);
await a.tool('dim');await a.click(10,0);await q.$eval('#dimin',(e,v)=>{e.value=v},'20');await q.focus('#dimin');await q.keyboard.press('Enter');await w(500);console.log(await a.msg());
p0=q;
const before=JSON.stringify(await ents());
await setPt(25,10);E=await ents();console.log(JSON.stringify(E));
const l3=E.find(e=>e[0]==='line'),p3=E.find(e=>e[0]==='pt');
ok('dimensioned line does not move',near(l3[3],20)&&near(l3[4],0));
ok('Point returns to the line end',near(p3[1],20)&&near(p3[2],0));
await b.close();process.exit(bad);
