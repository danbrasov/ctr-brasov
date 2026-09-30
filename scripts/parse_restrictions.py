#!/usr/bin/env python3
import json, re, sys, math, html as htmlmod
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

SRC, OUT = sys.argv[1], sys.argv[2]
URL = "https://flightplan.romatsa.ro/init/notam/restrictiiro"
CENTER = (45.6579, 25.6012)
RADIUS_KM = 75.0
MAX_FT = 10000.0
TZ = ZoneInfo("Europe/Bucharest")

def rad(x): return math.radians(x)
def hav(a,b,c,d):
    R=6371.0
    x=rad(c-a); y=rad(d-b)
    h=math.sin(x/2)**2+math.cos(rad(a))*math.cos(rad(c))*math.sin(y/2)**2
    return 2*R*math.asin(math.sqrt(h))

def coord(s):
    m=re.fullmatch(r"(\d{2})(\d{2})(\d{2})([NS])(\d{3})(\d{2})(\d{2})([EW])",s)
    if not m:return None
    lat=int(m[1])+int(m[2])/60+int(m[3])/3600
    lon=int(m[5])+int(m[6])/60+int(m[7])/3600
    if m[4]=="S":lat=-lat
    if m[8]=="W":lon=-lon
    return [lat,lon]

def parse_dt(s):
    if not s or not re.fullmatch(r"\d{10}",s): return None
    return datetime.strptime(s,"%y%m%d%H%M").replace(tzinfo=timezone.utc)

def val_ft(s, upper=False):
    if not s:return None
    s=s.strip().upper()
    if s in ("GND","SFC"): return 0.0
    m=re.search(r"FL\s*(\d{2,3})",s)
    if m:return float(m.group(1))*100
    m=re.search(r"(\d+)\s*FT",s)
    if m:return float(m.group(1))
    if "UNL" in s:return 999999.0
    return None

def sunset_local(day):
    # NOAA-style sunset approximation for Brasov.
    n=day.timetuple().tm_yday; lat,lon=CENTER
    lng=lon/15.0; t=n+(18-lng)/24.0
    M=0.9856*t-3.289
    L=(M+1.916*math.sin(rad(M))+0.020*math.sin(rad(2*M))+282.634)%360
    RA=math.degrees(math.atan(0.91764*math.tan(rad(L))))%360
    RA += math.floor(L/90)*90-math.floor(RA/90)*90
    RA/=15
    sinDec=0.39782*math.sin(rad(L)); cosDec=math.cos(math.asin(sinDec))
    cosH=(math.cos(rad(90.833))-sinDec*math.sin(rad(lat)))/(cosDec*math.cos(rad(lat)))
    if cosH<-1 or cosH>1:return day.replace(hour=19,minute=0,second=0,microsecond=0)
    H=math.degrees(math.acos(cosH))/15
    T=H+RA-0.06571*t-6.622
    UT=(T-lng)%24
    utc=datetime(day.year,day.month,day.day,tzinfo=timezone.utc)+timedelta(hours=UT)
    return utc.astimezone(TZ)

def schedule_overlaps(dfield, local_day, win_start, win_end):
    if not dfield:return True
    pairs=re.findall(r"(?<!\d)(\d{4})-(\d{4})(?!\d)",dfield)
    if not pairs:return True  # complex schedule: keep it, don't accidentally hide a restriction
    for a,b in pairs:
        sh,sm=int(a[:2]),int(a[2:]); eh,em=int(b[:2]),int(b[2:])
        # NOTAM D) times are UTC
        s=datetime(local_day.year,local_day.month,local_day.day,sh,sm,tzinfo=timezone.utc)
        e=datetime(local_day.year,local_day.month,local_day.day,eh,em,tzinfo=timezone.utc)
        if e<=s:e+=timedelta(days=1)
        if s < win_end.astimezone(timezone.utc) and e > win_start.astimezone(timezone.utc):
            return True
    return False

raw=open(SRC,encoding="utf-8",errors="replace").read()
txt=htmlmod.unescape(re.sub(r"<[^>]+>"," ",raw))
txt=re.sub(r"\s+"," ",txt)
year=str(datetime.now(timezone.utc).year)

# Start at each NOTAM id and stop at the next id.
matches=list(re.finditer(r"([A-Z]\d{4}/(?:\d{2}|"+year+r"))\s+NOTAM[NRC]",txt))
blocks=[]
for i,m in enumerate(matches):
    end=matches[i+1].start() if i+1<len(matches) else len(txt)
    blocks.append((m.group(1),txt[m.start():end]))

