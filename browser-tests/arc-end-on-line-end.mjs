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
await p.click('#startsk');await p.click('#ppxy');await w(300);
const arcs=()=>p.evaluate(()=>window.__cad.sketchNow().filter(e=>e.t==='arc').map(e=>[e.a.x,e.a.y,e.b.x,e.b.y,e.m.x,e.m.y].map(v=>+v.toFixed(4))));
const lns=()=>p.evaluate(()=>window.__cad.sketchNow().filter(e=>e.t==='line').map(e=>[e.a.x,e.a.y,e.b.x,e.b.y].map(v=>+v.toFixed(4))));
const near=(x,y)=>Math.abs(x-y)<1e-6;
await a.tool('arc');await a.click(10,0);await a.click(0,10);await a.click(10,10);await p.keyboard.press('Escape');await w(300);
const A0=(await arcs())[0];console.log('arc0',JSON.stringify(A0));
await a.tool('line');await a.click(20,0);await a.click(30,10);await p.keyboard.press('Escape');await w(200);
console.log('line0',JSON.stringify(await lns()));
// A: join arc end b to line end a
await a.tool('ccoin');await a.click(A0[2],A0[3]);await a.click(20,0);await w(1500);
console.log('msgA',await a.msg());
let A1=(await arcs())[0],L1=(await lns())[0];console.log('arc1',JSON.stringify(A1),'line1',JSON.stringify(L1));
ok('arc end b moved onto the line start (20,0)',near(A1[2],20)&&near(A1[3],0));
ok('arc start a and middle m unchanged',near(A1[0],A0[0])&&near(A1[1],A0[1])&&near(A1[4],A0[4])&&near(A1[5],A0[5]));
ok('constraint stored as aend',(await a.C()).includes('aend'));
// B: Horizontal on the line moves its ends; the arc end must still sit on the line start
await a.tool('chor');await a.click(25,5);await w(1500);
console.log('msgB',await a.msg());
let A2=(await arcs())[0],L2=(await lns())[0];console.log('arc2',JSON.stringify(A2),'line2',JSON.stringify(L2));
ok('after Horizontal the line is horizontal',near(L2[1],L2[3]));
ok('the arc end b still equals the line start after the line solve',near(A2[2],L2[0])&&near(A2[3],L2[1]));
await p.screenshot({path:'/tmp/aend.png'});
// C: closed profile (arc plus closing line), joined, extruded, saved, reopened: the relation is in the feature sketch
p=await mk();a=api(p);
await p.click('#startsk');await p.click('#ppxy');await w(300);
await a.tool('arc');await a.click(10,0);await a.click(0,10);await a.click(10,10);await p.keyboard.press('Escape');await w(300);
await a.tool('line');await a.click(20,0);await a.click(10,0);await p.keyboard.press('Escape');await w(200);
await a.tool('ccoin');await a.click(0,10);await a.click(20,0);await w(1500);
console.log('msgC',await a.msg(),JSON.stringify(await arcs()),JSON.stringify(await lns()));
await p.$eval('#finish',e=>e.click());await w(800);
{const e1=await p.$$eval('button',bs=>bs.filter(x=>/Extrude/.test(x.textContent)).map(x=>x.id));await p.$eval('#'+e1[0],e=>e.click());await w(400);await p.$eval('#depth',(e,v)=>e.value=v,'5');await p.$eval('#dok',e=>e.click());await w(2500);}
const vol0=await p.evaluate(()=>window.__cad.volumes?.());console.log('vol',JSON.stringify(vol0));{const exact=(Math.PI*50-25*(Math.PI/2-1))*5;const v=Array.isArray(vol0)?vol0[0]:vol0;ok('extruded volume matches the hand calc '+exact.toFixed(2)+' (circle r^2=50 minus a 90 degree segment, depth 5) within 1%, got '+(+v).toFixed(2),Math.abs(v-exact)/exact<0.01);}
const file=await save(p,'aend.json');p=await open(file);a=api(p);
await p.evaluate(()=>{const n=[...document.querySelectorAll('#tree .node')].find(x=>/Sketch1/.test(x.textContent)&&x.ondblclick);n.ondblclick(new MouseEvent('dblclick'))});await w(1500);
console.log('reopen cons',await a.C(),JSON.stringify(await arcs()),JSON.stringify(await lns()));
ok('the relation survives extrude, save and reopen',(await a.C()).includes('aend'));
{const A=(await arcs())[0],L=(await lns())[0];ok('after reopen the arc end still sits on the line start',near(A[2],L[0])&&near(A[3],L[1]));}
await p.screenshot({path:'/tmp/aend-reopen.png'});
// D: degenerate join refused and rolled back
let q=await mk();let b2=api(q);p=q;a=b2;
await p.click('#startsk');await p.click('#ppxy');await w(300);
await a.tool('arc');await a.click(10,0);await a.click(0,10);await a.click(10,10);await p.keyboard.press('Escape');await w(300);
const D0=(await arcs())[0];
await a.tool('line');await a.click(10,20);await a.click(25,30);await p.keyboard.press('Escape');await w(200);
await a.tool('ccoin');await a.click(D0[2],D0[3]);await a.click(10,20);await w(1500);
const mD=await a.msg();console.log('msgD',mD);const D1=(await arcs())[0];
ok('a join that would make the three points collinear is refused: '+mD.slice(0,50),/cannot reach/.test(mD));
ok('refused join leaves the arc unchanged and stores nothing',JSON.stringify(D1)===JSON.stringify(D0)&&!(await a.C()).includes('aend'));
await b.close();process.exit(0);
