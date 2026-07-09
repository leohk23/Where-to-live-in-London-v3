import fs from 'fs';
import path from 'path';
import locationWardPolygons from '../src/data/generated/location-ward-polygons.json';

// Ward-level crime rates for the wards used by curated locations.
//
// Crime numerator: MPS "Ward Level Crime" (all offence categories), summed over the latest 12
//   available months — a committed CSV snapshot (scripts/data/mps-ward-crime.csv), refreshed by
//   dropping in a newer download from https://data.london.gov.uk/dataset/recorded_crime_summary.
// Population denominator: 2021 Census usual residents (Nomis NM_2021_1 / TS001), per 2022 ward.
// Both are keyed on 2022 ward codes (WD22CD), the same vintage generate-location-ward-polygons.ts
// now produces, so everything joins by code. No live Police API scrape.

interface LocationBoundary {
  ladCode: string;
  wards?: Array<{ code: string; name: string }>;
}

interface PopulationRow {
  wardCode: string;
  ladCode: string;
  wardName: string;
  population: number;
}

const OUT_PATH = path.resolve(process.cwd(), 'src/data/generated/ward-crime.json');
const POPULATION_PATH = path.resolve(process.cwd(), 'scripts/data/ward-population.csv');
const MPS_CRIME_PATH = path.resolve(process.cwd(), 'scripts/data/mps-ward-crime.csv');
const NOMIS_2021_URL = 'https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.data.csv';
const CENSUS_WARD_TYPE = 'TYPE153'; // 2022 wards, the vintage 2021-census outputs are published on
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

const num = (value: string) => Number(String(value ?? '').replace(/,/g, '')) || 0;

// The wards actually used by curated locations, deduped by code.
function usedWards(): Array<{ code: string; name: string; ladCode: string }> {
  const byCode = new Map<string, { code: string; name: string; ladCode: string }>();
  for (const boundary of Object.values(boundaries)) {
    for (const ward of boundary.wards ?? []) {
      if (!ward.code || byCode.has(ward.code)) continue;
      byCode.set(ward.code, { code: ward.code, name: ward.name, ladCode: boundary.ladCode });
    }
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return await res.text();
}

// 2021-census usual residents per 2022 ward = household residents (restype 1) + communal (restype 2).
async function refreshPopulationCsv(ladCodes: string[]) {
  const rows: PopulationRow[] = [];
  for (const ladCode of ladCodes) {
    const byCode = new Map<string, PopulationRow>();
    for (const restype of [1, 2]) {
      const qs = new URLSearchParams({
        geography: `${ladCode}${CENSUS_WARD_TYPE}`,
        c2021_restype_3: String(restype),
        measures: '20100',
        select: 'GEOGRAPHY_CODE,GEOGRAPHY_NAME,OBS_VALUE',
      });
      for (const row of parseCsv(await fetchText(`${NOMIS_2021_URL}?${qs}`))) {
        const wardCode = row.GEOGRAPHY_CODE;
        if (!wardCode) continue;
        const existing = byCode.get(wardCode);
        if (existing) existing.population += num(row.OBS_VALUE);
        else byCode.set(wardCode, { wardCode, ladCode, wardName: row.GEOGRAPHY_NAME, population: num(row.OBS_VALUE) });
      }
    }
    rows.push(...byCode.values());
  }

  fs.mkdirSync(path.dirname(POPULATION_PATH), { recursive: true });
  fs.writeFileSync(
    POPULATION_PATH,
    [
      'wardCode,ladCode,wardName,population,source',
      ...rows.map(row => [row.wardCode, row.ladCode, row.wardName, row.population, 'Nomis NM_2021_1 TS001 2021 Census']
        .map(csvCell).join(',')),
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
    population: num(row.population),
  }]));
}

// Sum MPS ward-level crime (all categories) over the latest 12 months, keyed by 2022 ward code.
function loadCrime(): { crimeByCode: Map<string, number>; months: string[] } {
  const text = fs.readFileSync(MPS_CRIME_PATH, 'utf8');
  const [header, ...rows] = rowsFromCsv(text);
  const monthCols = header
    .map((name, index) => ({ name, index }))
    .filter(col => /^\d{6}$/.test(col.name));
  const months = monthCols.map(col => col.name).sort().slice(-12);
  const usedIndexes = monthCols.filter(col => months.includes(col.name)).map(col => col.index);
  const codeIndex = header.indexOf('WardCode');
  if (codeIndex < 0) throw new Error('MPS crime CSV missing WardCode column');

  const crimeByCode = new Map<string, number>();
  for (const row of rows) {
    const code = row[codeIndex];
    if (!code) continue;
    const crimes = usedIndexes.reduce((sum, i) => sum + num(row[i]), 0);
    crimeByCode.set(code, (crimeByCode.get(code) ?? 0) + crimes);
  }
  return { crimeByCode, months };
}

async function main() {
  const wards = usedWards();
  if (!wards.length) throw new Error('No ward polygons found. Run npm run generate-ward-polygons first.');
  const ladCodes = [...new Set(wards.map(w => w.ladCode))];

  const needsPopulation = !fs.existsSync(POPULATION_PATH) || process.env.REFRESH_POPULATION === '1';
  if (needsPopulation) {
    console.log('Fetching 2021-census ward population...');
    await refreshPopulationCsv(ladCodes);
  }
  let population = loadPopulation();
  const missingPop = wards.filter(ward => !population.get(ward.code)?.population);
  if (missingPop.length && !needsPopulation) {
    console.log(`Population CSV missing ${missingPop.length} used ward(s); refreshing...`);
    await refreshPopulationCsv(ladCodes);
    population = loadPopulation();
  }

  const { crimeByCode, months } = loadCrime();
  console.log(`MPS crime: ${months[0]} to ${months[months.length - 1]} (${months.length} months)`);

  const missing: string[] = [];
  const wardRows = Object.fromEntries(wards.flatMap(ward => {
    const pop = population.get(ward.code)?.population;
    const crimes = crimeByCode.get(ward.code);
    if (!pop || crimes === undefined) {
      missing.push(`${ward.name} (${ward.code})${!pop ? ' [no population]' : ''}${crimes === undefined ? ' [no crime]' : ''}`);
      return [];
    }
    return [[ward.code, {
      code: ward.code,
      name: ward.name,
      ladCode: ward.ladCode,
      crimes,
      population: pop,
      crimesPer1000: Math.round((crimes / pop) * 1000 * 10) / 10,
    }]];
  }));

  if (missing.length) {
    console.warn(`⚠ ${missing.length} used ward(s) fell back to borough crime:\n  ${missing.join('\n  ')}`);
  }

  const toIso = (m: string) => `${m.slice(0, 4)}-${m.slice(4)}`;
  fs.writeFileSync(OUT_PATH, `${JSON.stringify({
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'MPS Ward Level Crime (all offences), latest 12 months',
      sourceUrl: 'https://data.london.gov.uk/dataset/recorded_crime_summary',
      months,
      period: `${toIso(months[0])} to ${toIso(months[months.length - 1])}`,
      populationSource: 'Nomis NM_2021_1 TS001 2021 Census usual residents by 2022 ward',
      populationSourceUrl: 'https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1',
    },
    wards: wardRows,
  }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${Object.keys(wardRows).length} wards)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
