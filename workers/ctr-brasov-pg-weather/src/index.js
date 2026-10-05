const BASE = "https://meteo.paragliding-romania.ro";
const SOURCE = "Paragliding România";
const ZERO_WIND_HOURS = 4;
const STALE_HOURS = 2;

const STATIONS = [
  { sourceId: 1,  id: "pg-sie",                  name: "Sie, HR",                    lat: 46.5788, lon: 25.9777, elevationM: 1051 },
  { sourceId: 2,  id: "pg-sacele",               name: "Sacele, BV",                 lat: 45.6220, lon: 25.6910, elevationM: 640 },
  { sourceId: 3,  id: "pg-postavaru",            name: "Vf. Postavaru",              lat: 45.5682, lon: 25.5668, elevationM: 1690 },
  { sourceId: 4,  id: "pg-ignis",                name: "Vf. Ignis, MM",              lat: 47.7321, lon: 23.6731, elevationM: 1307 },
  { sourceId: 5,  id: "pg-ozun",                 name: "Ozun, CV",                   lat: 45.7994, lon: 25.9019, elevationM: 760 },
  { sourceId: 7,  id: "pg-magura-uroiului",      name: "Magura Uroiului, HD",        lat: 45.8607, lon: 23.0444, elevationM: 360 },
  { sourceId: 8,  id: "pg-saua-magurii",         name: "Saua Magurii, BV",           lat: 45.5259, lon: 25.3204, elevationM: 1238 },
  { sourceId: 10, id: "pg-birdshouse-parang",    name: "BIRDSHOUSE Parang, HD",      lat: 45.3892, lon: 23.4598, elevationM: 1508 },
  { sourceId: 11, id: "pg-bunloc",               name: "Bunloc, BV",                 lat: 45.5889, lon: 25.6649, elevationM: 1171 },
  { sourceId: 12, id: "pg-gropsoarele",          name: "Vf. Gropsoarele, PH",        lat: 45.2924, lon: 25.5830, elevationM: 1810 },
  { sourceId: 14, id: "pg-piatra-mare",          name: "Piatra Mare",                lat: 0,       lon: 0,       elevationM: 0 },
  { sourceId: 15, id: "pg-lempes",               name: "Lempes",                     lat: 45.7148, lon: 25.6527, elevationM: 704 },
  { sourceId: 20, id: "pg-moeciu-de-sus",        name: "Moeciu de Sus",              lat: 45.4662, lon: 25.3780, elevationM: 1150 },
  { sourceId: 21, id: "pg-aerodrom-onesti",      name: "Aerodrom Onesti",            lat: 46.2985, lon: 26.7540, elevationM: 203 },
  { sourceId: 22, id: "pg-aerodrom-piatra-craiului", name: "Aerodrom Piatra Craiului", lat: 45.5645, lon: 25.3987, elevationM: 851 },
];

