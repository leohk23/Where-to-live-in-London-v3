import fs from 'fs';
import path from 'path';
import locationsJson from '../src/data/locations.json' with { type: 'json' };
import { PRIMARY_SCHOOL_RADIUS_KM, SECONDARY_SCHOOL_RADIUS_KM } from '../src/lib/constants';

type Phase = 'Primary' | 'Secondary';
type GenderOfEntry = 'Girls' | 'Boys';

interface LocationInfo {
  displayName: string;
  naptan?: string;
  station: string;
  point: { lat: number; lon: number };
}

interface OfstedRow {
  URN: string;
  'School name': string;
  'Ofsted phase': string;
  Region: string;
  'Admissions policy': string;
  'Local authority': string;
  Postcode: string;
  'Latest OEIF overall effectiveness': string;
  'Faith grouping': string;
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface School extends Coordinates {
  urn: string;
  name: string;
  phase: Phase;
  outstanding: boolean;
  good: boolean;
  grammar: boolean;
  genderOfEntry?: GenderOfEntry;
  faith?: boolean;
}

const OFSTED_CSV = path.resolve(process.cwd(), 'ofsted-latest-inspections-apr-2026.csv');
const OFSTED_URL = 'https://assets.publishing.service.gov.uk/media/6a06d8adee62840dba48a304/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Apr_2026.csv';
const OUT_PATH = path.resolve(process.cwd(), 'src/data/schools.json');
const MAX_CACHED_CSV_BYTES = 50 * 1024 * 1024;
const POSTCODE_COORDS_CSV = path.resolve(process.cwd(), 'scripts/school-postcode-coords.csv');

function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  if (!headers) return [];

  return dataRows
    .filter(dataRow => dataRow.some(cell => cell.trim()))
    .map(dataRow => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ''])));
}

function normalizePostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, '');
}

// School postcode -> coordinates, from the committed preprocessed dataset
// (scripts/school-postcode-coords.csv). Geocoding therefore needs no network.
// Regenerate that file from a full UK postcode dataset only when new school
// postcodes appear (see scripts/build-school-postcode-coords).
function loadPostcodeCoords(): Map<string, Coordinates> {
  const out = new Map<string, Coordinates>();
  const lines = fs.readFileSync(POSTCODE_COORDS_CSV, 'utf8').split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) { // skip header row
    const line = lines[i];
    if (!line) continue;
    const [postcode, lat, lon] = line.split(',');
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!postcode || Number.isNaN(latNum) || Number.isNaN(lonNum)) continue;
    out.set(normalizePostcode(postcode), { lat: latNum, lon: lonNum });
  }
  console.log(`Loaded ${out.size} postcode coordinates from ${POSTCODE_COORDS_CSV}`);
  return out;
}

async function loadOfstedCsv(): Promise<string> {
  if (fs.existsSync(OFSTED_CSV)) {
    console.log(`Using cached Ofsted CSV: ${OFSTED_CSV}`);
    return fs.readFileSync(OFSTED_CSV, 'utf8');
  }

  console.log('Downloading Ofsted latest inspections CSV...');
  const res = await fetch(OFSTED_URL);
  if (!res.ok) throw new Error(`Ofsted CSV HTTP ${res.status}`);
  const text = await res.text();
  const bytes = Buffer.byteLength(text, 'utf8');
  const sizeMb = (bytes / 1024 / 1024).toFixed(1);

  if (bytes <= MAX_CACHED_CSV_BYTES) {
    fs.writeFileSync(OFSTED_CSV, text, 'utf8');
    console.log(`Cached Ofsted CSV: ${OFSTED_CSV} (${sizeMb} MB)`);
  } else {
    console.log(`Skipped caching Ofsted CSV because it is ${sizeMb} MB`);
  }

  return text;
}

function distanceKm(a: Coordinates, b: Coordinates): number {
  const radius = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

// Name-based detection misses single-sex schools whose name doesn't say so — notably the boys
// grammars and several girls grammars. Curate those so gender filtering is right where it matters.
const GENDER_OVERRIDE: Record<string, GenderOfEntry> = {
  'Sutton Grammar School': 'Boys',
  "Wilson's School": 'Boys',
  'Tiffin School': 'Boys',
  'Wallington County Grammar School': 'Boys',
  "Queen Elizabeth's School, Barnet": 'Boys',
  "St Olave's and St Saviour's Grammar School": 'Boys',
  'The Henrietta Barnett School': 'Girls',
  'Newstead Wood School': 'Girls',
  'Woodford County High School': 'Girls',
  "St Michael's Catholic Grammar School": 'Girls',
};

function inferGenderOfEntry(name: string): GenderOfEntry | undefined {
  if (GENDER_OVERRIDE[name]) return GENDER_OVERRIDE[name];
  const normalized = name.toLowerCase();
  const girls = /\bgirls?\b|\bgirls['’]\b|\bfor girls\b/.test(normalized);
  const boys = /\bboys?\b|\bboys['’]\b|\bfor boys\b/.test(normalized);

  if (girls && !boys) return 'Girls';
  if (boys && !girls) return 'Boys';
  return undefined;
}

async function main() {
  const rows = parseCsv(await loadOfstedCsv()) as unknown as OfstedRow[];
  const schoolRows = rows.filter(row =>
    (row['Ofsted phase'] === 'Primary' || row['Ofsted phase'] === 'Secondary')
    && row.Postcode.trim()
  );
  const postcodeCoordinates = loadPostcodeCoords();

  const schools: School[] = schoolRows.flatMap(row => {
    const point = postcodeCoordinates.get(normalizePostcode(row.Postcode));
    if (!point) return [];
    return [{
      urn: row.URN,
      name: row['School name'],
      phase: row['Ofsted phase'] as Phase,
      outstanding: row['Latest OEIF overall effectiveness'] === '1',
      good: row['Latest OEIF overall effectiveness'] === '2',
      grammar: row['Admissions policy'].trim().toLowerCase() === 'selective',
      genderOfEntry: inferGenderOfEntry(row['School name']),
      // A faith school admits partly on religious grounds, so it's not realistically open to all —
      // the app can filter these out. 'Faith grouping' is Non-faith / Christian / Jewish / Muslim /…
      faith: Boolean(row['Faith grouping']?.trim()) && row['Faith grouping'].trim() !== 'Non-faith',
      ...point,
    }];
  });

  const locations = locationsJson as Record<string, LocationInfo>;
  const locationEntries = Object.entries(locations);
  const output = schools
    .filter(school => locationEntries.some(([, location]) => {
      const radiusKm = school.phase === 'Primary' ? PRIMARY_SCHOOL_RADIUS_KM : SECONDARY_SCHOOL_RADIUS_KM;
      return distanceKm(location.point, school) <= radiusKm;
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.urn.localeCompare(b.urn))
    .map(school => ({
      urn: school.urn,
      name: school.name,
      phase: school.phase,
      lat: Math.round(school.lat * 1_000_000) / 1_000_000,
      lon: Math.round(school.lon * 1_000_000) / 1_000_000,
      outstanding: school.outstanding,
      good: school.good,
      grammar: school.grammar,
      ...(school.genderOfEntry ? { genderOfEntry: school.genderOfEntry } : {}),
      ...(school.faith ? { faith: true } : {}),
    }));

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH} with ${output.length} schools near ${locationEntries.length} canonical locations (${schools.length}/${schoolRows.length} geocoded primary/secondary schools scanned)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
