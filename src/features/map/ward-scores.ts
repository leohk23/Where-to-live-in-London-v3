// Per-ward scoring shared by the big map's ward heatmap and the expanded row's ward section, so the
// two always show identical numbers. A ward's score blends Commute + Crime + Schools by the same
// slider weights the results table uses, but computed at ward granularity: Commute is the best
// station per ward (journey + wait + interchange + straight-line walk from the ward centre), Crime
// and Commute are normalised within the area (best ward = 100), Schools keeps its absolute sub-score.
import { schoolScoreFromStats, schoolStatsForPoint, wardCrime, haversineKm, locationData } from '../../data';
import type { SchoolFaith, SchoolGender } from '../../data';
import { expectedWaitMinutes, interchangeWaitMinutes, walkMinutes } from '../../lib/commute-wait';
import { pointForNaptan } from '../../lib/location-point';
import { commuteTimes, commuteRoutes } from '../../commute-times';
import type { LocationSchoolStats, SchoolScoreBreakdown, ScoredResult, Priorities } from '../../types';

interface Coordinate { lat: number; lon: number }

// Coordinates of every curated commute station, keyed by the name the commute matrix uses. A ward's
// commute walk term measures to the real platform, not the area centroid, and — crucially — lets a
// ward reach for the nearest USEFUL station across ALL curated areas, not just its own location's
// (so an Acton ward hugging Chiswick can walk to Turnham Green instead of trekking to Acton Town).
const STATION_COORDS: Map<string, Coordinate> = (() => {
  const m = new Map<string, Coordinate>();
  for (const [name, loc] of Object.entries(locationData)) {
    const stations = loc.commuteStations;
    if (stations?.length) {
      for (const s of stations) {
        try { m.set(s.key, s.point ?? pointForNaptan(s.naptan)); } catch { /* naptan without coords — skip */ }
      }
    } else if (loc.naptan) {
      try { m.set(name, loc.point ?? pointForNaptan(loc.naptan)); } catch { /* skip */ }
    }
  }
  return m;
})();

type StationOption = { station: string; time: number | null; route: string | null };
// Every curated station with a journey time to a given preset destination — the full candidate pool
// a ward picks its nearest-useful station from. Cached per destination (the matrix is static).
const globalOptionCache = new Map<string, StationOption[]>();
function globalOptionsFor(destKey: string): StationOption[] {
  const cached = globalOptionCache.get(destKey);
  if (cached) return cached;
  const opts: StationOption[] = [];
  for (const key of Object.keys(commuteTimes)) {
    const time = commuteTimes[key]?.[destKey];
    if (time == null || !STATION_COORDS.has(key)) continue;
    opts.push({ station: key, time, route: commuteRoutes[key]?.[destKey] ?? null });
  }
  globalOptionCache.set(destKey, opts);
  return opts;
}

export interface WardScoreInput {
  boundary: {
    anchor: Coordinate;
    stations?: Array<{ key: string; lat: number; lon: number }>;
    wards?: Array<{ code?: string; name: string; centroid: Coordinate }>;
  };
  location: string | null;
  result: ScoredResult | null;
  priorities: Priorities;
  childGender: SchoolGender;
  schoolFaith: SchoolFaith;
  maxGrammar: number;
  // Preset+static work destination key per side (You, Partner); a valid key opens the full
  // curated-station pool for that side, else the ward falls back to the location's own stations.
  commuteDestinations?: Array<string | null>;
}

export interface WardScore {
  stats: LocationSchoolStats;
  schoolScore: SchoolScoreBreakdown;
  crimeRate: number | null;
  safetyScore: number | null;
  commuteMinutes: number | null;
  commuteScore: number | null;
  // The station this ward would actually walk to (primary destination's best option) + that walk
  // leg alone, in minutes. Shown instead of a commute total: the Commute card already gives the
  // precise platform-to-platform time for that station, so repeating a second "commute minutes"
  // figure here — built from a cruder straight-line-walk estimate — just reads as a contradiction.
  // The walk delta is the one thing a ward genuinely adds.
  nearestStation: string | null;
  walkToStation: number | null;
  nearestStationRoute: string | null; // route boarded at that station (for line-coloured badges)
  composite: number;
  label: string;
}

