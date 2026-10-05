const NOTAM_URL =

  "https://flightplan.romatsa.ro/init/notam/getnotamlist?twr=LRBV";



const RESTRICTIONS_URL =

  "https://flightplan.romatsa.ro/init/notam/restrictiiro";



const CENTER = [45.6579, 25.6012];

const RADIUS_KM = 75;

const MAX_FT = 10000;



const AREAS = {

  AZLR1: {

    fl: "090",

    lower: "GND",

    upper: "FL090",

    coord:

      "452037N0253658E-452736N0252223E-453843N0253754E-453221N0254805E"

  },



  AZLR2: {

    fl: "060",

    lower: "GND",

    upper: "FL060",

    coord:

      "453843N0253754E-454233N0254914E-453953N0255514E-453221N0254805E"

  },



  AZLR3: {

    fl: "050",

    lower: "GND",

    upper: "FL050",

    coord:

      "454233N0254914E-453953N0255514E-454710N0260208E-454728N0255306E"

  }

};





/* =========================================================
   BASIC
   ========================================================= */



function json(data, status = 200) {

  return new Response(

    JSON.stringify(data, null, 2),

    {

      status,

      headers: {

        "Content-Type":

          "application/json; charset=utf-8",



        "Access-Control-Allow-Origin":

          "*",



        "Cache-Control":

          "no-store"

      }

    }

  );

}





