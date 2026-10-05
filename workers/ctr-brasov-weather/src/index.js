const ANM_URL =
  "https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii";

const CENTER = { lat: 45.6579, lon: 25.6012 };
const RADIUS_KM = 75;

const DIRECTIONS = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSV: 202.5,
  SV: 225,
  VSV: 247.5,
  V: 270,
  VNV: 292.5,
  NV: 315,
  NNV: 337.5,
};

function mercatorToWgs84(x, y) {
  const lon = (Number(x) * 180) / 20037508.34;

  const lat =
    ((2 * Math.atan(Math.exp(Number(y) / 6378137)) - Math.PI / 2) *
      180) /
    Math.PI;

  return [lat, lon];
}

function haversine(lat1, lon1, lat2, lon2) {
  const r = (x) => (x * Math.PI) / 180;
  const R = 6371;

  const dLat = r(lat2 - lat1);
  const dLon = r(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) *
      Math.cos(r(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function numberFromText(v) {
  if (v == null) return null;

  const m = String(v).match(/[-+]?\d+(?:[.,]\d+)?/);

  if (!m) return null;

  const n = Number(m[0].replace(",", "."));

  return Number.isFinite(n) ? n : null;
}

function parseWind(v) {
  if (!v || String(v).trim().toLowerCase() === "indisponibil") {
    return [null, null];
  }

  const m = String(v).match(
    /([-+]?\d+(?:[.,]\d+)?)\s*m\/s.*?:\s*([A-Z]+)/i
  );

  if (!m) return [null, null];

  const ms = Number(m[1].replace(",", "."));
  const dir = DIRECTIONS[m[2].toUpperCase()];

  return [
    Number.isFinite(ms) ? ms : null,
    Number.isFinite(dir) ? dir : null,
  ];
}

async function collect(env) {
  const response = await fetch(ANM_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ctr-brasov-weather/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`ANM HTTP ${response.status}`);
  }

  const data = await response.json();

  const observedAt = Date.parse(data.date);

  if (!Number.isFinite(observedAt)) {
    throw new Error("Invalid ANM dataset timestamp");
  }

  let saved = 0;

  for (const feature of data.features || []) {
    const props = feature.properties || {};
    const geometry = feature.geometry || {};
    const coords = geometry.coordinates || [];

    const name = String(props.nume || "").trim();

    if (!name || coords.length < 2) continue;

    const [lat, lon] = mercatorToWgs84(coords[0], coords[1]);

    const distanceKm = haversine(
      CENTER.lat,
      CENTER.lon,
      lat,
      lon
    );

    if (distanceKm > RADIUS_KM) continue;

    const [windMs, windDir] = parseWind(props.vant);

    if (windMs == null || windDir == null) continue;

    const stationId = "anm-" + slug(name);

    const windKmh = Math.round(windMs * 3.6 * 10) / 10;
    const temperatureC = numberFromText(props.tempe);
    const pressureHpa = numberFromText(props.presiunetext);

    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO weather_history
      (
        station_id,
        station_name,
        observed_at,
        wind_kmh,
        wind_dir,
        temperature_c,
        pressure_hpa,
        latitude,
        longitude,
        elevation_m
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        stationId,
        name,
        observedAt,
        windKmh,
        windDir,
        temperatureC,
        pressureHpa,
        lat,
        lon,
        null
      )
      .run();

    if (result.meta?.changes > 0) {
      saved++;
    }
  }

  return {
    ok: true,
    datasetAt: data.date,
    saved,
  };
}

async function history(env, stationId, hours = 4) {
  const cutoff = Date.now() - hours * 3600 * 1000;

  const result = await env.DB.prepare(`
    SELECT
      station_id,
      station_name,
      observed_at,
      wind_kmh,
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

async function latestObservedAt(env) {
  const row = await env.DB.prepare(`
    SELECT MAX(observed_at) AS last_observed
    FROM weather_history
    WHERE station_id LIKE 'anm-%'
  `).first();

  const value = Number(row?.last_observed);

  return Number.isFinite(value) ? value : null;
}

async function cleanupOldWeather(env) {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;

  await env.DB.prepare(`
    DELETE FROM weather_history
    WHERE observed_at < ?
  `)
    .bind(cutoff)
    .run();
}

async function scheduledCollect(event, env) {
  const now = new Date(event.scheduledTime || Date.now());

  // Curățare o singură dată pe zi, la 03:10 UTC.
  if (
    now.getUTCHours() === 3 &&
    now.getUTCMinutes() === 10
  ) {
    await cleanupOldWeather(env);
  }

  // La minutul 00 nu verificăm ANM.
  // Prima verificare este la HH:01.
  if (now.getUTCMinutes() === 0) {
    return;
  }

  const lastObserved = await latestObservedAt(env);

  // Dacă avem deja observația ANM pentru ora curentă,
  // nu mai interogăm ANM până în ora următoare.
  if (
    lastObserved !== null &&
    Math.floor(lastObserved / 3600000) ===
      Math.floor(now.getTime() / 3600000)
  ) {
    return;
  }

  // Nu avem încă observația pentru ora curentă.
  // Verificăm ANM. Dacă nu s-a actualizat încă,
  // cron-ul de peste un minut încearcă din nou.
  await collect(env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }

    if (url.pathname === "/collect") {
      try {
        const result = await collect(env);

        return new Response(
          JSON.stringify(result),
          { headers }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: String(e),
          }),
          {
            status: 500,
            headers,
          }
        );
      }
    }

    if (url.pathname === "/history") {
      const stationId = url.searchParams.get("station");

      if (!stationId) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Missing station parameter",
          }),
          {
            status: 400,
            headers,
          }
        );
      }

      const rows = await history(env, stationId, 4);

      return new Response(
        JSON.stringify({
          ok: true,
          station: stationId,
          history: rows,
        }),
        { headers }
      );
    }
if (url.pathname === "/stations") {
  const result = await env.DB.prepare(`
    SELECT
      w.station_id,
      w.station_name,
      w.observed_at,
      w.wind_kmh,
      w.wind_dir,
      w.temperature_c,
      w.pressure_hpa,
      w.latitude,
      w.longitude,
      w.elevation_m
    FROM weather_history w
    INNER JOIN (
      SELECT
        station_id,
        MAX(observed_at) AS max_observed
      FROM weather_history
      WHERE station_id LIKE 'anm-%'
      GROUP BY station_id
    ) latest
      ON w.station_id = latest.station_id
     AND w.observed_at = latest.max_observed
    WHERE w.station_id LIKE 'anm-%'
    ORDER BY w.station_name
  `).all();

  return new Response(
    JSON.stringify({
      ok: true,
      stations: result.results || [],
    }),
    { headers }
  );
}
    if (url.pathname === "/status") {
      const lastObserved = await latestObservedAt(env);

      return new Response(
        JSON.stringify({
          ok: true,
          lastObserved,
          lastObservedIso:
            lastObserved !== null
              ? new Date(lastObserved).toISOString()
              : null,
          retentionDays: 7,
        }),
        { headers }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        service: "CTR Brasov Weather",
        endpoints: [
          "/collect",
          "/history?station=anm-varful-omu",
          "/status",
          "/stations",
        ],
      }),
      { headers }
    );
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      scheduledCollect(event, env)
    );
  },
};
