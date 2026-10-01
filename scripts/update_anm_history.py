#!/usr/bin/env python3
import json, math, re, sys, urllib.request
from datetime import datetime, timezone, timedelta

URL="https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii"
CENTER=(45.6579,25.6012)
RADIUS_KM=75
DIRECTIONS={"N":0.0,"NNE":22.5,"NE":45.0,"ENE":67.5,"E":90.0,"ESE":112.5,"SE":135.0,"SSE":157.5,"S":180.0,"SSV":202.5,"SV":225.0,"VSV":247.5,"V":270.0,"VNV":292.5,"NV":315.0,"NNV":337.5}

def merc(x,y):
    lon=float(x)*180.0/20037508.34
    lat=math.degrees(2.0*math.atan(math.exp(float(y)/6378137.0))-math.pi/2.0)
    return lat,lon

def hav(a,b,c,d):
    rr=math.radians
    x=rr(c-a); y=rr(d-b)
    h=math.sin(x/2)**2+math.cos(rr(a))*math.cos(rr(c))*math.sin(y/2)**2
    return 2*6371*math.asin(math.sqrt(h))

def slug(s):
    import unicodedata
    s=unicodedata.normalize("NFD",str(s)).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","-",s).strip("-")

def num(v):
    if v is None:return None
    m=re.search(r"[-+]?\d+(?:[.,]\d+)?",str(v))
    return float(m.group(0).replace(",",".")) if m else None

def wind(v):
    if not v or str(v).strip().lower()=="indisponibil": return None,None
    m=re.search(r"([-+]?\d+(?:[.,]\d+)?)\s*m/s.*?:\s*([A-Z]+)",str(v),re.I)
    if not m:return None,None
    return float(m.group(1).replace(",",".")),DIRECTIONS.get(m.group(2).upper())

out=sys.argv[1]
try:
    old=json.load(open(out,encoding="utf-8"))
except Exception:
    old={"source":URL,"stations":{}}

req=urllib.request.Request(URL,headers={"User-Agent":"ctr-brasov-anm-history/1.0","Accept":"application/json"})
with urllib.request.urlopen(req,timeout=30) as r:
    data=json.load(r)

dt=datetime.fromisoformat(str(data["date"]).replace("Z","+00:00"))
t=int(dt.timestamp()*1000)
cut=int((dt-timedelta(hours=24)).timestamp()*1000)
stations=old.get("stations",{})

for f in data.get("features",[]):
    p=f.get("properties",{}); g=f.get("geometry",{}); co=g.get("coordinates",[])
    name=str(p.get("nume","")).strip()
    if not name or len(co)<2: continue
    lat,lon=merc(co[0],co[1])
    if hav(CENTER[0],CENTER[1],lat,lon)>RADIUS_KM: continue
    ms,dr=wind(p.get("vant"))
    if ms is None or dr is None: continue
    sid="anm-"+slug(name)
    h=stations.setdefault(sid,{"name":name,"history":[]})["history"]
    if not any(int(x.get("t",0))==t for x in h):
        h.append({
            "t":t,
            "windKmh":round(ms*3.6,1),
            "dir":dr,
            "tempC":num(p.get("tempe")),
            "pressureHpa":num(p.get("presiunetext"))
        })
    stations[sid]["history"]=[x for x in h if int(x.get("t",0))>=cut]
    stations[sid]["name"]=name

result={
    "source":URL,
    "checkedAt":datetime.now(timezone.utc).isoformat(),
    "datasetAt":data.get("date"),
    "retentionHours":24,
    "stations":stations
}
with open(out,"w",encoding="utf-8") as f:
    json.dump(result,f,ensure_ascii=False,indent=2)
print(json.dumps({"datasetAt":result["datasetAt"],"stations":len(stations)},ensure_ascii=False))