function cleanHtml(s) {
  return String(s ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&deg;/gi, "°")
    .replace(/&ndash;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      Accept: "text/html, text/plain, */*",
      "User-Agent": "CTR-Brasov-Meteo/1.0",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.text();
}

function num(v) {
  if (v == null) return null;
  const m = String(v).replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function timeFromText(text) {
  const m = String(text || "").match(/\b([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)\b/);
  return m ? `${m[1].padStart(2,"0")}:${m[2]}:${m[3]}` : null;
}

function localTimestamp(timeText) {
  if (!timeText || timeText === "00:00:00") return null;

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);

  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const [hh, mm, ss] = timeText.split(":").map(Number);

  // Determine Bucharest UTC offset for today using Intl.
  const probe = new Date(Date.UTC(+obj.year, +obj.month - 1, +obj.day, hh, mm, ss));
  const tzParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(probe);
  const z = Object.fromEntries(tzParts.map(p => [p.type, p.value]));
  const localAsUtc = Date.UTC(+z.year, +z.month - 1, +z.day, +z.hour, +z.minute, +z.second);
  const offsetMs = localAsUtc - probe.getTime();

  let t = Date.UTC(+obj.year, +obj.month - 1, +obj.day, hh, mm, ss) - offsetMs;

  // Around midnight the station may still report yesterday's final observation.
  if (t > Date.now() + 30 * 60 * 1000) t -= 24 * 3600 * 1000;
  return t;
}

function parseWind(text) {
  const s = cleanHtml(text);
  const time = timeFromText(s);

  let windKmh = null, gustKmh = null, dir = null;

  const speed = s.match(/(?:wind|v(?:i|î)nt|viteza)[^\d-]*([-+]?\d+(?:[.,]\d+)?)/i);
  const gust = s.match(/(?:gust|rafal)[^\d-]*([-+]?\d+(?:[.,]\d+)?)/i);
  const degree = s.match(/(?:dir(?:ection)?|direc(?:t|ț)ia)[^\d-]*(\d{1,3})(?:\s*°)?/i);

  if (speed) windKmh = num(speed[1]);
  if (gust) gustKmh = num(gust[1]);
  if (degree) dir = num(degree[1]);

  // Fallback for compact endpoint responses.
  const numbers = [...s.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)].map(m => num(m[0])).filter(Number.isFinite);
  if (windKmh == null && numbers.length) windKmh = numbers[0];
  if (gustKmh == null && numbers.length > 1) gustKmh = numbers[1];
  if (dir == null) {
    const deg = s.match(/\b(\d{1,3})\s*°/);
    if (deg) dir = num(deg[1]);
  }

  return { time, windKmh, gustKmh, dir };
}

function parseTemperature(text) {
  const s = cleanHtml(text);
  const m = s.match(/[-+]?\d+(?:[.,]\d+)?\s*°?\s*C/i);
  return m ? num(m[0]) : num(s);
}

function parsePressure(text) {
  const s = cleanHtml(text);
  const m = s.match(/\d{3,4}(?:[.,]\d+)?\s*(?:hpa|mb)/i);
  return m ? num(m[0]) : num(s);
}

async function getStation(station) {
  const q = "?station_id=" + encodeURIComponent(station.sourceId);

  // Keep this to 3 upstream requests per station.
  const [windRaw, tempRaw, pressureRaw] = await Promise.all([
    fetchText(BASE + "/windspeeddirection.php" + q),
    fetchText(BASE + "/temperature.php" + q),
    fetchText(BASE + "/barometer.php" + q),
  ]);

  const wind = parseWind(windRaw);
  const observedAt = localTimestamp(wind.time);

  return {
    station_id: station.id,
    station_name: station.name,
    observed_at: observedAt,
    wind_kmh: wind.windKmh,
    gust_kmh: wind.gustKmh,
    wind_dir: wind.dir,
    temperature_c: parseTemperature(tempRaw),
    pressure_hpa: parsePressure(pressureRaw),
    latitude: station.lat,
    longitude: station.lon,
    elevation_m: station.elevationM,
    source: SOURCE,
    _time: wind.time,
  };
}

async function saveStation(env, row) {
  if (!Number.isFinite(+row.observed_at)) return 0;

  const r = await env.DB.prepare(`
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
      elevation_m
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      row.station_id,
      row.station_name,
      row.observed_at,
      row.wind_kmh,
      row.gust_kmh,
      row.wind_dir,
      row.temperature_c,
      row.pressure_hpa,
      row.latitude,
      row.longitude,
      row.elevation_m
    )
    .run();

  return r.meta?.changes || 0;
}

async function collect(env) {
  let saved = 0;
  const results = [];

  // Sequential collection keeps upstream/subrequest behaviour predictable.
  for (const station of STATIONS) {
    try {
      const row = await getStation(station);
      const changed = await saveStation(env, row);
      saved += changed;
      results.push({ station: station.id, ok: true, saved: changed, observed_at: row.observed_at });
    } catch (e) {
      results.push({ station: station.id, ok: false, error: String(e) });
    }
  }

  return { ok: true, source: SOURCE, saved, results };
}

async function liveStations() {
  const stations = [];

  // IMPORTANT: this endpoint does not read D1.
  // Values shown on the map come directly from Paragliding România.
  for (const station of STATIONS) {
    try {
      const row = await getStation(station);

      const ageMs = Number.isFinite(+row.observed_at) ? Date.now() - +row.observed_at : Infinity;
      const stale = ageMs > STALE_HOURS * 3600 * 1000 || row._time === "00:00:00";

      stations.push({
        ...row,
        wind_kmh: stale ? "-" : row.wind_kmh,
        gust_kmh: stale ? "-" : row.gust_kmh,
        wind_dir: stale ? "-" : row.wind_dir,
      });
    } catch (e) {
      stations.push({
        station_id: station.id,
        station_name: station.name,
        observed_at: null,
        wind_kmh: "-",
        gust_kmh: "-",
        wind_dir: "-",
        temperature_c: null,
        pressure_hpa: null,
        latitude: station.lat,
        longitude: station.lon,
        elevation_m: station.elevationM,
        source: SOURCE,
        error: String(e),
      });
    }
  }

  return stations;
}

async function history(env, stationId, hours = 4) {
  const safeHours = Math.max(1, Math.min(168, Number(hours) || 4));
  const cutoff = Date.now() - safeHours * 3600 * 1000;

  const result = await env.DB.prepare(`
    SELECT
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
      elevation_m
    FROM weather_history
    WHERE station_id = ?
      AND observed_at >= ?
    ORDER BY observed_at ASC
  `)
    .bind(stationId, cutoff)
    .all();

  return result.results || [];
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }

    if (url.pathname === "/stations") {
      try {
        return json({ ok: true, source: SOURCE, stations: await liveStations() });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }

    if (url.pathname === "/history") {
      const stationId = url.searchParams.get("station");
      if (!stationId) return json({ ok: false, error: "Missing station parameter" }, 400);

      try {
        const hours = url.searchParams.get("hours") || 4;
        return json({
          ok: true,
          station: stationId,
          history: await history(env, stationId, hours),
        });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }

    if (url.pathname === "/collect") {
      try {
        return json(await collect(env));
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }

    if (url.pathname === "/status") {
      return json({
        ok: true,
        service: "CTR Brasov PG Weather",
        source: SOURCE,
        stations: STATIONS.length,
        liveStationsReadsD1: false,
        historyReadsD1: true,
        cronWritesD1: true,
        historyHoursDefault: 4,
        zeroWindWindowHours: ZERO_WIND_HOURS,
      });
    }

    return json({
      ok: true,
      service: "CTR Brasov PG Weather",
      endpoints: [
        "/stations",
        "/collect",
        "/history?station=pg-bunloc",
        "/status",
      ],
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(collect(env));
  },
};
