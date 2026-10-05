const STATIONS = [
  { id: "pg-sie", sourceId: 1, name: "Sie, HR", lat: 46.5788, lon: 25.9777, elevationM: 1051 },
  { id: "pg-sacele", sourceId: 2, name: "Sacele, BV", lat: 45.6220, lon: 25.6910, elevationM: 640 },
  { id: "pg-postavaru", sourceId: 3, name: "Vf. Postavaru", lat: 45.5682, lon: 25.5668, elevationM: 1690 },
  { id: "pg-ignis", sourceId: 4, name: "Vf. Ignis, MM", lat: 47.7321, lon: 23.6731, elevationM: 1307 },
  { id: "pg-ozun", sourceId: 5, name: "Ozun, CV", lat: 45.7994, lon: 25.9019, elevationM: 760 },
  { id: "pg-magura-uroiului", sourceId: 7, name: "Magura Uroiului, HD", lat: 45.8607, lon: 23.0444, elevationM: 360 },
  { id: "pg-saua-magurii", sourceId: 8, name: "Saua Magurii, BV", lat: 45.5259, lon: 25.3204, elevationM: 1238 },
  { id: "pg-parang", sourceId: 10, name: "BIRDSHOUSE Parang, HD", lat: 45.3892, lon: 23.4598, elevationM: 1508 },
  { id: "pg-bunloc", sourceId: 11, name: "Bunloc, BV", lat: 45.5889, lon: 25.6649, elevationM: 1171 },
  { id: "pg-gropsoarele", sourceId: 12, name: "Vf. Gropșoarele, PH", lat: 45.48983, lon: 25.97532, elevationM: 1883 },
  { id: "pg-piatra-mare", sourceId: 14, name: "Piatra Mare", lat: 45.55078, lon: 25.63853, elevationM: 1844 },
  { id: "pg-lempes", sourceId: 15, name: "Lempes", lat: 45.7148, lon: 25.6527, elevationM: 704 },
  { id: "pg-moeciu", sourceId: 20, name: "Moeciu de Sus", lat: 45.4662, lon: 25.3780, elevationM: 1150 },
  { id: "pg-onesti", sourceId: 21, name: "Aerodrom Onesti", lat: 46.2985, lon: 26.7540, elevationM: 203 },
  { id: "pg-piatra-craiului", sourceId: 22, name: "Aerodrom Piatra Craiului", lat: 45.5645, lon: 25.3987, elevationM: 851 }
];

const BASE = "https://meteo.paragliding-romania.ro";
const SOURCE = "paragliding-romania";
const UPSTREAM = "xpander";
const XPANDER_API = "https://www.xpander.ro/api/";
const STALE_HOURS = 2;
const ZERO_WIND_HOURS = 4;

