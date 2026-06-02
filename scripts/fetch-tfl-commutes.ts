/* scripts/fetch-tfl-commutes.ts */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { locationData } from "../src/location-data";
import { workLocations } from "../src/work-locations";
import type { CommuteTimes } from "../src/types";

type Minutes = number;

interface StopPointSearchMatch {
  id?: string;
  icsId?: string;
  stationId?: string;
  naptanId?: string;
}

interface StopPointSearchResponse {
  matches?: StopPointSearchMatch[];
}

interface StopPointDetails {
  stopType?: string;
  commonName?: string;
  naptanId?: string;
  id?: string;
}

interface JourneyPlannerResponse {
  journeys?: Array<{ duration?: number }>;
}

/** If a label is notoriously ambiguous, force a specific StopPoint (NaPTAN) ID. */
const STOPPOINT_OVERRIDES: Record<string, string> = {
  // ---- Works (central hubs) ----
  "King's Cross St. Pancras Underground Station": "940GZZLUKSX",  // King's Cross St Pancras (Tube)
  "Paddington Underground Station": "940GZZLUPAC",                 // Paddington (Bakerloo/Circle/District)
  // If your routes use the H&C entrance instead, use: "940GZZLUPAH"
  "Wimbledon Underground Station": "940GZZLUWIM",                  // Wimbledon (District)
  "Bank Underground Station": "940GZZLUBNK",
  // "Canary Wharf Underground Station": resolved via search (940GZZLUCAW not recognised by Journey Planner)
  "Oxford Circus Underground Station": "940GZZLUOXC",
  "Victoria Underground Station": "940GZZLUVIC",
  "Liverpool Street Underground Station": "940GZZLULVT",
  "Westminster Underground Station": "940GZZLUWSM",
  "Waterloo Underground Station": "940GZZLUWLO",
  "Green Park Underground Station": "940GZZLUGPK",
  // "Shoreditch High Street Rail Station": resolved via search (910GSHRDCH not recognised by Journey Planner)
  "South Kensington Underground Station": "940GZZLUSKS",           // Piccadilly/Circle/District
  "Holborn Underground Station": "940GZZLUHBN",                    // Central/Piccadilly
  "London Bridge Underground Station": "940GZZLULNB",              // Jubilee/Northern
  "Euston Underground Station": "940GZZLUEAC",                     // Victoria/Northern

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
  // "East Croydon Rail Station": resolved via search (910GECRYDON not recognised by Journey Planner)
  "High Barnet Underground Station": "940GZZLUHBT",
  "Cheam Rail Station": "910GCHEAM",
  "Acton Town Underground Station": "940GZZLUACT",
  // "South Ealing Underground Station": "",                         // TODO: find correct NaPTAN (940GZZLUSEA returns 404)
  "Southfields Underground Station": "940GZZLUSFS",                 // Southfields (District)
  "Clapham Common Underground Station": "940GZZLUCPC",
  "Bethnal Green Underground Station": "940GZZLUBLG",
  "Stratford Underground Station": "940GZZLUSTD",
  "Walthamstow Central Underground Station": "940GZZLUWWL",
  "Peckham Rye Rail Station": "910GPCKHMRY",
  "Hackney Central Rail Station": "910GHACKNYC",

  // ---- New areas (May 2026) ----
  "East Putney Underground Station": "940GZZLUEPY",
  "Crystal Palace Rail Station": "910GCRYSTLP",
  "Chiswick Park Underground Station": "940GZZLUCWP",
  "Hammersmith Underground Station": "940GZZLUHSD",
  "Highbury and Islington Underground Station": "940GZZLUHAI",
  "Finchley Central Underground Station": "940GZZLUFYC",
  "Greenwich DLR Station": "940GZZDLGRE",
  "Lewisham Rail Station": "910GLEWISHM",
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

const PAUSE_MS    = 300; // ~200 req/min — conservative; TfL's stated limit is 500/min but burst enforcement is stricter
const CONCURRENCY = 3;   // parallel workers sharing the rate limiter

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getObjectKeys(value: unknown) {
  return value && typeof value === "object" ? Object.keys(value) : [];
}

// Claim the next available rate-limit slot synchronously, then wait for it.
// Because JS is single-threaded, the slot assignment is atomic — no two workers
// can claim the same slot even when called concurrently.
let nextAllowedMs = Date.now();
function acquireRateSlot(): Promise<void> {
  const slot = Math.max(nextAllowedMs, Date.now());
  nextAllowedMs = slot + PAUSE_MS;
  const wait = slot - Date.now();
  return wait > 0 ? pause(wait) : Promise.resolve();
}

// Simple worker pool: `concurrency` workers drain a shared queue
async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const item = queue.shift()!;
        await worker(item);
      }
    })
  );
}

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
    const data = await res.json() as StopPointSearchResponse;
    const matches = data.matches || [];

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
      const det = await detRes.json() as StopPointDetails;

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
  const fromQuery = locationData[fromLabel]?.station;
  const toQuery = workLocations[toLabel]?.station;
  if (!fromQuery || !toQuery) throw new Error(`Unknown labels: ${fromLabel} → ${toLabel}`);

  const fromId = await resolveStopPointId(fromQuery);
  const toId = await resolveStopPointId(toQuery);

  const url = `${BASE}/Journey/JourneyResults/${encodeURIComponent(fromId)}/to/${encodeURIComponent(toId)}?` + qs({
    mode: modes.join(","),
    timeIs: "Departing",
    date: "20260602", time: "0900", // pin to 09:00 Mon for consistent peak-hour results
  });

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0") || 0;
      const wait = retryAfter > 0 ? retryAfter * 1000 : 15000 * attempt;
      console.warn(`429 rate-limited ${fromLabel} → ${toLabel}, waiting ${wait / 1000}s (attempt ${attempt})`);
      await pause(wait);
      continue;
    }

    if (res.status === 300) {
      const body = await res.json().catch(() => null) as unknown;
      console.warn(`300 for ${fromLabel} → ${toLabel} (IDs: ${fromId} → ${toId})`);
      console.warn(`  body keys:`, getObjectKeys(body));
      console.warn(`  raw:`, JSON.stringify(body)?.slice(0, 600));
      if (attempt < 4) { await pause(500 * attempt); continue; }
      throw new Error(`HTTP 300`);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as JourneyPlannerResponse;
    const journeys = data.journeys;
    const best = journeys?.map(j => j.duration).filter((d): d is number => typeof d === "number").sort((a,b)=>a-b)[0];
    return typeof best === "number" ? Math.round(best) : 0;
  }

  return 0;
}

