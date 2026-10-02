#!/usr/bin/env python3
import json, sys, urllib.request
from datetime import datetime, timezone, timedelta

OUT = sys.argv[1] if len(sys.argv) > 1 else "pg-weather-history.json"
URL = "https://ctr-brasov-aircraft.vercel.app/api/pgmeteo"
RETENTION_HOURS = 168  # 7 days

with urllib.request.urlopen(URL, timeout=20) as r:
    data = json.load(r)

if not data.get("ok"):
    raise SystemExit("PG meteo endpoint returned ok=false")

station = data.get("station") or {}
current = data.get("current") or {}
sid = station.get("id") or "pg-lempes"
time_text = current.get("time")

try:
    with open(OUT, encoding="utf-8") as f:
        out = json.load(f)
except Exception:
    out = {"source":"Paragliding România","updatedAt":None,"stations":{}}

stations = out.setdefault("stations", {})
entry = stations.setdefault(sid, {
    "id": sid,
    "name": station.get("name"),
    "lat": station.get("lat"),
    "lon": station.get("lon"),
    "elevationM": station.get("elevationM"),
    "history": []
})

# Convert HH:MM:SS reported by the station to today's Europe/Bucharest-like local
# timestamp using the current UTC offset (+03 in Oct 2026). This is temporary
# until the official API provides a full timestamp.
now = datetime.now(timezone.utc)
local = now + timedelta(hours=3)
obs_ms = None
if time_text:
    try:
        hh, mm, ss = map(int, time_text.split(":"))
        obs_local = local.replace(hour=hh, minute=mm, second=ss, microsecond=0)
        obs_utc = obs_local - timedelta(hours=3)
        obs_ms = int(obs_utc.timestamp()*1000)
    except Exception:
        pass
if obs_ms is None:
    obs_ms = int(now.timestamp()*1000)

point = {
    "t": obs_ms,
    "time": time_text,
    "windKmh": current.get("windKmh"),
    "gustKmh": current.get("gustKmh"),
    "dir": current.get("dir"),
    "tempC": current.get("tempC"),
    "pressureHpa": current.get("pressureHpa")
}

hist = entry.setdefault("history", [])
if not hist or hist[-1].get("time") != time_text:
    hist.append(point)

cutoff = int((now - timedelta(hours=RETENTION_HOURS)).timestamp()*1000)
entry["history"] = [x for x in hist if int(x.get("t") or 0) >= cutoff]
entry.update({
    "name": station.get("name"),
    "lat": station.get("lat"),
    "lon": station.get("lon"),
    "elevationM": station.get("elevationM")
})
out["updatedAt"] = now.isoformat()

with open(OUT,"w",encoding="utf-8") as f:
    json.dump(out,f,ensure_ascii=False,indent=2)

print(json.dumps(point,ensure_ascii=False))
