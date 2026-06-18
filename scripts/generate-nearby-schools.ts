import fs from 'fs';
import path from 'path';
import locationsJson from '../src/data/locations.json' with { type: 'json' };

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
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface School extends Coordinates {
  urn: string;
  name: string;
  phase: Phase;
  localAuthority: string;
  postcode: string;
  outstanding: boolean;
  grammar: boolean;
  genderOfEntry?: GenderOfEntry;
}

interface LocationSchoolStats {
  displayName: string;
  anchorStation: string;
  radiusKm: number;
  primaryRadiusKm: number;
  secondaryRadiusKm: number;
  primaryOutstandingSchools: number;
  primarySchools: number;
  secondaryOutstandingSchools: number;
  secondarySchools: number;
  grammarSchools: number;
  nearestOutstandingSchools: Array<{
    name: string;
    phase: Phase;
    distanceKm: number;
    genderOfEntry?: GenderOfEntry;
  }>;
  nearestPrimaryOutstandingSchools: Array<{
    name: string;
    phase: Phase;
    distanceKm: number;
    genderOfEntry?: GenderOfEntry;
  }>;
  nearestSecondaryOutstandingSchools: Array<{
    name: string;
    phase: Phase;
    distanceKm: number;
    genderOfEntry?: GenderOfEntry;
  }>;
  nearestGrammarSchools: Array<{
    name: string;
    phase: Phase;
    distanceKm: number;
    genderOfEntry?: GenderOfEntry;
  }>;
}

const OFSTED_CSV = path.resolve(process.cwd(), 'ofsted-latest-inspections-apr-2026.csv');
const OFSTED_URL = 'https://assets.publishing.service.gov.uk/media/6a06d8adee62840dba48a304/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Apr_2026.csv';
const OUT_PATH = path.resolve(process.cwd(), 'src/data/location-schools.json');
const MAX_CACHED_CSV_BYTES = 50 * 1024 * 1024;
const PRIMARY_RADIUS_KM = 3;
const SECONDARY_RADIUS_KM = 5;
const NEAREST_OUTSTANDING_LIMIT = 5;
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

function inferGenderOfEntry(name: string): GenderOfEntry | undefined {
  const normalized = name.toLowerCase();
  const girls = /\bgirls?\b|\bgirls['’]\b|\bfor girls\b/.test(normalized);
  const boys = /\bboys?\b|\bboys['’]\b|\bfor boys\b/.test(normalized);

  if (girls && !boys) return 'Girls';
  if (boys && !girls) return 'Boys';
  return undefined;
}

function toNearbySchools(
  items: Array<{ school: School; distanceKm: number }>,
  limit = NEAREST_OUTSTANDING_LIMIT,
) {
  return items
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit)
    .map(item => ({
      name: item.school.name,
      phase: item.school.phase,
      distanceKm: Math.round(item.distanceKm * 10) / 10,
      genderOfEntry: item.school.genderOfEntry,
    }));
}

function nearestOutstandingSchools(
  items: Array<{ school: School; distanceKm: number }>,
  limit = NEAREST_OUTSTANDING_LIMIT,
) {
  return toNearbySchools(
    items.filter(item => item.school.outstanding),
    limit,
  );
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
      localAuthority: row['Local authority'],
      postcode: row.Postcode,
      outstanding: row['Latest OEIF overall effectiveness'] === '1',
      grammar: row['Admissions policy'].trim().toLowerCase() === 'selective',
      genderOfEntry: inferGenderOfEntry(row['School name']),
      ...point,
    }];
  });

  const locations = locationsJson as Record<string, LocationInfo>;
  const output: Record<string, LocationSchoolStats> = {};

  for (const [locationKey, location] of Object.entries(locations)) {
    // Anchor on the canonical registry point (single source of truth), not a live TfL lookup.
    const anchor: Coordinates = { lat: location.point.lat, lon: location.point.lon };
    const schoolDistances = schools
      .map(school => ({ school, distanceKm: distanceKm(anchor, school) }));
    const primary = schoolDistances.filter(item =>
      item.school.phase === 'Primary' && item.distanceKm <= PRIMARY_RADIUS_KM
    );
    const secondary = schoolDistances.filter(item =>
      item.school.phase === 'Secondary' && item.distanceKm <= SECONDARY_RADIUS_KM
    );
    const nearby = [...primary, ...secondary];
    const grammar = secondary.filter(item => item.school.grammar);
    const nearestOutstanding = nearestOutstandingSchools(nearby);
    const nearestPrimaryOutstanding = nearestOutstandingSchools(primary);
    const nearestSecondaryOutstanding = nearestOutstandingSchools(secondary);
    const nearestGrammar = toNearbySchools(grammar);

    output[locationKey] = {
      displayName: location.displayName,
      anchorStation: location.station,
      radiusKm: SECONDARY_RADIUS_KM,
      primaryRadiusKm: PRIMARY_RADIUS_KM,
      secondaryRadiusKm: SECONDARY_RADIUS_KM,
      primaryOutstandingSchools: primary.filter(item => item.school.outstanding).length,
      primarySchools: primary.length,
      secondaryOutstandingSchools: secondary.filter(item => item.school.outstanding).length,
      secondarySchools: secondary.length,
      grammarSchools: grammar.length,
      nearestOutstandingSchools: nearestOutstanding,
      nearestPrimaryOutstandingSchools: nearestPrimaryOutstanding,
      nearestSecondaryOutstandingSchools: nearestSecondaryOutstanding,
      nearestGrammarSchools: nearestGrammar,
    };
    console.log(`${location.displayName}: ${primary.length} primary within ${PRIMARY_RADIUS_KM}km, ${secondary.length} secondary, ${grammar.length} grammar/selective within ${SECONDARY_RADIUS_KM}km`);
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH} from ${schools.length}/${schoolRows.length} primary/secondary schools with geocoded postcodes`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
