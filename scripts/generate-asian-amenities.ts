import fs from 'fs';
import path from 'path';
import locationsJson from '../src/data/locations.json' with { type: 'json' };
import excludedJson from '../src/data/asian-spots-excluded.json' with { type: 'json' };

// Terms to never count, matched as case-insensitive substrings — so "Wagamama"
// also drops "Wagamama Stratford". Curated in asian-spots-excluded.json.
const EXCLUDED_TERMS = (excludedJson as string[]).map(s => s.toLowerCase());
const isExcluded = (name: string) => {
  const n = name.toLowerCase();
  return EXCLUDED_TERMS.some(term => n.includes(term));
};

// SEED GENERATOR for src/data/asian-spots.json — a FLAT master list of
// Hongkongese/East Asian restaurants, cafes and grocers (one entry per physical
// spot, with coordinates). The app picks up whichever spots fall within each
// location's radius, so the same spot is never duplicated across locations.
//   npm run generate-asian-amenities         # seed only NOT-yet-seeded locations
//   DRY=1 npm run generate-asian-amenities   # preview which locations would seed
//
// NEW-LOCATIONS-ONLY: seeds only locations absent from scripts/asian-spots-seeded.json,
// then records them there. Existing spots and your hand-curation are never
// touched. Excluded names (asian-spots-excluded.json) are skipped on seed.
// To re-pull an area: remove its key from the seeded tracker, and delete its
// only-near-there spots from the list first if you want them refreshed.
//
// ponytail: OSM cuisine/name tagging is patchy (most oriental grocers aren't
// tagged with an ethnicity), so the seed is approximate by design — that's
// exactly why the file is then curated by hand.

interface LocationInfo {
  displayName: string;
  station: string;
  point: { lat: number; lon: number };
}

type SpotType = 'hk' | 'asian-food' | 'grocery';

// OSM cuisine values that signal Hongkongese/Cantonese, vs other East Asian.
// Best-effort only — the seed is then recategorised by hand.
const HK_CUISINE = /hong_kong|hongkong|cantonese|dim_sum|cha_chaan_teng/;

interface AsianSpot {
  name: string;
  type: SpotType;
  lat: number;
  lon: number;
}

const OUT_PATH = path.resolve(process.cwd(), 'src/data/asian-spots.json');
const SEEDED_PATH = path.resolve(process.cwd(), 'scripts/asian-spots-seeded.json');
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'where-to-live-london/1.0 (leohk23@gmail.com)';
const RADIUS_KM = 1.75; // ~21 min walk
const MAX_RETRIES = 4;
// Greater London bounding box (south,west,north,east) — one query covers every
// anchor, so we hit the shared public API once instead of 40 times.
const LONDON_BBOX = '51.28,-0.52,51.70,0.34';

// East Asian restaurant/cafe cuisines (OSM cuisine=* values). Includes Korean
// and Japanese so Koreatown areas like New Malden are covered.
const RESTAURANT_CUISINE = 'chinese|cantonese|hong_kong|hongkong|asian|dim_sum|taiwanese|korean|japanese|sushi|ramen|noodle';
// Name keywords for grocers — OSM has no ethnicity tag on shops, so match names.
const GROCERY_NAME = 'chinese|asian|oriental|korea|korean|seoul|japan|loon fung|see woo|hoo hing|wing yip|longdan|hang won|loon moon|tian tian|h mart|hmart|starville|hk|大|華|华|亞|亚|超市|香港|마트|한인';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radius = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

interface OverpassElement {
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}

async function queryAllLondon(): Promise<OverpassElement[]> {
  const query = `[out:json][timeout:90];
(
  nwr["amenity"~"restaurant|cafe"]["cuisine"~"${RESTAURANT_CUISINE}",i](${LONDON_BBOX});
  nwr["shop"~"supermarket|convenience|greengrocer|food",i]["name"~"${GROCERY_NAME}",i](${LONDON_BBOX});
);
out tags center;`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) {
      const data = await res.json() as { elements: OverpassElement[] };
      return data.elements;
    }
    // 429/504 are Overpass rate/load signals: back off and retry.
    const backoff = 5000 * attempt;
    console.warn(`Overpass HTTP ${res.status}, retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`);
    await sleep(backoff);
  }
  throw new Error('Overpass failed after retries');
}

interface Place { name: string; type: SpotType; lat: number; lon: number; }

function spotType(el: OverpassElement): SpotType {
  if (el.tags?.shop) return 'grocery';
  const cuisine = (el.tags?.cuisine ?? '').toLowerCase();
  return HK_CUISINE.test(cuisine) ? 'hk' : 'asian-food';
}

function toPlaces(elements: OverpassElement[]): Place[] {
  return elements.flatMap(el => {
    const point = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
    const name = el.tags?.name;
    if (!point || !name) return [];
    return [{ name, type: spotType(el), lat: point.lat, lon: point.lon }];
  });
}

function readJson<T>(p: string, fallback: T): T {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) as T : fallback;
}

async function main() {
  const locations = locationsJson as unknown as Record<string, LocationInfo>;
  const masterList = readJson<AsianSpot[]>(OUT_PATH, []);
  const seeded = readJson<string[]>(SEEDED_PATH, []);
  const seededSet = new Set(seeded);

  const newKeys = Object.keys(locations).filter(key => !seededSet.has(key));
  if (newKeys.length === 0) {
    console.log('No new locations to seed; every location is already in the seeded tracker.');
    return;
  }
  console.log(`New location(s) to seed: ${newKeys.join(', ')}`);
  if (process.env.DRY === '1') {
    console.log('DRY run — no Overpass call, nothing written.');
    return;
  }

  console.log('Querying Overpass for East Asian restaurants, cafes and grocers across London...');
  const places = toPlaces(await queryAllLondon());
  console.log(`Fetched ${places.length} candidate spots across London`);

  // Existing names (case-insensitive) so a spot already in the master list isn't
  // re-added when a new neighbouring location also sees it.
  const have = new Set(masterList.map(s => s.name.toLowerCase()));
  let added = 0;
  for (const key of newKeys) {
    const anchor = { lat: locations[key].point.lat, lon: locations[key].point.lon };
    const inRange = places
      .filter(p => distanceKm(anchor, p) <= RADIUS_KM)
      .filter(p => !isExcluded(p.name))
      .filter(p => (have.has(p.name.toLowerCase()) ? false : have.add(p.name.toLowerCase())));
    masterList.push(...inRange);
    added += inRange.length;
    console.log(`${locations[key].displayName}: +${inRange.length} new spots`);
  }

  masterList.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(masterList, null, 2)}\n`, 'utf8');
  fs.writeFileSync(SEEDED_PATH, `${JSON.stringify([...seeded, ...newKeys], null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${masterList.length} spots, +${added}); recorded ${newKeys.length} location(s) as seeded.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
