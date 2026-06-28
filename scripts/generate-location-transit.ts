import fs from 'fs';
import path from 'path';
import locationData from '../src/data/locations.json';

// Builds src/data/location-transit.json: the transit modes serving each location's area,
// queried from TfL (stations within RADIUS of the anchor) plus the anchor station's own mode
// as a guaranteed fallback. Drives the transit icons (and which locations get a frequency note).
//   npm run generate-transit

type Mode = 'tube' | 'overground' | 'elizabeth-line' | 'dlr' | 'tram' | 'national-rail';
const KEEP: Mode[] = ['tube', 'overground', 'elizabeth-line', 'dlr', 'tram', 'national-rail'];
const RADIUS_M = 700;

const registry = locationData as unknown as Record<string, { point: { lat: number; lon: number }; anchorStation: string }>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// The anchor station's own mode, so a location is never left without at least its primary icon.
function anchorMode(station: string): Mode | null {
  if (/DLR/i.test(station)) return 'dlr';
  if (/Underground/i.test(station)) return 'tube';
  if (/Rail Station/i.test(station)) return 'national-rail';
  return null;
}

async function modesNear(lat: number, lon: number): Promise<Set<Mode>> {
  const url = `https://api.tfl.gov.uk/StopPoint?stopTypes=NaptanMetroStation,NaptanRailStation&radius=${RADIUS_M}&lat=${lat}&lon=${lon}`;
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
    const base = anchorMode(info.anchorStation);
    if (base) modes.add(base);
    out[name] = KEEP.filter(m => modes.has(m)); // canonical display order
    console.log(`${name}: ${out[name].join(', ') || '—'}`);
    await sleep(350);
  }
  const outPath = path.resolve(process.cwd(), 'src/data/location-transit.json');
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
