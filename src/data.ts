import type { LocationInfo, LocationSchoolStats, SchoolRecord, NearbySchool, AsianSpot, AsianSpotRecord, BoroughStats, BedroomCount, SchoolScoreBreakdown, GeoPoint, WardCrimeDataset, CrimeSource } from './types';
import locationsJson from './data/locations.json';
import schoolRecordsJson from './data/generated/schools.json';
import asianSpotsJson from './data/asian-spots.json';
import boroughStatsJson from './data/borough-stats.json';
import locationWardPolygonsJson from './data/generated/location-ward-polygons.json';
import wardCrimeJson from './data/generated/ward-crime.json';
import taxDataRaw from './data/council-tax.json';
import { ASIAN_RADIUS_KM, NEAREST_SCHOOL_LIMIT, PRIMARY_CHOICE_TARGET, PRIMARY_SCHOOL_RADIUS_KM, SECONDARY_CHOICE_TARGET, SECONDARY_SCHOOL_RADIUS_KM } from './lib/constants';
import { grammarCatchmentKm, RANK_ONLY_KM } from './data/grammar-catchments';
import { resolveLocationPoint, anchorPointsOf } from './lib/location-point';

// A location's `point` is derived: for multi-station locations it's the centroid of its stations,
// so schools/spots and the map all anchor to the middle of the area (see resolveLocationPoint).
export const locationData: Record<string, LocationInfo> = Object.fromEntries(
  Object.entries(locationsJson as unknown as Record<string, LocationInfo>)
    .map(([key, loc]) => [key, { ...loc, point: resolveLocationPoint(loc) }]),
);
export const boroughStats = boroughStatsJson as unknown as Record<string, BoroughStats>;
export const councilTaxData = taxDataRaw as Record<string, Record<BedroomCount, number>>;
export const wardCrime = wardCrimeJson as unknown as WardCrimeDataset;

interface CrimeBoundary {
  wards?: Array<{ code?: string }>;
}

const locationCrimeBoundaries = locationWardPolygonsJson as unknown as Record<string, CrimeBoundary>;

export function crimeStatsForLocation(location: string, borough: string): {
  crimeRate: number | null;
  crimeSource: CrimeSource;
  crimeWardCount: number;
  crimePeriod: string | null;
} {
  const fallback = boroughStats[borough]?.crimesPer1000 ?? null;
  const wards = locationCrimeBoundaries[location]?.wards ?? [];
  const stats = wards.flatMap(ward => ward.code && wardCrime.wards[ward.code] ? [wardCrime.wards[ward.code]] : []);

  if (wards.length && stats.length === wards.length) {
    const crimes = stats.reduce((sum, ward) => sum + ward.crimes, 0);
    const population = stats.reduce((sum, ward) => sum + ward.population, 0);
    if (population > 0) {
      return {
        crimeRate: Math.round((crimes / population) * 1000 * 10) / 10,
        crimeSource: 'ward',
        crimeWardCount: stats.length,
        crimePeriod: wardCrime.meta.period || null,
      };
    }
  }

  return {
    crimeRate: fallback,
    crimeSource: 'borough',
    crimeWardCount: 0,
    crimePeriod: null,
  };
}

// asian-spots.json is a flat master list (one entry per physical spot, with
// coordinates). Each location picks up whichever spots fall within its radius —
// so a shared spot is derived for both neighbours instead of duplicated, and
// editing it once fixes it everywhere. Changing ASIAN_RADIUS_KM re-derives this
// with no data regeneration.
const asianSpotList = asianSpotsJson as unknown as AsianSpotRecord[];

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
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
  loc: Pick<LocationInfo, 'displayName' | 'station'>,
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

type SchoolScoreStats = Pick<LocationSchoolStats,
  | 'primaryOutstandingSchools'
  | 'primaryGoodSchools'
  | 'primarySchools'
  | 'primaryWeightedQuality'
  | 'primaryWeightedStrong'
  | 'secondaryOutstandingSchools'
  | 'secondaryGoodSchools'
  | 'secondarySchools'
  | 'grammarSchools'
>;

const phaseQuality = (o: number, g: number, total: number) => total ? (o + 0.5 * g) / total : 0;
const phaseSupply = (strong: number, target: number) => Math.sqrt(Math.min(strong, target) / target);
const phaseInt = (quality: number | null, supply: number | null) =>
  quality === null || supply === null
    ? null
    : Math.round(0.6 * Math.round(quality * 100) + 0.4 * Math.round(supply * 100));

export function schoolScoreFromStats(stats: SchoolScoreStats, maxGrammar: number): SchoolScoreBreakdown {
  const primaryStrong = stats.primaryWeightedStrong;
  const secondaryStrong = stats.secondaryOutstandingSchools + stats.secondaryGoodSchools;
  const pq = stats.primarySchools ? stats.primaryWeightedQuality : null;
  const ps = stats.primarySchools ? phaseSupply(primaryStrong, PRIMARY_CHOICE_TARGET) : null;
  const sq = stats.secondarySchools
    ? phaseQuality(stats.secondaryOutstandingSchools, stats.secondaryGoodSchools, stats.secondarySchools)
    : null;
  const ss = stats.secondarySchools ? phaseSupply(secondaryStrong, SECONDARY_CHOICE_TARGET) : null;
  const pScore = phaseInt(pq, ps);
  const sScore = phaseInt(sq, ss);
  const averaged = Math.round(((pScore ?? 0) + (sScore ?? 0)) / 2);
  const grammarBonus = 0.25 * Math.sqrt(stats.grammarSchools / Math.max(1, maxGrammar));

  return {
    primary: { strong: primaryStrong, quality: pq, supply: ps, score: pScore },
    secondary: { strong: secondaryStrong, quality: sq, supply: ss, score: sScore },
    averaged,
    raw: Math.min(100, averaged + Math.round(grammarBonus * 100)),
  };
}

export function schoolStatsForPoint(
  displayName: string,
  point: GeoPoint,
  g: SchoolGender,
  f: SchoolFaith,
): LocationSchoolStats {
  return schoolStatsFor(
    { displayName, station: displayName },
    schoolRecords.map(school => ({ school, distanceKm: haversineKm(point, school) })),
    g,
    f,
  );
}

// Computed once at module load: location -> gender -> faith mode -> stats. Distances are computed
// once per location and just re-tallied per variant. Adding a canonical location auto-derives its
// schools. 3 genders × 2 faith modes = 6 cheap tallies per location off one distance pass.
export const locationSchoolStats: Record<string, Record<SchoolGender, Record<SchoolFaith, LocationSchoolStats>>> =
  Object.fromEntries(
    Object.entries(locationData).map(([key, loc]) => {
      // Nearest-station distance: a multi-station area's catchment is the union of its stations'
      // catchments, so a school near any one station counts at its true walking distance.
      const anchorPoints = anchorPointsOf(loc);
      const schoolDistances = schoolRecords.map(school => ({
        school,
        distanceKm: Math.min(...anchorPoints.map(p => haversineKm(p, school))),
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
  Object.entries(locationData).map(([key, loc]) => {
    // Nearest-station distance, same as schools: a spot near any of a multi-station area's
    // stations counts, at its true walking distance from the closest one.
    const anchorPoints = anchorPointsOf(loc);
    return [
      key,
      asianSpotList
        .map(s => ({ s, d: Math.min(...anchorPoints.map(p => haversineKm(p, s))) }))
        .filter(({ d }) => d <= ASIAN_RADIUS_KM)
        .sort((a, b) => a.d - b.d)
        .map(({ s }) => ({ name: s.name, type: s.type })),
    ];
  }),
);
