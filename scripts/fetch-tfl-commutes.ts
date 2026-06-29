/* scripts/fetch-tfl-commutes.ts */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { locationData } from "../src/data";
import { workLocations } from "../src/work-locations";
import type { CommuteTimes, CommuteRoutes } from "../src/commute-times";
import { summariseRoute, type TflJourney } from "../src/lib/tfl-route";

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
  journeys?: TflJourney[];
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
  // Search returns the HUBSPB hub / "Shepherd's Bush Market" instead of the Central-line
  // station, so pin the Central-line StopPoint directly (verified in Journey Planner).
  "Shepherd's Bush Underground Station": "940GZZLUSBC",
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

// TfL product limit is 500 req/min (~120ms/req). Pace just under that with headroom;
// every TfL call (search, detail, journey) shares this one limiter so nothing bursts.
// Override via env if your key's limit differs.
const PAUSE_MS    = Number(process.env.TFL_PAUSE_MS ?? 135);    // ~444 req/min, ~11% headroom
const CONCURRENCY = Number(process.env.TFL_CONCURRENCY ?? 4);   // workers to keep the pace saturated despite latency

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
  // Modern TfL keys authenticate with app_key alone (app_id is deprecated and usually
  // empty). Send whichever are present — previously this required BOTH, so an empty
  // app_id meant no key was sent at all and every call hit the anonymous rate limit.
  if (APP_KEY) sp.set("app_key", APP_KEY);
  if (APP_ID) sp.set("app_id", APP_ID);
  return sp.toString();
}

