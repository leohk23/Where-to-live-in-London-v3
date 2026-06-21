import type { LocationInfo, LocationSchoolStats, AsianSpot, AsianSpotRecord, BoroughStats, BedroomCount } from './types';
import locationsJson from './data/locations.json';
import locationSchoolsJson from './data/location-schools.json';
import asianSpotsJson from './data/asian-spots.json';
import boroughStatsJson from './data/borough-stats.json';
import taxDataRaw from '../counciltax.json';
import { ASIAN_RADIUS_KM } from './lib/constants';

export const locationData = locationsJson as unknown as Record<string, LocationInfo>;
export const locationSchoolStats = locationSchoolsJson as unknown as Record<string, LocationSchoolStats>;
export const boroughStats = boroughStatsJson as unknown as Record<string, BoroughStats>;
export const councilTaxData = taxDataRaw as Record<string, Record<BedroomCount, number>>;

// asian-spots.json is a flat master list (one entry per physical spot, with
// coordinates). Each location picks up whichever spots fall within its radius —
// so a shared spot is derived for both neighbours instead of duplicated, and
// editing it once fixes it everywhere. Changing ASIAN_RADIUS_KM re-derives this
// with no data regeneration.
const asianSpotList = asianSpotsJson as unknown as AsianSpotRecord[];

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Computed once at module load: location key -> spots within ASIAN_RADIUS_KM,
// nearest first. Same shape the UI consumed before the master-list migration.
export const asianSpots: Record<string, AsianSpot[]> = Object.fromEntries(
  Object.entries(locationData).map(([key, loc]) => [
    key,
    asianSpotList
      .map(s => ({ s, d: haversineKm(loc.point, s) }))
      .filter(({ d }) => d <= ASIAN_RADIUS_KM)
      .sort((a, b) => a.d - b.d)
      .map(({ s }) => ({ name: s.name, type: s.type })),
  ]),
);
