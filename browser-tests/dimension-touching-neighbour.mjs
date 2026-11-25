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
const typ=async(v)=>{await p.$eval('#dimin',(e,v)=>{e.value=v},String(v));await p.focus('#dimin');await p.keyboard.press('Enter');await w(500)};
const fit=(A)=>{const [ax,ay,bx,by,mx,my]=A;const d=2*(ax*(my-by)+mx*(by-ay)+bx*(ay-my));const a2=ax*ax+ay*ay,m2=mx*mx+my*my,b2=bx*bx+by*by;const cx=(a2*(my-by)+m2*(by-ay)+b2*(ay-my))/d,cy=(a2*(bx-mx)+m2*(ax-bx)+b2*(mx-ax))/d;return {cx,cy,r:Math.hypot(ax-cx,ay-cy),rb:Math.hypot(bx-cx,by-cy),rm:Math.hypot(mx-cx,my-cy)}};
const distLine=(f,L)=>{const [x1,y1,x2,y2]=L;return Math.abs((x2-x1)*(y1-f.cy)-(x1-f.cx)*(y2-y1))/Math.hypot(x2-x1,y2-y1)};



const res=[];
for (const join of [false,true]) {
p=await mk();a=api(p);
await p.click('#startsk');await p.click('#ppxy');await w(300);
await a.tool('arc');await a.click(10,0);await a.click(0,10);await a.click(10,10);await p.keyboard.press('Escape');await w(300);
await a.tool('line');await a.click(20,0);await a.click(10,0);await p.keyboard.press('Escape');await w(200);
if(join){await a.tool('ccoin');await a.click(10,0);console.log('c1',await a.msg());await a.click(10,0);console.log('c2',await a.msg());await w(1500);console.log('cons',await a.C());}
const A0=(await arcs())[0];
await a.tool('dim');await a.click(15,0);await typ('12');await w(1500);
const A1=(await arcs())[0],L1=(await lns())[0];
console.log('join',join,JSON.stringify(A0),JSON.stringify(A1),JSON.stringify(L1),await a.msg());
ok('line moved to len 12',Math.abs(Math.hypot(L1[2]-L1[0],L1[3]-L1[1])-12)<1e-6);
if(!join) ok('touching arc start stays',near(A1[0],A0[0])&&near(A1[1],A0[1]));
else ok('stored aend: arc start follows line end',near(A1[0],L1[2])&&near(A1[1],L1[3]));
}
await b.close();process.exit(bad);
