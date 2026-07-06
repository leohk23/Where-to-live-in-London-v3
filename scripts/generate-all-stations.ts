/* scripts/generate-all-stations.ts */
import "dotenv/config";
import fs from "fs";
import path from "path";
import locationsJson from "../src/data/locations.json";

// Builds src/data/generated/all-stations.json: every tube/DLR/Overground/Elizabeth line station in London
// (for the map's "all stations" overlay, spotting multi-anchor merge candidates) PLUS any
// National Rail/tram station that a location in locations.json actually anchors on. Doubles as
// the single source of truth for station lat/lon, looked up by naptan from locations.json's
// commuteStations (see src/lib/location-point.ts) — no separately hand-kept coordinates to drift
// out of sync. One-shot snapshot — rerun manually if TfL adds a station or a new anchor is added.
//   npm run generate-all-stations

const APP_ID = process.env.TFL_APP_ID || "";
const APP_KEY = process.env.TFL_APP_KEY || "";
// Fetched one mode at a time — combining all in one StopPoint/Mode call 500s (payload too large).
// National Rail/tram are NOT fetched in bulk (nationwide National Rail alone 504s — too large);
// only the specific naptans locations.json actually references are looked up individually below.
const MODES = ["tube", "dlr", "overground", "elizabeth-line"];

function qs() {
  const sp = new URLSearchParams();
  if (APP_KEY) sp.set("app_key", APP_KEY);
  if (APP_ID) sp.set("app_id", APP_ID);
  return sp.toString();
}

interface StopPoint {
  naptanId?: string;
  commonName?: string;
  lat?: number;
  lon?: number;
  stopType?: string;
  modes?: string[];
}

interface Station {
  name: string;
  naptan: string;
  lat: number;
  lon: number;
  lines: string[];
}

function addIfValid(byNaptan: Map<string, Station>, sp: StopPoint) {
  // Station-level entries only — skip individual platforms/entrances.
  if (sp.stopType !== "NaptanMetroStation" && sp.stopType !== "NaptanRailStation") return;
  if (!sp.naptanId || !sp.commonName || sp.lat == null || sp.lon == null) return;
  byNaptan.set(sp.naptanId, {
    name: sp.commonName,
    naptan: sp.naptanId,
    lat: sp.lat,
    lon: sp.lon,
    lines: sp.modes ?? [],
  });
}

// Every naptan a location in locations.json actually anchors on (top-level or commuteStations).
function referencedNaptans(): string[] {
  const registry = locationsJson as unknown as Record<string, {
    naptan?: string;
    commuteStations?: Array<{ naptan: string }>;
  }>;
  const naptans = new Set<string>();
  for (const loc of Object.values(registry)) {
    if (loc.naptan) naptans.add(loc.naptan);
    for (const s of loc.commuteStations ?? []) naptans.add(s.naptan);
  }
  return [...naptans];
}

async function main() {
  const byNaptan = new Map<string, Station>();

  for (const mode of MODES) {
    const url = `https://api.tfl.gov.uk/StopPoint/Mode/${mode}?${qs()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${mode}: HTTP ${res.status}`);
    const data = await res.json() as { stopPoints?: StopPoint[] };
    const before = byNaptan.size;
    for (const sp of data.stopPoints ?? []) addIfValid(byNaptan, sp);
    console.log(`${mode}: ${byNaptan.size - before} stations`);
  }

  const missing = referencedNaptans().filter(n => !byNaptan.has(n));
  console.log(`Looking up ${missing.length} referenced naptans not covered by the mode fetch (National Rail/tram anchors)...`);
  for (const naptan of missing) {
    const res = await fetch(`https://api.tfl.gov.uk/StopPoint/${naptan}?${qs()}`);
    if (!res.ok) { console.warn(`  ⚠ ${naptan}: HTTP ${res.status}`); continue; }
    const sp = await res.json() as StopPoint;
    // A direct lookup can redirect to a parent hub (different naptanId, stopType
    // "TransportInterchange") — key by the naptan we asked for, not what came back, and skip
    // the station-level-only filter since we already trust this specific ID.
    if (sp.lat == null || sp.lon == null || !sp.commonName) { console.warn(`  ⚠ ${naptan}: no coordinates in response`); continue; }
    byNaptan.set(naptan, { name: sp.commonName, naptan, lat: sp.lat, lon: sp.lon, lines: sp.modes ?? [] });
  }

  const stations = [...byNaptan.values()].sort((a, b) => a.name.localeCompare(b.name));
  const outPath = path.resolve(process.cwd(), "src/data/generated/all-stations.json");
  fs.writeFileSync(outPath, `${JSON.stringify(stations, null, 2)}\n`, "utf8");
  console.log(`Wrote ${stations.length} stations to ${outPath}`);

  const stillMissing = referencedNaptans().filter(n => !byNaptan.has(n));
  if (stillMissing.length) console.warn(`Still missing (locations.json references these naptans but TfL didn't resolve them): ${stillMissing.join(", ")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
