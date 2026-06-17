export type BedroomCount = 1 | 2 | 3 | 4;

export type SortColumn =
  | 'total' | 'rent' | 'transport' | 'commute'
  | 'location' | 'borough' | 'councilTax'
  | 'crime' | 'schools' | 'score';

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

export interface LocationSchoolStats {
  displayName: string;
  anchorStation: string;
  radiusKm: number;
  primaryRadiusKm: number;
  secondaryRadiusKm: number;
  primaryOutstandingSchools: number;
  primarySchools: number;
  secondaryOutstandingSchools: number;
  secondarySchools: number;
  grammarSchools: number;
  nearestOutstandingSchools: NearbyOutstandingSchool[];
  nearestPrimaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestSecondaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestGrammarSchools: NearbySchool[];
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
  crimeRate: number | null;
  outstandingSchools: number | null;
  schoolsTotal: number | null;
  outstandingSchoolsPct: number | null;
  primaryOutstandingSchools: number | null;
  primarySchools: number | null;
  secondaryOutstandingSchools: number | null;
  secondarySchools: number | null;
  grammarSchools: number | null;
  schoolsSource: 'nearby' | 'borough';
  schoolsRadiusKm: number | null;
  primarySchoolsRadiusKm: number | null;
  secondarySchoolsRadiusKm: number | null;
  nearestOutstandingSchools: NearbyOutstandingSchool[];
  nearestPrimaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestSecondaryOutstandingSchools: NearbyOutstandingSchool[];
  nearestGrammarSchools: NearbySchool[];
  bedrooms: BedroomCount;
}

export interface ScoredResult extends Result {
  compositeScore: number;
  scoreBreakdown: ScoreFactor[];
  commuteIsLive: boolean;
  commuteTime2IsLive: boolean;
}
