import fs from 'fs';
import path from 'path';
import locationWardPolygons from '../src/data/generated/location-ward-polygons.json';

type Position = [number, number];
type PolygonGeometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

interface WardBoundary {
  code: string;
  name: string;
  geometry: PolygonGeometry;
}

interface LocationBoundary {
  ladCode: string;
  wards?: WardBoundary[];
}

interface UsedWard extends WardBoundary {
  ladCode: string;
}

interface PopulationRow {
  wardCode: string;
  ladCode: string;
  wardName: string;
  population: number;
  sourceYear: string;
  source: string;
}

interface PoliceCrime {
  id?: number;
  persistent_id?: string;
}

const OUT_PATH = path.resolve(process.cwd(), 'src/data/generated/ward-crime.json');
const POPULATION_PATH = path.resolve(process.cwd(), 'scripts/data/ward-population.csv');
const CACHE_PATH = path.resolve(process.cwd(), 'scripts/data/ward-crime-cache.json');
const POLICE_DATES_URL = 'https://data.police.uk/api/crimes-street-dates';
const POLICE_CRIME_URL = 'https://data.police.uk/api/crimes-street/all-crime';
const NOMIS_LADS_URL = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_144_1/geography/2092957699TYPE464.def.sdmx.json';
const NOMIS_DATA_URL = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_144_1.data.csv';
const USER_AGENT = 'WhereToLiveInLondon/1.0';

const boundaries = locationWardPolygons as Record<string, LocationBoundary>;

function rowsFromCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter(r => r.some(c => c.length));
}

function parseCsv(text: string): Record<string, string>[] {
  const [header, ...rows] = rowsFromCsv(text);
  if (!header) return [];
  return rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])));
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function fetchText(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return JSON.parse(await fetchText(url, init)) as T;
}

function annotationValue(item: unknown, title: string): string | null {
  const annotations = (item as { annotations?: { annotation?: unknown } }).annotations?.annotation;
  const list = Array.isArray(annotations) ? annotations : annotations ? [annotations] : [];
  const found = list.find(a => (a as { annotationtitle?: string }).annotationtitle === title);
  const value = (found as { annotationtext?: unknown } | undefined)?.annotationtext;
  return value === undefined || value === null ? null : String(value);
}

function codelistCodes(json: unknown): Array<{ value: string | number; description?: { value?: string } }> {
  const lists = (json as { structure?: { codelists?: { codelist?: unknown } } }).structure?.codelists?.codelist;
  const list = Array.isArray(lists) ? lists[0] : lists;
  const codes = (list as { code?: unknown })?.code;
  return (Array.isArray(codes) ? codes : codes ? [codes] : []) as Array<{ value: string | number; description?: { value?: string } }>;
}

function usedWards(): UsedWard[] {
  const byCode = new Map<string, UsedWard>();
  for (const boundary of Object.values(boundaries)) {
    for (const ward of boundary.wards ?? []) {
      if (!ward.code || byCode.has(ward.code)) continue;
      byCode.set(ward.code, { ...ward, ladCode: boundary.ladCode });
    }
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

async function refreshPopulationCsv(wards: UsedWard[]) {
  const ladCodes = [...new Set(wards.map(w => w.ladCode))];
  const neededWardCodes = new Set(wards.map(w => w.code));
  const ladJson = await fetchJson<unknown>(NOMIS_LADS_URL);
  const ladNomisCode = new Map<string, string>();

  for (const code of codelistCodes(ladJson)) {
    const geogCode = annotationValue(code, 'GeogCode');
    if (geogCode) ladNomisCode.set(geogCode, String(code.value));
  }

  const rows: PopulationRow[] = [];
  for (const ladCode of ladCodes) {
    const nomis = ladNomisCode.get(ladCode);
    if (!nomis) throw new Error(`No Nomis LAD code for ${ladCode}`);
    const qs = new URLSearchParams({
      date: 'latest',
      geography: `${nomis}TYPE295`,
      cell: '0',
      rural_urban: '0',
      measures: '20100',
    });
    const csv = await fetchText(`${NOMIS_DATA_URL}?${qs}`);
    for (const row of parseCsv(csv)) {
      const wardCode = row.GEOGRAPHY_CODE;
      if (!neededWardCodes.has(wardCode)) continue;
      rows.push({
        wardCode,
        ladCode,
        wardName: row.GEOGRAPHY_NAME,
        population: Number(row.OBS_VALUE),
        sourceYear: row.DATE_NAME,
        source: 'Nomis NM_144_1 KS101EW 2011 Census',
      });
    }
  }

  const found = new Set(rows.map(row => row.wardCode));
  const missing = [...neededWardCodes].filter(code => !found.has(code));
  if (missing.length) throw new Error(`Missing ward population for: ${missing.join(', ')}`);

  fs.mkdirSync(path.dirname(POPULATION_PATH), { recursive: true });
  fs.writeFileSync(
    POPULATION_PATH,
    [
      'wardCode,ladCode,wardName,population,sourceYear,source',
      ...rows.map(row => [
        row.wardCode,
        row.ladCode,
        row.wardName,
        row.population,
        row.sourceYear,
        row.source,
      ].map(csvCell).join(',')),
      '',
    ].join('\n'),
    'utf8',
  );
}

function loadPopulation(): Map<string, PopulationRow> {
  const rows = parseCsv(fs.readFileSync(POPULATION_PATH, 'utf8'));
  return new Map(rows.map(row => [row.wardCode, {
    wardCode: row.wardCode,
    ladCode: row.ladCode,
    wardName: row.wardName,
    population: Number(row.population),
    sourceYear: row.sourceYear,
    source: row.source,
  }]));
}

function outerRings(geometry: PolygonGeometry): Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates[0] ? [geometry.coordinates[0]] : [];
  return geometry.coordinates.flatMap(polygon => polygon[0] ? [polygon[0]] : []);
}

function thinRing(ring: Position[]) {
  const maxPoints = 90;
  if (ring.length <= maxPoints) return ring;
  // ponytail: point thinning keeps Police API polygons short; use topo-aware simplification if edge precision starts mattering.
  const last = ring[ring.length - 1];
  const points = Array.from({ length: maxPoints - 1 }, (_, i) => ring[Math.floor(i * (ring.length - 1) / (maxPoints - 2))]);
  return [...points, last];
}

function ringToPolicePoly(ring: Position[]) {
  return thinRing(ring)
    .map(([lon, lat]) => `${lat},${lon}`)
    .join(':');
}

async function fetchPoliceCrimes(poly: string, date: string, attempt = 0): Promise<PoliceCrime[]> {
  await new Promise(resolve => setTimeout(resolve, 350));
  const body = new URLSearchParams({ poly, date });
  const res = await fetch(POLICE_CRIME_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body,
  });

  if (res.ok) return await res.json() as PoliceCrime[];
  if ((res.status === 429 || res.status === 503) && attempt < 8) {
    const text = await res.text();
    const retryAfter = Number(res.headers.get('Retry-After')) || Number(text.match(/"retry_after":\s*(\d+)/)?.[1]) || 0;
    const waitMs = retryAfter ? (retryAfter + 1) * 1000 : 1500 * (attempt + 1);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return fetchPoliceCrimes(poly, date, attempt + 1);
  }
  throw new Error(`Police API ${date} -> HTTP ${res.status}: ${await res.text()}`);
}

