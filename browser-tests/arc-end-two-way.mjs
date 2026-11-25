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
const mkSk=async()=>{p=await mk();a=api(p);await p.click('#startsk');await p.click('#ppxy');await w(300);await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Clear sketch/.test(x.textContent));if(b)b.click()});await w(300);console.log('fresh entities',(await p.evaluate(()=>window.__cad.sketchNow().length)));
 await a.tool('arc');await a.click(10,0);await a.click(0,10);await a.click(10,10);await p.keyboard.press('Escape');await w(300);
 await a.tool('line');await a.click(20,0);await a.click(30,10);await p.keyboard.press('Escape');await w(200);};
const key=async(k)=>{await p.keyboard.down('Control');await p.keyboard.press(k);await p.keyboard.up('Control');await w(500)};
const typ=async(v)=>{await p.$eval('#dimin',(e,v)=>{e.value=v},String(v));await p.focus('#dimin');await p.keyboard.press('Enter');await w(500)};
const fit=(A)=>{const [ax,ay,bx,by,mx,my]=A;const d=2*(ax*(my-by)+mx*(by-ay)+bx*(ay-my));const a2=ax*ax+ay*ay,m2=mx*mx+my*my,b2=bx*bx+by*by;const cx=(a2*(my-by)+m2*(by-ay)+b2*(ay-my))/d,cy=(a2*(bx-mx)+m2*(ax-bx)+b2*(mx-ax))/d;return {cx,cy,r:Math.hypot(ax-cx,ay-cy),rb:Math.hypot(bx-cx,by-cy),rm:Math.hypot(mx-cx,my-cy)}};
const distLine=(f,L)=>{const [x1,y1,x2,y2]=L;return Math.abs((x2-x1)*(y1-f.cy)-(x1-f.cx)*(y2-y1))/Math.hypot(x2-x1,y2-y1)};


const setF=async(label,v)=>{await p.evaluate((label,v)=>{const l=[...document.querySelectorAll('#props label')].find(x=>x.firstChild&&x.firstChild.textContent===label);const i=l.querySelector('input');i.value=String(v);i.dispatchEvent(new Event('change',{bubbles:true}))},label,v);await w(1500)};
// T1: free arc, End X edit: only that end moves, start and middle stay, still a valid circle
await mkSk();
let A0=(await arcs())[0];await setF('End X (mm)',5);
let A1=(await arcs())[0];console.log('T1',JSON.stringify(A0),JSON.stringify(A1),await a.msg());
ok('T1 End X edited to 5: end is (5,10); start and middle unchanged',near(A1[2],5)&&near(A1[3],A0[3])&&near(A1[0],A0[0])&&near(A1[1],A0[1])&&near(A1[4],A0[4])&&near(A1[5],A0[5]));
{const f=fit(A1);ok('T1 the three points are one circle (r '+f.r.toFixed(4)+')',Math.abs(f.r-f.rb)<1e-6&&Math.abs(f.r-f.rm)<1e-6);}
// T2: joined, free line: editing the ARC end moves the LINE end (two way)
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
await setF('End X (mm)',35);await setF('End Y (mm)',15);
{const A=(await arcs())[0],L=(await lns())[0];console.log('T2',JSON.stringify(A),JSON.stringify(L),await a.msg());
ok('T2 arc end moved to (35,15)',near(A[2],35)&&near(A[3],15));
ok('T2 the joined line end followed to (35,15) and the other line end stayed (20,0)',near(L[2],35)&&near(L[3],15)&&near(L[0],20)&&near(L[1],0));
ok('T2 relation still stored',(await a.C()).includes('aend'));}
// T3: joined, line Horizontal: the line constraint wins on y; arc end and line end stay joined and the message says so
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
await a.tool('chor');await a.click(25,5);await w(1500);
{const L=(await lns())[0];console.log('T3 before',JSON.stringify(L));}
await a.tool('select');await a.click(10,10);await w(300);
await setF('End Y (mm)',12);
{const A=(await arcs())[0],L=(await lns())[0];const m=await a.msg();console.log('T3',JSON.stringify(A),JSON.stringify(L),m);
ok('T3 the line stays horizontal',near(L[1],L[3]));
ok('T3 arc end and line end stay joined',near(A[2],L[2])&&near(A[3],L[3]));
ok('T3 the message tells the user where the constraint put the end',/constraints put it at|followed/.test(m));}
// T4: an edit that leaves no valid arc is refused unchanged
await mkSk();
const R0=(await arcs())[0];await setF('End X (mm)',10);
{const R1=(await arcs())[0];const m=await a.msg();console.log('T4',JSON.stringify(R0),JSON.stringify(R1),m);
ok('T4 an end point set onto the middle point (10,10) leaves no arc and is refused and the arc is unchanged',/no valid arc/.test(m)&&JSON.stringify(R0)===JSON.stringify(R1));}
await p.screenshot({path:'/tmp/aend-twoway.png'});
await b.close();process.exit(0);
