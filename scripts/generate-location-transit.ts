import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import locationData from '../src/data/locations.json';
import allStations from '../src/data/generated/all-stations.json';
import { commuteRoutes } from '../src/commute-times';

// Builds src/data/generated/location-transit.json: the transit modes serving each location's area —
// the union of its member stations' lines (from all-stations.json, no API call), the modes its
// commute routes actually board (so a combined NR+tube station keyed by its Underground naptan —
// Wimbledon — still shows the National Rail arrow when journeys use the mainline), a TfL geo query
// for other stations within RADIUS of the anchor, plus the anchor station's own mode as a
// guaranteed fallback. Drives the transit icons (and the frequency-note gating).
//   npm run generate-transit

type Mode = 'tube' | 'overground' | 'elizabeth-line' | 'dlr' | 'tram' | 'national-rail';
const KEEP: Mode[] = ['tube', 'overground', 'elizabeth-line', 'dlr', 'tram', 'national-rail'];
const RADIUS_M = 700;

const registry = locationData as unknown as Record<string, {
  point: { lat: number; lon: number };
  anchorStation: string;
  naptan?: string;
  commuteStations?: Array<{ key: string; naptan: string }>;
}>;

// Line/operator name (first leg of a summarised route) → mode, mirroring src/lib/commute-wait.ts.
const TUBE_LINES = new Set(['Bakerloo', 'Central', 'Circle', 'District', 'Hammersmith & City', 'Jubilee', 'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'Waterloo & City', 'Tube']);
const OVERGROUND_LINES = new Set(['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush', 'Overground', 'London Overground']);
function lineToMode(line: string): Mode {
  if (TUBE_LINES.has(line)) return 'tube';
  if (OVERGROUND_LINES.has(line)) return 'overground';
  if (line === 'Elizabeth line') return 'elizabeth-line';
  if (line === 'DLR') return 'dlr';
  if (line === 'Tram' || line === 'London Trams') return 'tram';
  return 'national-rail';
}
const routes = commuteRoutes as Record<string, Record<string, string | null>>;

// The modes a station key actually boards first across all its destinations — a station may be
// both NR and tube, and which one appears in journeys depends on where you're going.
function routeModesFor(key: string): Mode[] {
  const dests = routes[key];
  if (!dests) return [];
  const modes = Object.values(dests)
    .filter((r): r is string => Boolean(r))
    .map(r => lineToMode(r.split(' → ')[0]));
  return [...new Set(modes)];
}
const LINES_BY_NAPTAN = new Map(
  (allStations as Array<{ naptan: string; lines: string[] }>).map(s => [s.naptan, s.lines]),
);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// The anchor station's own mode, so a location is never left without at least its primary icon.
function anchorMode(station: string): Mode | null {
  if (/DLR/i.test(station)) return 'dlr';
  if (/Underground/i.test(station)) return 'tube';
  if (/Rail Station/i.test(station)) return 'national-rail';
  return null;
}

async function modesNear(lat: number, lon: number): Promise<Set<Mode>> {
  const key = process.env.TFL_APP_KEY ? `&app_key=${process.env.TFL_APP_KEY}` : '';
  const url = `https://api.tfl.gov.uk/StopPoint?stopTypes=NaptanMetroStation,NaptanRailStation&radius=${RADIUS_M}&lat=${lat}&lon=${lon}${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { stopPoints?: Array<{ modes?: string[] }> };
  const modes = new Set<Mode>();
  for (const sp of data.stopPoints ?? []) {
    for (const m of sp.modes ?? []) if (KEEP.includes(m as Mode)) modes.add(m as Mode);
  }
  return modes;
}

async function main() {
  const out: Record<string, Mode[]> = {};
  for (const [name, info] of Object.entries(registry)) {
    let modes = new Set<Mode>();
    try {
      modes = await modesNear(info.point.lat, info.point.lon);
    } catch (e) {
      console.warn(`  ⚠ ${name}: geo query failed (${e instanceof Error ? e.message : e}) — anchor mode only`);
    }
    // Union in every member station's lines — a 9-station area's centroid can sit >700m
    // from all of them (Canning Town), so the geo query alone misses the members' own modes.
    const members = info.commuteStations ?? (info.naptan ? [{ key: name, naptan: info.naptan }] : []);
    for (const { key, naptan } of members) {
      for (const m of LINES_BY_NAPTAN.get(naptan) ?? []) if (KEEP.includes(m as Mode)) modes.add(m as Mode);
      // …and the modes its journeys actually board: all-stations.json reports only the tube mode
      // for an Underground-naptan'd combined station, but the routes reveal it's on National Rail.
      for (const m of routeModesFor(key)) modes.add(m);
    }
    const base = anchorMode(info.anchorStation);
    if (base) modes.add(base);
    out[name] = KEEP.filter(m => modes.has(m)); // canonical display order
    console.log(`${name}: ${out[name].join(', ') || '—'}`);
    await sleep(350);
  }
  const outPath = path.resolve(process.cwd(), 'src/data/generated/location-transit.json');
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