async function main() {
  const homeKeys = Object.keys(locationData);
  const workKeys = Object.keys(workLocations);
  const out: CommuteTimes = {};
  for (const h of homeKeys) out[h] = {};

  const pairs = homeKeys.flatMap(h => workKeys.map(w => [h, w] as [string, string]));
  console.log(`Fetching ${pairs.length} pairs with ${CONCURRENCY} workers at ${PAUSE_MS}ms/req…\n`);

  await runPool(pairs, async ([h, w]) => {
    try {
      await acquireRateSlot();
      const mins = await getDurationMinutes(h, w);
      out[h][w] = mins;
      console.log(`${h} → ${w}: ${mins} min`);
    } catch (e: unknown) {
      console.warn(`Failed ${h} → ${w}: ${getErrorMessage(e)}`);
      out[h][w] = 0;
    }
  }, CONCURRENCY);

  const lastRun = new Date().toISOString();
  const banner = `/**
 * AUTO-GENERATED by scripts/fetch-tfl-commutes.ts
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

export const commuteTimesLastRun = "${lastRun}";
`;

  const outPath = path.resolve(process.cwd(), "src/commute-times.ts");
  fs.writeFileSync(outPath, file, "utf8");
  console.log(`\nWrote ${outPath} (lastRun: ${lastRun})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
