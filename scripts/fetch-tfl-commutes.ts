/* scripts/fetch-tfl-commutes.ts */
import fs from "fs";
import path from "path";

type Minutes = number;

export interface CommuteTimes {
  [homeLocation: string]: {
    [workLocation: string]: Minutes;
  };
}

/** Labels → search queries (keep your friendly labels) */
const homes: Record<string, string> = {
  "Brixton": "Brixton Underground Station",
  "Fulham": "Fulham Broadway Underground Station",
  "Tooting": "Tooting Broadway Underground Station",
  "Sutton": "Sutton (London) Rail Station",
  "New Malden": "New Malden Rail Station",
  "Wimbledon": "Wimbledon Underground Station",           // 👈 ensure Underground
  "Richmond": "Richmond (London) Rail Station",
  "Ealing": "Ealing Broadway Underground Station",
  "Hounslow": "Hounslow Central Underground Station",
  "Croydon": "East Croydon Rail Station",
  "Wimbledon Park": "Wimbledon Park Underground Station",
  "High Barnet": "High Barnet Underground Station",
  "Sutton Cheam": "Cheam Rail Station",
  "Acton Common": "Acton Town Underground Station",
  "South Ealing": "South Ealing Underground Station",
  "Southfields": "Southfields Underground Station",
};

const works: Record<string, string> = {
  "City of London": "Bank Underground Station",
  "Canary Wharf": "Canary Wharf Underground Station",
  "King's Cross": "King's Cross St. Pancras Underground Station", // 👈 full, specific
  "Shoreditch": "Shoreditch High Street Rail Station",
  "Westminster": "Westminster Underground Station",
  "South Bank": "Waterloo Underground Station",
  "Paddington": "Paddington Underground Station",
  "Victoria": "Victoria Underground Station",
  "Liverpool Street": "Liverpool Street Underground Station",
  "Oxford Circus": "Oxford Circus Underground Station",
  "Green Park": "Green Park Underground Station",
};

/** If a label is notoriously ambiguous, force a specific StopPoint (NaPTAN) ID. */
const STOPPOINT_OVERRIDES: Record<string, string> = {
  // ---- Works (central hubs) ----
  "King's Cross St. Pancras Underground Station": "940GZZLUKSX",  // King's Cross St Pancras (Tube)
  "Paddington Underground Station": "940GZZLUPAC",                 // Paddington (Bakerloo/Circle/District)
  // If your routes use the H&C entrance instead, use: "940GZZLUPAH"
  "Wimbledon Underground Station": "940GZZLUWIM",                  // Wimbledon (District)
  "Bank Underground Station": "940GZZLUBNK",
  "Canary Wharf Underground Station": "940GZZLUCAW",
  "Oxford Circus Underground Station": "940GZZLUOXC",
  "Victoria Underground Station": "940GZZLUVIC",
  "Liverpool Street Underground Station": "940GZZLULVT",
  "Westminster Underground Station": "940GZZLUWSM",
  "Waterloo Underground Station": "940GZZLUWLO",
  "Green Park Underground Station": "940GZZLUGPK",
  "Shoreditch High Street Rail Station": "910GSHRDCH",             // London Overground

  // ---- Homes (suburbs) ----
  "Brixton Underground Station": "940GZZLUBXN",
  "Fulham Broadway Underground Station": "940GZZLUFBY",
  "Tooting Broadway Underground Station": "940GZZLUTBY",
  "Sutton (London) Rail Station": "910GSUTTON",
  "New Malden Rail Station": "910GNEWMLDN",
  "Wimbledon Park Underground Station": "940GZZLUWIP",
  "Richmond (London) Rail Station": "910GRICHMND",                 // alt: 910GRICHMOND
  "Ealing Broadway Underground Station": "940GZZLUEBY",
  "Hounslow Central Underground Station": "940GZZLUHWC",
  "East Croydon Rail Station": "910GECRYDON",
  "High Barnet Underground Station": "940GZZLUHBT",
  "Cheam Rail Station": "910GCHEAM",
  "Acton Town Underground Station": "940GZZLUACT",
  "South Ealing Underground Station": "940GZZLUSFS",
  "Southfields Underground Station": "940GZZLUSFS",                // Southfields is 940GZZLUSFS
};

/** TfL API config */
const APP_ID = process.env.TFL_APP_ID || "";
const APP_KEY = process.env.TFL_APP_KEY || "";
const BASE = "https://api.tfl.gov.uk";
const modes = ["tube", "overground", "elizabeth-line", "dlr", "tram", "national-rail"];

const cacheFile = path.resolve(process.cwd(), "scripts/.tfl-stop-cache.json");
let STOP_CACHE: Record<string, string> = {};
try {
  STOP_CACHE = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
} catch { STOP_CACHE = {}; }

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

function qs(params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  if (APP_ID && APP_KEY) {
    sp.set("app_id", APP_ID);
    sp.set("app_key", APP_KEY);
  }
  return sp.toString();
}

