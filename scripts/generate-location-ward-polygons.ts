import fs from 'fs';
import path from 'path';
import locationData from '../src/data/locations.json';

interface Coordinate {
  lat: number;
  lon: number;
}

interface Feature {
  type: 'Feature';
  properties: {
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

const OUT_PATH = path.resolve(process.cwd(), 'src/data/location-ward-polygons.json');
const WARD_BASE_URL = 'https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/electoral/eng/wards_by_lad';

// Anchor coordinate and borough (LAD) code now come from the canonical location registry
// (src/data/locations.json) so "where is this location" is defined in exactly one place.
const registry = locationData as Record<string, { point: Coordinate; ladCode: string }>;

const LOCATION_COORDS: Record<string, Coordinate> = Object.fromEntries(
  Object.entries(registry).map(([name, info]) => [name, { lat: info.point.lat, lon: info.point.lon }]),
);

const LOCATION_LAD_CODES: Record<string, string> = Object.fromEntries(
  Object.entries(registry).map(([name, info]) => [name, info.ladCode]),
);

function getRings(geometry: Geometry): number[][][] {
  if (geometry.type === 'Polygon') return geometry.coordinates as number[][][];
  return (geometry.coordinates as number[][][][]).flat();
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

async function fetchWardCollection(ladCode: string): Promise<FeatureCollection> {
  const res = await fetch(`${WARD_BASE_URL}/${ladCode}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${ladCode}: HTTP ${res.status}`);
  return await res.json() as FeatureCollection;
}

async function main() {
  const ladCodes = [...new Set(Object.values(LOCATION_LAD_CODES))];
  const wardCollections = new Map<string, FeatureCollection>();

  for (const ladCode of ladCodes) {
    const collection = await fetchWardCollection(ladCode);
    wardCollections.set(ladCode, collection);
    console.log(`Fetched ${ladCode}: ${collection.features.length} wards`);
  }

  const output: Record<string, {
    anchor: Coordinate;
    boundaryLevel: string;
    boundaryName: string;
    geometry: Geometry;
    source: string;
  }> = {};

  for (const [location, anchor] of Object.entries(LOCATION_COORDS)) {
    const ladCode = LOCATION_LAD_CODES[location];
    const collection = wardCollections.get(ladCode);
    if (!collection) throw new Error(`No ward collection for ${location}`);

    const containing = collection.features.find(feature => pointInGeometry(anchor, feature.geometry));
    const selected = containing ?? collection.features
      .map(feature => ({ feature, distance: distanceSquared(anchor, geometryCentroid(feature.geometry)) }))
      .sort((a, b) => a.distance - b.distance)[0]?.feature;

    if (!selected) throw new Error(`No ward geometry for ${location}`);

    output[location] = {
      anchor,
      boundaryLevel: 'ward',
      boundaryName: getWardName(selected),
      geometry: selected.geometry,
      source: 'ONS/OS ward boundary via martinjc/UK-GeoJSON',
    };

    console.log(`${location}: ${getWardName(selected)}${containing ? '' : ' (nearest fallback)'}`);
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
