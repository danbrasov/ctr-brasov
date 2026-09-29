import { createHmac } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import WebSocket from 'ws';

const URL='wss://live2.xcontest.org/websock/webclient';
const KEY='bjIsOZnTlI5ktxO7uGTmJyfxBIonEtrwFPIaePVPPcAKj9YNlrm2TItjePlPySkD';
const flights=new Map(), statics=new Map();
const POLYS={
 AZLR1:[[45+20/60+37/3600,25+36/60+58/3600],[45+27/60+36/3600,25+22/60+23/3600],[45+38/60+43/3600,25+37/60+54/3600],[45+32/60+21/3600,25+48/60+5/3600]],
 AZLR2:[[45+38/60+43/3600,25+37/60+54/3600],[45+42/60+33/3600,25+49/60+14/3600],[45+39/60+53/3600,25+55/60+14/3600],[45+32/60+21/3600,25+48/60+5/3600]],
 AZLR3:[[45+42/60+33/3600,25+49/60+14/3600],[45+39/60+53/3600,25+55/60+14/3600],[45+47/60+10/3600,26+2/60+8/3600],[45+47/60+28/3600,25+53/60+6/3600]]
};
function inside(lat,lon,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const yi=p[i][0],xi=p[i][1],yj=p[j][0],xj=p[j][1];if(((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi))c=!c}return c}
let init=true, done=false;

const ws=new WebSocket(URL,{headers:{Origin:'https://live.xcontest.org','User-Agent':'Mozilla/5.0 ctr-brasov-xcontest-test/1.0'}});

function finish(error=null){
  if(done)return; done=true;
  const pilots=[];
  for(const [uuid,f] of flights){
    const fix=f?.lastFix;
    if(!fix||f?.landed)continue;
    const s=statics.get(uuid)||{};
    pilots.push({uuid,name:s.user?.fullname||null,username:s.user?.username||null,lon:fix[0],lat:fix[1],alt:fix[2],time:fix[3]?.t||null,landed:!!f.landed});
  }
  const near=pilots.filter(p=>p.lat>=44.8&&p.lat<=46.5&&p.lon>=24.5&&p.lon<=27.0);
  const zones={};
  for(const [z,p] of Object.entries(POLYS))zones[z]=pilots.filter(x=>inside(x.lat,x.lon,p));
  fs.writeFileSync('xcontest-test.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'XContest Live',connected:!error,error:error?String(error):null,flyingTotal:pilots.length,brasovRegion:near,zones},null,2));
  try{ws.close()}catch{}
  process.exitCode=error?1:0;
}
ws.on('message',(data,isBinary)=>{
  if(init){
    init=false;
    ws.send(createHmac('sha256',KEY).update(Buffer.from(data)).digest());
    ws.send(JSON.stringify({tag:'WebFilterContest',contest:'live9999',staticInfos:true}));
    ws.send(JSON.stringify({tag:'WebFollow',contents:[]}));
    return;
  }
  try{
    const b=Buffer.from(data), txt=isBinary&&b[0]===0x1f&&b[1]===0x8b?gunzipSync(b).toString():b.toString(),m=JSON.parse(txt);
    if(m.tag==='LiveFlightInfos'&&m.info){for(const [u,v] of Object.entries(m.info))flights.set(u,v);ws.send(JSON.stringify({tag:'WebRequestInfo',contents:Object.keys(m.info)}))}
    if(m.tag==='LiveStaticInfos'&&m.static)for(const [u,v] of Object.entries(m.static))statics.set(u,v);
  }catch{}
});
ws.on('error',e=>finish(e.message));
setTimeout(()=>finish(),15000);
