import { useState, useEffect, useCallback, useMemo } from 'react';
import { commuteTimes, commuteRoutes } from '../commute-times';
import { summariseRoute, type TflJourney } from '../lib/tfl-route';
import { locationData, councilTaxData, boroughStats, locationSchoolStats, asianSpots } from '../data';
import type { SchoolGender, SchoolFaith } from '../data';
import { workLocations, type WorkLocationKey } from '../work-locations';
import { expectedWaitMinutes, interchangeWaitMinutes } from '../lib/commute-wait';
import {
  FARE_BY_ZONE_DIFF, FARE_FALLBACK,
  NULL_COMMUTE_FALLBACK, NULL_CRIME_FALLBACK,
  DEFAULT_MONTHLY_TRIPS, DEFAULT_BUDGET, MAX_MONTHLY_TRIPS,
} from '../lib/constants';
import type { BedroomCount, Result, ScoredResult, Priorities, SortColumn } from '../types';

type WorkMode = 'preset' | 'address';
type CommuteSource = 'static' | 'live';
const ADDRESS_WORK_ZONE = 'Zone 1';
const LIVE_COMMUTE_CACHE_VERSION = 'v5'; // v5 pins live commute requests to 08:30
const PRIORITY_MAX = 5;

function readUrlParams() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  return {
    work:   p.get('work') ?? '',
    work2:  p.get('work2') ?? '',
    beds:   (parseInt(p.get('beds') ?? '1') || 1) as BedroomCount,
    trips:  Math.min(parseInt(p.get('trips') ?? String(DEFAULT_MONTHLY_TRIPS)) || DEFAULT_MONTHLY_TRIPS, MAX_MONTHLY_TRIPS),
    pc:     Math.min(parseInt(p.get('pc')   ?? '0') || 0, PRIORITY_MAX),
    pco:    Math.min(parseInt(p.get('pco')  ?? '0') || 0, PRIORITY_MAX),
    ps:     Math.min(parseInt(p.get('ps')   ?? '0') || 0, PRIORITY_MAX),
    psch:   Math.min(parseInt(p.get('psch') ?? '0') || 0, PRIORITY_MAX),
    budget: parseInt(p.get('budget') ?? String(DEFAULT_BUDGET)) || DEFAULT_BUDGET,
    be:     p.get('be') === '1',
    op:     p.get('op') ?? '',
    op2:    p.get('op2') ?? '',
    // Commute data source for preset destinations: static matrix (default) or live TfL fetch.
    cs:     (p.get('cs')  === 'live' ? 'live' : 'static') as CommuteSource,
    cs2:    (p.get('cs2') === 'live' ? 'live' : 'static') as CommuteSource,
    // Explicit flag wins; otherwise infer preset for legacy links that carry a preset
    // work location, defaulting new visitors to the exact-address mode.
    wm:     (p.get('wm') === 'a' ? 'address' : p.get('wm') === 'p' ? 'preset' : p.get('work') ? 'preset' : 'address') as WorkMode,
    wm2:    (p.get('wm2') === 'a' ? 'address' : p.get('wm2') === 'p' ? 'preset' : p.get('work2') ? 'preset' : 'address') as WorkMode,
    // Child gender for school eligibility: excludes opposite single-sex schools from scoring.
    cg:     (p.get('cg') === 'boy' ? 'boy' : p.get('cg') === 'girl' ? 'girl' : 'any') as SchoolGender,
    // Faith mode: 'secular' excludes faith schools from scoring.
    sf:     (p.get('sf') === 'secular' ? 'secular' : 'any') as SchoolFaith,
  };
}

function getFarePerTrip(homeZone: string, workZone: string): number {
  const homeNum = parseInt(homeZone.replace('Zone ', ''));
  const workNum = parseInt(workZone.replace('Zone ', ''));
  return FARE_BY_ZONE_DIFF[Math.abs(homeNum - workNum)] ?? FARE_FALLBACK;
}

function getCommuteTime(homeLocation: string, workLoc: string): number | null {
  const t = commuteTimes[homeLocation]?.[workLoc];
  return t ? t : null;
}

function getCommuteRoute(homeLocation: string, workLoc: string): string | null {
  return commuteRoutes[homeLocation]?.[workLoc] ?? null;
}


// A preset work location's coords as the string pair the live-fetch destination expects.
function presetCoordsStr(loc: WorkLocationKey | ''): { lat: string; lon: string } | null {
  const wl = loc ? workLocations[loc] : undefined;
  return wl ? { lat: String(wl.coords.lat), lon: String(wl.coords.lon) } : null;
}

