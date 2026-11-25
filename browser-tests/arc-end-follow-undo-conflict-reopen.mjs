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
const mkSk=async()=>{p=await mk();a=api(p);await p.click('#startsk');await p.click('#ppxy');await w(300);
 await a.tool('arc');await a.click(10,0);await a.click(0,10);await a.click(10,10);await p.keyboard.press('Escape');await w(300);
 await a.tool('line');await a.click(20,0);await a.click(30,10);await p.keyboard.press('Escape');await w(200);};
const key=async(k)=>{await p.keyboard.down('Control');await p.keyboard.press(k);await p.keyboard.up('Control');await w(500)};
// E1: join the arc end to the line END b (30,10); Horizontal moves that end; the arc end must follow the CHANGED coordinate
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
let A=(await arcs())[0],L=(await lns())[0];console.log('E1 joined',JSON.stringify(A),JSON.stringify(L));
ok('E1 arc end b joined to line end b (30,10)',near(A[2],30)&&near(A[3],10));
await a.tool('chor');await a.click(25,5);await w(1500);
const A2=(await arcs())[0],L2=(await lns())[0];console.log('E1 after horizontal',JSON.stringify(A2),JSON.stringify(L2));
ok('E1 the line end b actually moved ('+L[3]+' to '+L2[3]+')',Math.abs(L2[3]-L[3])>1e-3||Math.abs(L2[2]-L[2])>1e-3);
ok('E1 the arc end follows the CHANGED line end coordinate',near(A2[2],L2[2])&&near(A2[3],L2[3]));
// Undo and Redo
await key('KeyZ');const U1=[(await arcs())[0],(await lns())[0]];console.log('E2 undo 1',JSON.stringify(U1));
ok('E2 undo of the Horizontal restores the slanted line and the arc end on its end',near(U1[0][2],U1[1][2])&&near(U1[0][3],U1[1][3])&&near(U1[1][3],10));
await key('KeyY');const R1=[(await arcs())[0],(await lns())[0],await a.C()];console.log('E2 redo',JSON.stringify(R1));
ok('E2 redo restores the horizontal line with the arc end still on it, relation kept',near(R1[1][3],L2[3])&&near(R1[0][2],R1[1][2])&&near(R1[0][3],R1[1][3])&&R1[2].includes('aend'));
await key('KeyZ');await key('KeyZ');const U2=await a.C();console.log('E2 undo x2 cons',U2);
ok('E2 undoing the join itself removes the relation and restores the arc end (0,10)',!U2.includes('aend')&&near((await arcs())[0][2],0)&&near((await arcs())[0][3],10));
// E3: Concentric on a joined arc must be refused, unchanged
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
await a.tool('circle');await a.click(40,30);await a.click(45,30);await w(300);
const B0=(await arcs())[0];
await a.tool('cconc');await a.click(10,10);console.log('E3 first',await a.msg());await a.click(40,35);await w(1500);
const m3=await a.msg();console.log('E3',m3);const B1=(await arcs())[0];
ok('E3 Concentric on an arc that already has an end join is refused: '+m3.slice(0,60),/cannot|refus|conflict|already|constraint/i.test(m3)&&!/Now click|applied/i.test(m3));
ok('E3 the arc and the aend relation are unchanged',JSON.stringify(B0)===JSON.stringify(B1)&&(await a.C()).includes('aend')&&!(await a.C()).includes('aconc'));
// E4: Tangent on the joined arc to a second line keeps the join
await a.tool('line');await a.click(5,20);await a.click(25,25);await p.keyboard.press('Escape');await w(200);
await a.tool('ctanarc');await a.click(10,0);await w(100);await a.click(15,22.5);await w(1800);
const m4=await a.msg();console.log('E4',m4);const T=(await arcs())[0],TL=(await lns());console.log(JSON.stringify(T),JSON.stringify(TL));
ok('E4 the tangent was applied AND the arc end is still on the line end',/Tangent applied/.test(m4)&&near(T[2],TL[0][2])&&near(T[3],TL[0][3]));
ok('E4 the join relation is still stored',(await a.C()).includes('aend'));
console.log('E4 tangent applied?',/Tangent applied/.test(m4));

{const nt=await p.$$eval('.arcnote',e=>e.map(x=>x.textContent)),dt=await p.$$eval('.arcdof',e=>e.map(x=>x.textContent));console.log('NOTE',JSON.stringify(nt),JSON.stringify(dt));ok('G the arc row lists the end join in its note and tally',nt.length===1&&nt[0].includes('end point on a line end point')&&nt[0].includes('other end is NOT constrained')&&dt[0].includes('1 end on a line end')&&dt[0].includes('1 tangent to a line')&&dt[0].includes('Arc DOF: NOT solved yet'));}
// F: a never-extruded sketch in progress: save, reopen, it must come back with its shapes and relations
const file=await save(p,'aend-pending.json');
p=await open(file);a=api(p);
console.log('F tree',JSON.stringify(await p.$$eval('#tree .node',n=>n.map(x=>x.textContent))));
await p.evaluate(()=>{const n=[...document.querySelectorAll('#tree .node')].find(x=>/not used yet/.test(x.textContent));n.ondblclick(new MouseEvent('dblclick'))});await w(1200);
const FA=await arcs(),FL=await lns(),FC=await a.C();console.log('F reopened',JSON.stringify(FA),JSON.stringify(FL),FC);
ok('F the saved never-extruded sketch reopens by double-clicking its tree node, with its arc and 2 lines',FA.length===1&&FL.length===2);
ok('F the reopened sketch keeps both relations (aend and tanla)',FC.includes('aend')&&FC.includes('tanla'));
ok('F the arc end is still on the line end after reopen',near(FA[0][2],FL[0][2])&&near(FA[0][3],FL[0][3]));
await p.screenshot({path:'/tmp/aend-pending-reopen.png'});
await b.close();process.exit(0);
