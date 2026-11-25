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

const snap=async()=>JSON.stringify([await arcs(),await lns()]);
// U1 free arc: edit, Undo restores, Redo re-applies
await mkSk();
let s0=await snap();await setF('End X (mm)',5);let s1=await snap();
ok('U1 edit changed the arc',s0!==s1);
await key('z');let s2=await snap();console.log('U1',s0,s1,s2);
ok('U1 Undo restores the exact arc',s2===s0);
await key('y');let s3=await snap();
ok('U1 Redo re-applies the edit',s3===s1);
// U2 joined: edit moves arc end and line end, one Undo restores both
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
s0=await snap();await setF('End X (mm)',35);await setF('End Y (mm)',15);s1=await snap();
ok('U2 joined edit changed arc and line',s0!==s1&&(await lns())[0][2]===35);
await key('z');await key('z');s2=await snap();console.log('U2',s0,s1,s2);
ok('U2 two Undos restore arc and line',s2===s0);
await key('y');await key('y');s3=await snap();
ok('U2 two Redos re-apply',s3===s1);
// G1 Tangent guard: arc tangent to a line, then edit End X: report outcome, state must be consistent
await mkSk();
await a.tool('ctanarc');await a.click(0,10);await w(100);await a.click(25,5);await w(1500);console.log('G1 cons',await a.C(),await a.msg());ok('G1 tangent relation stored',(await a.C()).includes('tanla'));
s0=await snap();await setF('End X (mm)',5);s1=await snap();const m1=await a.msg();console.log('G1',s0,s1,m1);
{const A=(await arcs())[0],L=(await lns())[0];const f=fit(A);const d=distLine(f,L);console.log('G1 radius',f.r,'dist centre-line',d);
 const kept=Math.abs(d-f.r)<1e-3;const refused=s1===s0;
 ok('G1 either tangency still holds (infinite line) or the edit was refused and rolled back',kept||refused);
 ok('G1 the arc is still one valid circle',Math.abs(f.r-f.rb)<1e-6&&Math.abs(f.r-f.rm)<1e-6);}
await b.close();process.exit(bad);
