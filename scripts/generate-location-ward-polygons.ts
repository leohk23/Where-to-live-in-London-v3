import fs from 'fs';
import path from 'path';
import polygonClipping, { type Geom } from 'polygon-clipping';
import locationData from '../src/data/locations.json';
import allStationsJson from '../src/data/generated/all-stations.json';
import { LOCATION_WARDS } from './location-wards';
import { resolveLocationPoint, pointForNaptan } from '../src/lib/location-point';

interface AllStation { naptan: string; name: string; lat: number; lon: number; lines: string[] }
const ALL_STATIONS = allStationsJson as AllStation[];

// Naptans already curated as commute anchors somewhere — excluded from each ward's "extra stations"
// (those already carry journey times). What's left is the not-yet-modelled stations, surfaced as
// nearby placeholders in the commute card.
const CURATED_NAPTANS = new Set<string>();
for (const loc of Object.values(locationData as Record<string, { naptan?: string; commuteStations?: Array<{ naptan: string }> }>)) {
  if (loc.naptan) CURATED_NAPTANS.add(loc.naptan);
  for (const s of loc.commuteStations ?? []) CURATED_NAPTANS.add(s.naptan);
}

interface Coordinate {
  lat: number;
  lon: number;
}

interface Feature {
  type: 'Feature';
  properties: {
    WD13CD?: string;
    WD22CD?: string;
    WD24CD?: string;
    WD25CD?: string;
    WD13NM?: string;
    WD22NM?: string;
    WD24NM?: string;
    WD25NM?: string;
    [key: string]: unknown;
  };
  geometry: Geometry;
}

interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

const OUT_PATH = path.resolve(process.cwd(), 'src/data/generated/location-ward-polygons.json');
// 2022 ward boundaries (WD22CD/WD22NM) from the ONS Open Geography Portal, queried per borough.
// This is the vintage the 2021 Census (ward population) and MPS ward-level crime are keyed on,
// so ward codes join cleanly downstream (see generate-ward-crime.ts).
const WARD_BOUNDARY_URL = (ladCode: string) =>
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/'
  + 'Wards_December_2022_Boundaries_UK_BGC/FeatureServer/0/query'
  + `?where=LAD22CD%3D%27${ladCode}%27&outFields=WD22CD,WD22NM&f=geojson&resultRecordCount=2000`;

// Anchor coordinate and borough (LAD) code now come from the canonical location registry
// (src/data/locations.json) so "where is this location" is defined in exactly one place.
const registry = locationData as Record<string, {
  point: Coordinate;
  ladCode: string;
  commuteStations?: Array<{ key: string; naptan: string; point?: Coordinate }>;
}>;

// Anchor = the derived point (centroid of stations for multi-station locations), matching runtime.
const LOCATION_COORDS: Record<string, Coordinate> = Object.fromEntries(
  Object.entries(registry).map(([name, info]) => [name, resolveLocationPoint(info)]),
);

// Individual station pins for multi-station locations (single-station ones just use `anchor`).
const LOCATION_STATIONS: Record<string, Array<{ key: string; lat: number; lon: number }>> = Object.fromEntries(
  Object.entries(registry)
    .filter(([, info]) => (info.commuteStations?.length ?? 0) > 1)
    .map(([name, info]) => [name, info.commuteStations!.map(s => { const p = s.point ?? pointForNaptan(s.naptan); return { key: s.key, lat: p.lat, lon: p.lon }; })]),
);

const LOCATION_LAD_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(registry).map(([name, info]) => [name, info.ladCode]),
);

function getRings(geometry: Geometry): number[][][] {
  if (geometry.type === 'Polygon') return geometry.coordinates as number[][][];
  return (geometry.coordinates as number[][][][]).flat();
}

// Dissolve several ward geometries into one, removing the shared internal borders.
function unionGeometries(geometries: Geometry[]): Geometry {
  const geoms = geometries.map(g => g.coordinates as unknown as Geom);
  const merged = polygonClipping.union(geoms[0], ...geoms.slice(1));
  return { type: 'MultiPolygon', coordinates: merged as unknown as number[][][][] };
}

function pointInRing(point: Coordinate, ring: number[][]) {
  let inside = false;
  const x = point.lon;
  const y = point.lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInGeometry(point: Coordinate, geometry: Geometry) {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates as number[][][];
    return Boolean(outer && pointInRing(point, outer) && !holes.some(hole => pointInRing(point, hole)));
  }

  return (geometry.coordinates as number[][][][]).some(polygon => {
    const [outer, ...holes] = polygon;
    return Boolean(outer && pointInRing(point, outer) && !holes.some(hole => pointInRing(point, hole)));
  });
}

