import type { LocationInfo, LocationSchoolStats, SchoolRecord, NearbySchool, AsianSpot, AsianSpotRecord, BoroughStats, BedroomCount } from './types';
import locationsJson from './data/locations.json';
import schoolRecordsJson from './data/schools.json';
import asianSpotsJson from './data/asian-spots.json';
import boroughStatsJson from './data/borough-stats.json';
import taxDataRaw from '../counciltax.json';
import { ASIAN_RADIUS_KM, NEAREST_SCHOOL_LIMIT, PRIMARY_SCHOOL_RADIUS_KM, SECONDARY_SCHOOL_RADIUS_KM } from './lib/constants';

export const locationData = locationsJson as unknown as Record<string, LocationInfo>;
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

const schoolRecords = schoolRecordsJson as unknown as SchoolRecord[];

function toNearbySchools(
  items: Array<{ school: SchoolRecord; distanceKm: number }>,
): NearbySchool[] {
  return [...items]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, NEAREST_SCHOOL_LIMIT)
    .map(({ school, distanceKm }) => ({
      name: school.name,
      phase: school.phase,
      distanceKm: Math.round(distanceKm * 10) / 10,
      genderOfEntry: school.genderOfEntry,
    }));
}

// Computed once at module load: location key -> school counts/lists within each
// phase-specific radius. The JSON is a single deduped school master list, so adding
// a canonical location automatically derives its nearby schools after regeneration.
export const locationSchoolStats: Record<string, LocationSchoolStats> = Object.fromEntries(
  Object.entries(locationData).map(([key, loc]) => {
    const schoolDistances = schoolRecords.map(school => ({
      school,
      distanceKm: haversineKm(loc.point, school),
    }));
    const primary = schoolDistances.filter(({ school, distanceKm }) =>
      school.phase === 'Primary' && distanceKm <= PRIMARY_SCHOOL_RADIUS_KM
    );
    const secondary = schoolDistances.filter(({ school, distanceKm }) =>
      school.phase === 'Secondary' && distanceKm <= SECONDARY_SCHOOL_RADIUS_KM
    );
    const nearby = [...primary, ...secondary];
    const grammar = secondary.filter(({ school }) => school.grammar);

    return [key, {
      displayName: loc.displayName,
      anchorStation: loc.station,
      radiusKm: SECONDARY_SCHOOL_RADIUS_KM,
      primaryRadiusKm: PRIMARY_SCHOOL_RADIUS_KM,
      secondaryRadiusKm: SECONDARY_SCHOOL_RADIUS_KM,
      primaryOutstandingSchools: primary.filter(({ school }) => school.outstanding).length,
      primaryGoodSchools: primary.filter(({ school }) => school.good).length,
      primarySchools: primary.length,
      secondaryOutstandingSchools: secondary.filter(({ school }) => school.outstanding).length,
      secondaryGoodSchools: secondary.filter(({ school }) => school.good).length,
      secondarySchools: secondary.length,
      grammarSchools: grammar.length,
      nearestOutstandingSchools: toNearbySchools(nearby.filter(({ school }) => school.outstanding)),
      nearestPrimaryOutstandingSchools: toNearbySchools(primary.filter(({ school }) => school.outstanding)),
      nearestPrimaryGoodSchools: toNearbySchools(primary.filter(({ school }) => school.good)),
      nearestSecondaryOutstandingSchools: toNearbySchools(secondary.filter(({ school }) => school.outstanding)),
      nearestSecondaryGoodSchools: toNearbySchools(secondary.filter(({ school }) => school.good)),
      nearestGrammarSchools: toNearbySchools(grammar),
    }];
  }),
);

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
