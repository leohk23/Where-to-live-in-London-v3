import { useState, useEffect, useCallback, useMemo } from 'react';
import { commuteTimes } from '../commute-times';
import { locationData } from '../location-data';
import { councilTaxData } from '../tax-data';
import { boroughStats } from '../borough-stats';
import { locationSchoolStats } from '../location-schools';
import { workLocations, type WorkLocationKey } from '../work-locations';
import {
  FARE_BY_ZONE_DIFF, FARE_FALLBACK,
  NULL_COMMUTE_FALLBACK, NULL_CRIME_FALLBACK,
  DEFAULT_MONTHLY_TRIPS, DEFAULT_BUDGET, MAX_MONTHLY_TRIPS,
} from '../lib/constants';
import type { BedroomCount, Result, ScoredResult, Priorities, SortColumn } from '../types';

type WorkMode = 'preset' | 'address';
const ADDRESS_WORK_ZONE = 'Zone 1';
const LIVE_COMMUTE_CACHE_VERSION = 'v3';
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
    wm:     (p.get('wm') === 'a' ? 'address' : 'preset') as WorkMode,
    wm2:    (p.get('wm2') === 'a' ? 'address' : 'preset') as WorkMode,
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

function getNextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + diff);
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
  journeys?: Array<{ duration?: number }>;
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
): Promise<{ duration: number | null; destination: string }> {
  try {
    const res = await fetch(
      `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(origin)}/to/${encodeURIComponent(destination)}?${qs}`
    );

    if (res.ok) {
      const json = await res.json() as TflJourneyResponse;
      return { duration: json.journeys?.[0]?.duration ?? null, destination };
    }

    if (res.status === 300 && !hasRetried) {
      const json = await res.json().catch(() => null) as TflDisambiguationResponse | null;
      const resolvedOrigin = getDisambiguatedPoint(json?.fromLocationDisambiguation) ?? origin;
      const resolvedDestination = getDisambiguatedPoint(json?.toLocationDisambiguation) ?? destination;

      if (resolvedOrigin !== origin || resolvedDestination !== destination) {
        return fetchTflJourneyDuration(resolvedOrigin, resolvedDestination, qs, true);
      }
    }
  } catch {
    return { duration: null, destination };
  }

  return { duration: null, destination };
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
}): Promise<{ destination: string; allResults: Record<string, number | null> } | null> {
  const { input, selectedCoords, setGeocoding, setError, setLoading, setProgress, setTotal, updateTimes } = params;

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
  const date = getNextMonday();
  const qs = new URLSearchParams({
    mode: 'tube,overground,elizabeth-line,dlr,tram,national-rail',
    timeIs: 'Departing',
    date,
    time: '0900',
  }).toString();
  const resolvedDestination = await resolveTflDestination(destination, entries, qs);

  await fetchWithConcurrency(entries, 8, async ([location, data]) => {
    if (!data.naptan) {
      allResults[location] = null;
    } else {
      const result = await fetchTflJourneyDuration(data.naptan, resolvedDestination, qs);
      allResults[location] = result.duration;
    }
    updateTimes(location, allResults[location]);
    setProgress(p => p + 1);
  });

  setLoading(false);
  return { destination, allResults };
}

