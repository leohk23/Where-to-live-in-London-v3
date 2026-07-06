import type { GeoPoint } from '../types';
import allStationsJson from '../data/generated/all-stations.json';

// Station lat/lon lives in ONE place — all-stations.json (regenerated from live TfL data via
// `npm run generate-all-stations`) — keyed by naptan, so a location's commuteStations never hand-
// carry their own (and inevitably drifting) copy of a coordinate.
const POINT_BY_NAPTAN = new Map(
  (allStationsJson as Array<{ naptan: string; lat: number; lon: number }>).map(s => [s.naptan, { lat: s.lat, lon: s.lon }]),
);

export function pointForNaptan(naptan: string): GeoPoint {
  const point = POINT_BY_NAPTAN.get(naptan);
  if (!point) throw new Error(`No coordinates for naptan "${naptan}" in all-stations.json — run npm run generate-all-stations`);
  return point;
}

interface CommuteStation {
  naptan: string;
  // Explicit override for the rare member with no station of its own (e.g. Childs Hill, folded
  // into Golders Green via the nearby Cricklewood naptan for commute times) — its real position
  // is the neighbourhood, not the borrowed station, so it can't be derived from the naptan.
  point?: GeoPoint;
}

function stationPoint(s: CommuteStation): GeoPoint {
  return s.point ?? pointForNaptan(s.naptan);
}

// A location's effective anchor point. For a multi-station location it's the CENTROID (mean) of its
// stations, so schools/spots distances and both map anchors sit in the middle of the area rather
// than on one station; single-station locations keep their own point. One source of truth, used by
// the runtime data layer (src/data.ts) and the ward-polygon generator (scripts/).
export function resolveLocationPoint(loc: {
  point: GeoPoint;
  commuteStations?: CommuteStation[];
}): GeoPoint {
  const stations = loc.commuteStations;
  if (!stations || stations.length < 2) return loc.point;
  const points = stations.map(stationPoint);
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
  return { lat, lon };
}

// Every point a resident might live near — each station for a multi-station location, else the
// single anchor. Schools/spots use the NEAREST of these per candidate, so a multi-station area's
// catchment is the union of its stations' catchments (a great school near ANY station counts),
// rather than the centroid — which can drop schools near one station that sit far from the middle.
export function anchorPointsOf(loc: {
  point: GeoPoint;
  commuteStations?: CommuteStation[];
}): GeoPoint[] {
  return loc.commuteStations?.length ? loc.commuteStations.map(stationPoint) : [loc.point];
}