/** Resolve a Station Name → a specific StopPoint ID (NaptanId). */
async function resolveStopPointId(query: string): Promise<string> {
  // 1) Use override if present
  if (STOPPOINT_OVERRIDES[query]) return STOPPOINT_OVERRIDES[query];

  // 2) Use cache if present
  if (STOP_CACHE[query]) return STOP_CACHE[query];

  const url = `${BASE}/StopPoint/Search/${encodeURIComponent(query)}?` + qs({
    modes: modes.join(","),
    maxResults: "10",
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (!res.ok) {
      if (attempt === 3) throw new Error(`StopPoint search failed: HTTP ${res.status}`);
      await pause(300 * attempt);
      continue;
    }
    const data = await res.json() as any;
    const matches: any[] = data?.matches || [];

    // Prefer Underground stations first, then Rail/DLR/Elizabeth/tram
    const preferredTypes = [
      "NaptanMetroStation",      // Underground
      "NaptanRailStation",       // National Rail / Overground
      "NaptanDLRStation",
      "NaptanFerryPort",
      "NaptanBusCoachStation",
      "NaptanTramStation",
    ];

    // Search details for each match to get stopPoint 'type'
    let bestId = "";
    for (const m of matches) {
      const id = m.id || m.icsId || m.stationId || m.naptanId || "";
      const detailsUrl = `${BASE}/StopPoint/${encodeURIComponent(id)}?${qs({})}`;
      const detRes = await fetch(detailsUrl);
      if (!detRes.ok) continue;
      const det = await detRes.json() as any;

      const type = det?.stopType || "";
      const name = det?.commonName || "";
      // Heuristic: ensure the name contains a strong hint (e.g. 'Underground')
      const nameOk =
        /Underground Station|Rail Station|DLR Station|Elizabeth line/i.test(name) ||
        /Underground|Rail|DLR|Elizabeth/i.test(query);

      const typeRank = preferredTypes.indexOf(type);
      if (nameOk && typeRank !== -1) {
        bestId = det?.naptanId || det?.id || id;
        break;
      }
    }

    // Fallback: first match id if heuristics failed
    if (!bestId && matches.length) {
      bestId = matches[0].id || matches[0].naptanId || matches[0].icsId || "";
    }

    if (!bestId) {
      throw new Error(`No StopPoint match for "${query}"`);
    }

    STOP_CACHE[query] = bestId;
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(STOP_CACHE, null, 2), "utf8");
    return bestId;
  }

  throw new Error(`Could not resolve stop for "${query}"`);
}

/** Call Journey Planner with StopPoint IDs to avoid 300 (multiple choices). */
async function getDurationMinutes(fromLabel: string, toLabel: string): Promise<Minutes> {
  const fromQuery = homes[fromLabel];
  const toQuery = works[toLabel];
  if (!fromQuery || !toQuery) throw new Error(`Unknown labels: ${fromLabel} → ${toLabel}`);

  const fromId = await resolveStopPointId(fromQuery);
  await pause(200); // gentle pacing
  const toId = await resolveStopPointId(toQuery);

  const url = `${BASE}/Journey/JourneyResults/${encodeURIComponent(fromId)}/to/${encodeURIComponent(toId)}?` + qs({
    mode: modes.join(","),
    timeIs: "Departing",
    // date: "2025-09-01", time: "08:30", // optional: pin a time
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 300) {
        // Shouldn't happen with IDs, but if it does, retry once
        if (attempt < 3) { await pause(300 * attempt); continue; }
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json() as any;
    const journeys = data?.journeys as Array<{ duration?: number }> | undefined;
    const best = journeys?.map(j => j.duration).filter((d): d is number => typeof d === "number").sort((a,b)=>a-b)[0];
    return typeof best === "number" ? Math.round(best) : 0;
  }

  return 0;
}

async function main() {
  const homeKeys = Object.keys(homes);
  const workKeys = Object.keys(works);
  const out: CommuteTimes = {};

  for (const h of homeKeys) {
    out[h] = {};
    for (const w of workKeys) {
      try {
        await pause(1200); // increased pacing to 1.2 seconds between requests
        const mins = await getDurationMinutes(h, w);
        out[h][w] = mins;
        console.log(`${h} → ${w}: ${mins} min`);
      } catch (e: any) {
        console.warn(`Failed ${h} → ${w}: ${e?.message || e}`);
        out[h][w] = 0;
      }
    }
  }

  const banner = `/**
 * AUTO-GENERATED by scripts/fetch-commute-times.ts
 * To regenerate: npm run fetch-commutes:tfl
 * Values are one-way minutes from TfL Journey Planner (shortest itinerary).
 */`;

  const file = `${banner}

export interface CommuteTimes {
  [homeLocation: string]: {
    [workLocation: string]: number;
  };
}

export const commuteTimes: CommuteTimes = ${JSON.stringify(out, null, 2)};
`;

  const outPath = path.resolve(process.cwd(), "src/commute-times.ts");
  fs.writeFileSync(outPath, file, "utf8");
  console.log(`\nWrote ${outPath}`);

  // Write last run time as a TypeScript export
  const lastRunTsPath = path.resolve(process.cwd(), "src/commute-times-last-run.ts");
  fs.writeFileSync(
    lastRunTsPath,
    `export const commuteTimesLastRun = "${new Date().toISOString()}";\n`,
    "utf8"
  );
  console.log(`Last run time written to ${lastRunTsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