function cleanHtml(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&deg;/gi, "°")
    .replace(/&#176;/gi, "°")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localTimestamp(timeText) {
  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeText || "")) return null;

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const obj = Object.fromEntries(parts.map(x => [x.type, x.value]));
  const [hh, mm, ss] = timeText.split(":").map(Number);
  const tentativeUtc = Date.UTC(Number(obj.year), Number(obj.month) - 1, Number(obj.day), hh, mm, ss);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const wanted =
    `${obj.year}-${obj.month}-${obj.day} ` +
    `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  for (const offsetHours of [2, 3]) {
    const candidate = tentativeUtc - offsetHours * 3600000;
    const p = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(x => [x.type, x.value]));
    const check = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    if (check === wanted) return candidate;
  }

  return null;
}


function localDateTimeTimestamp(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;

  const [, yy, mo, dd, hh, mi, ss] = m;
  const tentativeUtc = Date.UTC(+yy, +mo - 1, +dd, +hh, +mi, +ss);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const wanted = `${yy}-${mo}-${dd} ${hh}:${mi}:${ss}`;

  for (const offsetHours of [2, 3]) {
    const candidate = tentativeUtc - offsetHours * 3600000;
    const p = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(x => [x.type, x.value]));
    const check = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    if (check === wanted) return candidate;
  }
  return null;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getXpanderAuth(env) {
  const binding = env.XPANDER_AUTH;
  if (!binding) return null;
  if (typeof binding === "string") return binding;
  if (typeof binding?.get === "function") return await binding.get();
  return null;
}

async function fetchXpander(env) {
  const auth = await getXpanderAuth(env);
  if (!auth) throw new Error("XPANDER_AUTH secret is not configured");

  const url = new URL(XPANDER_API);
  url.searchParams.set("auth", auth);
  url.searchParams.set("_", String(Date.now()));

  const r = await fetch(url.toString(), {
    headers: {
      "User-Agent": "ctr-brasov-pg-weather/2.0",
      "Accept": "application/json"
    },
    cf: { cacheTtl: 0, cacheEverything: false }
  });

  if (!r.ok) throw new Error(`Xpander API -> HTTP ${r.status}`);
  const payload = await r.json();
  if (!payload || typeof payload.meteo !== "object") throw new Error("Invalid Xpander API response");
  return payload.meteo;
}

function fromXpander(station, meteo) {
  const key = String(station.sourceId).padStart(2, "0");
  const item = meteo?.[key];
  if (!item) {
    return { station, status: "offline", offlineReason: "station missing from API" };
  }

  const rawAge = finiteNumber(item.age);
  const age = rawAge === null ? null : Math.max(0, rawAge);
  const online = item.status === "online" && item.data &&
    (age === null || age <= STALE_HOURS * 3600);

  if (!online) {
    return {
      station,
      status: "offline",
      offlineReason: item.offline_reason || (age !== null ? `stale data (${age}s)` : "no data")
    };
  }

  const observedAt = localDateTimeTimestamp(item.ts);
  if (!observedAt) {
    return { station, status: "offline", offlineReason: "invalid observation timestamp" };
  }

  const ws = finiteNumber(item.data.ws);
  const wg = finiteNumber(item.data.wg);

  return {
    station,
    status: "online",
    offlineReason: null,
    observedAt,
    time: item.ts,
    age,
    windKmh: ws === null ? null : ws * 3.6,
    gustKmh: wg === null ? null : wg * 3.6,
    windDir: finiteNumber(item.data.wdn),
    temperatureC: finiteNumber(item.data.ta),
    pressureHpa: finiteNumber(item.data.pa),
    humidityPct: finiteNumber(item.data.rh)
  };
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "ctr-brasov-pg-weather/1.0",
      "Accept": "text/html,*/*"
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  });

  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return await r.text();
}

async function getStation(station) {
  const bust = Date.now();
  const q = `?station_id=${station.sourceId}&_=${bust}`;

  const [windRaw, tempRaw, pressureRaw] = await Promise.all([
    fetchText(`${BASE}/windspeeddirection.php${q}`),
    fetchText(`${BASE}/temperature.php${q}`),
    fetchText(`${BASE}/barometer.php${q}`)
  ]);

  const windText = cleanHtml(windRaw);
  const tempText = cleanHtml(tempRaw);
  const pressureText = cleanHtml(pressureRaw);

  const time =
    windText.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] ||
    tempText.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] ||
    pressureText.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] ||
    null;

  if (!time) throw new Error("Station offline or no observation");
  if (time === "00:00:00") throw new Error("Station offline (00:00:00)");

  const observedAt = localTimestamp(time);
  if (!observedAt) throw new Error(`Invalid observation time: ${time}`);

  const ageMs = Date.now() - observedAt;
  const maxAgeMs = STALE_HOURS * 3600000;
  if (ageMs > maxAgeMs || ageMs < -10 * 60000) {
    throw new Error(`Station offline or stale observation (${time})`);
  }

  const degMatches = [...windText.matchAll(/\b(\d{1,3})\s*°/g)]
    .map(m => Number(m[1]))
    .filter(x => Number.isFinite(x) && x >= 0 && x <= 360);

  const windDir = degMatches.length ? degMatches[0] : null;

  const kmh = [...windText.matchAll(/(-?\d+(?:[.,]\d+)?)\s*km\/h/gi)]
    .map(m => Number(m[1].replace(",", ".")))
    .filter(Number.isFinite);

  const windKmh = kmh.length ? kmh[0] : null;
  const gustKmh = kmh.length > 1 ? kmh[1] : null;

  let temperatureC = null;
  const tempHtmlMatch = tempRaw.match(/class=["']temptextmilder["'][^>]*>\s*(-?\d+(?:[.,]\d+)?)/i);
  if (tempHtmlMatch) {
    temperatureC = Number(tempHtmlMatch[1].replace(",", "."));
  } else {
    const temps = [...tempText.matchAll(/(-?\d+(?:[.,]\d+)?)\s*°C/gi)]
      .map(m => Number(m[1].replace(",", ".")))
      .filter(Number.isFinite);
    if (temps.length) temperatureC = temps[0];
  }

  let pressureHpa = null;
  const pressureValues = [...pressureText.matchAll(/(-?\d+(?:[.,]\d+)?)\s*hPa/gi)]
    .map(m => Number(m[1].replace(",", ".")))
    .filter(x => Number.isFinite(x) && x > 800 && x < 1100);

  if (pressureValues.length) {
    pressureHpa = pressureValues.reduce(
      (best, x) => Math.abs(x - 960) < Math.abs(best - 960) ? x : best
    );
  }

  if (
    windKmh === null &&
    gustKmh === null &&
    windDir === null &&
    temperatureC === null &&
    pressureHpa === null
  ) {
    throw new Error("No weather values returned");
  }

  return {
    station,
    observedAt,
    time,
    windKmh,
    gustKmh,
    windDir,
    temperatureC,
    pressureHpa
  };
}

async function saveStation(env, data) {
  const s = data.station;

  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO weather_history
    (
      station_id,
      station_name,
      observed_at,
      wind_kmh,
      gust_kmh,
      wind_dir,
      temperature_c,
      pressure_hpa,
      latitude,
      longitude,
      elevation_m,
      source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      s.id,
      s.name,
      data.observedAt,
      data.windKmh,
      data.gustKmh,
      data.windDir,
      data.temperatureC,
      data.pressureHpa,
      s.lat,
      s.lon,
      s.elevationM,
      SOURCE
    )
    .run();

  return result.meta?.changes || 0;
}

async function collect(env) {
  let saved = 0;
  const results = [];

  let meteo = null;
  if (env.XPANDER_AUTH) {
    try {
      meteo = await fetchXpander(env);
    } catch (e) {
      results.push({ upstream: UPSTREAM, error: String(e?.message || e), fallback: "legacy" });
    }
  }

  for (const station of STATIONS) {
    try {
      const data = meteo ? fromXpander(station, meteo) : await getStation(station);

      if (data.status === "offline") {
        results.push({
          station: station.id,
          sourceId: station.sourceId,
          name: station.name,
          status: "offline",
          offlineReason: data.offlineReason,
          saved: 0
        });
        continue;
      }

      const changes = await saveStation(env, data);
      saved += changes;

      results.push({
        station: station.id,
        sourceId: station.sourceId,
        name: station.name,
        status: "online",
        time: data.time,
        observedAt: data.observedAt,
        observedAtIso: new Date(data.observedAt).toISOString(),
        saved: changes,
        windKmh: data.windKmh,
        gustKmh: data.gustKmh,
        windDir: data.windDir,
        temperatureC: data.temperatureC,
        pressureHpa: data.pressureHpa,
        humidityPct: data.humidityPct ?? null
      });
    } catch (e) {
      results.push({
        station: station.id,
        sourceId: station.sourceId,
        name: station.name,
        saved: 0,
        error: String(e?.message || e)
      });
    }
  }

  return {
    ok: true,
    source: SOURCE,
    upstream: meteo ? UPSTREAM : "legacy-paragliding-romania",
    stationsConfigured: STATIONS.length,
    saved,
    results
  };
}

/*
 * Current station values are read directly from Paragliding România.
 * This endpoint intentionally does not query D1.
 */
async function stations(env) {
  const rows = [];

  if (env.XPANDER_AUTH) {
    try {
      const meteo = await fetchXpander(env);

      for (const station of STATIONS) {
        const data = fromXpander(station, meteo);
        const offline = data.status === "offline";

        rows.push({
          station_id: station.id,
          station_name: station.name,
          observed_at: offline ? null : data.observedAt,
          wind_kmh: offline ? null : data.windKmh,
          wind_dir: offline ? null : data.windDir,
          temperature_c: offline ? null : data.temperatureC,
          pressure_hpa: offline ? null : data.pressureHpa,
          humidity_pct: offline ? null : data.humidityPct,
          latitude: station.lat,
          longitude: station.lon,
          elevation_m: station.elevationM,
          gust_kmh: offline ? null : data.gustKmh,
          source: SOURCE,
          upstream: UPSTREAM,
          weather_status: offline ? "offline" : "ok",
          offline_reason: offline ? data.offlineReason : null,
          age_seconds: offline ? null : data.age
        });
      }

      return {
        ok: true,
        source: SOURCE,
        upstream: UPSTREAM,
        zeroWindWindowHours: ZERO_WIND_HOURS,
        liveSource: true,
        d1Read: false,
        stations: rows
      };
    } catch (e) {
      console.warn("Xpander unavailable, using legacy source", String(e?.message || e));
    }
  }

  for (const station of STATIONS) {
    try {
      const data = await getStation(station);
      rows.push({
        station_id: station.id,
        station_name: station.name,
        observed_at: data.observedAt,
        wind_kmh: data.windKmh,
        wind_dir: data.windDir,
        temperature_c: data.temperatureC,
        pressure_hpa: data.pressureHpa,
        latitude: station.lat,
        longitude: station.lon,
        elevation_m: station.elevationM,
        gust_kmh: data.gustKmh,
        source: SOURCE,
        upstream: "legacy-paragliding-romania",
        weather_status: "ok",
        offline_reason: null
      });
    } catch (e) {
      // Legacy source cannot reliably enumerate offline stations.
    }
  }

  return {
    ok: true,
    source: SOURCE,
    upstream: "legacy-paragliding-romania",
    zeroWindWindowHours: ZERO_WIND_HOURS,
    liveSource: true,
    d1Read: false,
    stations: rows
  };
}

async function history(env, stationId, hours = 4) {
  hours = Math.max(1, Math.min(Number(hours) || 4, 168));
  const since = Date.now() - hours * 3600000;

  const q = await env.DB.prepare(`
    SELECT *
    FROM weather_history
    WHERE station_id = ?
      AND source = ?
      AND observed_at >= ?
    ORDER BY observed_at ASC
  `)
    .bind(stationId, SOURCE, since)
    .all();

  return {
    ok: true,
    station: stationId,
    hours,
    history: q.results || []
  };
}

async function status(env) {
  const row = await env.DB.prepare(`
    SELECT MAX(observed_at) AS last_observed
    FROM weather_history
    WHERE source = ?
  `).bind(SOURCE).first();

  const countRow = await env.DB.prepare(`
    SELECT COUNT(DISTINCT station_id) AS station_count
    FROM weather_history
    WHERE source = ?
  `).bind(SOURCE).first();

  return {
    ok: true,
    source: SOURCE,
    stationsConfigured: STATIONS.length,
    stationsInDatabase: countRow?.station_count || 0,
    lastObserved: row?.last_observed || null,
    lastObservedIso: row?.last_observed
      ? new Date(row.last_observed).toISOString()
      : null
  };
}

function configuredStations() {
  return {
    ok: true,
    count: STATIONS.length,
    stations: STATIONS.map(s => ({
      id: s.id,
      sourceId: s.sourceId,
      name: s.name,
      latitude: s.lat,
      longitude: s.lon,
      elevationM: s.elevationM
    }))
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/collect") {
        return json(await collect(env));
      }

      if (url.pathname === "/stations") {
        return json(await stations(env));
      }

      if (url.pathname === "/configured") {
        return json(configuredStations());
      }

      if (url.pathname === "/history") {
        const station = url.searchParams.get("station") || "pg-lempes";
        const hours = url.searchParams.get("hours") || 4;
        return json(await history(env, station, hours));
      }

      if (url.pathname === "/status") {
        return json(await status(env));
      }

      return json({
        ok: true,
        service: "CTR Brasov Paragliding Romania weather",
        source: SOURCE,
        stationsConfigured: STATIONS.length,
        zeroWindWindowHours: ZERO_WIND_HOURS,
        endpoints: [
          "/collect",
          "/stations",
          "/configured",
          "/history?station=pg-lempes",
          "/history?station=pg-bunloc",
          "/history?station=pg-postavaru",
          "/history?station=pg-lempes&hours=24",
          "/status"
        ]
      });
    } catch (e) {
      return json({
        ok: false,
        error: String(e?.message || e)
      }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(collect(env));
  }
};
