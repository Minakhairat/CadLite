import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>console.log('ERR',e.message.slice(0,200)));
const w=(t=1500)=>new Promise(r=>setTimeout(r,t));let bad=0;const ok=(n,c)=>{console.log(c?'ASSERT OK':'ASSERT FAIL',n);if(!c)bad=1;};
await p.goto(process.argv[2],{waitUntil:'networkidle0'});await w();
const base={version:1,features:[{kind:'extrude',depth:15,sketch:[{t:'rect',a:{x:0,y:0},b:{x:40,y:30}},{t:'point',p:{x:12,y:8}}]}]};
await p.evaluate((t)=>window.__cad.load(t),JSON.stringify(base));await w(6000);
const vol=()=>p.evaluate(()=>window.__cad.volumes());
const v0=await vol();console.log('v0',JSON.stringify(v0));
const hole=async(depth)=>{await p.evaluate(()=>document.getElementById('hol').click());await w(500);await p.select('#hpt','0');await p.$eval('#msize',(e,d)=>{e.value=d},String(depth));await p.click('#mok');await w(6000);};
const near=(a,b,t)=>Math.abs(a-b)<t;
await hole(0);
const v1=await vol();const sum=(v)=>v.reduce?v.reduce((s,x)=>s+(typeof x==='number'?x:x.v??0),0):v;console.log('v1',JSON.stringify(v1));
const V0=sum(v0),V1=sum(v1),exp=Math.PI*2.5*2.5*15;
ok(`through-hole removes pi r^2 h (${(V0-V1).toFixed(1)} vs ${exp.toFixed(1)})`,near(V0-V1,exp,exp*0.02));
const s=await p.evaluate(()=>window.__cad.serialize());
await p.evaluate((t)=>window.__cad.load(t),s);await w(6000);
const V2=sum(await vol());ok('save/reopen volume equal',near(V2,V1,0.01));
await p.screenshot({path:'/tmp/hole-3d.png'});
// blind: fresh model, depth 6
await p.evaluate((t)=>window.__cad.load(t),JSON.stringify(base));await w(6000);
await hole(6);const V3=sum(await vol());const exp3=Math.PI*2.5*2.5*6;
ok(`blind 6 mm removes ${exp3.toFixed(1)} (got ${(V0-V3).toFixed(1)})`,near(V0-V3,exp3,exp3*0.02));
const f=JSON.parse(await p.evaluate(()=>window.__cad.serialize())).features.at(-1);
ok('stored dia 5 depth 6 centre 12,8',f.depth===6&&f.sketch[0].r===2.5&&f.sketch[0].c.x===12&&f.sketch[0].c.y===8);

// location probe: point near the corner so the circle is clipped by x=0 and y=0
const cb=JSON.parse(JSON.stringify(base));cb.features[0].sketch[1].p={x:2,y:1};
await p.evaluate((t)=>window.__cad.load(t),JSON.stringify(cb));await w(6000);
await hole(0);const V4=sum(await vol());
let area=0;const n=2000,h=40/n;for(let i=0;i<n;i++)for(let j=0;j<n;j++){}
const N=1500;let cnt=0;for(let i=0;i<N;i++)for(let j=0;j<N;j++){const x=-2.5+5*(i+.5)/N+2,y=-2.5+5*(j+.5)/N+1;if((x-2)**2+(y-1)**2<=6.25&&x>=0&&x<=40&&y>=0&&y<=30)cnt++;}
const expc=cnt*(25/(N*N))*15;
ok(`corner hole at (2,1) removes clipped area ${expc.toFixed(1)} (got ${(V0-V4).toFixed(1)}; full circle would be ${exp.toFixed(1)})`,near(V0-V4,expc,expc*0.02)&&Math.abs(expc-exp)>20);
await p.screenshot({path:'/tmp/hole-corner.png'});
await b.close();process.exit(bad);