// Pin journeys to the most recent Monday at 08:30 - a representative weekday-morning peak.
function getLastMonday(): string {
  const d = new Date();
  const daysSinceMonday = (d.getDay() + 6) % 7; // 0 if Monday, else days back to the last Monday
  d.setDate(d.getDate() - daysSinceMonday);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const worker = async () => { while (i < items.length) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

function isUKPostcode(input: string): boolean {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(input.trim());
}

function getLiveCommuteCacheKey(
  prefix: string,
  input: string,
  coords: { lat: string; lon: string } | null,
) {
  const destinationKey = coords ? `${coords.lat},${coords.lon}` : input.trim().toLowerCase();
  return `${prefix}-${LIVE_COMMUTE_CACHE_VERSION}-${destinationKey}`;
}

function hasCompleteLiveCommuteResults(results: Record<string, number | null>) {
  return Object.keys(results).length === Object.keys(locationData).length
    && Object.values(results).every(time => typeof time === 'number');
}

interface TflJourneyResponse {
  journeys?: TflJourney[];
}

interface TflDisambiguation {
  disambiguationOptions?: Array<{
    place?: {
      lat?: number;
      lon?: number;
    };
  }>;
}

interface TflDisambiguationResponse {
  fromLocationDisambiguation?: TflDisambiguation;
  toLocationDisambiguation?: TflDisambiguation;
}

async function geocodeAddress(address: string): Promise<{ lat: string; lon: string } | null> {
  try {
    const qs = new URLSearchParams({ q: address, countrycodes: 'gb', limit: '1', format: 'json' });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, {
      headers: { 'User-Agent': 'WhereToLiveInLondon/1.0' },
    });
    if (!res.ok) return null;
    const results = await res.json() as Array<{ lat: string; lon: string }>;
    return results[0] ?? null;
  } catch {
    return null;
  }
}

function getDisambiguatedPoint(disambiguation?: TflDisambiguation): string | null {
  const option = disambiguation?.disambiguationOptions?.find(o =>
    typeof o.place?.lat === 'number' && typeof o.place?.lon === 'number'
  );
  return option?.place ? `${option.place.lat},${option.place.lon}` : null;
}

async function fetchTflJourneyDuration(
  origin: string,
  destination: string,
  qs: string,
  hasRetried = false,
  attempt = 0,
): Promise<{ duration: number | null; route: string | null; destination: string }> {
  try {
    const res = await fetch(
      `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(origin)}/to/${encodeURIComponent(destination)}?${qs}`
    );

    if (res.ok) {
      const json = await res.json() as TflJourneyResponse;
      const best = json.journeys?.[0];
      return { duration: best?.duration ?? null, route: summariseRoute(best), destination };
    }

    // TfL throttles anonymous (no app key) browser use to ~50 req/min; with 50+ locations a
    // burst gets 429s and would otherwise silently drop the tail of the list. Back off
    // (honouring Retry-After, with jitter) and retry so every location resolves.
    if (res.status === 429 && attempt < 5) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '') || 0;
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 700 * (attempt + 1) + Math.random() * 600;
      await new Promise(r => setTimeout(r, waitMs));
      return fetchTflJourneyDuration(origin, destination, qs, hasRetried, attempt + 1);
    }

    if (res.status === 300 && !hasRetried) {
      const json = await res.json().catch(() => null) as TflDisambiguationResponse | null;
      const resolvedOrigin = getDisambiguatedPoint(json?.fromLocationDisambiguation) ?? origin;
      const resolvedDestination = getDisambiguatedPoint(json?.toLocationDisambiguation) ?? destination;

      if (resolvedOrigin !== origin || resolvedDestination !== destination) {
        return fetchTflJourneyDuration(resolvedOrigin, resolvedDestination, qs, true, attempt);
      }
    }
  } catch {
    return { duration: null, route: null, destination };
  }

  return { duration: null, route: null, destination };
}

async function resolveTflDestination(
  destination: string,
  entries: Array<[string, (typeof locationData)[string]]>,
  qs: string,
): Promise<string> {
  const firstOrigin = entries.find(([, data]) => data.naptan)?.[1].naptan;
  if (!firstOrigin) return destination;

  const result = await fetchTflJourneyDuration(firstOrigin, destination, qs);
  return result.destination;
}

// Core fetch logic shared by both work locations
async function doFetchLiveCommutes(params: {
  input: string;
  selectedCoords: { lat: string; lon: string } | null;
  setGeocoding: (b: boolean) => void;
  setError: (s: string | null) => void;
  setLoading: (b: boolean) => void;
  setProgress: (fn: (n: number) => number) => void;
  setTotal: (n: number) => void;
  updateTimes: (location: string, time: number | null) => void;
  updateRoute: (location: string, route: string | null) => void;
}): Promise<{ destination: string; allResults: Record<string, number | null>; allRoutes: Record<string, string | null> } | null> {
  const { input, selectedCoords, setGeocoding, setError, setLoading, setProgress, setTotal, updateTimes, updateRoute } = params;

  let destination: string;
  if (selectedCoords) {
    destination = `${selectedCoords.lat},${selectedCoords.lon}`;
  } else if (isUKPostcode(input)) {
    const norm = input.toUpperCase().replace(/\s+/g, '');
    destination = `${norm.slice(0, -3)} ${norm.slice(-3)}`;
  } else {
    setGeocoding(true);
    const geo = await geocodeAddress(input);
    setGeocoding(false);
    if (!geo) {
      setError('Address not found — try a more specific address or use a postcode');
      return null;
    }
    destination = `${geo.lat},${geo.lon}`;
  }

  const entries = Object.entries(locationData);
  setLoading(true);
  setProgress(() => 0);
  setTotal(entries.length);

  const allResults: Record<string, number | null> = {};
  const allRoutes: Record<string, string | null> = {};
  const date = getLastMonday();
  const qs = new URLSearchParams({
    mode: 'tube,overground,elizabeth-line,dlr,tram,national-rail',
    timeIs: 'Departing',
    date,
    time: '0830',
  }).toString();
  const resolvedDestination = await resolveTflDestination(destination, entries, qs);

  await fetchWithConcurrency(entries, 5, async ([location, data]) => {
    if (!data.naptan) {
      allResults[location] = null;
      allRoutes[location] = null;
    } else {
      const result = await fetchTflJourneyDuration(data.naptan, resolvedDestination, qs);
      allResults[location] = result.duration;
      allRoutes[location] = result.route;
    }
    updateTimes(location, allResults[location]);
    updateRoute(location, allRoutes[location]);
    setProgress(p => p + 1);
  });

  setLoading(false);
  return { destination, allResults, allRoutes };
}

