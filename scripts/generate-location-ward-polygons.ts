import fs from 'fs';
import path from 'path';

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

const LOCATION_COORDS: Record<string, Coordinate> = {
  'Acton Common': { lat: 51.5028, lon: -0.2801 },
  'Bethnal Green': { lat: 51.5279, lon: -0.0556 },
  Brixton: { lat: 51.4627, lon: -0.1147 },
  Chiswick: { lat: 51.4946, lon: -0.2678 },
  Clapham: { lat: 51.4618, lon: -0.1383 },
  Croydon: { lat: 51.3757, lon: -0.0924 },
  'Crystal Palace': { lat: 51.4182, lon: -0.0726 },
  Ealing: { lat: 51.5152, lon: -0.3017 },
  Finchley: { lat: 51.6012, lon: -0.1924 },
  Fulham: { lat: 51.4804, lon: -0.1950 },
  Greenwich: { lat: 51.4781, lon: -0.0149 },
  Hackney: { lat: 51.5471, lon: -0.0560 },
  Hammersmith: { lat: 51.4927, lon: -0.2229 },
  'High Barnet': { lat: 51.6505, lon: -0.1940 },
  Hounslow: { lat: 51.4713, lon: -0.3666 },
  Islington: { lat: 51.5465, lon: -0.1039 },
  Lewisham: { lat: 51.4657, lon: -0.0142 },
  'New Malden': { lat: 51.4036, lon: -0.2558 },
  Peckham: { lat: 51.4698, lon: -0.0698 },
  Putney: { lat: 51.4592, lon: -0.2110 },
  Richmond: { lat: 51.4633, lon: -0.3013 },
  'South Ealing': { lat: 51.5008, lon: -0.3074 },
  Southfields: { lat: 51.4450, lon: -0.2066 },
  Stratford: { lat: 51.5416, lon: -0.0037 },
  Sutton: { lat: 51.3594, lon: -0.1919 },
  'Sutton Cheam': { lat: 51.3555, lon: -0.2143 },
  Tooting: { lat: 51.4274, lon: -0.1680 },
  Walthamstow: { lat: 51.5829, lon: -0.0199 },
  Wimbledon: { lat: 51.4214, lon: -0.2064 },
  'Wimbledon Park': { lat: 51.4346, lon: -0.1998 },
};

const LOCATION_LAD_CODES: Record<string, string> = {
  'Acton Common': 'E09000009',
  'Bethnal Green': 'E09000030',
  Brixton: 'E09000022',
  Chiswick: 'E09000018',
  Clapham: 'E09000022',
  Croydon: 'E09000008',
  'Crystal Palace': 'E09000006',
  Ealing: 'E09000009',
  Finchley: 'E09000003',
  Fulham: 'E09000013',
  Greenwich: 'E09000011',
  Hackney: 'E09000012',
  Hammersmith: 'E09000013',
  'High Barnet': 'E09000003',
  Hounslow: 'E09000018',
  Islington: 'E09000019',
  Lewisham: 'E09000023',
  'New Malden': 'E09000021',
  Peckham: 'E09000028',
  Putney: 'E09000032',
  Richmond: 'E09000027',
  'South Ealing': 'E09000009',
  Southfields: 'E09000032',
  Stratford: 'E09000025',
  Sutton: 'E09000029',
  'Sutton Cheam': 'E09000029',
  Tooting: 'E09000032',
  Walthamstow: 'E09000031',
  Wimbledon: 'E09000024',
  'Wimbledon Park': 'E09000024',
};

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