now_local=datetime.now(TZ)
day0=now_local.replace(hour=0,minute=0,second=0,microsecond=0)
win_start=day0.replace(hour=12)
win_end=sunset_local(day0)
items=[]; skipped_geometry=0

for notam,block in blocks:
    compact=re.sub(r"\s+"," ",block)
    b=re.search(r"\bB\)\s*(\d{10})",compact)
    c=re.search(r"\bC\)\s*(\d{10})",compact)
    d=re.search(r"\bD\)\s*(.*?)(?=\s+[EFGQ]\)|$)",compact)
    e=re.search(r"\bE\)\s*(.*?)(?=\s+[FGQ]\)|$)",compact)
    f=re.search(r"\bF\)\s*(.*?)(?=\s+G\)|$)",compact)
    g=re.search(r"\bG\)\s*(.*?)(?=$|\s+[A-Z]\))",compact)
    start=parse_dt(b.group(1) if b else None); end=parse_dt(c.group(1) if c else None)
    if start and start >= win_end.astimezone(timezone.utc): continue
    if end and end <= win_start.astimezone(timezone.utc): continue
    dfield=d.group(1).strip() if d else ""
    if not schedule_overlaps(dfield,day0,win_start,win_end): continue

    lower=(f.group(1).strip() if f else "")
    upper=(g.group(1).strip() if g else "")
    lo=val_ft(lower); hi=val_ft(upper,True)
    if lo is not None and lo>=MAX_FT: continue
    if hi is not None and hi<=0: continue

    desc=(e.group(1).strip() if e else "")
    u=desc.upper()
    # Keep only operationally important warnings/restrictions.
    keywords=("PROHIBITED","RESTRICTED AREA","RESERVED AREA","DANGER AREA","TSA","TRA ","UNMANNED ACFT","UAS","MIL FLT","FIRING","SHOOTING","NAVIGATION WARNING")
    if not any(k in u for k in keywords): continue

    severity="red" if any(k in u for k in ("PROHIBITED","RESTRICTED AREA","RESERVED AREA","TSA","TRA ")) else "orange"

    coords=[coord(x) for x in re.findall(r"\d{6}[NS]\d{7}[EW]",desc)]
    coords=[x for x in coords if x]
    shape=None
    # Explicit circle only; don't use Q-line radius as if it were the true boundary.
    cm=re.search(r"CIRCLE.*?COORD(?:INATES?)?\s*(\d{6}[NS]\d{7}[EW]).*?WITH\s*([0-9.]+)\s*(NM|KM)\s+RADIUS",u)
    if cm:
        cc=coord(cm.group(1)); rr=float(cm.group(2))*(1.852 if cm.group(3)=="NM" else 1.0)
        if cc and hav(CENTER[0],CENTER[1],cc[0],cc[1])<=RADIUS_KM+rr:
            shape={"type":"circle","center":cc,"radiusKm":rr}
    elif len(coords)>=3:
        # De-duplicate consecutive repetitions and keep polygon if near Brasov.
        poly=[]
        for p in coords:
            if not poly or p!=poly[-1]:poly.append(p)
        if min(hav(CENTER[0],CENTER[1],p[0],p[1]) for p in poly)<=RADIUS_KM:
            shape={"type":"polygon","points":poly}
    if not shape:
        skipped_geometry+=1
        continue

    items.append({
      "notam":notam,
      "from":b.group(1) if b else None,
      "to":c.group(1) if c else None,
      "schedule":dfield or None,
      "lower":lower or None,
      "upper":upper or None,
      "description":desc,
      "severity":severity,
      "shape":shape
    })

out={
 "source":URL,
 "checkedAt":datetime.now(timezone.utc).isoformat(),
 "date":day0.date().isoformat(),
 "windowLocal":{"from":"12:00","to":win_end.strftime("%H:%M")},
 "radiusKm":RADIUS_KM,
 "maxAltitude":"FL100",
 "items":items,
 "skippedWithoutExplicitGeometry":skipped_geometry
}
with open(OUT,"w",encoding="utf-8") as fh:json.dump(out,fh,ensure_ascii=False,indent=2)
print(json.dumps(out,ensure_ascii=False,indent=2))