/** Most recent Monday as YYYYMMDD — a representative weekday-morning peak. */
function getLastMonday(): string {
  const d = new Date();
  const daysSinceMonday = (d.getDay() + 6) % 7; // 0 if Monday, else days back to the last Monday
  d.setDate(d.getDate() - daysSinceMonday);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
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
    await acquireRateSlot(); // pace resolution too, so it can't burst past the rate limit
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
      await acquireRateSlot();
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

/** Call Journey Planner with StopPoint IDs to avoid 300 (multiple choices).
 *  Returns minutes + route summary on success (0 only for a genuine empty result), or null
 *  when the request could not be completed (e.g. rate-limited) — callers must NOT persist null,
 *  leaving the pair absent so a later run retries it. */
async function getDurationMinutes(fromLabel: string, toLabel: string): Promise<{ minutes: number; route: string | null } | null> {
  const fromQuery = locationData[fromLabel]?.station;
  const toQuery = workLocations[toLabel]?.station;
  if (!fromQuery || !toQuery) throw new Error(`Unknown labels: ${fromLabel} → ${toLabel}`);

  const fromId = await resolveStopPointId(fromQuery);
  const toId = await resolveStopPointId(toQuery);

  const url = `${BASE}/Journey/JourneyResults/${encodeURIComponent(fromId)}/to/${encodeURIComponent(toId)}?` + qs({
    mode: modes.join(","),
    timeIs: "Departing",
    date: getLastMonday(), time: "0830", // pin to 08:30 last Mon for consistent peak-hour results
  });

  for (let attempt = 1; attempt <= 4; attempt++) {
    await acquireRateSlot(); // every TfL call shares one global pace, so nothing bursts
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
    // Pick the fastest journey, then summarise that same journey's lines (keeps time & route consistent).
    const best = (data.journeys ?? [])
      .filter(j => typeof j.duration === "number")
      .sort((a, b) => (a.duration ?? 0) - (b.duration ?? 0))[0];
    return best ? { minutes: Math.round(best.duration ?? 0), route: summariseRoute(best) } : { minutes: 0, route: null };
  }

  return null; // exhausted retries (e.g. persistent rate-limiting) — leave the pair for a later run
}

async function main() {
  const homeKeys = Object.keys(locationData);
  const workKeys = Object.keys(workLocations);

  // Incremental & merge-based: start from the existing matrix and only fetch the pairs
  // we still need, so adding one location pulls just its pairs and a rate-limit blip
  // never overwrites good data. Modes:
  //   (default)         fill only missing pairs
  //   REFETCH_ZEROS=1   also re-fetch existing 0s (repair earlier failures)
  //   FORCE=1           re-fetch every pair
  //   ONLY=<location>   restrict to a single home location
  //   DRY=1             list what would be fetched, make no API calls
  let existing: CommuteTimes = {};
  let existingRoutes: CommuteRoutes = {};
  try {
    const mod = await import("../src/commute-times");
    existing = mod.commuteTimes ?? {};
    existingRoutes = mod.commuteRoutes ?? {};
  } catch { existing = {}; existingRoutes = {}; }

  const force = process.env.FORCE === "1";
  const refetchZeros = process.env.REFETCH_ZEROS === "1";
  const backfillRoutes = process.env.BACKFILL_ROUTES === "1";
  const only = process.env.ONLY;
  const dry = process.env.DRY === "1";

  // Carry every existing value forward; we only ever add/replace, never drop good data.
  const out: CommuteTimes = {};
  const outRoutes: CommuteRoutes = {};
  for (const h of homeKeys) {
    out[h] = { ...(existing[h] ?? {}) };
    outRoutes[h] = { ...(existingRoutes[h] ?? {}) };
  }

  const pairs = homeKeys.flatMap(h => workKeys.map(w => [h, w] as [string, string]))
    .filter(([h, w]) => {
      if (only && h !== only) return false;
      if (force) return true;
      const cur = existing[h]?.[w];
      if (cur === undefined) return true;                                          // new pair (no time) → fetch
      if (refetchZeros && cur === 0) return true;                                  // repair a previously-failed 0
      if (backfillRoutes && existingRoutes[h]?.[w] === undefined) return true;     // opt-in: fill a missing route
      return false;                                                               // has a time → preserved (manual edits safe)
    });

  const totalPairs = homeKeys.length * workKeys.length;
  const mode = force ? "FORCE all" : refetchZeros ? "missing + zeros" : "missing only";
  console.log(`${pairs.length}/${totalPairs} pairs to fetch (mode: ${mode}${only ? `, ONLY=${only}` : ""}); preserving ${totalPairs - pairs.length} existing values.`);

  if (dry) {
    pairs.forEach(([h, w]) => console.log(`  would fetch: ${h} → ${w}`));
    console.log(`\nDRY run — no API calls made.`);
    return;
  }

  console.log(`Using ${CONCURRENCY} workers at ${PAUSE_MS}ms/req…\n`);

  let filled = 0;
  let skipped = 0;
  await runPool(pairs, async ([h, w]) => {
    try {
      const res = await getDurationMinutes(h, w);
      if (res === null) { skipped += 1; console.warn(`· ${h} → ${w}: no result — kept existing, will retry next run`); return; }
      if (res.minutes === 0 && (existing[h]?.[w] ?? 0) > 0) { skipped += 1; return; } // never downgrade a good value
      out[h][w] = res.minutes;
      outRoutes[h][w] = res.route;
      filled += 1;
      console.log(`${h} → ${w}: ${res.minutes} min${res.route ? ` via ${res.route}` : ""}`);
    } catch (e: unknown) {
      skipped += 1;
      console.warn(`· ${h} → ${w}: ${getErrorMessage(e)} — kept existing, will retry next run`);
    }
  }, CONCURRENCY);

  console.log(`\nFilled ${filled}, skipped/failed ${skipped}.`);

  const lastRun = new Date().toISOString();
  const banner = `/**
 * AUTO-GENERATED by scripts/fetch-tfl-commutes.ts — but safe to hand-edit.
 * commuteTimes  — one-way minutes from TfL Journey Planner (shortest itinerary).
 * commuteRoutes — the tube/rail lines of that same itinerary, e.g. "Victoria → Central".
 *
 * Incremental & merge-based — a default run ONLY fetches new pairs (a home/work pair
 * with no time yet) and preserves everything else, so manual edits and existing values
 * are never overwritten. Preview first with DRY=1.
 *   DRY=1 npm run fetch-commutes:tfl              # list what WOULD be fetched, no API calls
 *   npm run fetch-commutes:tfl                    # fetch only new (missing-time) pairs
 *   ONLY="Camden" npm run fetch-commutes:tfl      # restrict to one home location
 *   BACKFILL_ROUTES=1 npm run fetch-commutes:tfl  # also fill pairs that have a time but no route
 *   REFETCH_ZEROS=1 npm run fetch-commutes:tfl    # also repair existing 0s
 *   FORCE=1 npm run fetch-commutes:tfl            # re-fetch everything (full overwrite)
 *
 * To pin a value by hand, set BOTH its commuteTimes entry and its commuteRoutes entry
 * (use null if the route is unknown) so the pair is never seen as "missing".
 */`;

  const file = `${banner}

export interface CommuteTimes {
  [homeLocation: string]: {
    [workLocation: string]: number;
  };
}

export interface CommuteRoutes {
  [homeLocation: string]: {
    [workLocation: string]: string | null;
  };
}

export const commuteTimes: CommuteTimes = ${JSON.stringify(out, null, 2)};

export const commuteRoutes: CommuteRoutes = ${JSON.stringify(outRoutes, null, 2)};

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