export function useCalculator() {
  const url = useMemo(() => readUrlParams(), []);

  const [workLocation,  setWorkLocation]  = useState<WorkLocationKey | ''>(url?.work  as WorkLocationKey | '' ?? '');
  const [workLocation2, setWorkLocation2] = useState<WorkLocationKey | ''>(url?.work2 as WorkLocationKey | '' ?? '');
  const [workMode,      setWorkMode]      = useState<WorkMode>(url?.wm  ?? 'address');
  const [workMode2,     setWorkMode2]     = useState<WorkMode>(url?.wm2 ?? 'address');
  const [commuteSource,  setCommuteSource]  = useState<CommuteSource>(url?.cs  ?? 'static');
  const [commuteSource2, setCommuteSource2] = useState<CommuteSource>(url?.cs2 ?? 'static');
  const [monthlyTrips,  setMonthlyTrips]  = useState<number>(url?.trips ?? DEFAULT_MONTHLY_TRIPS);
  const [bedrooms,      setBedrooms]      = useState<BedroomCount>(url?.beds ?? 1);
  const [budgetEnabled, setBudgetEnabled] = useState<boolean>(url?.be ?? false);
  const [maxBudget,     setMaxBudget]     = useState<number>(url?.budget ?? DEFAULT_BUDGET);
  // Which child the schools are being judged for — filters out opposite single-sex schools.
  const [childGender,   setChildGender]   = useState<SchoolGender>(url?.cg ?? 'any');
  const [schoolFaith,   setSchoolFaith]   = useState<SchoolFaith>(url?.sf ?? 'any');
  const [priorities, setPriorities] = useState<Priorities>({
    commute: url?.pc   ?? 0,
    cost:    url?.pco  ?? 0,
    safety:  url?.ps   ?? 0,
    schools: url?.psch ?? 0,
  });
  const [results, setResults] = useState<Result[]>([]);
  const [sortBy, setSortBy] = useState<SortColumn>('total');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Live commute — primary
  const [officePostcode,      setOfficePostcode]      = useState<string>(url?.op ?? '');
  const [selectedOfficeCoords, setSelectedOfficeCoords] = useState<{ lat: string; lon: string } | null>(null);
  const [liveCommuteTimes,    setLiveCommuteTimes]    = useState<Record<string, number | null>>({});
  const [liveCommuteRoutes,   setLiveCommuteRoutes]   = useState<Record<string, string | null>>({});
  const [liveCommuteProgress, setLiveCommuteProgress] = useState(0);
  const [liveCommuteTotal,    setLiveCommuteTotal]    = useState(0);
  const [liveCommuteLoading,  setLiveCommuteLoading]  = useState(false);
  const [liveCommuteGeocoding, setLiveCommuteGeocoding] = useState(false);
  const [liveCommuteError,    setLiveCommuteError]    = useState<string | null>(null);

  // Live commute — partner
  const [officePostcode2,       setOfficePostcode2]       = useState<string>(url?.op2 ?? '');
  const [selectedOfficeCoords2, setSelectedOfficeCoords2] = useState<{ lat: string; lon: string } | null>(null);
  const [liveCommuteTimes2,     setLiveCommuteTimes2]     = useState<Record<string, number | null>>({});
  const [liveCommuteRoutes2,    setLiveCommuteRoutes2]    = useState<Record<string, string | null>>({});
  const [liveCommuteProgress2,  setLiveCommuteProgress2]  = useState(0);
  const [liveCommuteTotal2,     setLiveCommuteTotal2]     = useState(0);
  const [liveCommuteLoading2,   setLiveCommuteLoading2]   = useState(false);
  const [liveCommuteGeocoding2, setLiveCommuteGeocoding2] = useState(false);
  const [liveCommuteError2,     setLiveCommuteError2]     = useState<string | null>(null);

  // Clear live times when inputs are edited (address, or the preset destination/source).
  useEffect(() => {
    setLiveCommuteTimes({});
    setLiveCommuteRoutes({});
    setLiveCommuteProgress(0);
    setLiveCommuteTotal(0);
    setLiveCommuteError(null);
  }, [officePostcode, workLocation, commuteSource]);

  useEffect(() => {
    setLiveCommuteTimes2({});
    setLiveCommuteRoutes2({});
    setLiveCommuteProgress2(0);
    setLiveCommuteTotal2(0);
    setLiveCommuteError2(null);
  }, [officePostcode2, workLocation2, commuteSource2]);

  // URL sync
  useEffect(() => {
    const p = new URLSearchParams();
    if (workLocation)                           p.set('work',   workLocation);
    if (workLocation2)                          p.set('work2',  workLocation2);
    if (workMode  === 'preset')                 p.set('wm',     'p');
    else if (workLocation)                      p.set('wm',     'a');
    if (workMode2 === 'preset')                 p.set('wm2',    'p');
    else if (workLocation2)                     p.set('wm2',    'a');
    if (bedrooms !== 1)                         p.set('beds',   String(bedrooms));
    if (monthlyTrips !== DEFAULT_MONTHLY_TRIPS) p.set('trips',  String(monthlyTrips));
    if (priorities.commute)                     p.set('pc',     String(priorities.commute));
    if (priorities.cost)                        p.set('pco',    String(priorities.cost));
    if (priorities.safety)                      p.set('ps',     String(priorities.safety));
    if (priorities.schools)                     p.set('psch',   String(priorities.schools));
    if (childGender !== 'any')                  p.set('cg',     childGender);
    if (schoolFaith !== 'any')                  p.set('sf',     schoolFaith);
    if (budgetEnabled) { p.set('be', '1'); p.set('budget', String(maxBudget)); }
    if (officePostcode)  p.set('op',  officePostcode);
    if (officePostcode2) p.set('op2', officePostcode2);
    if (commuteSource  === 'live') p.set('cs',  'live');
    if (commuteSource2 === 'live') p.set('cs2', 'live');
    const qs = p.toString();
    window.history.replaceState({}, '', qs ? '?' + qs : window.location.pathname);
  }, [workLocation, workLocation2, workMode, workMode2, bedrooms, monthlyTrips, priorities, maxBudget, budgetEnabled, officePostcode, officePostcode2, commuteSource, commuteSource2, childGender, schoolFaith]);

  // Auto-switch sort column when priorities change
  useEffect(() => {
    const anyActive = Object.values(priorities).some(v => v > 0);
    if (anyActive  && sortBy === 'total') { setSortBy('score'); setSortDirection('desc'); }
    if (!anyActive && sortBy === 'score') { setSortBy('total'); setSortDirection('asc'); }
  }, [priorities]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (col: SortColumn) => {
    if (sortBy === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDirection(col === 'score' || col === 'asianSpots' ? 'desc' : 'asc');
    }
  };

  const calculateCosts = useCallback(() => {
    // Default to a Zone 1 destination when nothing is selected yet, so the map and
    // table render on first load (commute stays "?" until a destination is chosen) —
    // same assumption address mode already makes before an address is entered.
    const workZone = workMode === 'address'
      ? ADDRESS_WORK_ZONE
      : workLocations[workLocation as WorkLocationKey]?.zone ?? ADDRESS_WORK_ZONE;

    // A partner contributes their own commute fares once their workplace is set
    // (a preset location, or a typed address — assumed Zone 1, like the primary).
    const hasPartnerWork = workMode2 === 'address'
      ? Boolean(officePostcode2.trim())
      : Boolean(workLocation2);
    const partnerWorkZone = workMode2 === 'address'
      ? ADDRESS_WORK_ZONE
      : workLocations[workLocation2 as WorkLocationKey]?.zone ?? ADDRESS_WORK_ZONE;

    const calculated = Object.entries(locationData).map(([location, data]) => {
      const rent = data.rent[bedrooms];
      const farePerTrip = getFarePerTrip(data.zone, workZone);
      const partnerFarePerTrip = hasPartnerWork ? getFarePerTrip(data.zone, partnerWorkZone) : 0;
      const transportCostMonthly = (farePerTrip + partnerFarePerTrip) * monthlyTrips;
      const councilTaxMonthly = councilTaxData[data.borough][bedrooms] / 12;
      const totalMonthly = rent + transportCostMonthly + councilTaxMonthly;
      const stats = boroughStats[data.borough];
      const nearbySchools = locationSchoolStats[location]?.[childGender]?.[schoolFaith];
      const nearbySchoolsTotal = nearbySchools
        ? nearbySchools.primarySchools + nearbySchools.secondarySchools
        : 0;
      const schools = nearbySchools && nearbySchoolsTotal > 0 ? nearbySchools : stats;
      const schoolsSource: Result['schoolsSource'] = nearbySchools && nearbySchoolsTotal > 0 ? 'nearby' : 'borough';
      const outstandingSchools = schools
        ? schools.primaryOutstandingSchools + schools.secondaryOutstandingSchools
        : null;
      const schoolsTotal = schools
        ? schools.primarySchools + schools.secondarySchools
        : null;
      return {
        location,
        displayName: data.displayName,
        comparisonName: data.comparisonName,
        anchorStation: data.anchorStation,
        labelScope: data.labelScope,
        dataConfidence: data.dataConfidence,
        reviewNote: data.reviewNote,
        borough: data.borough,
        zone: data.zone,
        rent,
        transportCostMonthly,
        councilTaxMonthly,
        totalMonthly,
        farePerTrip,
        partnerFarePerTrip,
        // Static matrix feeds the base only for preset + static; live (and address) start
        // null and are filled by the live fetch in sortedResults.
        commuteTime:  workMode  === 'preset' && commuteSource  === 'static' ? getCommuteTime(location, workLocation) : null,
        commuteTime2: workMode2 === 'preset' && commuteSource2 === 'static' && workLocation2 ? getCommuteTime(location, workLocation2) : null,
        commuteRoute:  workMode  === 'preset' && commuteSource  === 'static' ? getCommuteRoute(location, workLocation) : null,
        commuteRoute2: workMode2 === 'preset' && commuteSource2 === 'static' && workLocation2 ? getCommuteRoute(location, workLocation2) : null,
        crimeRate:    stats?.crimesPer1000 ?? null,
        primaryOutstandingSchools: schools?.primaryOutstandingSchools ?? null,
        primaryGoodSchools: schoolsSource === 'nearby' ? nearbySchools.primaryGoodSchools ?? null : null,
        primarySchools: schools?.primarySchools ?? null,
        primaryWeightedQuality: schoolsSource === 'nearby' ? nearbySchools.primaryWeightedQuality ?? null : null,
        primaryWeightedStrong:  schoolsSource === 'nearby' ? nearbySchools.primaryWeightedStrong ?? null : null,
        secondaryOutstandingSchools: schools?.secondaryOutstandingSchools ?? null,
        secondaryGoodSchools: schoolsSource === 'nearby' ? nearbySchools.secondaryGoodSchools ?? null : null,
        secondarySchools: schools?.secondarySchools ?? null,
        grammarSchools: schoolsSource === 'nearby'
          ? nearbySchools.grammarSchools ?? nearbySchools.nearestOutstandingSchools.filter(school =>
            school.phase === 'Secondary' && school.name.toLowerCase().includes('grammar')
          ).length
          : null,
        outstandingSchools,
        schoolsTotal,
        outstandingSchoolsPct: outstandingSchools !== null && schoolsTotal
          ? Math.round((outstandingSchools / schoolsTotal) * 1000) / 10
          : null,
        schoolsSource,
        schoolsRadiusKm: schoolsSource === 'nearby' ? nearbySchools.secondaryRadiusKm ?? nearbySchools.radiusKm : null,
        primarySchoolsRadiusKm: schoolsSource === 'nearby' ? nearbySchools.primaryRadiusKm ?? nearbySchools.radiusKm : null,
        secondarySchoolsRadiusKm: schoolsSource === 'nearby' ? nearbySchools.secondaryRadiusKm ?? nearbySchools.radiusKm : null,
        nearestOutstandingSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestOutstandingSchools
          : [],
        nearestPrimaryOutstandingSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestPrimaryOutstandingSchools
            ?? nearbySchools.nearestOutstandingSchools.filter(school => school.phase === 'Primary')
          : [],
        nearestPrimaryGoodSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestPrimaryGoodSchools ?? []
          : [],
        nearestSecondaryOutstandingSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestSecondaryOutstandingSchools
            ?? nearbySchools.nearestOutstandingSchools.filter(school => school.phase === 'Secondary')
          : [],
        nearestSecondaryGoodSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestSecondaryGoodSchools ?? []
          : [],
        nearestGrammarSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestGrammarSchools
            ?? nearbySchools.nearestOutstandingSchools.filter(school =>
              school.phase === 'Secondary' && school.name.toLowerCase().includes('grammar')
            )
          : [],
        bedrooms,
      };
    });
    const anyPriority = Object.values(priorities).some(v => v > 0);
    setSortBy(anyPriority ? 'score' : 'total');
    setSortDirection(anyPriority ? 'desc' : 'asc');
    setResults(calculated);
  }, [workMode, workLocation, workMode2, workLocation2, commuteSource, commuteSource2, officePostcode2, monthlyTrips, bedrooms, priorities, childGender, schoolFaith]);

  // force=true skips the session cache so an explicit click always recalculates.
  const fetchLiveCommutes = useCallback(async (force = false) => {
    // Destination is the typed address, or — for preset + live — the chosen preset's coords.
    const presetLive = workMode === 'preset' && commuteSource === 'live';
    const coords = presetLive ? presetCoordsStr(workLocation) : selectedOfficeCoords;
    const input = presetLive ? '' : officePostcode.trim();
    if (!input && !coords) return;
    setLiveCommuteError(null);

    const cacheKey = getLiveCommuteCacheKey('live-commute', input, coords);
    const cached = !force && sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { times: Record<string, number | null>; routes: Record<string, string | null> };
      setLiveCommuteTimes(parsed.times);
      setLiveCommuteRoutes(parsed.routes ?? {});
      setLiveCommuteProgress(Object.keys(locationData).length);
      setLiveCommuteTotal(Object.keys(locationData).length);
      return;
    }

    setLiveCommuteTimes({});
    setLiveCommuteRoutes({});
    const result = await doFetchLiveCommutes({
      input,
      selectedCoords: coords,
      setGeocoding: setLiveCommuteGeocoding,
      setError: setLiveCommuteError,
      setLoading: setLiveCommuteLoading,
      setProgress: setLiveCommuteProgress,
      setTotal: setLiveCommuteTotal,
      updateTimes: (loc, time) => setLiveCommuteTimes(prev => ({ ...prev, [loc]: time })),
      updateRoute: (loc, route) => setLiveCommuteRoutes(prev => ({ ...prev, [loc]: route })),
    });
    if (result && hasCompleteLiveCommuteResults(result.allResults)) {
      sessionStorage.setItem(cacheKey, JSON.stringify({ times: result.allResults, routes: result.allRoutes }));
    }
  }, [officePostcode, selectedOfficeCoords, workMode, commuteSource, workLocation]);

  const fetchLiveCommutes2 = useCallback(async (force = false) => {
    const presetLive = workMode2 === 'preset' && commuteSource2 === 'live';
    const coords = presetLive ? presetCoordsStr(workLocation2) : selectedOfficeCoords2;
    const input = presetLive ? '' : officePostcode2.trim();
    if (!input && !coords) return;
    setLiveCommuteError2(null);

    const cacheKey = getLiveCommuteCacheKey('live-commute2', input, coords);
    const cached = !force && sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { times: Record<string, number | null>; routes: Record<string, string | null> };
      setLiveCommuteTimes2(parsed.times);
      setLiveCommuteRoutes2(parsed.routes ?? {});
      setLiveCommuteProgress2(Object.keys(locationData).length);
      setLiveCommuteTotal2(Object.keys(locationData).length);
      return;
    }

    setLiveCommuteTimes2({});
    setLiveCommuteRoutes2({});
    const result = await doFetchLiveCommutes({
      input,
      selectedCoords: coords,
      setGeocoding: setLiveCommuteGeocoding2,
      setError: setLiveCommuteError2,
      setLoading: setLiveCommuteLoading2,
      setProgress: setLiveCommuteProgress2,
      setTotal: setLiveCommuteTotal2,
      updateTimes: (loc, time) => setLiveCommuteTimes2(prev => ({ ...prev, [loc]: time })),
      updateRoute: (loc, route) => setLiveCommuteRoutes2(prev => ({ ...prev, [loc]: route })),
    });
    if (result && hasCompleteLiveCommuteResults(result.allResults)) {
      sessionStorage.setItem(cacheKey, JSON.stringify({ times: result.allResults, routes: result.allRoutes }));
    }
  }, [officePostcode2, selectedOfficeCoords2, workMode2, commuteSource2, workLocation2]);

  // Preset + live auto-fetches as soon as a destination/source is chosen — no extra button.
  // The clearing effects above reset times first; fetch then re-runs (cache makes it instant).
  useEffect(() => {
    if (workMode === 'preset' && commuteSource === 'live' && workLocation) void fetchLiveCommutes();
  }, [workMode, commuteSource, workLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (workMode2 === 'preset' && commuteSource2 === 'live' && workLocation2) void fetchLiveCommutes2();
  }, [workMode2, commuteSource2, workLocation2]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyPriority = Object.values(priorities).some(v => v > 0);

  const sortedResults = useMemo((): ScoredResult[] => {
    if (!results.length) return [];

    const isActive = Object.values(priorities).some(v => v > 0);

    // Address is inherently live; a preset is live only when its source toggle says so.
    const liveOn  = workMode  === 'address' || commuteSource  === 'live';
    const liveOn2 = workMode2 === 'address' || commuteSource2 === 'live';
    const withLive = results.map(r => ({
      ...r,
      commuteTime:        liveOn  && r.location in liveCommuteTimes  ? liveCommuteTimes[r.location]  : r.commuteTime,
      commuteIsLive:      liveOn  && r.location in liveCommuteTimes,
      commuteRoute:       liveOn  && r.location in liveCommuteTimes  ? (liveCommuteRoutes[r.location]  ?? null) : r.commuteRoute,
      commuteTime2:       liveOn2 && r.location in liveCommuteTimes2 ? liveCommuteTimes2[r.location] : r.commuteTime2,
      commuteTime2IsLive: liveOn2 && r.location in liveCommuteTimes2,
      commuteRoute2:      liveOn2 && r.location in liveCommuteTimes2 ? (liveCommuteRoutes2[r.location] ?? null) : r.commuteRoute2,
    }));

    const norm = (val: number, arr: number[], lowerBetter: boolean) => {
      const min = Math.min(...arr), max = Math.max(...arr);
      if (max === min) return 50;
      return lowerBetter ? ((max - val) / (max - min)) * 100 : ((val - min) / (max - min)) * 100;
    };

    // Schools: blend quality (Outstanding + half-credit for Good) with supply (how many strong
    // schools are actually nearby), scored per phase then averaged so primary AND secondary both
    // have to be decent — plus a small bump where selective/grammar exists. Supply is relative to
    // the best-served area (sqrt for diminishing returns, so a few dense central areas don't flatten
    // everyone else). Computed for every row (independent of the sliders) so the expanded view can
    // always show the breakdown; the scoring below reuses these values. Replaces the old
    // Outstanding-share-only metric.
    // Primary uses distance-weighted figures (closer schools count more, since primary admission is
    // distance-based); secondary stays on flat counts. Falls back to raw counts on borough data.
    const primaryStrong   = (x: typeof withLive[number]) => x.primaryWeightedStrong ?? ((x.primaryOutstandingSchools ?? 0) + (x.primaryGoodSchools ?? 0));
    const secondaryStrong = (x: typeof withLive[number]) => (x.secondaryOutstandingSchools ?? 0) + (x.secondaryGoodSchools ?? 0);
    const maxPrimaryStrong   = Math.max(1, ...withLive.map(primaryStrong));
    const maxSecondaryStrong = Math.max(1, ...withLive.map(secondaryStrong));
    const phaseQuality = (o: number, g: number, total: number) => total ? (o + 0.5 * g) / total : 0;
    const phaseSupply  = (strong: number, maxStrong: number) => Math.sqrt(strong / maxStrong);
    // Selective/grammar bonus scales with how many grammar schools are nearby (not a flat bump),
    // relative to the best-served area with sqrt for diminishing returns — so a 5-grammar borough
    // like Sutton is rewarded over an area with one, which a flat bonus failed to do.
    const maxGrammar = Math.max(1, ...withLive.map(x => x.grammarSchools ?? 0));
    const grammarBonus = (x: typeof withLive[number]) => 0.25 * Math.sqrt((x.grammarSchools ?? 0) / maxGrammar);
    // Phase score from the *displayed* rounded %s, so the on-screen "Q×0.6 + C×0.4 = N" adds up. A
    // phase with no schools nearby scores 0 (a real gap), so averaging both phases penalises areas
    // strong in one phase but missing the other — that's the point of weighting them equally.
    const phaseInt = (quality: number | null, supply: number | null) =>
      quality === null || supply === null
        ? null
        : Math.round(0.6 * Math.round(quality * 100) + 0.4 * Math.round(supply * 100));
    const buildSchoolScore = (x: typeof withLive[number]): ScoredResult['schoolScore'] => {
      const pq = x.primarySchools ? (x.primaryWeightedQuality ?? phaseQuality(x.primaryOutstandingSchools ?? 0, x.primaryGoodSchools ?? 0, x.primarySchools)) : null;
      const ps = x.primarySchools ? phaseSupply(primaryStrong(x), maxPrimaryStrong) : null;
      const sq = x.secondarySchools ? phaseQuality(x.secondaryOutstandingSchools ?? 0, x.secondaryGoodSchools ?? 0, x.secondarySchools) : null;
      const ss = x.secondarySchools ? phaseSupply(secondaryStrong(x), maxSecondaryStrong) : null;
      const pScore = phaseInt(pq, ps), sScore = phaseInt(sq, ss);
      const averaged = Math.round(((pScore ?? 0) + (sScore ?? 0)) / 2);
      return {
        primary:   { strong: primaryStrong(x),   quality: pq, supply: ps, score: pScore },
        secondary: { strong: secondaryStrong(x), quality: sq, supply: ss, score: sScore },
        averaged,
        raw: averaged + Math.round(grammarBonus(x) * 100),
      };
    };
    // Build once per area; the composite normalises the SAME raw the column shows, so a schools-only
    // ranking lines up exactly with the Schools column order.
    const schoolScores = withLive.map(buildSchoolScore);
    const allSchoolRaws = schoolScores.map(s => s.raw);

    let scored = withLive.map((r, i) => {
      let compositeScore = 0;
      let scoreBreakdown: ScoredResult['scoreBreakdown'] = [];
      if (isActive) {
        const totalWeight = priorities.commute + priorities.cost + priorities.safety + priorities.schools;
        // Effective commute = journey time + expected wait, where the wait keys off each
        // person's actual route (train vs tube first leg), so two equal journey times score
        // differently when one boards a service that runs every 30 min.
        const withPartnerScore = (workMode2 !== 'preset' || workLocation2);
        // A side contributes its journey time + route-aware wait + interchange cost only when it
        // has an actual journey; with no destination the per-location wait is meaningless noise, so
        // a null side drops out. When BOTH sides are null (no commute destination selected at all)
        // every location falls back to the same constant, so the commute factor is neutral rather
        // than ranking purely by which station happens to have the longest train interval. The
        // interchange cost makes a direct trip beat an equal-length trip with changes.
        const sideEffective = (time: number | null, location: string, route: string | null) =>
          time === null ? null : time + expectedWaitMinutes(location, route) + interchangeWaitMinutes(route);
        const combineCommute = (x: typeof withLive[number]) => {
          const sides = [sideEffective(x.commuteTime, x.location, x.commuteRoute)];
          if (withPartnerScore) sides.push(sideEffective(x.commuteTime2, x.location, x.commuteRoute2));
          const present = sides.filter((v): v is number => v !== null);
          return present.length ? present.reduce((a, b) => a + b, 0) / present.length : NULL_COMMUTE_FALLBACK;
        };
        const allCommutes = withLive.map(combineCommute);
        const allCosts   = withLive.map(x => x.totalMonthly);
        const allCrimes  = withLive.map(x => x.crimeRate  ?? NULL_CRIME_FALLBACK);

        const myCommute = combineCommute(r);

        const nCommute = norm(myCommute,                          allCommutes, true);
        const nCost    = norm(r.totalMonthly,                     allCosts,    true);
        const nSafety  = norm(r.crimeRate ?? NULL_CRIME_FALLBACK, allCrimes,   true);
        const nSchools = norm(schoolScores[i].raw,                allSchoolRaws,    false);

        const sc = nCommute * priorities.commute
                 + nCost    * priorities.cost
                 + nSafety  * priorities.safety
                 + nSchools * priorities.schools;

        compositeScore = totalWeight > 0 ? Math.round(sc / totalWeight) : 0;
        scoreBreakdown = ([
          { key: 'commute', normalized: Math.round(nCommute), weight: priorities.commute },
          { key: 'cost',    normalized: Math.round(nCost),    weight: priorities.cost },
          { key: 'safety',  normalized: Math.round(nSafety),  weight: priorities.safety },
          { key: 'schools', normalized: Math.round(nSchools), weight: priorities.schools },
        ] as ScoredResult['scoreBreakdown']).filter(factor => factor.weight > 0);
      }
      return { ...r, compositeScore, scoreBreakdown, schoolScore: schoolScores[i] };
    });

    const cmp = (a: ScoredResult, b: ScoredResult): number => {
      switch (sortBy) {
        case 'score':      return b.compositeScore - a.compositeScore;
        case 'rent':       return a.rent - b.rent;
        case 'transport':  return a.transportCostMonthly - b.transportCostMonthly;
        case 'councilTax': return a.councilTaxMonthly - b.councilTaxMonthly;
        case 'location':   return a.displayName.localeCompare(b.displayName);
        case 'borough':    return a.borough.localeCompare(b.borough);
        case 'commute': {
          if (a.commuteTime === null && b.commuteTime === null) return 0;
          if (a.commuteTime === null) return 1;
          if (b.commuteTime === null) return -1;
          return a.commuteTime - b.commuteTime;
        }
        case 'crime': {
          if (a.crimeRate === null && b.crimeRate === null) return 0;
          if (a.crimeRate === null) return 1;
          if (b.crimeRate === null) return -1;
          return a.crimeRate - b.crimeRate;
        }
        case 'schools': {
          // Sort by the blended school sub-score (what the column now shows); no-data rows still sink.
          if (a.outstandingSchoolsPct === null && b.outstandingSchoolsPct === null) return 0;
          if (a.outstandingSchoolsPct === null) return 1;
          if (b.outstandingSchoolsPct === null) return -1;
          return b.schoolScore.raw - a.schoolScore.raw;
        }
        case 'asianSpots': {
          // Most spots first by default (like score/schools); 0 is a valid value, never null.
          return (asianSpots[b.location]?.length ?? 0) - (asianSpots[a.location]?.length ?? 0);
        }
        default: return a.totalMonthly - b.totalMonthly;
      }
    };

    scored.sort(cmp);
    const descByDefault = sortBy === 'score' || sortBy === 'schools' || sortBy === 'asianSpots';
    if (sortDirection === 'desc' && !descByDefault) scored.reverse();
    if (sortDirection === 'asc'  && descByDefault) scored.reverse();

    // Rows missing the sorted metric (e.g. no live commute fetched yet) always sink to the
    // bottom, regardless of direction — otherwise the desc reverse floats the blanks to the top.
    const missingForSort = (r: ScoredResult): boolean =>
      sortBy === 'commute' ? r.commuteTime === null
        : sortBy === 'crime' ? r.crimeRate === null
          : sortBy === 'schools' ? r.outstandingSchoolsPct === null
            : false;
    if (sortBy === 'commute' || sortBy === 'crime' || sortBy === 'schools') {
      scored = [...scored.filter(r => !missingForSort(r)), ...scored.filter(r => missingForSort(r))];
    }

    if (budgetEnabled) {
      const within = scored.filter(r => r.totalMonthly <= maxBudget);
      const over   = scored.filter(r => r.totalMonthly >  maxBudget);
      scored = [...within, ...over];
    }

    return scored;
  }, [results, liveCommuteTimes, liveCommuteTimes2, liveCommuteRoutes, liveCommuteRoutes2, workMode, workMode2, workLocation2, commuteSource, commuteSource2, sortBy, sortDirection, priorities, budgetEnabled, maxBudget]);

  useEffect(() => {
    calculateCosts();
  }, [calculateCosts]);

  return {
    workLocation,  setWorkLocation,
    workLocation2, setWorkLocation2,
    workMode,      setWorkMode,
    workMode2,     setWorkMode2,
    commuteSource,  setCommuteSource,
    commuteSource2, setCommuteSource2,
    bedrooms,      setBedrooms,
    monthlyTrips,  setMonthlyTrips,
    priorities,    setPriorities,
    childGender,   setChildGender,
    schoolFaith,   setSchoolFaith,
    budgetEnabled, setBudgetEnabled,
    maxBudget,     setMaxBudget,
    // Primary live commute
    officePostcode,       setOfficePostcode,
    selectedOfficeCoords, setSelectedOfficeCoords,
    liveCommuteLoading,   liveCommuteGeocoding,
    liveCommuteProgress,  liveCommuteTotal,
    liveCommuteError,
    fetchLiveCommutes,
    // Partner live commute
    officePostcode2,      setOfficePostcode2,
    selectedOfficeCoords2, setSelectedOfficeCoords2,
    liveCommuteLoading2,  liveCommuteGeocoding2,
    liveCommuteProgress2, liveCommuteTotal2,
    liveCommuteError2,
    fetchLiveCommutes2,
    // Shared
    sortedResults,
    anyPriority,
    sortBy,
    sortDirection,
    handleSort,
  };
}