function cleanHtml(html) {

  return String(html || "")

    .replace(/<script[\s\S]*?<\/script>/gi, " ")

    .replace(/<style[\s\S]*?<\/style>/gi, " ")

    .replace(/&nbsp;/gi, " ")

    .replace(/&amp;/gi, "&")

    .replace(/&quot;/gi, '"')

    .replace(/&#39;/gi, "'")

    .replace(/&lt;/gi, "<")

    .replace(/&gt;/gi, ">")

    .replace(/<[^>]+>/g, " ")

    .replace(/\s+/g, " ")

    .trim();

}





async function fetchText(url) {



  const r =

    await fetch(

      url,

      {

        headers: {

          "User-Agent":

            "Mozilla/5.0 ctr-brasov-notam/2.1",



          "Accept":

            "text/html,*/*"

        },



        cf: {

          cacheTtl: 0,

          cacheEverything: false

        }

      }

    );





  if (!r.ok) {

    throw new Error(

      `${url} -> HTTP ${r.status}`

    );

  }





  return await r.text();

}





/* =========================================================

   TIME

   ========================================================= */



function bucharestParts(

  date = new Date()

) {



  return Object.fromEntries(



    new Intl.DateTimeFormat(

      "en-CA",

      {

        timeZone:

          "Europe/Bucharest",



        year:

          "numeric",



        month:

          "2-digit",



        day:

          "2-digit",



        hour:

          "2-digit",



        minute:

          "2-digit",



        second:

          "2-digit",



        hourCycle:

          "h23"

      }

    )



      .formatToParts(date)



      .map(

        x => [

          x.type,

          x.value

        ]

      )

  );

}





function bucharestLocalToUtc(

  year,

  month,

  day,

  hour,

  minute = 0,

  second = 0

) {



  const tentative =

    Date.UTC(

      year,

      month - 1,

      day,

      hour,

      minute,

      second

    );





  const formatter =

    new Intl.DateTimeFormat(

      "en-CA",

      {

        timeZone:

          "Europe/Bucharest",



        year:

          "numeric",



        month:

          "2-digit",



        day:

          "2-digit",



        hour:

          "2-digit",



        minute:

          "2-digit",



        second:

          "2-digit",



        hourCycle:

          "h23"

      }

    );





  const wanted =

    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ` +

    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;





  for (

    const offsetHours

    of [2, 3]

  ) {



    const candidate =

      tentative -

      offsetHours *

      3600000;





    const p =

      Object.fromEntries(



        formatter



          .formatToParts(

            new Date(candidate)

          )



          .map(

            x => [

              x.type,

              x.value

            ]

          )

      );





    const got =

      `${p.year}-${p.month}-${p.day} ` +

      `${p.hour}:${p.minute}:${p.second}`;





    if (

      got === wanted

    ) {

      return new Date(

        candidate

      );

    }

  }





  return new Date(

    tentative

  );

}





function selectedLocalDay(

  mode

) {



  const p =

    bucharestParts();





  let d =

    bucharestLocalToUtc(

      Number(p.year),

      Number(p.month),

      Number(p.day),

      12

    );





  if (

    mode === "tomorrow"

  ) {



    d =

      new Date(

        d.getTime() +

        86400000

      );

  }





  const q =

    bucharestParts(d);





  return {

    year:

      Number(q.year),



    month:

      Number(q.month),



    day:

      Number(q.day)

  };

}





/* =========================================================

   NOTAM DATE

   ========================================================= */



function notamDate(s) {



  if (

    !/^\d{10}$/.test(

      s || ""

    )

  ) {

    return null;

  }





  return new Date(

    Date.UTC(



      2000 +

      Number(

        s.slice(0, 2)

      ),



      Number(

        s.slice(2, 4)

      ) - 1,



      Number(

        s.slice(4, 6)

      ),



      Number(

        s.slice(6, 8)

      ),



      Number(

        s.slice(8, 10)

      )

    )

  );

}





/* =========================================================

   COORDINATES

   ========================================================= */



function coord(s) {



  const m =

    String(s || "")

      .match(

        /^(\d{2})(\d{2})(\d{2})([NS])(\d{3})(\d{2})(\d{2})([EW])$/

      );





  if (!m) {

    return null;

  }





  let lat =

    Number(m[1]) +

    Number(m[2]) / 60 +

    Number(m[3]) / 3600;





  let lon =

    Number(m[5]) +

    Number(m[6]) / 60 +

    Number(m[7]) / 3600;





  if (

    m[4] === "S"

  ) {

    lat = -lat;

  }





  if (

    m[8] === "W"

  ) {

    lon = -lon;

  }





  return [

    lat,

    lon

  ];

}





/* =========================================================

   DISTANCE

   ========================================================= */



function rad(x) {

  return (

    x *

    Math.PI /

    180

  );

}





function hav(

  lat1,

  lon1,

  lat2,

  lon2

) {



  const R =

    6371;





  const a =

    rad(

      lat2 -

      lat1

    );





  const b =

    rad(

      lon2 -

      lon1

    );





  const h =



    Math.sin(

      a / 2

    ) ** 2 +



    Math.cos(

      rad(lat1)

    ) *



    Math.cos(

      rad(lat2)

    ) *



    Math.sin(

      b / 2

    ) ** 2;





  return (

    2 *

    R *

    Math.asin(

      Math.sqrt(h)

    )

  );

}





/* =========================================================

   LIMITS

   ========================================================= */



function cleanLimit(value) {



  return String(

    value ||

    ""

  )



    .replace(

      /\)\s*From:.*$/i,

      ""

    )



    .replace(

      /\)\s*$/g,

      ""

    )



    .trim();

}





function valFt(s) {



  if (!s) {

    return null;

  }





  s =

    String(s)

      .trim()

      .toUpperCase();





  if (

    s === "GND" ||

    s === "SFC"

  ) {

    return 0;

  }





  let m =

    s.match(

      /FL\s*(\d{2,3})/

    );





  if (m) {

    return (

      Number(

        m[1]

      ) *

      100

    );

  }





  m =

    s.match(

      /(\d+)\s*FT/

    );





  if (m) {

    return Number(

      m[1]

    );

  }





  if (

    s.includes("UNL")

  ) {

    return 999999;

  }





  return null;

}





/* =========================================================

   AZLR DUPLICATE FILTER

   ========================================================= */



function isAzlrRestriction(

  description

) {



  const text =

    String(

      description ||

      ""

    )



      .replace(

        /\s+/g,

        ""

      )



      .toUpperCase();





  return Object.values(

    AREAS

  ).some(

    area => {



      const points =

        area.coord



          .split("-")



          .map(

            x =>

              x.toUpperCase()

          );





      return points.every(

        p =>

          text.includes(p)

      );

    }

  );

}





/* =========================================================

   SUNSET BRAȘOV

   ========================================================= */



function sunsetUtc(

  year,

  month,

  day

) {



  const jan1 =

    Date.UTC(

      year,

      0,

      1

    );





  const thisDay =

    Date.UTC(

      year,

      month - 1,

      day

    );





  const n =

    Math.floor(

      (

        thisDay -

        jan1

      ) /

      86400000

    ) + 1;





  const lat =

    CENTER[0];



  const lon =

    CENTER[1];





  const lngHour =

    lon / 15;





  const t =

    n +

    (

      18 -

      lngHour

    ) /

    24;





  const M =

    0.9856 *

    t -

    3.289;





  let L =

    M +



    1.916 *

    Math.sin(

      rad(M)

    ) +



    0.020 *

    Math.sin(

      rad(

        2 * M

      )

    ) +



    282.634;





  L =

    (

      L %

      360 +

      360

    ) %

    360;





  let RA =

    Math.atan(

      0.91764 *

      Math.tan(

        rad(L)

      )

    ) *

    180 /

    Math.PI;





  RA =

    (

      RA %

      360 +

      360

    ) %

    360;





  RA +=

    Math.floor(

      L / 90

    ) *

    90 -



    Math.floor(

      RA / 90

    ) *

    90;





  RA /=

    15;





  const sinDec =

    0.39782 *

    Math.sin(

      rad(L)

    );





  const cosDec =

    Math.cos(

      Math.asin(

        sinDec

      )

    );





  const cosH =

    (

      Math.cos(

        rad(90.833)

      ) -



      sinDec *

      Math.sin(

        rad(lat)

      )

    ) /



    (

      cosDec *

      Math.cos(

        rad(lat)

      )

    );





  if (

    cosH < -1 ||

    cosH > 1

  ) {



    return bucharestLocalToUtc(

      year,

      month,

      day,

      19

    );

  }





  const H =

    Math.acos(

      cosH

    ) *

    180 /

    Math.PI /

    15;





  const T =

    H +

    RA -

    0.06571 *

    t -

    6.622;





  let UT =

    T -

    lngHour;





  UT =

    (

      UT %

      24 +

      24

    ) %

    24;





  const hour =

    Math.floor(

      UT

    );





  const minute =

    Math.round(

      (

        UT -

        hour

      ) *

      60

    );





  return new Date(

    Date.UTC(

      year,

      month - 1,

      day,

      hour,

      minute

    )

  );

}





/* =========================================================

   D) SCHEDULE

   ========================================================= */



function scheduleOverlaps(

  dfield,

  year,

  month,

  day,

  winStart,

  winEnd

) {



  if (!dfield) {

    return true;

  }





  const pairs =

    [

      ...String(

        dfield

      )

        .matchAll(

          /(?<!\d)(\d{4})-(\d{4})(?!\d)/g

        )

    ];





  if (

    !pairs.length

  ) {

    return true;

  }





  for (

    const pair

    of pairs

  ) {



    const a =

      pair[1];



    const b =

      pair[2];





    const sh =

      Number(

        a.slice(

          0,

          2

        )

      );



    const sm =

      Number(

        a.slice(

          2,

          4

        )

      );



    const eh =

      Number(

        b.slice(

          0,

          2

        )

      );



    const em =

      Number(

        b.slice(

          2,

          4

        )

      );





    const start =

      new Date(

        Date.UTC(

          year,

          month - 1,

          day,

          sh,

          sm

        )

      );





    let end =

      new Date(

        Date.UTC(

          year,

          month - 1,

          day,

          eh,

          em

        )

      );





    if (

      end <= start

    ) {



      end =

        new Date(

          end.getTime() +

          86400000

        );

    }





    if (

      start < winEnd &&

      end > winStart

    ) {

      return true;

    }

  }





  return false;

}





/* =========================================================

   AZLR NOTAMS

   ========================================================= */



function parseNotams(

  html,

  dayMode = "today"

) {



  const text =

    cleanHtml(

      html

    );





  const zones = {};



  const now =

    new Date();





  const localDay =

    selectedLocalDay(

      dayMode

    );





  const dayStart =

    bucharestLocalToUtc(

      localDay.year,

      localDay.month,

      localDay.day,

      0

    );





  const dayEnd =

    bucharestLocalToUtc(

      localDay.year,

      localDay.month,

      localDay.day,

      23,

      59,

      59

    );





  for (

    const [

      zone,

      area

    ]

    of Object.entries(

      AREAS

    )

  ) {



    const hits = [];





    const re =

      /([A-Z]\d{4}\/(?:\d{2}|20\d{2}))[\s\S]*?(?=(?:[A-Z]\d{4}\/(?:\d{2}|20\d{2}))|$)/g;





    for (

      const match

      of text.matchAll(re)

    ) {



      const block =

        match[0];





      const notam =

        match[1];





      if (

        !block.includes(

          "GLD FLT"

        )

      ) {

        continue;

      }





      if (

        !block.includes(

          area.coord

        )

      ) {

        continue;

      }





      const flRe =

        new RegExp(

          `G\\)\\s*FL${area.fl}\\b`

        );





      if (

        !flRe.test(

          block

        )

      ) {

        continue;

      }





      const from =

        block.match(

          /B\)\s*(\d{10})/

        )?.[1] ||

        null;





      const to =

        block.match(

          /C\)\s*(\d{10})/

        )?.[1] ||

        null;





      const fromDate =

        notamDate(

          from

        );





      const toDate =

        notamDate(

          to

        );





      const active =

        !!(

          fromDate &&

          toDate &&

          now >= fromDate &&

          now <= toDate

        );





      const selectedDay =

        !!(

          fromDate &&

          toDate &&

          fromDate <= dayEnd &&

          toDate >= dayStart

        );





      if (

        dayMode ===

        "tomorrow" &&

        !selectedDay

      ) {

        continue;

      }





      hits.push({

        notam,

        from,

        to,



        fromIso:

          fromDate

            ? fromDate.toISOString()

            : null,



        toIso:

          toDate

            ? toDate.toISOString()

            : null,



        active

      });

    }





    hits.sort(

      (a, b) =>



        (

          notamDate(

            a.from

          )?.getTime() ||

          0

        )



        -



        (

          notamDate(

            b.from

          )?.getTime() ||

          0

        )

    );





    let selected =

      null;





    if (

      dayMode ===

      "today"

    ) {



      selected =

        hits.find(

          x => x.active

        ) ||

        null;



    } else {



      selected =

        hits[0] ||

        null;

    }





    zones[zone] = {



      notam:

        selected?.notam ||

        null,



      from:

        selected?.from ||

        null,



      to:

        selected?.to ||

        null,



      fromIso:

        selected?.fromIso ||

        null,



      toIso:

        selected?.toIso ||

        null,



      active:

        selected?.active ||

        false,



      lower:

        area.lower,



      upper:

        area.upper,



      matches:

        hits.length,



      activeMatches:

        hits.filter(

          x => x.active

        ).length,



      all:

        hits

    };

  }





  return zones;

}





/* =========================================================

   RESTRICTIONS

   ========================================================= */



function parseRestrictions(

  html,

  dayMode = "today"

) {



  const txt =

    cleanHtml(

      html

    );





  const localDay =

    selectedLocalDay(

      dayMode

    );





  const year =

    localDay.year;



  const month =

    localDay.month;



  const day =

    localDay.day;





  const winStart =

    bucharestLocalToUtc(

      year,

      month,

      day,

      12

    );





  const winEnd =

    sunsetUtc(

      year,

      month,

      day

    );





  const matches =

    [

      ...txt.matchAll(

        /([A-Z]\d{4}\/(?:\d{2}|20\d{2}))\s+NOTAM[NRC]/g

      )

    ];





  const blocks = [];





  for (

    let i = 0;

    i < matches.length;

    i++

  ) {



    const m =

      matches[i];





    const end =

      i + 1 <

      matches.length



        ? matches[

            i + 1

          ].index



        : txt.length;





    blocks.push({

      notam:

        m[1],



      block:

        txt.slice(

          m.index,

          end

        )

    });

  }





  const items = [];



  let skippedGeometry =

    0;





  for (

    const entry

    of blocks

  ) {



    const block =

      entry.block

        .replace(

          /\s+/g,

          " "

        );





    const b =

      block.match(

        /\bB\)\s*(\d{10})/

      );





    const c =

      block.match(

        /\bC\)\s*(\d{10})/

      );





    const d =

      block.match(

        /\bD\)\s*(.*?)(?=\s+[EFGQ]\)|$)/

      );





    const e =

      block.match(

        /\bE\)\s*(.*?)(?=\s+[FGQ]\)|$)/

      );





    const f =

      block.match(

        /\bF\)\s*(.*?)(?=\s+G\)|$)/

      );





    const g =

      block.match(

        /\bG\)\s*(.*?)(?=$|\s+[A-Z]\))/

      );





    const from =

      b?.[1] ||

      null;





    const to =

      c?.[1] ||

      null;





    const start =

      notamDate(

        from

      );





    const end =

      notamDate(

        to

      );





    if (

      start &&

      start >= winEnd

    ) {

      continue;

    }





    if (

      end &&

      end <= winStart

    ) {

      continue;

    }





    const schedule =

      d?.[1]?.trim() ||

      "";





    if (

      !scheduleOverlaps(

        schedule,

        year,

        month,

        day,

        winStart,

        winEnd

      )

    ) {

      continue;

    }





    const lower =

      cleanLimit(

        f?.[1] ||

        ""

      );





    const upper =

      cleanLimit(

        g?.[1] ||

        ""

      );





    const lo =

      valFt(

        lower

      );





    const hi =

      valFt(

        upper

      );





    if (

      lo !== null &&

      lo >= MAX_FT

    ) {

      continue;

    }





    if (

      hi !== null &&

      hi <= 0

    ) {

      continue;

    }





    const description =

      e?.[1]?.trim() ||

      "";





    /*

      AZLR1/2/3 sunt deja

      tratate prin /notams.

    */



    if (

      isAzlrRestriction(

        description

      )

    ) {

      continue;

    }





    const upperDesc =

      description

        .toUpperCase();





    const keywords = [

      "PROHIBITED",

      "RESTRICTED AREA",

      "RESERVED AREA",

      "DANGER AREA",

      "TSA",

      "TRA ",

      "UNMANNED ACFT",

      "UAS",

      "MIL FLT",

      "FIRING",

      "SHOOTING",

      "NAVIGATION WARNING"

    ];





    if (

      !keywords.some(

        k =>

          upperDesc.includes(

            k

          )

      )

    ) {

      continue;

    }





    const severity =

      [

        "PROHIBITED",

        "RESTRICTED AREA",

        "RESERVED AREA",

        "TSA",

        "TRA "

      ].some(

        k =>

          upperDesc.includes(

            k

          )

      )



        ? "red"



        : "orange";





    const coordStrings =

      [

        ...description.matchAll(

          /\d{6}[NS]\d{7}[EW]/g

        )

      ]



        .map(

          m =>

            m[0]

        );





    const coords =

      coordStrings



        .map(

          coord

        )



        .filter(

          Boolean

        );





    let shape =

      null;





    const circle =

      upperDesc.match(

        /CIRCLE.*?COORD(?:INATES?)?\s*(\d{6}[NS]\d{7}[EW]).*?WITH\s*([0-9.]+)\s*(NM|KM)\s+RADIUS/

      );





    if (circle) {



      const center =

        coord(

          circle[1]

        );





      const radiusKm =

        Number(

          circle[2]

        ) *

        (

          circle[3] ===

          "NM"



            ? 1.852



            : 1

        );





      if (

        center &&

        hav(

          CENTER[0],

          CENTER[1],

          center[0],

          center[1]

        ) <=

          RADIUS_KM +

          radiusKm

      ) {



        shape = {

          type:

            "circle",



          center,



          radiusKm

        };

      }



    } else if (

      coords.length >= 3

    ) {



      const poly =

        [];





      for (

        const p

        of coords

      ) {



        const last =

          poly[

            poly.length - 1

          ];





        if (

          !last ||

          last[0] !== p[0] ||

          last[1] !== p[1]

        ) {

          poly.push(

            p

          );

        }

      }





      const minDistance =

        Math.min(

          ...poly.map(

            p =>

              hav(

                CENTER[0],

                CENTER[1],

                p[0],

                p[1]

              )

          )

        );





      if (

        minDistance <=

        RADIUS_KM

      ) {



        shape = {

          type:

            "polygon",



          points:

            poly

        };

      }

    }





    if (!shape) {



      skippedGeometry++;



      continue;

    }





    items.push({



      notam:

        entry.notam,



      from,



      to,



      fromIso:

        start

          ? start.toISOString()

          : null,



      toIso:

        end

          ? end.toISOString()

          : null,



      schedule:

        schedule ||

        null,



      lower:

        lower ||

        null,



      upper:

        upper ||

        null,



      description,



      severity,



      shape

    });

  }





  const sunsetParts =

    bucharestParts(

      winEnd

    );





  return {



    source:

      RESTRICTIONS_URL,



    checkedAt:

      new Date()

        .toISOString(),



    day:

      dayMode,



    date:

      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,



    windowLocal: {

      from:

        "12:00",



      to:

        `${sunsetParts.hour}:${sunsetParts.minute}`

    },



    radiusKm:

      RADIUS_KM,



    maxAltitude:

      "FL100",



    items,



    skippedWithoutExplicitGeometry:

      skippedGeometry

  };

}





/* =========================================================

   D1 CACHE — TODAY + TOMORROW ONLY

   ========================================================= */

async function ensureNotamCacheTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notam_daily_cache (
      day_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

function localDayKey(dayMode = "today") {
  const d = selectedLocalDay(dayMode);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

async function saveDailyCache(env, dayMode, payload) {
  if (!env.DB) return;
  await ensureNotamCacheTable(env);
  const key = localDayKey(dayMode);
  await env.DB.prepare(`
    INSERT INTO notam_daily_cache (day_key, payload_json, checked_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(day_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      checked_at = excluded.checked_at,
      updated_at = excluded.updated_at
  `).bind(
    key,
    JSON.stringify(payload),
    payload.checkedAt || new Date().toISOString(),
    Date.now()
  ).run();

  const keepToday = localDayKey("today");
  const keepTomorrow = localDayKey("tomorrow");
  await env.DB.prepare(`
    DELETE FROM notam_daily_cache
    WHERE day_key NOT IN (?, ?)
  `).bind(keepToday, keepTomorrow).run();
}

async function readDailyCache(env, dayMode) {
  if (!env.DB) return null;
  await ensureNotamCacheTable(env);
  const row = await env.DB.prepare(`
    SELECT payload_json, checked_at, updated_at
    FROM notam_daily_cache
    WHERE day_key = ?
    LIMIT 1
  `).bind(localDayKey(dayMode)).first();

  if (!row?.payload_json) return null;

  try {
    const payload = JSON.parse(row.payload_json);
    return {
      ...payload,
      cache: {
        source: "d1",
        dayKey: localDayKey(dayMode),
        checkedAt: row.checked_at || payload.checkedAt || null,
        updatedAt: row.updated_at || null
      }
    };
  } catch {
    return null;
  }
}

async function refreshDay(env, dayMode) {
  const payload = await collect(dayMode);
  await saveDailyCache(env, dayMode, payload);
  return payload;
}

async function refreshTodayAndTomorrow(env) {
  const [today, tomorrow] = await Promise.all([
    collect("today"),
    collect("tomorrow")
  ]);

  await saveDailyCache(env, "today", today);
  await saveDailyCache(env, "tomorrow", tomorrow);

  return { today, tomorrow };
}


/* =========================================================

   COLLECT

   ========================================================= */



async function collect(

  dayMode = "today"

) {



  const [

    notamHtml,

    restrictionsHtml

  ] =

    await Promise.all([



      fetchText(

        NOTAM_URL

      ),



      fetchText(

        RESTRICTIONS_URL

      )

    ]);





  return {



    ok: true,



    checkedAt:

      new Date()

        .toISOString(),



    day:

      dayMode,



    zones:

      parseNotams(

        notamHtml,

        dayMode

      ),



    restrictions:

      parseRestrictions(

        restrictionsHtml,

        dayMode

      )

  };

}





/* =========================================================

   WORKER

   ========================================================= */



export default {



  async fetch(

    request,

    env

  ) {



    const url =

      new URL(

        request.url

      );





    try {



      const dayMode =

        url.searchParams.get(

          "day"

        ) ===

        "tomorrow"



          ? "tomorrow"



          : "today";





      if (

        url.pathname ===

        "/collect"

      ) {



        return json(
          await refreshDay(env, dayMode)
        );

      }





      if (

        url.pathname ===

        "/notams"

      ) {

        let cached = await readDailyCache(env, dayMode);

        if (!cached) {
          try {
            cached = await refreshDay(env, dayMode);
          } catch (e) {
            throw e;
          }
        }

        return json({
          ok: true,
          source: NOTAM_URL,
          checkedAt: cached.checkedAt || new Date().toISOString(),
          day: dayMode,
          zones: cached.zones || {},
          cache: cached.cache || { source: "live" }
        });
      }



      if (

        url.pathname ===

        "/restrictions"

      ) {

        let cached = await readDailyCache(env, dayMode);

        if (!cached) {
          cached = await refreshDay(env, dayMode);
        }

        return json({
          ok: true,
          ...(cached.restrictions || {
            source: RESTRICTIONS_URL,
            checkedAt: cached.checkedAt || new Date().toISOString(),
            day: dayMode,
            date: localDayKey(dayMode),
            items: [],
            skippedWithoutExplicitGeometry: 0
          }),
          cache: cached.cache || { source: "live" }
        });
      }



      if (

        url.pathname ===

        "/debug"

      ) {



        return json(
          await refreshDay(env, dayMode)
        );

      }





      return json({



        ok:

          true,



        service:

          "CTR Brasov NOTAM Worker",



        endpoints: [

          "/notams",

          "/notams?day=tomorrow",

          "/restrictions",

          "/restrictions?day=tomorrow",

          "/collect",

          "/debug"

        ]

      });





    } catch (e) {



      return json(

        {

          ok:

            false,



          error:

            String(

              e?.message ||

              e

            )

        },

        500

      );

    }

  },





  async scheduled(

    event,

    env,

    ctx

  ) {



    ctx.waitUntil(
      refreshTodayAndTomorrow(env)
    );

  }

};
