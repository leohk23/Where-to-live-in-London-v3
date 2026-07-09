/* scripts/generate-all-stations.ts */
import "dotenv/config";
import fs from "fs";
import path from "path";
import locationsJson from "../src/data/locations.json";

// Builds src/data/generated/all-stations.json: every tube/DLR/Overground/Elizabeth line station in London
// (for the map's "all stations" overlay, spotting multi-anchor merge candidates) PLUS every
// National Rail station inside Greater London (fetched per-operator via the Line API and clipped to
// a Greater-London bounding box — see below) PLUS any tram station a location anchors on. Doubles
// as the single source of truth for station lat/lon, looked up by naptan from locations.json's
// commuteStations (see src/lib/location-point.ts) — no separately hand-kept coordinates to drift
// out of sync. One-shot snapshot — rerun manually if TfL adds a station or a new anchor is added.
//   npm run generate-all-stations

const APP_ID = process.env.TFL_APP_ID || "";
const APP_KEY = process.env.TFL_APP_KEY || "";
// Fetched one mode at a time — combining all in one StopPoint/Mode call 500s (payload too large).
// Tram is NOT fetched in bulk; only the specific naptans locations.json references are looked up
// individually below. National Rail can't be bulk-fetched either (nationwide StopPoint/Mode 504s,
// and even a 5 km rail geo query 504s in central London), so it's pulled per-operator via the
// Line API — a bounded ~25 calls — then clipped to Greater London.
const MODES = ["tube", "dlr", "overground", "elizabeth-line"];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// The Greater London region boundary (ONS, E12000007), fetched once and used to clip National Rail
// to London — a bounding box leaks ~50 commuter-belt stations (Epsom, Dartford, Staines, Potters
// Bar…) that aren't in Greater London. A cheap bbox pre-filter avoids the ring test for far points.
const LONDON_BBOX = { latMin: 51.28, latMax: 51.70, lonMin: -0.52, lonMax: 0.34 };
const LONDON_REGION_URL =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
  + "Regions_December_2022_EN_BGC/FeatureServer/0/query"
  + "?where=RGN22CD%3D%27E12000007%27&outFields=RGN22NM&f=geojson";

async function londonRings(): Promise<number[][][]> {
  const gj = await fetch(LONDON_REGION_URL)
    .then(r => { if (!r.ok) throw new Error(`London region: HTTP ${r.status}`); return r.json() as Promise<{ features: Array<{ geometry: { type: string; coordinates: unknown } }> }>; });
  const g = gj.features[0].geometry;
  const rings: number[][][] = [];
  if (g.type === "Polygon") for (const r of g.coordinates as number[][][]) rings.push(r);
  else if (g.type === "MultiPolygon") for (const poly of g.coordinates as number[][][][]) for (const r of poly) rings.push(r);
  return rings;
}

// Even-odd ray casting across every ring (holes handled automatically). London is a single blob
// with no interior holes, and its polygons don't overlap, so one pass over all rings is correct.
function makeInLondon(rings: number[][][]) {
  return (lat: number, lon: number): boolean => {
    if (lat < LONDON_BBOX.latMin || lat > LONDON_BBOX.latMax || lon < LONDON_BBOX.lonMin || lon > LONDON_BBOX.lonMax) return false;
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
      }
    }
    return inside;
  };
}

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

// Every National Rail station inside Greater London, gathered per-operator (the only endpoint that
// doesn't 504 for rail) and clipped to the bounding box. Naptans come back as 910G… — the same
// format tube/DLR/etc. use — so they slot straight into byNaptan. Never overwrites an existing
// entry: a station already added via the Overground/Elizabeth fetch carries its fuller mode list.
async function addNationalRailLondon(byNaptan: Map<string, Station>, inLondon: (lat: number, lon: number) => boolean) {
  const lines = await fetch(`https://api.tfl.gov.uk/Line/Mode/national-rail?${qs()}`)
    .then(r => { if (!r.ok) throw new Error(`Line/Mode/national-rail: HTTP ${r.status}`); return r.json() as Promise<Array<{ id: string }>>; });
  let added = 0;
  for (const line of lines) {
    let stops: StopPoint[];
    try {
      const res = await fetch(`https://api.tfl.gov.uk/Line/${line.id}/StopPoints?${qs()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      stops = await res.json() as StopPoint[];
    } catch (e) {
      console.warn(`  ⚠ ${line.id}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    for (const sp of stops) {
      if (sp.stopType !== "NaptanRailStation") continue;
      if (!sp.naptanId || !sp.commonName || sp.lat == null || sp.lon == null) continue;
      if (!inLondon(sp.lat, sp.lon) || byNaptan.has(sp.naptanId)) continue;
      byNaptan.set(sp.naptanId, { name: sp.commonName, naptan: sp.naptanId, lat: sp.lat, lon: sp.lon, lines: sp.modes ?? ["national-rail"] });
      added += 1;
    }
    await sleep(200);
  }
  console.log(`national-rail (Greater London): +${added} stations from ${lines.length} operators`);
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

  const inLondon = makeInLondon(await londonRings());
  await addNationalRailLondon(byNaptan, inLondon);

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
