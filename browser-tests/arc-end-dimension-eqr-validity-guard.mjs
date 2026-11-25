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
// H1: driver DIMENSION moves the joined line end; the arc end follows; the arc stays a valid circle through its 3 points
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
await a.tool('dim');await a.click(25,5);await typ('20');await w(1500);
const HA=(await arcs())[0],HL=(await lns())[0];console.log('H1',JSON.stringify(HA),JSON.stringify(HL),await a.msg());
const len=Math.hypot(HL[2]-HL[0],HL[3]-HL[1]);
ok('H1 the dimension set the line length to 20 (got '+len.toFixed(4)+')',Math.abs(len-20)<1e-3);
ok('H1 the line end really moved from (30,10)',Math.hypot(HL[2]-30,HL[3]-10)>1);
ok('H1 the arc end follows the moved line end',near(HA[2],HL[2])&&near(HA[3],HL[3]));
{const f=fit(HA);ok('H1 curve validity: the three arc points lie on one circle (radii '+f.r.toFixed(4)+', '+f.rb.toFixed(4)+', '+f.rm.toFixed(4)+')',Math.abs(f.r-f.rb)<1e-6&&Math.abs(f.r-f.rm)<1e-6&&isFinite(f.r)&&f.r>0.1);}
// H2: Equal R on a joined arc is refused and unchanged
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
await a.tool('circle');await a.click(40,30);await a.click(45,30);await w(300);
const E0=(await arcs())[0];
await a.tool('ceqr');await a.click(10,10);await a.click(40,35);await w(1500);
const mE=await a.msg();console.log('H2',mE);
ok('H2 Equal R on a joined arc is refused ('+mE.slice(0,70)+')',/other constraints or dimensions/.test(mE));
ok('H2 arc unchanged and only aend stored',JSON.stringify((await arcs())[0])===JSON.stringify(E0)&&(await a.C()).includes('aend')&&!(await a.C()).includes('aeqr'));
// H3: Tangent on a joined arc: curve validity (circle through a,b,m is tangent to the line, end on the line end)
await mkSk();
await a.tool('ccoin');await a.click(0,10);await a.click(30,10);await w(1500);
await a.tool('line');await a.click(5,20);await a.click(25,25);await p.keyboard.press('Escape');await w(200);
await a.tool('ctanarc');await a.click(10,0);await w(100);await a.click(15,22.5);await w(1800);
{const T=(await arcs())[0],LL=await lns();const f=fit(T);const dl=distLine(f,LL[1]);console.log('H3',JSON.stringify(T),JSON.stringify(LL),f.r,dl);
ok('H3 Tangent applied',/Tangent applied/.test(await a.msg()));
ok('H3 curve validity: the arc circle is tangent to the line (centre to line distance '+dl.toFixed(6)+' equals radius '+f.r.toFixed(6)+')',Math.abs(dl-f.r)<1e-4*Math.max(1,f.r));
{const L=LL[1];const dx=L[2]-L[0],dy=L[3]-L[1];const t=((f.cx-L[0])*dx+(f.cy-L[1])*dy)/(dx*dx+dy*dy);console.log('H3 tangent point parameter on the line segment (0..1 is inside):',t.toFixed(3),'radius',f.r.toFixed(1));}
ok('H3 the arc end is still on the joined line end',near(T[2],LL[0][2])&&near(T[3],LL[0][3]));
ok('H3 the start point (10,0) is unchanged and the three points are one circle',near(T[0],10)&&near(T[1],0)&&Math.abs(f.r-f.rb)<1e-6&&Math.abs(f.r-f.rm)<1e-6);}
// H4: Concentric first, then the join: the guard must trigger, refuse, and restore ALL three arc points
await mkSk();
await a.tool('circle');await a.click(40,30);await a.click(45,30);await w(300);
await a.tool('cconc');await a.click(10,10);await a.click(40,35);await w(1500);
console.log('H4 conc msg',await a.msg(),JSON.stringify((await arcs())[0]));
const Q0=(await arcs())[0],C0=await a.C();
await a.tool('ccoin');await a.click(Q0[2],Q0[3]);await a.click(30,10);await w(1800);
const mH=await a.msg();console.log('H4 join msg',mH);const Q1=(await arcs())[0];
ok('H4 the join after Concentric is refused or kept consistent: '+mH.slice(0,80),/Nothing was kept|conflict|cannot/.test(mH)||(near(Q1[2],30)&&near(Q1[3],10)));
{const refused=/Nothing was kept|conflict|cannot/.test(mH);
ok('H4 '+(refused?'refused: arc fully restored (a, b and middle) and no aend stored':'accepted: arc end on the line end and Concentric still true'),refused?(JSON.stringify(Q1)===JSON.stringify(Q0)&&!(await a.C()).includes('aend')&&(await a.C()).includes('aconc')):((await a.C()).includes('aend')&&(await a.C()).includes('aconc')));
const f0=fit(Q1);console.log('H4 fit',JSON.stringify(f0));}
await b.close();process.exit(0);
