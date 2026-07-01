import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Home,
  Info,
  MapPin,
  Route,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { ASIAN_RADIUS_KM, CRIME_THRESHOLDS, SCORE_THRESHOLDS, PRIMARY_SCHOOL_RADIUS_KM, SECONDARY_SCHOOL_RADIUS_KM } from '../lib/constants';
import { lineColor } from '../lib/tfl-line-colors';
import locationWardPolygons from '../data/location-ward-polygons.json';
import locationTransit from '../data/location-transit.json';
import { trainInterval } from '../data/service-frequency';
import { expectedWaitMinutes } from '../lib/commute-wait';
import { asianSpots } from '../data';
import hkFlag from '../assets/flag-hk.svg';
import type { ScoredResult, SortColumn, NearbySchool, AsianSpot, AsianSpotType, SchoolScoreBreakdown, SchoolPhaseScore } from '../types';
import type { WorkLocationKey } from '../work-locations';

type WorkMode = 'preset' | 'address';
type SchoolListMode = 'outstanding' | 'good' | 'selective';

const SCHOOL_LIST_MODES: Array<{ mode: SchoolListMode; label: string }> = [
  { mode: 'outstanding', label: 'Outstanding' },
  { mode: 'good', label: 'Good' },
  { mode: 'selective', label: 'Selective' },
];

interface Coordinate {
  lat: number;
  lon: number;
}

interface LocationBoundary {
  anchor: Coordinate;
  boundaryName: string;
}

const LOCATION_BOUNDARIES = locationWardPolygons as Record<string, LocationBoundary>;

interface Props {
  sortedResults: ScoredResult[];
  anyPriority: boolean;
  workMode: WorkMode;
  workLocation2: WorkLocationKey | '';
  workMode2: WorkMode;
  officePostcode2: string;
  monthlyTrips: number;
  budgetEnabled: boolean;
  maxBudget: number;
  sortBy: SortColumn;
  sortDirection: 'asc' | 'desc';
  onSort: (col: SortColumn) => void;
  liveCommuteLoading: boolean;
  liveCommuteLoading2: boolean;
  onLocationHover?: (location: string | null) => void;
  selectedLocation?: string | null;
  onLocationSelect?: (location: string) => void;
  focusRequest?: { location: string; requestId: number } | null;
}

const SCORE_FACTOR_LABELS: Record<ScoredResult['scoreBreakdown'][number]['key'], string> = {
  commute: 'Commute',
  cost: 'Cost',
  safety: 'Safety',
  schools: 'Schools',
};

function buildScoreTitle(result: ScoredResult): string | undefined {
  if (!result.scoreBreakdown.length) return undefined;
  const lines = result.scoreBreakdown.map(
    factor => `${SCORE_FACTOR_LABELS[factor.key]}: ${factor.normalized}/100 (weight ${factor.weight})`,
  );
  return `Match score ${result.compositeScore}/100 — weighted average of:\n${lines.join('\n')}`;
}

function crimeColor(rate: number) {
  if (rate <= CRIME_THRESHOLDS.low) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (rate <= CRIME_THRESHOLDS.medium) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  if (rate <= CRIME_THRESHOLDS.high) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

// Colour band for the 0–100 blended school score. Thresholds suit its realistic spread
// (London areas land ~44–79; few are very low), so the bands still separate good from weak.
function schoolScoreColor(n: number) {
  if (n >= 65) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (n >= 52) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

function scoreColor(score: number) {
  if (score >= SCORE_THRESHOLDS.high) return 'text-green-600 dark:text-green-400';
  if (score >= SCORE_THRESHOLDS.medium) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-500 dark:text-red-400';
}

function locationFlagStyle(confidence: ScoredResult['dataConfidence']) {
  if (confidence === 'low') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200';
  }
  return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-200';
}

function LocationDataFlag({ result }: { result: ScoredResult }) {
  if (result.dataConfidence === 'high') return null;

  const label = result.labelScope === 'multi-borough'
    ? 'Borough proxy'
    : result.dataConfidence === 'low'
      ? 'Review'
      : 'Proxy';
  const scopeLabel = result.labelScope.replace('-', ' ');
  const title = [
    result.reviewNote,
    `Anchor: ${result.anchorStation}`,
    `Scope: ${scopeLabel}`,
  ].filter(Boolean).join(' ');

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${locationFlagStyle(result.dataConfidence)}`}
      title={title}
    >
      <Info className="h-3 w-3" />
      {label}
    </span>
  );
}

function getDestinationLabel(
  mode: WorkMode,
  preset: WorkLocationKey | '',
  address: string,
  fallback: string,
) {
  if (mode === 'address') return address.trim() || fallback;
  return preset;
}

function LiveCommuteDot({ tone = 'green' }: { tone?: 'green' | 'indigo' }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${
        tone === 'indigo' ? 'bg-indigo-500' : 'bg-green-500'
      }`}
      title="Live TfL time"
    />
  );
}

function getSchoolScope(result: ScoredResult) {
  const primaryRadius = result.primarySchoolsRadiusKm ?? result.schoolsRadiusKm;
  const secondaryRadius = result.secondarySchoolsRadiusKm ?? result.schoolsRadiusKm;
  // Grammar/selective use each school's own catchment (see grammar-catchments.ts), not one radius.
  const grammarLabel = 'per-school catchment';

  if (primaryRadius !== null && secondaryRadius !== null) {
    return {
      label: `P ${primaryRadius}km / S ${secondaryRadius}km`,
      shortLabel: `${primaryRadius}–${secondaryRadius}km`,
      title: `Primary schools are counted within ${primaryRadius}km and secondary within ${secondaryRadius}km; grammar/selective use each school's own catchment.`,
      description: `primary within ${primaryRadius}km, secondary within ${secondaryRadius}km`,
      primaryLabel: `${primaryRadius}km`,
      secondaryLabel: `${secondaryRadius}km`,
      grammarLabel,
    };
  }

  if (result.schoolsRadiusKm !== null) {
    return {
      label: `Within ${result.schoolsRadiusKm}km`,
      shortLabel: `${result.schoolsRadiusKm}km`,
      title: `Schools are counted within ${result.schoolsRadiusKm}km of the location anchor.`,
      description: `within ${result.schoolsRadiusKm}km`,
      primaryLabel: `${result.schoolsRadiusKm}km`,
      secondaryLabel: `${result.schoolsRadiusKm}km`,
      grammarLabel,
    };
  }

  return {
    label: 'Borough fallback',
    shortLabel: 'Borough',
    title: 'School counts are using borough-level fallback data.',
    description: 'at borough level',
    primaryLabel: 'borough',
    secondaryLabel: 'borough',
    grammarLabel: 'borough',
  };
}

function getSchoolTitle(result: ScoredResult) {
  const scope = getSchoolScope(result);
  const split = `${result.primaryOutstandingSchools}/${result.primarySchools} primary (${scope.primaryLabel}), ${result.secondaryOutstandingSchools}/${result.secondarySchools} secondary (${scope.secondaryLabel})`;
  const grammar = result.grammarSchools !== null
    ? ` Grammar/selective secondary schools: ${result.grammarSchools} (${scope.grammarLabel}).`
    : '';
  const nearest = result.nearestOutstandingSchools.length > 0
    ? ` Nearest Outstanding: ${result.nearestOutstandingSchools
      .map(school => `${school.name} (${school.phase}, ${school.distanceKm}km)`)
      .join('; ')}.`
    : '';

  if (result.schoolsSource === 'nearby') {
    return `${result.outstandingSchools} of ${result.schoolsTotal} schools Outstanding around ${result.anchorStation}: ${split}. ${scope.title} Ofsted Apr 2026.${grammar}${nearest}`;
  }

  return `${result.outstandingSchools} of ${result.schoolsTotal} schools Outstanding at borough level: ${split} (Ofsted Apr 2026).`;
}

