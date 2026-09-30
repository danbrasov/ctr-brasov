#!/usr/bin/env python3
import json,re,sys
from datetime import datetime,timezone
src,outfile=sys.argv[1],sys.argv[2]
URL="https://flightplan.romatsa.ro/init/notam/getnotamlist?twr=LRBV"
AREAS={
 "AZLR1":{"coord":"452037N0253658E-452736N0252223E-453843N0253754E-453221N0254805E"},
 "AZLR2":{"coord":"453843N0253754E-454233N0254914E-453953N0255514E-453221N0254805E"},
 "AZLR3":{"coord":"454233N0254914E-453953N0255514E-454710N0260208E-454728N0255306E"},
}
html=open(src,encoding="utf-8",errors="replace").read()
text=re.sub(r"<[^>]+>"," ",html)
text=re.sub(r"&nbsp;"," ",text)
text=re.sub(r"\s+"," ",text)
year=str(datetime.now(timezone.utc).year)
pattern=r"(D\d{4}/"+year+r").*?(?=(?:[A-Z]\d{4}/"+year+r")|$)"
out={"source":URL,"checkedAt":datetime.now(timezone.utc).isoformat(),"zones":{}}
for zone,a in AREAS.items():
    hits=[]
    for m in re.finditer(pattern,text):
        block=m.group(0)
        compact=re.sub(r"\s+","",block)
        if "GLDFLT" in compact and a["coord"] in compact:
            b=re.search(r"B\)(\d{10})",compact); c=re.search(r"C\)(\d{10})",compact)
            f=re.search(r"F\)(GND|SFC|FL\d{3})",compact); g=re.search(r"G\)(FL\d{3}|GND|SFC|UNL)",compact)
            hits.append({"notam":m.group(1),"from":b.group(1) if b else None,"to":c.group(1) if c else None,"lower":f.group(1) if f else None,"upper":g.group(1) if g else None})
    now=datetime.now(timezone.utc)
    active=[]
    for h in hits:
        try:
            bdt=datetime.strptime(h["from"],"%y%m%d%H%M").replace(tzinfo=timezone.utc) if h.get("from") else None
            cdt=datetime.strptime(h["to"],"%y%m%d%H%M").replace(tzinfo=timezone.utc) if h.get("to") else None
            if (bdt is None or bdt<=now) and (cdt is None or now<=cdt):
                active.append((bdt or datetime.min.replace(tzinfo=timezone.utc),h))
        except Exception:
            pass
    if active:
        active.sort(key=lambda x:x[0],reverse=True)
        chosen=active[0][1]
        chosen["matches"]=len(hits)
        chosen["activeMatches"]=len(active)
        out["zones"][zone]=chosen
    elif hits:
        future=[]
        for h in hits:
            try:
                bdt=datetime.strptime(h["from"],"%y%m%d%H%M").replace(tzinfo=timezone.utc) if h.get("from") else None
                if bdt and bdt>now:
                    future.append((bdt,h))
            except Exception:
                pass
        if future:
            future.sort(key=lambda x:x[0])
            chosen=future[0][1]
            chosen["matches"]=len(hits)
            chosen["activeMatches"]=0
            chosen["status"]="upcoming"
            out["zones"][zone]=chosen
        else:
            out["zones"][zone]={"notam":None,"matches":len(hits),"activeMatches":0}
    else:
        out["zones"][zone]={"notam":None,"matches":0,"activeMatches":0}
with open(outfile,"w",encoding="utf-8") as f: json.dump(out,f,ensure_ascii=False,indent=2)
print(json.dumps(out,ensure_ascii=False,indent=2))
