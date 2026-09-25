#!/usr/bin/env python3
import json,re,urllib.request
from datetime import datetime,timezone

URL="https://flightplan.romatsa.ro/init/notam/getnotamlist?twr=LRBV"
AREAS={
 "AZLR1":{"fl":"090","coord":"452037N0253658E-452736N0252223E-453843N0253754E-453221N0254805E"},
 "AZLR2":{"fl":"060","coord":"453843N0253754E-454233N0254914E-453953N0255514E-453221N0254805E"},
 "AZLR3":{"fl":"050","coord":"454233N0254914E-453953N0255514E-454710N0260208E-454728N0255306E"},
}
req=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0 ctr-brasov-notam-check/1.0"})
with urllib.request.urlopen(req,timeout=30) as r:
    html=r.read().decode("utf-8","replace")
text=re.sub(r"<[^>]+>"," ",html)
text=re.sub(r"&nbsp;"," ",text)
text=re.sub(r"\s+"," ",text)
out={"source":URL,"checkedAt":datetime.now(timezone.utc).isoformat(),"zones":{}}
for zone,a in AREAS.items():
    hits=[]
    for m in re.finditer(r"(D\d{4}/2026).*?(?=(?:[A-Z]\d{4}/2026)|$)",text):
        block=m.group(0)
        if "GLD FLT" in block and a["coord"] in block and re.search(r"G\)\s*FL"+a["fl"]+r"\b",block):
            b=re.search(r"B\)\s*(\d{10})",block); c=re.search(r"C\)\s*(\d{10})",block)
            hits.append({"notam":m.group(1),"from":b.group(1) if b else None,"to":c.group(1) if c else None})
    out["zones"][zone]=hits[0] if len(hits)==1 else {"notam":None,"matches":len(hits)}
with open("notam-data.json","w",encoding="utf-8") as f: json.dump(out,f,ensure_ascii=False,indent=2)
print(json.dumps(out,ensure_ascii=False,indent=2))
