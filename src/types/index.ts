export type BedroomCount = 1 | 2 | 3 | 4;

export type SortColumn =
  | 'total' | 'rent' | 'transport' | 'commute'
  | 'location' | 'borough' | 'councilTax'
  | 'crime' | 'schools' | 'score' | 'asianSpots';

export type LocationLabelScope = 'station' | 'area' | 'broad-area' | 'multi-borough';
export type DataConfidence = 'high' | 'medium' | 'low';
export type DatasetKey = 'commute' | 'rent' | 'councilTax' | 'crime' | 'schools';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface LocationInfo {
  id: string;
  displayName: string;
  comparisonName: string;
  anchorStation: string;
  labelScope: LocationLabelScope;
  dataConfidence: DataConfidence;
  reviewNote?: string;
  borough: string;
  // Canonical geographic identity for this location (single source of truth). The map
  // anchor and the ward-polygon generator both derive from these instead of redefining them:
  //   point   - the station/area anchor coordinate
  //   ladCode - the ONS Local Authority District (borough) code these borough-level KPIs join on
  point: GeoPoint;
  ladCode: string;
  rent: Record<BedroomCount, number>;
  zone: string;
  station: string;
  naptan?: string;
}

export interface DatasetGeography {
  key: DatasetKey;
  label: string;
  geography: string;
  joinKey: string;
  caveat: string;
}

export interface BoroughStats {
  crimesPer1000: number;
  primaryOutstandingSchools: number;
  primarySchools: number;
  secondaryOutstandingSchools: number;
  secondarySchools: number;
}

export interface NearbySchool {
  name: string;
  phase: 'Primary' | 'Secondary';
  distanceKm: number;
  genderOfEntry?: 'Girls' | 'Boys';
}

export type NearbyOutstandingSchool = NearbySchool;

export interface SchoolRecord {
  urn: string;
  name: string;
  phase: 'Primary' | 'Secondary';
  lat: number;
  lon: number;
  outstanding: boolean;
  good: boolean;
  grammar: boolean;
  genderOfEntry?: 'Girls' | 'Boys';
  faith?: boolean;
}

export interface LocationSchoolStats {
  displayName: string;
  anchorStation: string;
  radiusKm: number;
  primaryRadiusKm: number;
  secondaryRadiusKm: number;
  primaryOutstandingSchools: number;
  primaryGoodSchools: number;
  primarySchools: number;
  // Distance-weighted primary figures (closer schools count more), used for the primary phase
  // score so a great primary at the edge of the radius doesn't score like one next door. The
  // integer counts above stay as the honest "what's physically nearby" headline.
  primaryWeightedQuality: number;  // 0..1: (Σw·Outstanding + ½·Σw·Good) / Σw·total
  primaryWeightedStrong: number;   // Σw over Outstanding + Good primaries
  secondaryOutstandingSchools: number;
  secondaryGoodSchools: number;
  secondarySchools: number;
  grammarSchools: number;
  nearestOutstandingSchools: NearbyOutstandingSchool[];
  nearestPrimaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestPrimaryGoodSchools: NearbySchool[];
  nearestSecondaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestSecondaryGoodSchools: NearbySchool[];
  nearestGrammarSchools: NearbySchool[];
}

export type AsianSpotType = 'hk' | 'asian-food' | 'grocery';

export interface AsianSpot {
  name: string;
  type: AsianSpotType;
}

// Master-list record: one entry per physical spot, with coordinates. Locations
// pick up whichever of these fall within ASIAN_RADIUS_KM of their anchor.
export interface AsianSpotRecord extends AsianSpot {
  lat: number;
  lon: number;
}

export interface Priorities {
  commute: number;
  cost: number;
  safety: number;
  schools: number;
}

export interface ScoreFactor {
  key: keyof Priorities;
  normalized: number; // 0-100, higher is better for this factor
  weight: number;     // the priority slider value
}

export interface SchoolPhaseScore {
  strong: number;         // count of Outstanding + Good schools nearby
  quality: number | null; // 0..1: (Outstanding + ½·Good) / total; null if no schools of this phase
  supply: number | null;  // 0..1: "choice" — strong-school count relative to the best-served area
  score: number | null;   // 0-100 phase score = round(60·quality% + 40·choice%); null if none nearby
}

export interface SchoolScoreBreakdown {
  primary: SchoolPhaseScore;
  secondary: SchoolPhaseScore;
  averaged: number;       // 0-100 average of the two phase scores (a missing phase counts as 0)
  raw: number;            // 0-100 final = averaged + selective bonus. Integer-derived so the panel's
                          // arithmetic (and the column) add up exactly. selective = raw - averaged.
}

export interface Result {
  location: string;
  displayName: string;
  comparisonName: string;
  anchorStation: string;
  labelScope: LocationLabelScope;
  dataConfidence: DataConfidence;
  reviewNote?: string;
  borough: string;
  zone: string;
  rent: number;
  transportCostMonthly: number;
  councilTaxMonthly: number;
  totalMonthly: number;
  farePerTrip: number;
  // Partner's per-trip fare (0 when no partner workplace is set); already folded into transportCostMonthly.
  partnerFarePerTrip: number;
  commuteTime: number | null;
  commuteTime2: number | null;
  // Tube/rail lines of the itinerary, e.g. "Victoria → Central" (static matrix or live).
  commuteRoute: string | null;
  commuteRoute2: string | null;
  crimeRate: number | null;
  outstandingSchools: number | null;
  schoolsTotal: number | null;
  outstandingSchoolsPct: number | null;
  primaryOutstandingSchools: number | null;
  primaryGoodSchools: number | null;
  primarySchools: number | null;
  primaryWeightedQuality: number | null; // distance-weighted; null on borough fallback
  primaryWeightedStrong: number | null;
  secondaryOutstandingSchools: number | null;
  secondaryGoodSchools: number | null;
  secondarySchools: number | null;
  grammarSchools: number | null;
  schoolsSource: 'nearby' | 'borough';
  schoolsRadiusKm: number | null;
  primarySchoolsRadiusKm: number | null;
  secondarySchoolsRadiusKm: number | null;
  nearestOutstandingSchools: NearbyOutstandingSchool[];
  nearestPrimaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestPrimaryGoodSchools: NearbySchool[];
  nearestSecondaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestSecondaryGoodSchools: NearbySchool[];
  nearestGrammarSchools: NearbySchool[];
  bedrooms: BedroomCount;
}

export interface ScoredResult extends Result {
  compositeScore: number;
  scoreBreakdown: ScoreFactor[];
  schoolScore: SchoolScoreBreakdown;
  commuteIsLive: boolean;
  commuteTime2IsLive: boolean;
}
