/* scripts/build-school-postcode-coords.ts
 *
 * Rebuilds scripts/school-postcode-coords.csv — the lat/long of every postcode
 * referenced in the Ofsted schools CSV. Committing this small (~0.5 MB) lookup lets
 * generate-nearby-schools.ts geocode schools fully offline: no postcodes.io calls and
 * no ~90 MB national postcode download each time it runs.
 *
 * Only needs rebuilding when the Ofsted CSV gains postcodes not already covered.
 *
 * Prerequisite: a full UK "postcode -> lat/long" CSV with columns
 * id,postcode,latitude,longitude (e.g. the dwyl/uk-postcodes-latitude-longitude-complete-csv
 * dataset, unzipped). Point at it via the POSTCODE_CSV env var:
 *
 *   POSTCODE_CSV=/path/to/ukpostcodes.csv npx tsx scripts/build-school-postcode-coords.ts
 */
import fs from 'fs';
import path from 'path';

const OFSTED_CSV = path.resolve(process.cwd(), 'ofsted-latest-inspections-apr-2026.csv');
const OUT_PATH = path.resolve(process.cwd(), 'scripts/school-postcode-coords.csv');
const SOURCE_CSV = process.env.POSTCODE_CSV;

const normalizePostcode = (postcode: string) => postcode.toUpperCase().replace(/\s+/g, '');

// Minimal quote-aware CSV parser (the Ofsted file has quoted, comma-bearing fields).
function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { value += '"'; i += 1; } else { quoted = !quoted; }
    } else if (char === ',' && !quoted) {
      row.push(value); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length > 0) { row.push(value); rows.push(row); }

  const [headers, ...dataRows] = rows;
  if (!headers) return [];
  return dataRows
    .filter(dataRow => dataRow.some(cell => cell.trim()))
    .map(dataRow => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] ?? ''])));
}

function main() {
  if (!SOURCE_CSV) {
    throw new Error('Set POSTCODE_CSV to a full UK postcode CSV (id,postcode,latitude,longitude).');
  }

  const ofstedRows = parseCsv(fs.readFileSync(OFSTED_CSV, 'utf8'));
  const needed = new Set(
    ofstedRows.map(row => row.Postcode).filter(Boolean).map(normalizePostcode),
  );
  console.log(`Ofsted unique postcodes: ${needed.size}`);

  // Stream the national CSV by line; keep only the postcodes we need.
  const source = fs.readFileSync(SOURCE_CSV, 'utf8');
  const found: Array<[string, string, string]> = [];
  let cursor = source.indexOf('\n') + 1; // skip header
  while (cursor < source.length) {
    let end = source.indexOf('\n', cursor);
    if (end < 0) end = source.length;
    const line = source.slice(cursor, end);
    cursor = end + 1;
    const c1 = line.indexOf(',');
    if (c1 < 0) continue;
    const c2 = line.indexOf(',', c1 + 1);
    if (c2 < 0) continue;
    const c3 = line.indexOf(',', c2 + 1);
    if (c3 < 0) continue;
    const postcode = normalizePostcode(line.slice(c1 + 1, c2));
    if (!needed.has(postcode)) continue;
    const lat = Number(line.slice(c2 + 1, c3));
    const lon = Number(line.slice(c3 + 1));
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    found.push([postcode, lat.toFixed(5), lon.toFixed(5)]);
  }

  found.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const lines = ['postcode,lat,lon', ...found.map(record => record.join(','))];
  fs.writeFileSync(OUT_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${found.length}/${needed.size} geocoded postcodes to ${OUT_PATH}`);
}

main();