export function computeWardScores(input: WardScoreInput): Map<string, WardScore> {
  const { boundary, result, priorities, childGender, schoolFaith, maxGrammar, commuteDestinations } = input;
  if (!boundary.wards?.length) return new Map<string, WardScore>();

  // Candidate stations per side (You, Partner). With a preset+static destination the pool is EVERY
  // curated station (so a ward can pick its genuinely nearest one, across areas); otherwise — live
  // or address mode, where only the location's own stations have fetched times — it's the location's
  // own commute options. The walk term always measures to STATION_COORDS (the real platform).
  const rawSides = [result?.commuteOptions, result?.commuteOptions2];
  const commuteSides = [0, 1]
    .map(i => {
      const dest = commuteDestinations?.[i] ?? null;
      if (dest) return globalOptionsFor(dest);
      const raw = rawSides[i];
      return raw?.length ? raw.map(o => ({ station: o.station, time: o.time, route: o.route })) : [];
    })
    .filter(opts => opts.length);
  // Blended additive estimate (journey + wait + interchange + straight-line walk), used only to
  // RANK/colour wards — never displayed as a number (see WardScore.nearestStation doc). Also
  // reports the primary destination's winning station + walk-only leg, which IS displayed.
  const wardCommuteDetail = (centroid: Coordinate): { minutes: number | null; station: string | null; walk: number | null; route: string | null } => {
    if (!commuteSides.length) return { minutes: null, station: null, walk: null, route: null };
    let primaryStation: string | null = null;
    let primaryWalk: number | null = null;
    let primaryRoute: string | null = null;
    const perSide = commuteSides.map((options, sideIndex) => {
      let best = Infinity;
      let bestStation: string | null = null;
      let bestWalk = 0;
      let bestRoute: string | null = null;
      for (const o of options) {
        if (o.time === null) continue;
        const coord = STATION_COORDS.get(o.station) ?? boundary.anchor;
        const walk = walkMinutes(haversineKm(centroid, coord));
        const effective = o.time + expectedWaitMinutes(o.station, o.route) + interchangeWaitMinutes(o.route) + walk;
        if (effective < best) { best = effective; bestStation = o.station; bestWalk = walk; bestRoute = o.route; }
      }
      if (sideIndex === 0) { primaryStation = bestStation; primaryWalk = bestWalk; primaryRoute = bestRoute; }
      return best === Infinity ? null : best;
    }).filter((v): v is number => v !== null);
    return {
      minutes: perSide.length ? perSide.reduce((a, b) => a + b, 0) / perSide.length : null,
      station: primaryStation,
      walk: primaryWalk,
      route: primaryRoute,
    };
  };

  const base = boundary.wards.map(ward => {
    const stats = schoolStatsForPoint(ward.name, ward.centroid, childGender, schoolFaith);
    const schoolScore = schoolScoreFromStats(stats, maxGrammar);
    const crimeRate = ward.code ? wardCrime.wards[ward.code]?.crimesPer1000 ?? null : null;
    const commute = wardCommuteDetail(ward.centroid);
    return { ward, stats, schoolScore, crimeRate, commuteMinutes: commute.minutes, nearestStation: commute.station, walkToStation: commute.walk, nearestStationRoute: commute.route };
  });

  const normaliser = (values: Array<number | null>) => {
    const present = values.filter((v): v is number => v !== null);
    const min = present.length ? Math.min(...present) : 0;
    const max = present.length ? Math.max(...present) : 0;
    return (value: number | null) => {
      if (value === null) return null;
      if (max === min) return 50;
      return Math.round(((max - value) / (max - min)) * 100); // lower crime/minutes ⇒ higher score
    };
  };
  const safetyScore = normaliser(base.map(item => item.crimeRate));
  const commuteScoreFor = normaliser(base.map(item => item.commuteMinutes));

  const schoolWeight = priorities.schools;
  const safetyWeight = priorities.safety;
  const commuteWeight = priorities.commute;
  return new Map(base.map(item => {
    const safety = safetyScore(item.crimeRate);
    const commute = commuteScoreFor(item.commuteMinutes);
    const dims = [
      { key: 'schools', score: item.schoolScore.raw as number | null, weight: schoolWeight },
      { key: 'crime', score: safety, weight: safetyWeight },
      { key: 'commute', score: commute, weight: commuteWeight },
    ];
    let num = 0, den = 0;
    for (const d of dims) if (d.weight > 0 && d.score !== null) { num += d.score * d.weight; den += d.weight; }
    const composite = den > 0 ? Math.round(num / den) : item.schoolScore.raw;
    const active = dims.filter(d => d.weight > 0 && d.score !== null).map(d => d.key);
    const label = active.length > 1
      ? 'Ward match'
      : active[0] === 'commute'
        ? 'Ward commute'
        : active[0] === 'crime'
          ? 'Ward crime'
          : 'School score';
    return [item.ward.name, {
      stats: item.stats,
      schoolScore: item.schoolScore,
      crimeRate: item.crimeRate,
      safetyScore: safety,
      commuteMinutes: item.commuteMinutes,
      commuteScore: commute,
      nearestStation: item.nearestStation,
      walkToStation: item.walkToStation,
      nearestStationRoute: item.nearestStationRoute,
      composite,
      label,
    }];
  }));
}

// Ward-scale palette — still "green = good, red = bad", but a green → neutral-grey → red diverging
// ramp rather than the results table's green → amber → red traffic light, so zooming into a ward
// heatmap reads as a distinct "within-area" lens. Emerald and rose ends with a slate midpoint.
const WARD_RAMP: Array<[number, [number, number, number]]> = [
  [0, [225, 29, 72]],     // #e11d48 rose-600 (worst)
  [50, [148, 163, 184]],  // #94a3b8 slate-400 (neutral)
  [100, [5, 150, 105]],   // #059669 emerald-600 (best)
];

function wardScoreRgb(score: number): [number, number, number] {
  const s = Math.max(0, Math.min(100, score));
  let a = WARD_RAMP[0], b = WARD_RAMP[WARD_RAMP.length - 1];
  for (let i = 0; i < WARD_RAMP.length - 1; i += 1) {
    if (s >= WARD_RAMP[i][0] && s <= WARD_RAMP[i + 1][0]) { a = WARD_RAMP[i]; b = WARD_RAMP[i + 1]; break; }
  }
  const t = (s - a[0]) / (b[0] - a[0] || 1);
  return [0, 1, 2].map(k => Math.round(a[1][k] + (b[1][k] - a[1][k]) * t)) as [number, number, number];
}

export function wardScoreColor(score: number): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const [r, g, b] = wardScoreRgb(score);
  return `#${hex(r)}${hex(g)}${hex(b)}`; // hex so it composes with hexToRgba fills
}

// Readable text colour for a chip filled with wardScoreColor(score): dark ink on the light slate
// midtones, white on the saturated emerald/rose ends. Chosen by the fill's relative luminance.
export function wardScoreInk(score: number): string {
  const [r, g, b] = wardScoreRgb(score).map(v => v / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#0c1420' : '#ffffff';
}