function geometryBBox(geometry: Geometry) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const ring of getRings(geometry)) for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

// Uncurated stations whose point falls inside a ward polygon — the "nearby, no journey data yet"
// placeholders. bbox pre-filter keeps the all-stations sweep cheap; names lose the " Station" noise.
function stationsInWard(geometry: Geometry): Array<{ naptan: string; name: string; lines: string[] }> {
  const bb = geometryBBox(geometry);
  // Keyed by display name so a station reached by two modes on two naptans (NR + tram Wimbledon)
  // shows once with both modes, not twice.
  const byName = new Map<string, { naptan: string; name: string; lines: string[] }>();
  for (const st of ALL_STATIONS) {
    if (CURATED_NAPTANS.has(st.naptan)) continue;
    if (st.lat < bb.minLat || st.lat > bb.maxLat || st.lon < bb.minLon || st.lon > bb.maxLon) continue;
    if (!pointInGeometry({ lat: st.lat, lon: st.lon }, geometry)) continue;
    const name = st.name.replace(/ (Underground|Rail|DLR) Station$/, '').replace(/ Station$/, '');
    const existing = byName.get(name);
    if (existing) existing.lines = [...new Set([...existing.lines, ...st.lines])];
    else byName.set(name, { naptan: st.naptan, name, lines: [...st.lines] });
  }
  return [...byName.values()];
}

function ringCentroid(ring: number[][]): Coordinate {
  const totals = ring.reduce(
    (acc, coord) => ({ lon: acc.lon + coord[0], lat: acc.lat + coord[1] }),
    { lat: 0, lon: 0 },
  );

  return {
    lat: totals.lat / ring.length,
    lon: totals.lon / ring.length,
  };
}

function geometryCentroid(geometry: Geometry): Coordinate {
  const rings = getRings(geometry);
  const largestRing = rings.reduce((largest, ring) => ring.length > largest.length ? ring : largest, rings[0]);
  return ringCentroid(largestRing);
}

function distanceSquared(a: Coordinate, b: Coordinate) {
  const lonScale = Math.cos((a.lat * Math.PI) / 180);
  return (a.lat - b.lat) ** 2 + ((a.lon - b.lon) * lonScale) ** 2;
}

function getWardName(feature: Feature) {
  return feature.properties.WD25NM
    ?? feature.properties.WD24NM
    ?? feature.properties.WD22NM
    ?? feature.properties.WD13NM
    ?? 'Ward boundary';
}

function getWardCode(feature: Feature) {
  return feature.properties.WD25CD
    ?? feature.properties.WD24CD
    ?? feature.properties.WD22CD
    ?? feature.properties.WD13CD
    ?? getWardName(feature);
}

async function fetchWardCollection(ladCode: string): Promise<FeatureCollection> {
  // The ONS ArcGIS service occasionally returns a transient "service unavailable" HTML body;
  // retry with backoff and only accept a real JSON FeatureCollection.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch(WARD_BOUNDARY_URL(ladCode));
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        const json = JSON.parse(text) as FeatureCollection;
        if (json.features?.length) return json;
      }
    } catch { /* retry */ }
    await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
  }
  throw new Error(`Failed to fetch 2022 wards for ${ladCode} after retries`);
}