async function countWardMonthCrimes(ward: UsedWard, month: string) {
  const seen = new Set<string>();
  for (const ring of outerRings(ward.geometry)) {
    const crimes = await fetchPoliceCrimes(ringToPolicePoly(ring), month);
    for (const crime of crimes) {
      seen.add(`${month}:${crime.persistent_id || crime.id || JSON.stringify(crime)}`);
    }
  }
  return seen.size;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const wards = usedWards();
  if (!wards.length) throw new Error('No ward polygons found. Run npm run generate-ward-polygons first.');

  if (!fs.existsSync(POPULATION_PATH) || process.env.REFRESH_POPULATION === '1') {
    console.log('Refreshing ward population CSV...');
    await refreshPopulationCsv(wards);
  }

  let population = loadPopulation();
  const missingPopulation = wards.filter(ward => !population.get(ward.code)?.population);
  if (missingPopulation.length) {
    console.log('Population CSV is missing used wards; refreshing...');
    await refreshPopulationCsv(wards);
    population = loadPopulation();
  }

  const dates = await fetchJson<Array<{ date: string }>>(POLICE_DATES_URL);
  const months = dates.map(item => item.date).sort().slice(-12);
  if (months.length < 12) throw new Error(`Only found ${months.length} Police API months.`);

  let done = 0;
  const total = wards.length;
  const crimeCounts = new Map<string, number>();
  const cache = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Record<string, number>
    : {};
  const saveCache = () => fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');

  await mapLimit(wards, 1, async ward => {
    let crimes = 0;
    for (const month of months) {
      const cacheKey = `${ward.code}:${month}`;
      if (cache[cacheKey] === undefined) {
        cache[cacheKey] = await countWardMonthCrimes(ward, month);
        saveCache();
      }
      crimes += cache[cacheKey];
    }
    crimeCounts.set(ward.code, crimes);
    done += 1;
    console.log(`${done}/${total} ${ward.name}: ${crimes}`);
  });

  const wardRows = Object.fromEntries(wards.map(ward => {
    const pop = population.get(ward.code);
    if (!pop) throw new Error(`No population for ${ward.code}`);
    const crimes = crimeCounts.get(ward.code) ?? 0;
    return [ward.code, {
      code: ward.code,
      name: ward.name,
      ladCode: ward.ladCode,
      crimes,
      population: pop.population,
      crimesPer1000: Math.round((crimes / pop.population) * 1000 * 10) / 10,
    }];
  }));

  fs.writeFileSync(OUT_PATH, `${JSON.stringify({
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'Police API street-level all-crime counts by ward polygon',
      sourceUrl: POLICE_CRIME_URL,
      months,
      period: `${months[0]} to ${months[months.length - 1]}`,
      populationSource: 'Nomis NM_144_1 KS101EW 2011 Census ward population',
      populationSourceUrl: 'https://www.nomisweb.co.uk/api/v01/dataset/NM_144_1',
    },
    wards: wardRows,
  }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
