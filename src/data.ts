import type { LocationInfo, LocationSchoolStats, SchoolRecord, NearbySchool, AsianSpot, AsianSpotRecord, BoroughStats, BedroomCount } from './types';
import locationsJson from './data/locations.json';
import schoolRecordsJson from './data/schools.json';
import asianSpotsJson from './data/asian-spots.json';
import boroughStatsJson from './data/borough-stats.json';
import taxDataRaw from '../counciltax.json';
import { ASIAN_RADIUS_KM, NEAREST_SCHOOL_LIMIT, PRIMARY_SCHOOL_RADIUS_KM, SECONDARY_SCHOOL_RADIUS_KM } from './lib/constants';
import { grammarCatchmentKm, RANK_ONLY_KM } from './data/grammar-catchments';

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

export type SchoolGender = 'any' | 'boy' | 'girl';
// 'secular' drops faith schools (not realistically open to families outside that faith); 'any' keeps them.
export type SchoolFaith = 'any' | 'secular';

// A single-sex school is only relevant to a matching child; mixed schools always count.
function suitsChild(s: SchoolRecord, g: SchoolGender): boolean {
  if (g === 'any' || !s.genderOfEntry) return true;
  return g === 'boy' ? s.genderOfEntry === 'Boys' : s.genderOfEntry === 'Girls';
}

function suitsFaith(s: SchoolRecord, f: SchoolFaith): boolean {
  return f === 'any' || !s.faith;
}

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

// School counts/lists for a location within each phase-specific radius, filtered to the schools a
// child of the given gender could actually attend (mixed always; single-sex only if it matches).
function schoolStatsFor(
  loc: LocationInfo,
  schoolDistances: Array<{ school: SchoolRecord; distanceKm: number }>,
  g: SchoolGender,
  f: SchoolFaith,
): LocationSchoolStats {
  const primary = schoolDistances.filter(({ school, distanceKm }) =>
    school.phase === 'Primary' && distanceKm <= PRIMARY_SCHOOL_RADIUS_KM && suitsChild(school, g) && suitsFaith(school, f)
  );
  // Primary admission is essentially by distance, so a primary at the edge of the radius isn't
  // realistically attainable. Weight each primary by proximity (linear falloff to the radius) and
  // score the primary phase on those weighted figures instead of raw counts. Secondary/grammar
  // admit from much wider, so they keep flat counts. ponytail: linear falloff from the anchor is a
  // proxy for "families live around here"; swap for a real catchment curve only if it matters.
  const proximity = (distanceKm: number) => Math.max(0, 1 - distanceKm / PRIMARY_SCHOOL_RADIUS_KM);
  let wTotal = 0, wOutstanding = 0, wGood = 0;
  for (const { school, distanceKm } of primary) {
    const w = proximity(distanceKm);
    wTotal += w;
    if (school.outstanding) wOutstanding += w;
    else if (school.good) wGood += w;
  }
  const primaryWeightedQuality = wTotal ? (wOutstanding + 0.5 * wGood) / wTotal : 0;
  const primaryWeightedStrong = wOutstanding + wGood;
  const secondary = schoolDistances.filter(({ school, distanceKm }) =>
    school.phase === 'Secondary' && distanceKm <= SECONDARY_SCHOOL_RADIUS_KM && suitsChild(school, g) && suitsFaith(school, f)
  );
  const nearby = [...primary, ...secondary];
  // Grammar/selective schools admit from far wider than a local comprehensive, and each has its own
  // catchment — a published radius, a designated area (approximated), or (for pure-rank
  // super-selectives) a wide "realistic reach". So a location only counts a grammar it could
  // actually get into, per that school's catchment. See grammar-catchments.ts.
  const grammar = schoolDistances.filter(({ school, distanceKm }) =>
    school.phase === 'Secondary' && school.grammar && suitsChild(school, g) && suitsFaith(school, f) &&
    distanceKm <= (grammarCatchmentKm[school.name] ?? RANK_ONLY_KM)
  );

  return {
    displayName: loc.displayName,
    anchorStation: loc.station,
    radiusKm: SECONDARY_SCHOOL_RADIUS_KM,
    primaryRadiusKm: PRIMARY_SCHOOL_RADIUS_KM,
    secondaryRadiusKm: SECONDARY_SCHOOL_RADIUS_KM,
    primaryOutstandingSchools: primary.filter(({ school }) => school.outstanding).length,
    primaryGoodSchools: primary.filter(({ school }) => school.good).length,
    primarySchools: primary.length,
    primaryWeightedQuality,
    primaryWeightedStrong,
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
  };
}

// Computed once at module load: location -> gender -> faith mode -> stats. Distances are computed
// once per location and just re-tallied per variant. Adding a canonical location auto-derives its
// schools. 3 genders × 2 faith modes = 6 cheap tallies per location off one distance pass.
export const locationSchoolStats: Record<string, Record<SchoolGender, Record<SchoolFaith, LocationSchoolStats>>> =
  Object.fromEntries(
    Object.entries(locationData).map(([key, loc]) => {
      const schoolDistances = schoolRecords.map(school => ({
        school,
        distanceKm: haversineKm(loc.point, school),
      }));
      const forGender = (g: SchoolGender) => ({
        any:     schoolStatsFor(loc, schoolDistances, g, 'any'),
        secular: schoolStatsFor(loc, schoolDistances, g, 'secular'),
      });
      return [key, { any: forGender('any'), boy: forGender('boy'), girl: forGender('girl') }];
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