export function useCalculator() {
  const url = useMemo(() => readUrlParams(), []);

  const [workLocation,  setWorkLocation]  = useState<WorkLocationKey | ''>(url?.work  as WorkLocationKey | '' ?? '');
  const [workLocation2, setWorkLocation2] = useState<WorkLocationKey | ''>(url?.work2 as WorkLocationKey | '' ?? '');
  const [workMode,      setWorkMode]      = useState<WorkMode>(url?.wm  ?? 'preset');
  const [workMode2,     setWorkMode2]     = useState<WorkMode>(url?.wm2 ?? 'preset');
  const [monthlyTrips,  setMonthlyTrips]  = useState<number>(url?.trips ?? DEFAULT_MONTHLY_TRIPS);
  const [bedrooms,      setBedrooms]      = useState<BedroomCount>(url?.beds ?? 1);
  const [budgetEnabled, setBudgetEnabled] = useState<boolean>(url?.be ?? false);
  const [maxBudget,     setMaxBudget]     = useState<number>(url?.budget ?? DEFAULT_BUDGET);
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
  const [liveCommuteProgress, setLiveCommuteProgress] = useState(0);
  const [liveCommuteTotal,    setLiveCommuteTotal]    = useState(0);
  const [liveCommuteLoading,  setLiveCommuteLoading]  = useState(false);
  const [liveCommuteGeocoding, setLiveCommuteGeocoding] = useState(false);
  const [liveCommuteError,    setLiveCommuteError]    = useState<string | null>(null);

  // Live commute — partner
  const [officePostcode2,       setOfficePostcode2]       = useState<string>(url?.op2 ?? '');
  const [selectedOfficeCoords2, setSelectedOfficeCoords2] = useState<{ lat: string; lon: string } | null>(null);
  const [liveCommuteTimes2,     setLiveCommuteTimes2]     = useState<Record<string, number | null>>({});
  const [liveCommuteProgress2,  setLiveCommuteProgress2]  = useState(0);
  const [liveCommuteTotal2,     setLiveCommuteTotal2]     = useState(0);
  const [liveCommuteLoading2,   setLiveCommuteLoading2]   = useState(false);
  const [liveCommuteGeocoding2, setLiveCommuteGeocoding2] = useState(false);
  const [liveCommuteError2,     setLiveCommuteError2]     = useState<string | null>(null);

  // Clear live times when inputs are edited
  useEffect(() => {
    setLiveCommuteTimes({});
    setLiveCommuteProgress(0);
    setLiveCommuteTotal(0);
    setLiveCommuteError(null);
  }, [officePostcode]);

  useEffect(() => {
    setLiveCommuteTimes2({});
    setLiveCommuteProgress2(0);
    setLiveCommuteTotal2(0);
    setLiveCommuteError2(null);
  }, [officePostcode2]);

  // URL sync
  useEffect(() => {
    const p = new URLSearchParams();
    if (workLocation)                           p.set('work',   workLocation);
    if (workLocation2)                          p.set('work2',  workLocation2);
    if (workMode  === 'address')                p.set('wm',     'a');
    if (workMode2 === 'address')                p.set('wm2',    'a');
    if (bedrooms !== 1)                         p.set('beds',   String(bedrooms));
    if (monthlyTrips !== DEFAULT_MONTHLY_TRIPS) p.set('trips',  String(monthlyTrips));
    if (priorities.commute)                     p.set('pc',     String(priorities.commute));
    if (priorities.cost)                        p.set('pco',    String(priorities.cost));
    if (priorities.safety)                      p.set('ps',     String(priorities.safety));
    if (priorities.schools)                     p.set('psch',   String(priorities.schools));
    if (budgetEnabled) { p.set('be', '1'); p.set('budget', String(maxBudget)); }
    if (officePostcode)  p.set('op',  officePostcode);
    if (officePostcode2) p.set('op2', officePostcode2);
    const qs = p.toString();
    window.history.replaceState({}, '', qs ? '?' + qs : window.location.pathname);
  }, [workLocation, workLocation2, workMode, workMode2, bedrooms, monthlyTrips, priorities, maxBudget, budgetEnabled, officePostcode, officePostcode2]);

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
      setSortDirection(col === 'score' ? 'desc' : 'asc');
    }
  };

  const calculateCosts = useCallback(() => {
    const workZone = workMode === 'address'
      ? ADDRESS_WORK_ZONE
      : workLocations[workLocation as WorkLocationKey]?.zone;
    if (!workZone) return;

    const calculated = Object.entries(locationData).map(([location, data]) => {
      const rent = data.rent[bedrooms];
      const farePerTrip = getFarePerTrip(data.zone, workZone);
      const transportCostMonthly = farePerTrip * monthlyTrips;
      const councilTaxMonthly = councilTaxData[data.borough][bedrooms] / 12;
      const totalMonthly = rent + transportCostMonthly + councilTaxMonthly;
      const stats = boroughStats[data.borough];
      const nearbySchools = locationSchoolStats[location];
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
        commuteTime:  workMode  === 'preset' ? getCommuteTime(location, workLocation) : null,
        commuteTime2: workMode2 === 'preset' && workLocation2 ? getCommuteTime(location, workLocation2) : null,
        crimeRate:    stats?.crimesPer1000 ?? null,
        primaryOutstandingSchools: schools?.primaryOutstandingSchools ?? null,
        primarySchools: schools?.primarySchools ?? null,
        secondaryOutstandingSchools: schools?.secondaryOutstandingSchools ?? null,
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
        nearestSecondaryOutstandingSchools: schoolsSource === 'nearby'
          ? nearbySchools.nearestSecondaryOutstandingSchools
            ?? nearbySchools.nearestOutstandingSchools.filter(school => school.phase === 'Secondary')
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
  }, [workMode, workLocation, workMode2, workLocation2, monthlyTrips, bedrooms, priorities]);

  const fetchLiveCommutes = useCallback(async () => {
    const input = officePostcode.trim();
    if (!input) return;
    setLiveCommuteError(null);

    const cacheKey = getLiveCommuteCacheKey('live-commute', input, selectedOfficeCoords);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, number | null>;
      setLiveCommuteTimes(parsed);
      setLiveCommuteProgress(Object.keys(locationData).length);
      setLiveCommuteTotal(Object.keys(locationData).length);
      return;
    }

    setLiveCommuteTimes({});
    const result = await doFetchLiveCommutes({
      input,
      selectedCoords: selectedOfficeCoords,
      setGeocoding: setLiveCommuteGeocoding,
      setError: setLiveCommuteError,
      setLoading: setLiveCommuteLoading,
      setProgress: setLiveCommuteProgress,
      setTotal: setLiveCommuteTotal,
      updateTimes: (loc, time) => setLiveCommuteTimes(prev => ({ ...prev, [loc]: time })),
    });
    if (result && hasCompleteLiveCommuteResults(result.allResults)) {
      sessionStorage.setItem(cacheKey, JSON.stringify(result.allResults));
    }
  }, [officePostcode, selectedOfficeCoords]);

  const fetchLiveCommutes2 = useCallback(async () => {
    const input = officePostcode2.trim();
    if (!input) return;
    setLiveCommuteError2(null);

    const cacheKey = getLiveCommuteCacheKey('live-commute2', input, selectedOfficeCoords2);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, number | null>;
      setLiveCommuteTimes2(parsed);
      setLiveCommuteProgress2(Object.keys(locationData).length);
      setLiveCommuteTotal2(Object.keys(locationData).length);
      return;
    }

    setLiveCommuteTimes2({});
    const result = await doFetchLiveCommutes({
      input,
      selectedCoords: selectedOfficeCoords2,
      setGeocoding: setLiveCommuteGeocoding2,
      setError: setLiveCommuteError2,
      setLoading: setLiveCommuteLoading2,
      setProgress: setLiveCommuteProgress2,
      setTotal: setLiveCommuteTotal2,
      updateTimes: (loc, time) => setLiveCommuteTimes2(prev => ({ ...prev, [loc]: time })),
    });
    if (result && hasCompleteLiveCommuteResults(result.allResults)) {
      sessionStorage.setItem(cacheKey, JSON.stringify(result.allResults));
    }
  }, [officePostcode2, selectedOfficeCoords2]);

  const anyPriority = Object.values(priorities).some(v => v > 0);

  const sortedResults = useMemo((): ScoredResult[] => {
    if (!results.length) return [];

    const isActive = Object.values(priorities).some(v => v > 0);

    const withLive = results.map(r => ({
      ...r,
      commuteTime:      r.location in liveCommuteTimes  ? liveCommuteTimes[r.location]  : r.commuteTime,
      commuteIsLive:    r.location in liveCommuteTimes,
      commuteTime2:     workMode2 === 'address' && r.location in liveCommuteTimes2 ? liveCommuteTimes2[r.location] : r.commuteTime2,
      commuteTime2IsLive: workMode2 === 'address' && r.location in liveCommuteTimes2,
    }));

    let scored = withLive.map(r => {
      let compositeScore = 0;
      if (isActive) {
        const totalWeight = priorities.commute + priorities.cost + priorities.safety + priorities.schools;
        const allCommutes = withLive.map(x => {
          const t1 = x.commuteTime ?? NULL_COMMUTE_FALLBACK;
          const t2 = (workMode2 !== 'preset' || workLocation2) ? (x.commuteTime2 ?? NULL_COMMUTE_FALLBACK) : t1;
          return (workMode2 !== 'preset' || workLocation2) ? (t1 + t2) / 2 : t1;
        });
        const allCosts   = withLive.map(x => x.totalMonthly);
        const allCrimes  = withLive.map(x => x.crimeRate  ?? NULL_CRIME_FALLBACK);
        const allSchools = withLive.map(x => x.outstandingSchoolsPct ?? 0);

        const norm = (val: number, arr: number[], lowerBetter: boolean) => {
          const min = Math.min(...arr), max = Math.max(...arr);
          if (max === min) return 50;
          return lowerBetter ? ((max - val) / (max - min)) * 100 : ((val - min) / (max - min)) * 100;
        };

        const hasPartner = workMode2 === 'address' || !!workLocation2;
        const myCommute = hasPartner
          ? ((r.commuteTime ?? NULL_COMMUTE_FALLBACK) + (r.commuteTime2 ?? NULL_COMMUTE_FALLBACK)) / 2
          : (r.commuteTime ?? NULL_COMMUTE_FALLBACK);

        const sc = norm(myCommute,                          allCommutes, true)  * priorities.commute
                 + norm(r.totalMonthly,                     allCosts,    true)  * priorities.cost
                 + norm(r.crimeRate ?? NULL_CRIME_FALLBACK, allCrimes,   true)  * priorities.safety
                 + norm(r.outstandingSchoolsPct ?? 0,       allSchools,  false) * priorities.schools;

        compositeScore = totalWeight > 0 ? Math.round(sc / totalWeight) : 0;
      }
      return { ...r, compositeScore };
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
          if (a.outstandingSchoolsPct === null && b.outstandingSchoolsPct === null) return 0;
          if (a.outstandingSchoolsPct === null) return 1;
          if (b.outstandingSchoolsPct === null) return -1;
          return b.outstandingSchoolsPct - a.outstandingSchoolsPct;
        }
        default: return a.totalMonthly - b.totalMonthly;
      }
    };

    scored.sort(cmp);
    if (sortDirection === 'desc' && sortBy !== 'score' && sortBy !== 'schools') scored.reverse();
    if (sortDirection === 'asc'  && (sortBy === 'score' || sortBy === 'schools')) scored.reverse();

    if (budgetEnabled) {
      const within = scored.filter(r => r.totalMonthly <= maxBudget);
      const over   = scored.filter(r => r.totalMonthly >  maxBudget);
      scored = [...within, ...over];
    }

    return scored;
  }, [results, liveCommuteTimes, liveCommuteTimes2, workMode2, workLocation2, sortBy, sortDirection, priorities, budgetEnabled, maxBudget]);

  useEffect(() => {
    calculateCosts();
  }, [calculateCosts]);

  return {
    workLocation,  setWorkLocation,
    workLocation2, setWorkLocation2,
    workMode,      setWorkMode,
    workMode2,     setWorkMode2,
    bedrooms,      setBedrooms,
    monthlyTrips,  setMonthlyTrips,
    priorities,    setPriorities,
    budgetEnabled, setBudgetEnabled,
    maxBudget,     setMaxBudget,
    // Primary live commute
    officePostcode,       setOfficePostcode,
    setSelectedOfficeCoords,
    liveCommuteLoading,   liveCommuteGeocoding,
    liveCommuteProgress,  liveCommuteTotal,
    liveCommuteError,
    fetchLiveCommutes,
    // Partner live commute
    officePostcode2,      setOfficePostcode2,
    setSelectedOfficeCoords2,
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