async function main() {
  const ladCodes = [...new Set(Object.values(LOCATION_LAD_CODES))];
  const wardCollections = new Map<string, FeatureCollection>();

  for (const ladCode of ladCodes) {
    const collection = await fetchWardCollection(ladCode);
    wardCollections.set(ladCode, collection);
    console.log(`Fetched ${ladCode}: ${collection.features.length} wards`);
  }

  // LIST_WARDS=1 — dump the ward names available for each location's borough, so you can
  // pick which ones to merge in scripts/location-wards.ts. Makes no polygon output.
  if (process.env.LIST_WARDS === '1') {
    const catalogue: Record<string, { ladCode: string; containing: string | null; available: string[] }> = {};
    for (const [location, anchor] of Object.entries(LOCATION_COORDS)) {
      const ladCode = LOCATION_LAD_CODES[location];
      const collection = wardCollections.get(ladCode);
      if (!collection) continue;
      const containing = collection.features.find(feature => pointInGeometry(anchor, feature.geometry));
      catalogue[location] = {
        ladCode,
        containing: containing ? getWardName(containing) : null,
        available: collection.features.map(getWardName).sort(),
      };
    }
    const cataloguePath = path.resolve(process.cwd(), 'scripts/data/ward-catalogue.json');
    fs.writeFileSync(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
    console.log(`\nWrote ${cataloguePath} (${Object.keys(catalogue).length} locations).`);
    return;
  }

  // Resolve each location's requested ward features (its explicit list, or the single ward its
  // anchor sits in) into one flat map, so the partition below can treat every location uniformly.
  const requestedFeatures = new Map<string, Feature[]>();
  const fallbackFeature = new Map<string, Feature>(); // the anchor's own ward, kept as a safety net
  for (const [location, anchor] of Object.entries(LOCATION_COORDS)) {
    const ladCode = LOCATION_LAD_CODES[location];
    const collection = wardCollections.get(ladCode);
    if (!collection) throw new Error(`No ward collection for ${location}`);

    const containing = collection.features.find(feature => pointInGeometry(anchor, feature.geometry))
      ?? collection.features
        .map(feature => ({ feature, distance: distanceSquared(anchor, geometryCentroid(feature.geometry)) }))
        .sort((a, b) => a.distance - b.distance)[0]?.feature;
    if (containing) fallbackFeature.set(location, containing);

    const wardList = LOCATION_WARDS[location];
    if (wardList && wardList.length) {
      const feats = wardList.map(name => {
        const feature = collection.features.find(f => getWardName(f).toLowerCase() === name.toLowerCase());
        if (!feature) console.warn(`  ⚠ ${location}: ward "${name}" not found in ${ladCode} — skipped`);
        return feature;
      }).filter((f): f is Feature => Boolean(f));
      requestedFeatures.set(location, feats);
    } else if (containing) {
      requestedFeatures.set(location, [containing]);
    }
  }

  // Partition: give each requested ward to its single nearest anchor (ward centroid → anchor), so no
  // two location polygons overlap. Adding a new anchor therefore just re-slices the wards nearest it
  // away from its neighbours, instead of stacking a second fill on top.
  const wardKey = (location: string, feature: Feature) =>
    `${LOCATION_LAD_CODES[location]}::${getWardName(feature).toLowerCase()}`;
  const wardOwner = new Map<string, string>();
  const wardOwnerDist = new Map<string, number>();
  for (const [location, feats] of requestedFeatures) {
    const anchor = LOCATION_COORDS[location];
    for (const feature of feats) {
      const key = wardKey(location, feature);
      const d2 = distanceSquared(anchor, geometryCentroid(feature.geometry));
      if (!wardOwnerDist.has(key) || d2 < (wardOwnerDist.get(key) as number)) {
        wardOwnerDist.set(key, d2);
        wardOwner.set(key, location);
      }
    }
  }

  const output: Record<string, {
    anchor: Coordinate;
    ladCode: string;
    stations?: Array<{ key: string; lat: number; lon: number }>;
    wards: Array<{ code: string; name: string; centroid: Coordinate; geometry: Geometry; stations: Array<{ naptan: string; name: string; lines: string[] }> }>;
    boundaryLevel: string;
    boundaryName: string;
    geometry: Geometry;
    source: string;
  }> = {};

  for (const [location, anchor] of Object.entries(LOCATION_COORDS)) {
    let matched = (requestedFeatures.get(location) ?? [])
      .filter(feature => wardOwner.get(wardKey(location, feature)) === location);

    if (!matched.length) {
      // Every requested ward went to a nearer anchor — fall back to the anchor's own ward. This only
      // re-overlaps in the degenerate case of two anchors sitting inside the very same ward.
      const fb = fallbackFeature.get(location);
      if (!fb) throw new Error(`No ward geometry for ${location}`);
      matched = [fb];
      console.warn(`  ⚠ ${location}: all requested wards claimed by nearer anchors — using anchor ward "${getWardName(fb)}"`);
    }

    const geometry = matched.length === 1 ? matched[0].geometry : unionGeometries(matched.map(f => f.geometry));
    const boundaryName = matched.map(getWardName).join(', ');
    console.log(`${location}: ${matched.length} ward(s) — ${boundaryName}`);

    output[location] = {
      anchor,
      ladCode: LOCATION_LAD_CODES[location],
      ...(LOCATION_STATIONS[location] ? { stations: LOCATION_STATIONS[location] } : {}),
      wards: matched.map(feature => ({
        code: getWardCode(feature),
        name: getWardName(feature),
        centroid: geometryCentroid(feature.geometry),
        geometry: feature.geometry,
        stations: stationsInWard(feature.geometry),
      })),
      boundaryLevel: 'ward',
      boundaryName,
      geometry,
      source: 'ONS/OS ward boundary via martinjc/UK-GeoJSON',
    };
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
