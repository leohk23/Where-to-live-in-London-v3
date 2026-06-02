import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
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
import { CRIME_THRESHOLDS, SCHOOL_THRESHOLDS, SCORE_THRESHOLDS } from '../lib/constants';
import type { ScoredResult, SortColumn, BedroomCount, NearbySchool } from '../types';
import type { WorkLocationKey } from '../work-locations';

type WorkMode = 'preset' | 'address';

interface Props {
  sortedResults: ScoredResult[];
  anyPriority: boolean;
  workLocation: WorkLocationKey | '';
  workMode: WorkMode;
  officePostcode: string;
  workLocation2: WorkLocationKey | '';
  workMode2: WorkMode;
  officePostcode2: string;
  bedrooms: BedroomCount;
  budgetEnabled: boolean;
  maxBudget: number;
  sortBy: SortColumn;
  sortDirection: 'asc' | 'desc';
  onSort: (col: SortColumn) => void;
  liveCommuteLoading: boolean;
  liveCommuteLoading2: boolean;
}

function crimeColor(rate: number) {
  if (rate <= CRIME_THRESHOLDS.low) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (rate <= CRIME_THRESHOLDS.medium) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  if (rate <= CRIME_THRESHOLDS.high) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

function schoolColor(pct: number) {
  if (pct >= SCHOOL_THRESHOLDS.high) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (pct >= SCHOOL_THRESHOLDS.medium) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
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

  if (primaryRadius !== null && secondaryRadius !== null) {
    return {
      label: `P ${primaryRadius}km / S ${secondaryRadius}km`,
      shortLabel: `${primaryRadius}/${secondaryRadius}km`,
      title: `Primary schools are counted within ${primaryRadius}km; secondary and grammar/selective schools are counted within ${secondaryRadius}km.`,
      description: `primary within ${primaryRadius}km, secondary within ${secondaryRadius}km`,
      primaryLabel: `${primaryRadius}km`,
      secondaryLabel: `${secondaryRadius}km`,
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
    };
  }

  return {
    label: 'Borough fallback',
    shortLabel: 'Borough',
    title: 'School counts are using borough-level fallback data.',
    description: 'at borough level',
    primaryLabel: 'borough',
    secondaryLabel: 'borough',
  };
}

function getSchoolTitle(result: ScoredResult) {
  const scope = getSchoolScope(result);
  const split = `${result.primaryOutstandingSchools}/${result.primarySchools} primary (${scope.primaryLabel}), ${result.secondaryOutstandingSchools}/${result.secondarySchools} secondary (${scope.secondaryLabel})`;
  const grammar = result.grammarSchools !== null
    ? ` Grammar/selective secondary schools: ${result.grammarSchools} (${scope.secondaryLabel}).`
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

function SchoolScopeBadges({
  primaryLabel,
  secondaryLabel,
}: {
  primaryLabel: string;
  secondaryLabel: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="inline-flex items-center gap-1">
        <SchoolPhaseBadge phase="Primary" title="Primary schools" />
        <span>{primaryLabel}</span>
      </span>
      <span className="text-gray-300 dark:text-gray-600">/</span>
      <span className="inline-flex items-center gap-1">
        <SchoolPhaseBadge phase="Secondary" title="Secondary schools" />
        <span>{secondaryLabel}</span>
      </span>
    </span>
  );
}

function SchoolPreviewList({
  title,
  schools,
  phase,
}: {
  title: string;
  schools: NearbySchool[];
  phase?: 'Primary' | 'Secondary';
}) {
  const visibleSchools = schools.slice(0, 5);

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

function GeographyCard({
  schoolScope,
  className = '',
}: {
  schoolScope: ReturnType<typeof getSchoolScope>;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        <Info className="h-4 w-4" />
        Geography
      </div>
      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
        <div>Commute: station/live</div>
        <div>Rent: area estimate</div>
        <div>Crime/tax: borough</div>
        <div className="flex flex-wrap items-center gap-1">
          <span>Schools:</span>
          <SchoolScopeBadges
            primaryLabel={schoolScope.primaryLabel}
            secondaryLabel={schoolScope.secondaryLabel}
          />
        </div>
      </div>
    </div>
  );
}

function formatCommute(time: number | null, isLive: boolean) {
  if (time === null) return 'Unavailable';
  return `${time} min${isLive ? ' live' : ''}`;
}

function LocationDetailPanel({
  result,
  hasPartnerDestination,
}: {
  result: ScoredResult;
  hasPartnerDestination: boolean;
}) {
  const mapQuery = encodeURIComponent(`${result.anchorStation}, London`);
  const mapSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const nearestPrimarySchools = result.nearestPrimaryOutstandingSchools.slice(0, 5);
  const nearestSecondarySchools = result.nearestSecondaryOutstandingSchools.slice(0, 5);
  const nearestGrammarSchools = result.nearestGrammarSchools.slice(0, 5);
  const hasSchoolDetails = nearestPrimarySchools.length > 0
    || nearestSecondarySchools.length > 0
    || result.grammarSchools !== null;
  const schoolSummary = result.outstandingSchools !== null && result.outstandingSchoolsPct !== null
    ? `${result.outstandingSchools} of ${result.schoolsTotal} Outstanding (${result.outstandingSchoolsPct}%)`
    : 'Unavailable';
  const schoolScope = getSchoolScope(result);
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

        <div className="flex min-h-[13rem] flex-col overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:min-h-[11rem] lg:min-h-[14rem] xl:col-start-1 xl:row-span-4 xl:row-start-1 xl:min-h-full">
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

        <div className="space-y-3 xl:col-start-2 xl:row-start-2 xl:space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-3 xl:gap-3">
            <div className={detailCardClass}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <Route className="h-4 w-4" />
                Commute
              </div>
              <DetailStat label="You" value={formatCommute(result.commuteTime, result.commuteIsLive)} />
              {hasPartnerDestination && (
                <div className="mt-2">
                  <DetailStat label="Partner" value={formatCommute(result.commuteTime2, result.commuteTime2IsLive)} />
                </div>
              )}
            </div>

            <div className={detailCardClass}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <Wallet className="h-4 w-4" />
                Cost
              </div>
              <DetailStat label="Total" value={`\u00a3${Math.round(result.totalMonthly).toLocaleString()}/mo`} />
              <div className="mt-2 grid grid-cols-3 gap-2">
                <DetailStat label="Rent" value={`\u00a3${result.rent.toLocaleString()}`} />
                <DetailStat label="Transport" value={`\u00a3${result.transportCostMonthly.toFixed(0)}`} />
                <DetailStat label="Tax" value={`\u00a3${result.councilTaxMonthly.toFixed(0)}`} />
              </div>
            </div>

            <div className={detailCardClass}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <GraduationCap className="h-4 w-4" />
                Schools
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{schoolSummary}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <SchoolPhaseBadge phase="Primary" />
                  <span>{result.primaryOutstandingSchools}/{result.primarySchools}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <SchoolPhaseBadge phase="Secondary" />
                  <span>{result.secondaryOutstandingSchools}/{result.secondarySchools}</span>
                </span>
              </div>
              {result.grammarSchools !== null && (
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <SchoolPhaseBadge phase="Secondary" />
                  <span>Grammar/selective: {result.grammarSchools}</span>
                </div>
              )}
            </div>

          </div>

          {hasSchoolDetails && (
            <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Nearest Outstanding schools
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SchoolPreviewList title="Primary" phase="Primary" schools={nearestPrimarySchools} />
                <SchoolPreviewList title="Secondary" phase="Secondary" schools={nearestSecondarySchools} />
                <SchoolPreviewList title={`Grammar/selective (${result.grammarSchools ?? 0})`} phase="Secondary" schools={nearestGrammarSchools} />
              </div>
            </div>
          )}

          <GeographyCard schoolScope={schoolScope} />
        </div>
      </div>
    </div>
  );
}

export default function ResultsTable({
  sortedResults,
  anyPriority,
  workLocation,
  workMode,
  officePostcode,
  workLocation2,
  workMode2,
  officePostcode2,
  bedrooms,
  budgetEnabled,
  maxBudget,
  sortBy,
  sortDirection,
  onSort,
  liveCommuteLoading,
  liveCommuteLoading2,
}: Props) {
  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortBy !== col) return null;
    return sortDirection === 'asc'
      ? <ArrowUp className="inline h-3 w-3 ml-1" />
      : <ArrowDown className="inline h-3 w-3 ml-1" />;
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState<boolean>(false);
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tableWidth, setTableWidth] = useState(0);
  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const [floatingHeaderFrame, setFloatingHeaderFrame] = useState<{ left: number; width: number } | null>(null);
  const primaryDestination = getDestinationLabel(workMode, workLocation, officePostcode, 'custom workplace');
  const partnerDestination = getDestinationLabel(workMode2, workLocation2, officePostcode2, '');
  const hasPartnerDestination = Boolean(partnerDestination);
  const detailColSpan = 9;

  const updateTableChrome = useCallback(() => {
    const el = scrollRef.current;
    const table = tableRef.current;
    if (!el) {
      setCanScrollRight(false);
      setHasHorizontalOverflow(false);
      setFloatingHeaderFrame(null);
      return;
    }

    setContainerWidth(el.clientWidth);
    const hasHorizontalOverflow = el.scrollWidth > el.clientWidth + 2;
    const hasMoreToRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    const headerCells = table?.querySelectorAll('thead th');

    setHasHorizontalOverflow(hasHorizontalOverflow);
    setCanScrollRight(hasHorizontalOverflow && hasMoreToRight);

    if (table) {
      setTableWidth(table.offsetWidth);
    }

    if (headerCells?.length) {
      setColumnWidths(Array.from(headerCells, cell => cell.getBoundingClientRect().width));
    }

    if (!table || hasHorizontalOverflow) {
      setFloatingHeaderFrame(null);
      return;
    }

    const tableRect = table.getBoundingClientRect();
    const scrollerRect = el.getBoundingClientRect();
    const shouldFloat = tableRect.top < 0 && tableRect.bottom > 72;

    setFloatingHeaderFrame(shouldFloat
      ? {
          left: Math.max(scrollerRect.left, 0),
          width: Math.min(scrollerRect.width, window.innerWidth - Math.max(scrollerRect.left, 0)),
        }
      : null
    );
  }, []);

  useEffect(() => {
    updateTableChrome();

    const scrollEl = scrollRef.current;
    const tableEl = tableRef.current;
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateTableChrome);

    if (scrollEl) resizeObserver?.observe(scrollEl);
    if (tableEl) resizeObserver?.observe(tableEl);
    window.addEventListener('resize', updateTableChrome);
    window.addEventListener('scroll', updateTableChrome, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateTableChrome);
      window.removeEventListener('scroll', updateTableChrome);
    };
  }, [anyPriority, budgetEnabled, expandedLocation, hasPartnerDestination, sortedResults.length, updateTableChrome]);

  const handleScroll = () => {
    updateTableChrome();
  };

  const thClass = (col: SortColumn, align = 'text-left') =>
    `${align} align-middle py-2 px-1.5 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none lg:py-3 lg:px-3 ${
      sortBy === col ? 'text-blue-600 dark:text-blue-400 underline' : 'hover:underline'
    }`;

  const thNarrowClass = (col: SortColumn) =>
    `text-center align-middle py-2 px-1 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none lg:py-3 lg:px-2 ${
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
        className={`text-center align-middle py-2 px-1.5 font-semibold whitespace-nowrap bg-gray-50 dark:bg-gray-700 min-w-[44px] w-[44px] overflow-hidden lg:py-3 lg:px-3 lg:min-w-[56px] lg:w-[56px] ${
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
        className={`${thClass('location')} sticky left-0 z-20 bg-gray-50 dark:bg-gray-700 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.08)]`}
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
              title="Home station to selected work station or live workplace address."
              tone="station"
            />
          </div>
          {hasPartnerDestination && (
            <div className="text-xs font-normal text-gray-400 dark:text-gray-500">you / partner</div>
          )}
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
        title="% of nearby state primary and secondary schools rated Outstanding by Ofsted (Apr 2026). Higher is better."
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Schools<SortIcon col="schools" /></div>
          <div className={headerBadgeRowClass()}>
            <div
              className="inline-flex h-5 items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
              title="Primary schools use a 3km radius; secondary and grammar/selective schools use a 5km radius around the location anchor."
            >
              <SchoolScopeBadges primaryLabel="3km" secondaryLabel="5km" />
            </div>
          </div>
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
        className={`${thClass('total', 'text-center')} bg-blue-50 dark:bg-gray-700`}
      >
        <div className={headerStackClass()}>
          <div className={headerTitleClass()}>Total<SortIcon col="total" /></div>
          <div className={headerBadgeRowClass()}>
            <HeaderLevelBadge
              label="Mixed"
              title="Total combines rent, transport and council tax estimates."
            />
          </div>
        </div>
      </th>
    </tr>
  );

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold flex items-center">
            <Home className="h-5 w-5 mr-2 text-green-600" />
            {bedrooms}-Bedroom Areas
          </h2>
          {budgetEnabled && (
            <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">
              Budget: &pound;{maxBudget.toLocaleString()}/mo
            </span>
          )}
        </div>
        {(primaryDestination || partnerDestination) && (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {primaryDestination && (
              <span>
                Your commute: <span className="font-medium text-gray-700 dark:text-gray-200">{primaryDestination}</span>
              </span>
            )}
            {partnerDestination && (
              <span>
                Partner commute: <span className="font-medium text-gray-700 dark:text-gray-200">{partnerDestination}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {floatingHeaderFrame && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 z-50 overflow-hidden rounded-t-lg border-x border-b border-gray-200 bg-gray-50 shadow-lg dark:border-gray-700 dark:bg-gray-700"
          style={{ left: floatingHeaderFrame.left, width: floatingHeaderFrame.width }}
        >
          <table
            className="border-separate border-spacing-0 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-gray-600"
            style={{ width: tableWidth || floatingHeaderFrame.width }}
          >
            {columnWidths.length > 0 && (
              <colgroup>
                {columnWidths.map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
            )}
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              {renderHeaderRow()}
            </thead>
          </table>
        </div>
      )}

      {hasHorizontalOverflow && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 lg:hidden">
          <Smartphone className="h-4 w-4 shrink-0" />
          <span>Phone tip: rotate to landscape for the full table.</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-700 overflow-hidden">
        <div className="relative">
          <div className="overflow-x-auto overscroll-x-contain" ref={scrollRef} onScroll={handleScroll}>
            <table
              className="w-full border-separate border-spacing-0 [&_td]:border-b [&_td]:border-gray-200 dark:[&_td]:border-gray-700 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-gray-600"
              ref={tableRef}
            >
              <thead className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                {renderHeaderRow()}
              </thead>
              <tbody>
                {sortedResults.map((result, index) => {
                  const overBudget = budgetEnabled && result.totalMonthly > maxBudget;
                  const hoverCellClass = overBudget ? '' : 'group-hover:!bg-gray-50 dark:group-hover:!bg-gray-700';
                  const isExpanded = expandedLocation === result.location;
                  return (
                    <Fragment key={result.location}>
                      <tr
                        className={`border-b dark:border-gray-700 ${
                          overBudget
                            ? 'opacity-35 bg-gray-50 dark:bg-gray-800'
                            : 'group'
                        }`}
                      >
                      <td className={`relative py-2 px-1.5 text-center whitespace-nowrap min-w-[44px] w-[44px] overflow-hidden lg:py-3 lg:px-3 lg:min-w-[56px] lg:w-[56px] ${
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
                          <span className={`text-sm font-bold lg:text-base ${scoreColor(result.compositeScore)}`}>
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

                      <td className={`sticky left-0 z-10 whitespace-nowrap px-2 py-2 shadow-[2px_0_5px_-1px_rgba(0,0,0,0.08)] lg:px-3 lg:py-3 ${
                        overBudget
                          ? 'bg-gray-50 dark:bg-gray-800'
                          : 'bg-white dark:bg-gray-900'
                      } ${hoverCellClass}`}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedLocation(current => (
                              current === result.location ? null : result.location
                            ))}
                            className="inline-flex items-center gap-1 text-left text-sm font-semibold text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300 lg:gap-1.5 lg:text-base"
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${result.displayName} details`}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 shrink-0" />
                              : <ChevronRight className="h-4 w-4 shrink-0" />}
                            <span>{result.displayName}</span>
                          </button>
                          <LocationDataFlag result={result} />
                        </div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 lg:text-xs">{result.borough}</div>
                      </td>
                      <td className={`whitespace-nowrap px-1.5 py-2 text-center lg:px-3 lg:py-3 ${hoverCellClass}`}>
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
                      </td>

                      <td className={`whitespace-nowrap px-1 py-2 text-center lg:px-3 lg:py-3 ${hoverCellClass}`}>
                        {result.crimeRate !== null ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium lg:px-2 lg:text-xs ${crimeColor(result.crimeRate)}`}
                            title={`${result.crimeRate} crimes per 1,000 residents (2024/25). London avg: 106/k.`}
                          >
                            {result.crimeRate}/k
                          </span>
                        ) : <span className="text-xs text-gray-400 lg:text-sm">?</span>}
                      </td>

                      <td className={`whitespace-nowrap px-1 py-2 text-center lg:px-3 lg:py-3 ${hoverCellClass}`}>
                        {result.outstandingSchools !== null && result.outstandingSchoolsPct !== null ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium lg:px-2 lg:text-xs ${schoolColor(result.outstandingSchoolsPct)}`}
                            title={getSchoolTitle(result)}
                          >
                            {result.outstandingSchools} ({result.outstandingSchoolsPct}%)
                          </span>
                        ) : <span className="text-xs text-gray-400 lg:text-sm">?</span>}
                      </td>

                      <td className={`whitespace-nowrap px-1 py-2 text-center text-sm font-medium lg:px-2 lg:py-3 lg:text-base ${hoverCellClass}`}>&pound;{result.rent.toLocaleString()}</td>
                      <td className={`whitespace-nowrap px-1 py-2 text-center lg:px-2 lg:py-3 ${hoverCellClass}`}>
                        <div className="text-sm font-medium lg:text-base">&pound;{result.transportCostMonthly.toFixed(0)}</div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 lg:text-xs">
                          <span className="lg:hidden">
                            {result.zone.replace('Zone ', 'Z')} - &pound;{result.farePerTrip.toFixed(2).replace(/\.00$/, '')}/trip
                          </span>
                          <span className="hidden lg:inline">
                            {result.zone} - &pound;{result.farePerTrip.toFixed(2)}/trip
                          </span>
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-1 py-2 text-center text-sm font-medium lg:px-2 lg:py-3 lg:text-base ${hoverCellClass}`}>&pound;{result.councilTaxMonthly.toFixed(0)}</td>
                      <td className={`whitespace-nowrap bg-blue-50 px-1.5 py-2 text-center text-sm font-bold dark:bg-gray-800 lg:px-3 lg:py-3 lg:text-base ${
                        overBudget
                          ? 'text-red-400'
                          : 'text-blue-900 dark:text-blue-300'
                      } ${hoverCellClass}`}>
                        &pound;{Math.round(result.totalMonthly).toLocaleString()}
                      </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b dark:border-gray-700">
                          <td colSpan={detailColSpan} className="p-0">
                            <div style={{ position: 'sticky', left: 0, width: containerWidth || undefined }}>
                              <LocationDetailPanel
                                result={result}
                                hasPartnerDestination={hasPartnerDestination}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
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