function HeaderLevelBadge({
  label,
  title,
  tone = 'mixed',
}: {
  label: string;
  title: string;
  tone?: 'station' | 'area' | 'borough' | 'zone' | 'mixed';
}) {
  const toneClass = {
    station: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200',
    area: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
    borough: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
    zone: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
    mixed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-200',
  }[tone];

  return (
    <span
      className={`inline-flex h-5 items-center rounded px-1 py-0.5 text-[9px] font-medium leading-none no-underline lg:px-1.5 lg:text-[10px] ${toneClass}`}
      title={title}
    >
      {label}
    </span>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase text-gray-400 dark:text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

function SchoolPhaseBadge({
  phase,
  label,
  title,
}: {
  phase: 'Primary' | 'Secondary';
  label?: string;
  title?: string;
}) {
  const isPrimary = phase === 'Primary';
  const tone = isPrimary
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
    : 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200';

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${tone}`}
      title={title ?? phase}
    >
      {label ?? (isPrimary ? 'P' : 'S')}
    </span>
  );
}

// One phase's counts: Outstanding (green) and, where we have nearby data, Good (blue), of total.
function SchoolCountRow({
  phase, outstanding, good, total, radius,
}: {
  phase: 'Primary' | 'Secondary';
  outstanding: number | null;
  good: number | null;
  total: number | null;
  radius: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
      <SchoolPhaseBadge phase={phase} />
      <span className="font-medium">{phase}</span>
      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{outstanding ?? '–'}</span>
      <span>Outstanding</span>
      {good !== null && (
        <>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="font-semibold text-sky-600 dark:text-sky-400">{good}</span>
          <span>Good</span>
        </>
      )}
      <span className="text-gray-400 dark:text-gray-500">of {total ?? '–'} · {radius}</span>
    </div>
  );
}

// How the schools score is built, shown as a readable formula: per phase, Quality and Choice
// combine into a phase score; the two phases are averaged and the selective bonus added to reach
// the 0-100 figure the column shows. Same blend the ranking uses, surfaced so it's explainable.
function SchoolScorePanel({ score }: { score: SchoolScoreBreakdown }) {
  const FactorBar = ({ label, pct, weight, tone }: { label: string; pct: number; weight: string; tone: string }) => (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
      <span className="w-12 shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right tabular-nums">{pct}%</span>
      <span className="w-9 shrink-0 text-right text-gray-400 dark:text-gray-500">{weight}</span>
    </div>
  );

  const Phase = ({ phase, data }: { phase: 'Primary' | 'Secondary'; data: SchoolPhaseScore }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-200">
        <span className="inline-flex items-center gap-1.5"><SchoolPhaseBadge phase={phase} />{phase}</span>
        {data.score === null
          ? <span className="font-normal text-gray-400 dark:text-gray-500">none nearby</span>
          : <span className="tabular-nums">= {data.score}</span>}
      </div>
      {data.score !== null && (
        <>
          <FactorBar label="Quality" pct={Math.round(data.quality! * 100)} weight="× 0.6" tone="bg-emerald-500" />
          <FactorBar label="Choice"  pct={Math.round(data.supply! * 100)}  weight="× 0.4" tone="bg-sky-500" />
        </>
      )}
    </div>
  );

  const grammarPct = score.raw - score.averaged;       // exact, by construction
  const note = 'text-gray-500 dark:text-gray-400';
  const num = 'tabular-nums';

  return (
    <div className="border-t border-gray-100 pt-3 dark:border-gray-800 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
      {/* Title height matched to the counts' summary line so both columns' bodies line up. */}
      <div className="mb-2 flex min-h-[1.5rem] items-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Score factors
      </div>
      <div className="space-y-2.5">
        <Phase phase="Primary" data={score.primary} />
        <Phase phase="Secondary" data={score.secondary} />
      </div>
      {/* Ledger: average the two phase scores, add the selective bonus, reach the final. */}
      <div className="mt-2.5 space-y-1 border-t border-gray-100 pt-2 text-[11px] dark:border-gray-800">
        <div className={`flex items-center justify-between gap-2 ${note}`}>
          <span>Average <span className="text-gray-400 dark:text-gray-500">({score.primary.score ?? 0} + {score.secondary.score ?? 0}) ÷ 2</span></span>
          <span className={num}>{score.averaged}</span>
        </div>
        {grammarPct > 0 && (
          <div className="flex items-center justify-between gap-2 text-violet-600 dark:text-violet-300">
            <span>+ Selective bonus</span>
            <span className={num}>+{grammarPct}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-1 font-bold text-gray-900 dark:border-gray-800 dark:text-gray-100">
          <span>School score</span>
          <span className={`text-sm ${num}`}>= {score.raw}</span>
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
        <p><strong className="font-semibold text-gray-500 dark:text-gray-400">Quality</strong>: Outstanding + ½&nbsp;Good share of nearby schools.</p>
        <p><strong className="font-semibold text-gray-500 dark:text-gray-400">Choice</strong>: strong (Outstanding + Good) schools nearby vs the best-served area.</p>
        <p><strong className="font-semibold text-gray-500 dark:text-gray-400">Primary</strong>: weighted by distance (closer schools count more, since primary admission is distance-based), so its Quality/Choice can differ from the raw counts on the left.</p>
      </div>
    </div>
  );
}

function SchoolPreviewList({
  title,
  schools,
  phase,
}: {
  title: string;
  schools: (NearbySchool & { selective?: boolean })[];
  phase?: 'Primary' | 'Secondary';
}) {
  const visibleSchools = schools.slice(0, 5);

  const SelectiveBadge = ({ selective }: { selective?: boolean }) => selective ? (
    <span className="ml-1 inline-flex rounded bg-violet-50 px-1 py-0.5 text-[10px] font-medium leading-none text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
      Selective
    </span>
  ) : null;

  const GenderBadge = ({ gender }: { gender: NearbySchool['genderOfEntry'] }) => {
    if (!gender) return null;

    const tone = gender === 'Girls'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'
      : 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200';

    return (
      <span className={`ml-1 inline-flex rounded px-1 py-0.5 text-[10px] font-medium leading-none ${tone}`}>
        {gender} only
      </span>
    );
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">
        {phase && <SchoolPhaseBadge phase={phase} />}
        <span>{title}</span>
      </div>
      {visibleSchools.length > 0 ? (
        <div className="space-y-1">
          {visibleSchools.map(school => (
            <div
              key={`${title}-${school.name}-${school.distanceKm}`}
              className="text-[11px] leading-snug text-gray-500 dark:text-gray-400"
            >
              <span className="font-medium text-gray-700 dark:text-gray-200">{school.name}</span>
              <SelectiveBadge selective={school.selective} />
              <GenderBadge gender={school.genderOfEntry} />
              <span> - {school.distanceKm}km</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-gray-400 dark:text-gray-500">None found within radius</div>
      )}
    </div>
  );
}

// Restaurants & cafes share one icon per cuisine group; grocers get the basket.
// Hong Kong uses the real flag image — the 🇭🇰 emoji renders as "HK" text on Windows.
const SPOT_EMOJI: Record<Exclude<AsianSpotType, 'hk'>, string> = {
  'asian-food': '🍜',
  grocery: '🛒',
};

function SpotIcon({ type }: { type: AsianSpotType }) {
  if (type === 'hk') {
    return <img src={hkFlag} alt="" aria-hidden className="mr-[2px] inline-block h-[0.85em] w-auto rounded-[1px] align-[-0.04em]" />;
  }
  return <span aria-hidden>{SPOT_EMOJI[type]}</span>;
}

const SPOT_LABEL: Record<AsianSpotType, string> = {
  hk: 'Hongkongese (restaurant/café/grocer)',
  'asian-food': 'Other Asian restaurant/café',
  grocery: 'Other East Asian grocer',
};

// Display order: Hongkongese first, then other Asian food, then grocers.
const SPOT_ORDER: AsianSpotType[] = ['hk', 'asian-food', 'grocery'];

// Tiny icon+count chips shown on the collapsed row so you can spot which areas
// have these features without expanding.
function SpotIcons({ spots, className = '' }: { spots: AsianSpot[]; className?: string }) {
  const order: AsianSpotType[] = ['hk', 'asian-food', 'grocery'];
  const counts = order
    .map(type => ({ type, n: spots.filter(s => s.type === type).length }))
    .filter(c => c.n > 0);
  if (counts.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}>
      {counts.map(({ type, n }) => (
        <span key={type} title={`${SPOT_LABEL[type]} × ${n} nearby`} className="inline-flex items-center gap-0.5">
          <SpotIcon type={type} />
          <span className="tabular-nums">{n}</span>
        </span>
      ))}
    </span>
  );
}

function GeographyCard({
  wards,
  className = '',
}: {
  wards: string[];
  className?: string;
}) {
  const items: Array<{ label: string; value: string }> = [
    { label: 'Commute', value: 'station / live' },
    { label: 'Rent', value: 'area est.' },
    { label: 'Crime & tax', value: 'borough' },
    { label: 'Schools', value: `within ${PRIMARY_SCHOOL_RADIUS_KM}–${SECONDARY_SCHOOL_RADIUS_KM} km` },
    { label: 'East Asian spots', value: `within ${ASIAN_RADIUS_KM} km` },
  ];
  return (
    <div className={`rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        <Info className="h-4 w-4" />
        Data coverage
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] dark:border-gray-700 dark:bg-gray-800"
          >
            <span className="font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-gray-500 dark:text-gray-400">{item.value}</span>
          </span>
        ))}
      </div>
      {wards.length > 0 && (
        <div className="mt-2.5 border-t border-gray-100 pt-2.5 dark:border-gray-800">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-200">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            Map area
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              {wards.length} ward{wards.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {wards.map(ward => (
              <span
                key={ward}
                className="inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {ward}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatCommute(time: number | null, isLive: boolean) {
  if (time === null) return 'Unavailable';
  return `${time} min${isLive ? ' live' : ''}`;
}

// The dated slot a live result was modelled for: most recent Monday, 08:30.
function lastMondayLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `Last Monday (${date}), 08:30.`;
}

// The tube/rail lines of an itinerary as colour-coded badges, shown beneath its time.
function RouteLine({ route }: { route: string | null }) {
  if (!route) return null;
  const lines = route.split(' → ');
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">via</span>
      {lines.map((line, i) => {
        const { bg, fg } = lineColor(line);
        return (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-gray-300 dark:text-gray-600">&rsaquo;</span>}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
              style={{ backgroundColor: bg, color: fg }}
            >
              {line}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Transit symbols beside a location name, from its actual served modes (scripts/generate-location-transit).
// Shared height keeps the roundels and the National Rail arrow visually aligned.
const TRANSIT_ICON_CLASS = 'h-2.5 w-auto shrink-0 lg:h-3';

// Mode roundels are monochrome (ring = bar); the Underground is the only red+blue one.
const MODE_ROUNDEL: Record<string, { ring: string; bar: string; title: string }> = {
  tube: { ring: '#DC241F', bar: '#10069F', title: 'London Underground' },
  overground: { ring: '#EE7C0E', bar: '#EE7C0E', title: 'London Overground' },
  'elizabeth-line': { ring: '#6950A1', bar: '#6950A1', title: 'Elizabeth line' },
  dlr: { ring: '#00AFAD', bar: '#00AFAD', title: 'DLR' },
  tram: { ring: '#5FB526', bar: '#5FB526', title: 'Tram' },
};

function Roundel({ ring, bar, title }: { ring: string; bar: string; title: string }) {
  return (
    <svg viewBox="0 0 22 16" className={TRANSIT_ICON_CLASS} role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="0" y="6.2" width="22" height="3.6" fill={bar} />
      <circle cx="11" cy="8" r="5.2" fill="none" stroke={ring} strokeWidth="2.6" />
    </svg>
  );
}

// The official National Rail "double arrow" (British Rail symbol), drawn as strokes
// exactly per the public SVG: two horizontal bars + a crossing zigzag, clipped by the box.
function NationalRailIcon({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 62 39" className={TRANSIT_ICON_CLASS} role="img" aria-label={title}>
      <title>{title}</title>
      <g stroke="#ED1C24" fill="none">
        <path d="M1,-8.9 46,12.4 16,26.6 61,47.9" strokeWidth="6" />
        <path d="M0,12.4H62m0,14.2H0" strokeWidth="6.4" />
      </g>
    </svg>
  );
}

function TransitIcons({ location }: { location: string }) {
  const modes = (locationTransit as Record<string, string[]>)[location] ?? [];
  if (!modes.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {modes.map(m =>
        m === 'national-rail'
          ? <NationalRailIcon key={m} title="National Rail" />
          : MODE_ROUNDEL[m] ? <Roundel key={m} {...MODE_ROUNDEL[m]} /> : null,
      )}
    </span>
  );
}

// One train-frequency row: a peak/off-peak badge followed by the interval.
function FreqRow({ label, value, tone }: { label: string; value: string; tone: 'peak' | 'off' | 'all' }) {
  const badge =
    tone === 'peak' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    : tone === 'off' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex w-16 shrink-0 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>{label}</span>
      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

function LocationDetailPanel({
  result,
  hasPartnerDestination,
  monthlyTrips,
}: {
  result: ScoredResult;
  hasPartnerDestination: boolean;
  monthlyTrips: number;
}) {
  // Split the transport total into each commuter's share (partner share is 0 when none set).
  const youTransportMonthly = result.farePerTrip * monthlyTrips;
  const partnerTransportMonthly = result.partnerFarePerTrip * monthlyTrips;
  const boundary = LOCATION_BOUNDARIES[result.location];
  const anchor = boundary?.anchor;
  // The ward(s) the location's map polygon is built from (comma-joined in the data).
  const wards = boundary?.boundaryName ? boundary.boundaryName.split(', ') : [];
  // Train frequency for non-tube locations (undefined for turn-up-and-go tube/DLR/Elizabeth).
  const freq = trainInterval[result.location];
  const mapQuery = anchor
    ? `${anchor.lat},${anchor.lon}`
    : `${result.anchorStation}, London`;
  const encodedMapQuery = encodeURIComponent(mapQuery);
  const mapSrc = `https://www.google.com/maps?q=${encodedMapQuery}&z=14&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodedMapQuery}`;
  // Grammar/selective schools are secondaries; in rated lists we only flag overlap,
  // while the Selective toggle shows the dedicated selective list.
  const grammarNames = new Set(result.nearestGrammarSchools.map(s => s.name));
  const nearestPrimaryOutstandingSchools = result.nearestPrimaryOutstandingSchools.slice(0, 5);
  const nearestPrimaryGoodSchools = result.nearestPrimaryGoodSchools.slice(0, 5);
  const nearestSecondaryOutstandingSchools = result.nearestSecondaryOutstandingSchools
    .map(s => ({ ...s, selective: grammarNames.has(s.name) }))
    .slice(0, 5);
  const nearestSecondaryGoodSchools = result.nearestSecondaryGoodSchools
    .map(s => ({ ...s, selective: grammarNames.has(s.name) }))
    .slice(0, 5);
  const nearestSelectiveSchools = result.nearestGrammarSchools
    .map(s => ({ ...s, selective: true }))
    .slice(0, 5);
  const [schoolListMode, setSchoolListMode] = useState<SchoolListMode>('outstanding');
  const schoolListsByMode: Record<SchoolListMode, Array<{
    title: string;
    phase: 'Primary' | 'Secondary';
    schools: (NearbySchool & { selective?: boolean })[];
  }>> = {
    outstanding: [
      { title: 'Primary', phase: 'Primary', schools: nearestPrimaryOutstandingSchools },
      { title: 'Secondary', phase: 'Secondary', schools: nearestSecondaryOutstandingSchools },
    ],
    good: [
      { title: 'Primary', phase: 'Primary', schools: nearestPrimaryGoodSchools },
      { title: 'Secondary', phase: 'Secondary', schools: nearestSecondaryGoodSchools },
    ],
    selective: [
      { title: 'Secondary', phase: 'Secondary', schools: nearestSelectiveSchools },
    ],
  };
  const activeSchoolLists = schoolListsByMode[schoolListMode];
  const hasSchoolDetails = Object.values(schoolListsByMode).some(lists =>
    lists.some(list => list.schools.length > 0)
  )
    || result.grammarSchools !== null;
  const activeSchoolListHeading = schoolListMode === 'selective'
    ? 'Nearest Selective'
    : `Nearest ${schoolListMode === 'good' ? 'Good' : 'Outstanding'}`;
  // Concrete counts of the schools that actually matter for the score, rather than the old
  // "% Outstanding" share (which flattered thin areas and buried supply).
  const goodNearby = (result.primaryGoodSchools ?? 0) + (result.secondaryGoodSchools ?? 0);
  const schoolSummary = result.outstandingSchools !== null
    ? [
        `${result.outstandingSchools} Outstanding`,
        result.primaryGoodSchools !== null || result.secondaryGoodSchools !== null ? `${goodNearby} Good` : null,
        (result.grammarSchools ?? 0) > 0 ? `${result.grammarSchools} Selective` : null,
      ].filter(Boolean).join(' · ') + ' nearby'
    : 'Unavailable';
  const schoolScope = getSchoolScope(result);
  const spots = asianSpots[result.location] ?? [];
  // Hongkongese first; membership is already nearest-first within each type (stable sort).
  const orderedSpots = [...spots].sort((a, b) => SPOT_ORDER.indexOf(a.type) - SPOT_ORDER.indexOf(b.type));
  // Dense central areas (e.g. Bloomsbury near Chinatown) pick up hundreds of
  // restaurants, so cap only the restaurants/cafés behind a toggle — Hongkongese
  // spots and grocers (the most relevant, and usually few) always stay visible.
  const [showAllSpots, setShowAllSpots] = useState(false);
  const FOOD_CAP = 10;
  const hkSpots = orderedSpots.filter(s => s.type === 'hk');
  const foodSpots = orderedSpots.filter(s => s.type === 'asian-food');
  const grocerySpots = orderedSpots.filter(s => s.type === 'grocery');
  const shownFood = showAllSpots ? foodSpots : foodSpots.slice(0, FOOD_CAP);
  const visibleSpots = [...hkSpots, ...shownFood, ...grocerySpots];
  const hiddenSpotCount = foodSpots.length - shownFood.length;
  const detailCardClass = 'rounded-md border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900 xl:p-3';

  return (
    <div className="bg-gray-50 px-3 py-3 dark:bg-gray-800/80 sm:px-4 sm:py-4">
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)] xl:gap-4">
        <div className="flex justify-end xl:hidden">
          <span className="rounded bg-teal-100 px-2 py-1 text-xs font-medium text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">
            Station anchor
          </span>
        </div>

        <div className="hidden flex-wrap items-start justify-between gap-3 xl:col-start-2 xl:row-start-1 xl:flex">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              <MapPin className="h-5 w-5 text-teal-600 dark:text-teal-300" />
              {result.displayName}
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {result.borough} - {result.zone} - {result.reviewNote ?? 'Station-centric comparison anchor.'}
            </div>
          </div>
          <span className="rounded bg-teal-100 px-2 py-1 text-xs font-medium text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">
            Station anchor
          </span>
        </div>

        <div className="flex min-h-[13rem] flex-col overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:min-h-[11rem] lg:min-h-[14rem] xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:min-h-full xl:self-stretch">
          <iframe
            title={`${result.displayName} map`}
            src={mapSrc}
            className="block h-52 min-h-[12rem] w-full flex-1 border-0 sm:h-44 sm:min-h-[10rem] lg:h-56 lg:min-h-[13rem] xl:h-auto xl:min-h-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
            <span className="truncate text-gray-500 dark:text-gray-400">{result.anchorStation}</span>
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-medium text-blue-600 hover:underline dark:text-blue-300"
            >
              Open map
            </a>
          </div>
        </div>

        {/* Commute + Cost sit beside the map; the map's bottom aligns to these (it row-spans 1-2). */}
        <div className="xl:col-start-2 xl:row-start-2">
          <div className="grid gap-2.5 sm:grid-cols-[1.3fr_1fr] xl:gap-3">
            <div className={detailCardClass}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <Route className="h-4 w-4" />
                Commute
              </div>
              {/* Group 1: journey time + route + when */}
              {hasPartnerDestination ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <DetailStat label="You" value={formatCommute(result.commuteTime, result.commuteIsLive)} />
                    <RouteLine route={result.commuteRoute} />
                  </div>
                  <div>
                    <DetailStat label="Partner" value={formatCommute(result.commuteTime2, result.commuteTime2IsLive)} />
                    <RouteLine route={result.commuteRoute2} />
                  </div>
                </div>
              ) : (
                <div>
                  <DetailStat label="You" value={formatCommute(result.commuteTime, result.commuteIsLive)} />
                  <RouteLine route={result.commuteRoute} />
                </div>
              )}
              <p className="mt-1.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
                {result.commuteIsLive || result.commuteTime2IsLive
                  ? lastMondayLabel()
                  : 'For a typical weekday morning — Monday, 08:30.'}
              </p>

              {/* Group 2: train frequency */}
              {freq && (
                <div className="mt-3 border-t border-gray-100 pt-2.5 dark:border-gray-800">
                  <div className="space-y-1">
                    {freq.peak === freq.offPeak ? (
                      <FreqRow label="All day" value={`~every ${freq.peak} min`} tone="all" />
                    ) : (
                      <>
                        <FreqRow label="Peak" value={`~every ${freq.peak} min`} tone="peak" />
                        <FreqRow label="Off-peak" value={`~every ${freq.offPeak} min`} tone="off" />
                      </>
                    )}
                  </div>
                  <p
                    className="mt-1.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500"
                    title="Peak = weekday rush hours (~07:00–09:30 & 16:00–19:00); off-peak = weekday daytime/evenings. Half the peak gap is added as expected wait when scoring commute."
                  >
                    Peak wait counts toward the commute score.
                  </p>
                </div>
              )}
            </div>

            <div className={detailCardClass}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <Wallet className="h-4 w-4" />
                Cost
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <CalendarClock className="h-3 w-3" />
                  monthly
                </span>
              </div>
              <div className="space-y-2">
                <DetailStat label="Rent" value={`\u00a3${result.rent.toLocaleString()}`} />
                <DetailStat label="Tax" value={`\u00a3${result.councilTaxMonthly.toFixed(0)}`} />
                <div>
                  <div className="text-[11px] font-medium uppercase text-gray-400 dark:text-gray-500">Transport</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    &pound;{result.transportCostMonthly.toFixed(0)}
                  </div>
                  <div className="text-[10px] leading-tight text-gray-400 dark:text-gray-500">
                    {result.partnerFarePerTrip > 0
                      ? <>&pound;{result.farePerTrip.toFixed(2)} + &pound;{result.partnerFarePerTrip.toFixed(2)}/trip</>
                      : <>{result.zone} &middot; &pound;{result.farePerTrip.toFixed(2)}/trip</>}
                  </div>
                  {result.partnerFarePerTrip > 0 && (
                    <div className="text-[10px] leading-tight text-gray-400 dark:text-gray-500">
                      <div>you &pound;{youTransportMonthly.toFixed(0)}</div>
                      <div>partner &pound;{partnerTransportMonthly.toFixed(0)}</div>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-2 dark:border-gray-800">
                  <DetailStat label="Total" value={`\u00a3${Math.round(result.totalMonthly).toLocaleString()}`} />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Schools, spots & geography run full-width below the map, so the map only needs to be
            as tall as the header + Commute/Cost cards. */}
        <div className="space-y-3 xl:col-span-2 xl:col-start-1 xl:row-start-3 xl:space-y-4">
          {/* Schools — counts (Outstanding + Good) merged with the nearest Outstanding lists */}
          <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              <GraduationCap className="h-4 w-4" />
              Schools
              <span
                className="ml-auto inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                title={schoolScope.title}
              >
                {schoolScope.shortLabel}
              </span>
            </div>
            {/* Counts on the left, the score-factor formula on the right (it has room). Each column
                leads with a height-matched title so their bodies line up. */}
            <div className="mt-2 grid items-start gap-3 sm:grid-cols-2 sm:gap-5">
              <div>
                <div className="mb-2 flex min-h-[1.5rem] items-center text-sm font-semibold text-gray-900 dark:text-gray-100">{schoolSummary}</div>
                <div className="space-y-1">
                  <SchoolCountRow phase="Primary" outstanding={result.primaryOutstandingSchools} good={result.primaryGoodSchools} total={result.primarySchools} radius={schoolScope.primaryLabel} />
                  <SchoolCountRow phase="Secondary" outstanding={result.secondaryOutstandingSchools} good={result.secondaryGoodSchools} total={result.secondarySchools} radius={schoolScope.secondaryLabel} />
                  {result.grammarSchools !== null && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <SchoolPhaseBadge phase="Secondary" />
                      <span>Grammar/selective: <strong className="font-semibold">{result.grammarSchools}</strong> <span className="text-gray-400 dark:text-gray-500">· {schoolScope.grammarLabel}</span></span>
                    </div>
                  )}
                </div>
              </div>
              <SchoolScorePanel score={result.schoolScore} />
            </div>
            {hasSchoolDetails && (
              <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {activeSchoolListHeading}
                  </div>
                  <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-[11px] dark:border-gray-700 dark:bg-gray-800">
                    {SCHOOL_LIST_MODES.map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSchoolListMode(mode)}
                        aria-pressed={schoolListMode === mode}
                        className={`rounded px-2 py-1 font-semibold leading-none transition ${
                          schoolListMode === mode
                            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`grid gap-3 ${activeSchoolLists.length > 1 ? 'md:grid-cols-2' : ''}`}>
                  {activeSchoolLists.map(list => (
                    <SchoolPreviewList
                      key={`${schoolListMode}-${list.title}`}
                      title={list.title}
                      phase={list.phase}
                      schools={list.schools}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {spots.length > 0 && (
            <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Hongkongese & East Asian spots
              </div>
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                {SPOT_ORDER
                  .map(type => ({ type, n: spots.filter(s => s.type === type).length }))
                  .filter(({ n }) => n > 0)
                  .map(({ type, n }) => (
                    <span key={type} className="inline-flex items-center gap-1">
                      <SpotIcon type={type} />
                      {SPOT_LABEL[type]} <span className="tabular-nums font-medium text-gray-700 dark:text-gray-200">({n})</span>
                    </span>
                  ))}
              </div>
              <ul className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {visibleSpots.map(spot => (
                  <li
                    key={`${spot.type}-${spot.name}`}
                    title={SPOT_LABEL[spot.type]}
                    className="flex items-center gap-2 text-[12px] text-gray-700 dark:text-gray-200"
                  >
                    <span className="w-4 shrink-0 text-center"><SpotIcon type={spot.type} /></span>
                    <span className="truncate">{spot.name}</span>
                  </li>
                ))}
              </ul>
              {(hiddenSpotCount > 0 || showAllSpots) && (
                <button
                  type="button"
                  onClick={() => setShowAllSpots(v => !v)}
                  className="mt-2 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-300"
                >
                  {showAllSpots ? 'Show fewer' : `Show all ${foodSpots.length} restaurants & cafés`}
                </button>
              )}
            </div>
          )}

          <GeographyCard wards={wards} />
        </div>
      </div>
    </div>
  );
}

export default function ResultsTable({
  sortedResults,
  anyPriority,
  workMode,
  workLocation2,
  workMode2,
  officePostcode2,
  monthlyTrips,
  budgetEnabled,
  maxBudget,
  sortBy,
  sortDirection,
  onSort,
  liveCommuteLoading,
  liveCommuteLoading2,
  onLocationHover,
  selectedLocation,
  onLocationSelect,
  focusRequest,
}: Props) {
  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortBy !== col) return null;
    return sortDirection === 'asc'
      ? <ArrowUp className="inline h-3 w-3 ml-1" />
      : <ArrowDown className="inline h-3 w-3 ml-1" />;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState<boolean>(true);
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const pendingExpandedScrollRef = useRef<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // Height of the sticky title; the sticky column headers dock directly beneath it.
  const [titleHeight, setTitleHeight] = useState(48);
  const [headerHeight, setHeaderHeight] = useState(64);
  // At xl the column-label header leaves the vertical scroller and becomes a
  // synced floating header above it, so the scrollbar starts below the labels.
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const headerTableRef = useRef<HTMLTableElement>(null);
  const [isXl, setIsXl] = useState(false);
  const partnerDestination = getDestinationLabel(workMode2, workLocation2, officePostcode2, '');
  const hasPartnerDestination = Boolean(partnerDestination);
  const detailColSpan = 10;

  const stickyRowTop = useCallback(() => {
    const title = titleRef.current;
    const titleTop = title ? Number.parseFloat(getComputedStyle(title).top) : 0;
    const safeTitleTop = Number.isFinite(titleTop) ? titleTop : 0;
    const safeTitleHeight = title?.getBoundingClientRect().height ?? titleHeight;
    return safeTitleTop + safeTitleHeight + headerHeight;
  }, [headerHeight, titleHeight]);

  const scrollLocationRowToStart = useCallback((location: string) => {
    const row = rowRefs.current[location];
    if (!row) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const topPadding = 8;
    const targetTop = window.scrollY + row.getBoundingClientRect().top - stickyRowTop() - topPadding;
    window.scrollTo({ top: Math.max(0, targetTop), behavior });
  }, [stickyRowTop]);

  const toggleExpandedLocation = useCallback((location: string) => {
    setExpandedLocation(current => {
      const next = current === location ? null : location;
      pendingExpandedScrollRef.current = next;
      return next;
    });
  }, []);

  const updateTableChrome = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollRight(false);
      setHasHorizontalOverflow(false);
      return;
    }

    setContainerWidth(el.clientWidth);
    const hasHorizontalOverflow = el.scrollWidth > el.clientWidth + 2;
    const hasMoreToRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;

    setHasHorizontalOverflow(hasHorizontalOverflow);
    setCanScrollRight(hasHorizontalOverflow && hasMoreToRight);
    setTitleHeight(titleRef.current?.getBoundingClientRect().height ?? 48);
    const xl = window.matchMedia('(min-width: 1280px)').matches;
    const header = xl ? headerScrollRef.current : tableRef.current?.querySelector('thead');
    setHeaderHeight(header?.getBoundingClientRect().height ?? 64);
  }, []);

  // Keep the floating header and body scroller locked together. Both are horizontally scrollable
  // (the header carries the always-visible scrollbar since it's sticky at the top, while the body's
  // own scrollbar sits off-screen at the very bottom of the tall table). Only assign when the values
  // differ, so a programmatic scroll doesn't ping-pong a second scroll event back.
  const syncHeaderScroll = useCallback(() => {
    const header = headerScrollRef.current, body = scrollRef.current;
    if (header && body && header.scrollLeft !== body.scrollLeft) header.scrollLeft = body.scrollLeft;
  }, []);
  const syncBodyScroll = useCallback(() => {
    const header = headerScrollRef.current, body = scrollRef.current;
    if (header && body && body.scrollLeft !== header.scrollLeft) body.scrollLeft = header.scrollLeft;
  }, []);

  // Match each floating-header column to the body column width (= max of header/body
  // natural width), forcing both tables to fixed layout so they stay aligned. At < xl
  // it just clears the forced widths so the single sticky-header table behaves as before.
  const syncHeaderWidths = useCallback(() => {
    const body = tableRef.current;
    const header = headerTableRef.current;
    const bodyCols = body ? Array.from(body.querySelectorAll(':scope > colgroup > col')) as HTMLElement[] : [];
    const headerCols = header ? Array.from(header.querySelectorAll(':scope > colgroup > col')) as HTMLElement[] : [];

    // Resetting to auto-layout momentarily collapses the width, which clamps the
    // horizontal scroll to 0 — capture it so we can restore it after re-applying widths
    // (otherwise sorting/refreshing snaps the table back to the left).
    const savedScrollLeft = scrollRef.current?.scrollLeft ?? 0;

    // Reset to natural so measurements are clean and < xl stays auto-laid-out.
    if (body) { body.style.tableLayout = ''; body.style.width = ''; }
    bodyCols.forEach(c => { c.style.width = ''; });

    const isXlNow = typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches;
    if (!isXlNow || !body || !header) return;

    const firstRow = body.querySelector('tbody tr');
    const bodyCells = firstRow ? Array.from(firstRow.querySelectorAll(':scope > td')) as HTMLElement[] : [];
    const headCells = Array.from(header.querySelectorAll('thead > tr > th')) as HTMLElement[];
    if (!bodyCells.length || bodyCells.length !== headCells.length || bodyCells.length !== bodyCols.length) return;

    header.style.tableLayout = 'auto';
    header.style.width = '';
    headerCols.forEach(c => { c.style.width = ''; });
    const headW = headCells.map(h => h.getBoundingClientRect().width);
    const bodyW = bodyCells.map(c => c.getBoundingClientRect().width);
    const widths = bodyW.map((w, i) => Math.ceil(Math.max(w, headW[i])));
    // If the columns don't fill the scroller, give the slack to the flexible
    // Location column (index 1) so the table stretches like the old w-full did.
    const natural = widths.reduce((a, b) => a + b, 0);
    const target = scrollRef.current?.clientWidth ?? natural;
    if (natural < target && widths.length > 1) widths[1] += target - natural;
    const total = widths.reduce((a, b) => a + b, 0);

    // Lock widths through a <colgroup> on each table — order-independent, so it stays
    // correct when rows reorder (sort) or content changes (live commute), unlike
    // per-row inline widths which only ever sized off the first row.
    body.style.tableLayout = 'fixed';
    body.style.width = `${total}px`;
    header.style.tableLayout = 'fixed';
    header.style.width = `${total}px`;
    widths.forEach((w, i) => {
      if (bodyCols[i]) bodyCols[i].style.width = `${w}px`;
      if (headerCols[i]) headerCols[i].style.width = `${w}px`;
    });
    // Width restored, so the scroll range exists again — put the user back where they were.
    if (scrollRef.current) scrollRef.current.scrollLeft = savedScrollLeft;
    syncHeaderScroll();
  }, [syncHeaderScroll]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsXl(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const recompute = () => { updateTableChrome(); syncHeaderWidths(); };
    recompute();

    const scrollEl = scrollRef.current;
    const tableEl = tableRef.current;
    const titleEl = titleRef.current;
    const headerScrollEl = headerScrollRef.current;
    const headerTableEl = headerTableRef.current;
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(recompute);

    if (scrollEl) resizeObserver?.observe(scrollEl);
    if (tableEl) resizeObserver?.observe(tableEl);
    if (titleEl) resizeObserver?.observe(titleEl);
    if (headerScrollEl) resizeObserver?.observe(headerScrollEl);
    if (headerTableEl) resizeObserver?.observe(headerTableEl);
    window.addEventListener('resize', recompute);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', recompute);
    };
    // Depend on the results array itself (not just length) so widths re-measure when
    // content changes too — e.g. live commute times arriving or a re-sort — since the
    // fixed-layout table can't grow to reveal overflow on its own.
  }, [anyPriority, budgetEnabled, expandedLocation, hasPartnerDestination, isXl, sortedResults, sortBy, sortDirection, updateTableChrome, syncHeaderWidths]);

  // Map clicks scroll the page to the picked row (highlighted, but not expanded).
  useEffect(() => {
    if (!focusRequest) return;
    const frame = requestAnimationFrame(() => {
      rowRefs.current[focusRequest.location]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  useEffect(() => {
    const location = pendingExpandedScrollRef.current;
    if (!expandedLocation || location !== expandedLocation) return undefined;

    let settleFrame: number | null = null;
    const renderFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        scrollLocationRowToStart(location);
        pendingExpandedScrollRef.current = null;
      });
    });

    return () => {
      cancelAnimationFrame(renderFrame);
      if (settleFrame !== null) cancelAnimationFrame(settleFrame);
    };
  }, [expandedLocation, scrollLocationRowToStart]);

  const handleScroll = () => {
    syncHeaderScroll();
    updateTableChrome();
  };

  // Header cells stick below the sticky title via pure CSS (no JS on scroll).
  // Backgrounds live on each cell so the stuck cells stay opaque over scrolling rows.
  const thStickyClass = 'sticky top-[var(--results-header-top)] z-20';

  const thClass = (col: SortColumn, align = 'text-left') =>
    `${align} ${thStickyClass} bg-gray-50 dark:bg-gray-700 align-middle py-2 px-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none lg:py-3 lg:px-3 lg:text-sm ${
      sortBy === col ? 'text-blue-600 dark:text-blue-400 underline' : 'hover:underline'
    }`;

  const thNarrowClass = (col: SortColumn) =>
    `text-center ${thStickyClass} bg-gray-50 dark:bg-gray-700 align-middle py-2 px-1 text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none lg:py-3 lg:px-2 lg:text-sm ${
      sortBy === col ? 'text-blue-600 dark:text-blue-400 underline' : 'hover:underline'
    }`;
  const headerStackClass = (align: 'left' | 'center' = 'center') =>
    `flex min-h-[3.25rem] flex-col justify-center gap-1 ${align === 'left' ? 'items-start' : 'items-center'}`;
  const headerTitleClass = (align: 'left' | 'center' = 'center') =>
    `flex h-5 items-center ${align === 'left' ? 'justify-start' : 'justify-center'}`;
  const headerBadgeRowClass = (align: 'left' | 'center' = 'center') =>
    `flex min-h-5 items-center ${align === 'left' ? 'justify-start' : 'justify-center'}`;

  const renderHeaderRow = () => (
    <tr>
      <th
        onClick={anyPriority ? () => onSort('score') : undefined}
        className={`text-center ${thStickyClass} left-0 !z-30 align-middle py-2 px-1.5 text-xs font-semibold whitespace-nowrap bg-gray-50 dark:bg-gray-700 min-w-[44px] w-[44px] overflow-hidden lg:py-3 lg:px-3 lg:min-w-[56px] lg:w-[56px] lg:text-sm ${
          anyPriority
            ? `cursor-pointer select-none ${sortBy === 'score' ? 'text-blue-600 dark:text-blue-400 underline' : 'text-gray-700 dark:text-gray-300 hover:underline'}`
            : 'text-gray-700 dark:text-gray-300'
        }`}
        title={anyPriority ? 'Weighted score based on your priority sliders (0-100, higher is better)' : undefined}
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>{anyPriority ? 'Score' : 'Rank'}{anyPriority && <SortIcon col="score" />}</div>
        </div>
      </th>
      <th
        onClick={() => onSort('location')}
        className={`${thClass('location')} left-[44px] !z-30 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.08)] lg:left-[56px]`}
      >
        <div className={headerStackClass('left')}>
          <div className={headerTitleClass('left')}>Location<SortIcon col="location" /></div>
          <div className={headerBadgeRowClass('left')}>
            <HeaderLevelBadge
              label="Station"
              title="Station-centric comparison anchor; other header badges show each metric's current source geography."
              tone="station"
            />
          </div>
        </div>
      </th>
      <th
        onClick={() => onSort('commute')}
        className={thClass('commute', 'text-center')}
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Commute<SortIcon col="commute" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label={workMode === 'address' || workMode2 === 'address' ? 'Station/live' : 'Station'}
              title="Home station to selected work station or live workplace address. Modelled for a typical weekday morning — Monday, 08:30."
              tone="station"
            />
          </div>
          {hasPartnerDestination && (
            <div className="text-xs font-normal text-gray-400 dark:text-gray-500">you / partner</div>
          )}
        </div>
      </th>
      <th onClick={() => onSort('rent')} className={thNarrowClass('rent')}>
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Rent<SortIcon col="rent" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label="Area est."
              title="Rent is a local area estimate and may not exactly match the station anchor."
              tone="area"
            />
          </div>
        </div>
      </th>
      <th onClick={() => onSort('transport')} className={thNarrowClass('transport')}>
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Transport<SortIcon col="transport" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label="Fare zone"
              title="Transport cost is estimated from fare-zone difference and monthly trip count."
              tone="zone"
            />
          </div>
        </div>
      </th>
      <th onClick={() => onSort('councilTax')} className={thNarrowClass('councilTax')}>
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>
            <span className="lg:hidden">Tax</span>
            <span className="hidden lg:inline">Council Tax</span>
            <SortIcon col="councilTax" />
          </div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label="Borough"
              title="Council tax uses borough-level Band D rates scaled by bedroom count."
              tone="borough"
            />
          </div>
        </div>
      </th>
      <th
        onClick={() => onSort('total')}
        className={`${thClass('total', 'text-center')} !bg-blue-50 dark:!bg-gray-700`}
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Total Cost<SortIcon col="total" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label="Mixed"
              title="Total combines rent, transport and council tax estimates."
            />
          </div>
        </div>
      </th>
      <th
        onClick={() => onSort('crime')}
        className={thClass('crime', 'text-center')}
        title="Borough crime rate per 1,000 residents (2024/25, Met Police). Lower is safer. London avg: 106/k."
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Crime<SortIcon col="crime" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label="Borough"
              title="Crime is currently measured at borough level."
              tone="borough"
            />
          </div>
        </div>
      </th>
      <th
        onClick={() => onSort('schools')}
        className={thClass('schools', 'text-center')}
        title="School score (0–100): blends quality (Outstanding + ½ Good share) with choice (how many strong schools are nearby), primary & secondary averaged, plus a selective/grammar bonus. Expand a row for the formula. Higher is better."
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Schools<SortIcon col="schools" /></div>
          <div className={headerBadgeRowClass()}>
            <div
              className="inline-flex h-5 items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
              title={`Counted by radius around the location anchor: primary ${PRIMARY_SCHOOL_RADIUS_KM}km, secondary ${SECONDARY_SCHOOL_RADIUS_KM}km. Grammar/selective use each school's own catchment (varies per school).`}
            >
              within {PRIMARY_SCHOOL_RADIUS_KM}–{SECONDARY_SCHOOL_RADIUS_KM} km
            </div>
          </div>
        </div>
      </th>
      <th onClick={() => onSort('asianSpots')} className={thNarrowClass('asianSpots')}>
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Lifelines<SortIcon col="asianSpots" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label={`~${ASIAN_RADIUS_KM}km`}
              title={`Hongkongese & East Asian restaurants, cafés and grocers within ~${ASIAN_RADIUS_KM}km of the anchor (🇭🇰 Hongkongese, 🍜 other Asian food, 🛒 grocer).`}
            />
          </div>
        </div>
      </th>
    </tr>
  );

  return (
    <div
      style={{
        '--results-title-h': `${titleHeight}px`,
        '--results-header-top': `calc(var(--app-header-h, 0px) + ${titleHeight}px)`,
        '--expanded-row-top': `calc(var(--app-header-h, 0px) + ${titleHeight + headerHeight}px)`,
      } as React.CSSProperties}
    >
      {hasHorizontalOverflow && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 lg:hidden">
          <Smartphone className="h-4 w-4 shrink-0" />
          <span>Phone tip: rotate to landscape for the full table.</span>
        </div>
      )}

      {/* The whole page scrolls (no internal table scroller): the card grows to show every
          row, and the title + column headers stick to the page top as you scroll.
          overflow-clip keeps the rounded-corner clipping without creating a scroll container. */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900 overflow-clip xl:flex xl:flex-col">
        <div
          ref={titleRef}
          className="sticky top-[var(--app-header-h,0px)] z-40 border-b border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 sm:p-4 xl:shrink-0"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold flex items-center">
              <Home className="h-5 w-5 mr-2 shrink-0 text-green-600" />
              Your best matched locations
            </h2>
            {budgetEnabled && (
              <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">
                Budget: &pound;{maxBudget.toLocaleString()}/mo
              </span>
            )}
            <span
              className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"
              title="Click any row to expand it for a map, cost breakdown, schools and nearby East Asian spots."
            >
              <ChevronRight className="h-3.5 w-3.5" />
              Click a row to expand
            </span>
          </div>
        </div>
        <div className="relative xl:flex xl:flex-col">
          {/* xl floating header: the column labels live here (outside the vertical
              scroller) so the scrollbar starts strictly below them. Width-synced to the
              body columns and horizontally scroll-synced via syncHeader*. */}
          {isXl && (
            <div
              ref={headerScrollRef}
              onScroll={() => { syncBodyScroll(); updateTableChrome(); }}
              className="thin-scrollbar shrink-0 overflow-x-auto overscroll-x-contain bg-gray-50 dark:bg-gray-700 [scrollbar-gutter:stable] xl:sticky xl:top-[var(--results-header-top)] xl:z-30"
            >
              <table
                ref={headerTableRef}
                className="border-separate border-spacing-0 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-gray-600"
              >
                <colgroup>{Array.from({ length: detailColSpan }).map((_, i) => <col key={i} />)}</colgroup>
                <thead className="bg-gray-50 dark:bg-gray-700">
                  {renderHeaderRow()}
                </thead>
              </table>
            </div>
          )}
          <div
            // At xl this is the vertical scroller; the floating header sits above it, so
            // the scrollbar starts below the labels. Below xl it only scrolls
            // horizontally when the table overflows.
            className={hasHorizontalOverflow ? 'thin-scrollbar overflow-x-auto overscroll-x-contain' : undefined}
            style={hasHorizontalOverflow
              ? ({
                '--results-header-top': '0px',
                '--expanded-row-top': isXl ? '0px' : `${headerHeight}px`,
              } as React.CSSProperties)
              : undefined}
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <table
              className="w-full border-separate border-spacing-0 [&_td]:border-b [&_td]:border-gray-200 dark:[&_td]:border-gray-700 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-gray-600"
              ref={tableRef}
            >
              <colgroup>{Array.from({ length: detailColSpan }).map((_, i) => <col key={i} />)}</colgroup>
              <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600 xl:hidden">
                {renderHeaderRow()}
              </thead>
              {sortedResults.map((result, index) => {
                  const overBudget = budgetEnabled && result.totalMonthly > maxBudget;
                  const isSelected = selectedLocation === result.location;
                  // Backgrounds on sticky cells must stay opaque (no alpha), otherwise the
                  // columns scrolling beneath them show through.
                  const hoverCellClass = overBudget
                    ? ''
                    : isSelected
                      ? '!bg-blue-50 dark:!bg-[#131d39]'
                      : 'group-hover:!bg-gray-50 dark:group-hover:!bg-gray-700';
                  const isExpanded = expandedLocation === result.location;
                  // Expected platform wait the score adds — keyed off the first leg of your route
                  // (train vs tube), so it matches the lines shown for this journey.
                  const waitMin = expectedWaitMinutes(result.location, result.commuteRoute);
                  return (
                    <tbody key={result.location}>
                      <tr
                        ref={el => { rowRefs.current[result.location] = el; }}
                        onClick={onLocationSelect ? () => onLocationSelect(result.location) : undefined}
                        onMouseEnter={() => onLocationHover?.(result.location)}
                        onMouseLeave={() => onLocationHover?.(null)}
                        className={`border-b dark:border-gray-700 ${
                          isExpanded
                            ? '[&>td]:sticky [&>td]:top-[var(--expanded-row-top)] [&>td]:z-[19] [&>td]:bg-white [&>td]:shadow-[0_3px_6px_-3px_rgba(0,0,0,0.25)] dark:[&>td]:bg-gray-900'
                            : ''
                        } ${
                          overBudget
                            ? 'opacity-35 bg-gray-50 dark:bg-gray-800'
                            : `group ${onLocationSelect ? 'cursor-pointer' : ''}`
                        }`}
                      >
                      <td className={`sticky left-0 z-10 py-2 px-1.5 text-center whitespace-nowrap min-w-[44px] w-[44px] overflow-hidden lg:py-3 lg:px-3 lg:min-w-[56px] lg:w-[56px] ${isExpanded ? '!z-[21]' : ''} ${
                        overBudget
                          ? 'bg-gray-50 dark:bg-gray-800'
                          : 'bg-white dark:bg-gray-900'
                      } ${hoverCellClass}`}>
                        <span
                          aria-hidden="true"
                          className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                            !anyPriority && !overBudget && index < 5 ? 'bg-blue-400 dark:bg-blue-500' : 'bg-transparent'
                          }`}
                        />
                        {anyPriority ? (
                          <span
                            className={`cursor-help text-sm font-bold lg:text-base ${scoreColor(result.compositeScore)}`}
                            title={buildScoreTitle(result)}
                          >
                            {result.compositeScore}
                          </span>
                        ) : !overBudget && index < 5 ? (
                            <div className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold lg:h-6 lg:w-6 lg:text-xs ${
                              index === 0 ? 'bg-green-500 text-white' :
                              index === 1 ? 'bg-blue-500 text-white' :
                              index === 2 ? 'bg-purple-500 text-white' :
                              index === 3 ? 'bg-amber-400 text-white' :
                                            'bg-gray-400 text-white'
                            }`}>
                              {index + 1}
                            </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400 lg:text-sm">{index + 1}</span>
                        )}
                      </td>

                      <td className={`sticky left-[44px] z-10 max-w-[40vw] px-2 py-2 align-middle shadow-[2px_0_5px_-1px_rgba(0,0,0,0.08)] lg:left-[56px] lg:max-w-none lg:whitespace-nowrap lg:px-3 lg:py-3 ${isExpanded ? '!z-[21]' : ''} ${
                        overBudget
                          ? 'bg-gray-50 dark:bg-gray-800'
                          : 'bg-white dark:bg-gray-900'
                      } ${hoverCellClass}`}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpandedLocation(result.location)}
                            className="inline-flex items-start gap-1 text-left text-sm font-semibold text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300 lg:items-center lg:gap-1.5 lg:text-base"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${result.displayName} details`}
                          >
                            {isExpanded
                              ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 lg:mt-0" />
                              : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 lg:mt-0" />}
                            <span className="break-words leading-tight">{result.displayName}</span>
                          </button>
                          <TransitIcons location={result.location} />
                          <LocationDataFlag result={result} />
                        </div>
                        <div className="pl-5 text-[11px] text-gray-400 dark:text-gray-500 lg:pl-[22px] lg:text-xs">{result.borough}</div>
                      </td>
                      <td
                        className={`whitespace-nowrap px-1.5 py-2 text-center lg:px-3 lg:py-3 ${hoverCellClass}`}
                        title={[
                          result.commuteRoute && `You: via ${result.commuteRoute}`,
                          result.commuteRoute2 && `Partner: via ${result.commuteRoute2}`,
                        ].filter(Boolean).join('\n') || undefined}
                      >
                        <div>
                          {result.commuteTime !== null ? (
                            <>
                              {result.commuteIsLive && <LiveCommuteDot />}
                              <span className={`text-xs lg:text-sm ${result.commuteIsLive ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                {result.commuteTime} min
                              </span>
                            </>
                          ) : liveCommuteLoading && !result.commuteIsLive ? (
                            <span className="animate-pulse text-xs text-gray-300 dark:text-gray-600 lg:text-sm">...</span>
                          ) : (
                            <span className="text-xs text-gray-400 lg:text-sm" title="Commute data unavailable">?</span>
                          )}
                          {hasPartnerDestination && <span className="text-gray-300 dark:text-gray-600 mx-1">/</span>}
                          {hasPartnerDestination && (
                            result.commuteTime2 !== null
                              ? (
                                <>
                                  {result.commuteTime2IsLive && <LiveCommuteDot tone="indigo" />}
                                  <span className="text-xs text-indigo-500 dark:text-indigo-400 lg:text-sm">
                                    {result.commuteTime2} min
                                  </span>
                                </>
                              )
                              : liveCommuteLoading2 && !result.commuteTime2IsLive
                                ? <span className="animate-pulse text-xs text-gray-300 dark:text-gray-600 lg:text-sm">...</span>
                              : <span className="text-xs text-gray-400 lg:text-sm" title="Partner commute data unavailable">?</span>
                          )}
                        </div>
                        {(result.commuteTime !== null || result.commuteTime2 !== null) && (
                          <div
                            className="mt-0.5 text-[10px] leading-none text-gray-400 dark:text-gray-500"
                            title="Expected wait for the first service on your route (≈ half the gap between trains), added to the commute score so frequent and infrequent journeys compare fairly."
                          >
                            +{waitMin} wait
                          </div>
                        )}
                      </td>

                      <td className={`whitespace-nowrap px-1 py-2 text-center text-sm font-medium lg:px-2 lg:py-3 lg:text-base ${hoverCellClass}`}>&pound;{result.rent.toLocaleString()}</td>
                      <td className={`whitespace-nowrap px-1 py-2 text-center text-sm font-medium lg:px-2 lg:py-3 lg:text-base ${hoverCellClass}`}>&pound;{result.transportCostMonthly.toFixed(0)}</td>
                      <td className={`whitespace-nowrap px-1 py-2 text-center text-sm font-medium lg:px-2 lg:py-3 lg:text-base ${hoverCellClass}`}>&pound;{result.councilTaxMonthly.toFixed(0)}</td>
                      <td className={`whitespace-nowrap bg-blue-50 px-1.5 py-2 text-center text-sm font-bold dark:bg-gray-800 lg:px-3 lg:py-3 lg:text-base ${
                        overBudget
                          ? 'text-red-400'
                          : 'text-blue-900 dark:text-blue-300'
                      } ${hoverCellClass}`}>
                        &pound;{Math.round(result.totalMonthly).toLocaleString()}
                      </td>
                      <td className={`whitespace-nowrap px-1 py-2 text-center lg:px-3 lg:py-3 ${hoverCellClass}`}>
                        {result.crimeRate !== null ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium lg:px-2 lg:text-xs ${crimeColor(result.crimeRate)}`}
                            title={`${Math.round(result.crimeRate)} crimes per 1,000 residents (2024/25). London avg: 106/k.`}
                          >
                            {Math.round(result.crimeRate)}/k
                          </span>
                        ) : <span className="text-xs text-gray-400 lg:text-sm">?</span>}
                      </td>

                      <td className={`whitespace-nowrap px-1 py-2 text-center lg:px-3 lg:py-3 ${hoverCellClass}`}>
                        {result.outstandingSchools !== null ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium lg:px-2 lg:text-xs ${schoolScoreColor(result.schoolScore.raw)}`}
                            title={getSchoolTitle(result)}
                          >
                            {result.schoolScore.raw}
                          </span>
                        ) : <span className="text-xs text-gray-400 lg:text-sm">?</span>}
                      </td>

                      <td className={`px-1.5 py-2 text-center align-middle lg:px-3 lg:py-3 ${hoverCellClass}`}>
                        {(asianSpots[result.location]?.length ?? 0) > 0
                          ? <SpotIcons spots={asianSpots[result.location]} className="mx-auto max-w-[4rem] justify-center text-[11px]" />
                          : <span className="text-gray-300 dark:text-gray-600">–</span>}
                      </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b dark:border-gray-700">
                          <td colSpan={detailColSpan} className="p-0">
                            <div style={{ position: 'sticky', left: 0, width: containerWidth || undefined }}>
                              <LocationDetailPanel
                                result={result}
                                hasPartnerDestination={hasPartnerDestination}
                                monthlyTrips={monthlyTrips}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
            </table>
          </div>
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none" />
          )}
        </div>
      </div>
      <p className="sm:hidden text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
        &lt;- Scroll to see all columns -&gt;
      </p>
    </div>
  );
}
