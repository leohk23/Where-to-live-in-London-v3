import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal, UserPlus, Users } from 'lucide-react';
import WorkLocationInput, { type LiveCommuteStatus } from './WorkLocationInput';
import { usePersistedCollapse } from '../hooks/usePersistedCollapse';
import { BUDGET_MIN, BUDGET_MAX, BUDGET_STEP, MAX_MONTHLY_TRIPS } from '../lib/constants';
import type { BedroomCount, Priorities } from '../types';
import type { WorkLocationKey } from '../work-locations';

type WorkMode = 'preset' | 'address';
const PRIORITY_MAX = 5;

const PRIORITY_SLIDERS: { key: keyof Priorities; label: string; tip: string }[] = [
  { key: 'commute',  label: 'Commute', tip: 'Shorter commute = higher score' },
  { key: 'cost',     label: 'Cost',    tip: 'Lower total monthly cost = higher score' },
  { key: 'safety',   label: 'Safety',  tip: 'Lower crime rate = higher score' },
  { key: 'schools',  label: 'Schools', tip: 'Higher nearby share of Outstanding primary and secondary schools = higher score' },
];

const SELECT_CLASS =
  'w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white';

interface Props {
  className?: string;
  workLocation: WorkLocationKey | '';
  setWorkLocation: (v: WorkLocationKey | '') => void;
  workMode: WorkMode;
  setWorkMode: (v: WorkMode) => void;
  workLocation2: WorkLocationKey | '';
  setWorkLocation2: (v: WorkLocationKey | '') => void;
  workMode2: WorkMode;
  setWorkMode2: (v: WorkMode) => void;
  bedrooms: BedroomCount;
  setBedrooms: (v: BedroomCount) => void;
  monthlyTrips: number;
  setMonthlyTrips: (v: number) => void;
  priorities: Priorities;
  setPriorities: (fn: (p: Priorities) => Priorities) => void;
  budgetEnabled: boolean;
  setBudgetEnabled: (v: boolean) => void;
  maxBudget: number;
  setMaxBudget: (v: number) => void;
  anyPriority: boolean;
  officePostcode: string;
  setOfficePostcode: (v: string) => void;
  setSelectedOfficeCoords: (coords: { lat: string; lon: string } | null) => void;
  onFetchLiveCommutes: () => void;
  liveCommuteLoading: boolean;
  liveCommuteGeocoding: boolean;
  liveCommuteProgress: number;
  liveCommuteTotal: number;
  liveCommuteError: string | null;
  officePostcode2: string;
  setOfficePostcode2: (v: string) => void;
  setSelectedOfficeCoords2: (coords: { lat: string; lon: string } | null) => void;
  onFetchLiveCommutes2: () => void;
  liveCommuteLoading2: boolean;
  liveCommuteGeocoding2: boolean;
  liveCommuteProgress2: number;
  liveCommuteTotal2: number;
  liveCommuteError2: string | null;
}

export default function FilterPanel({
  className,
  workLocation, setWorkLocation,
  workMode, setWorkMode,
  workLocation2, setWorkLocation2,
  workMode2, setWorkMode2,
  bedrooms, setBedrooms,
  monthlyTrips, setMonthlyTrips,
  priorities, setPriorities,
  budgetEnabled, setBudgetEnabled,
  maxBudget, setMaxBudget,
  anyPriority,
  officePostcode, setOfficePostcode, setSelectedOfficeCoords,
  onFetchLiveCommutes,
  liveCommuteLoading, liveCommuteGeocoding, liveCommuteProgress, liveCommuteTotal, liveCommuteError,
  officePostcode2, setOfficePostcode2, setSelectedOfficeCoords2,
  onFetchLiveCommutes2,
  liveCommuteLoading2, liveCommuteGeocoding2, liveCommuteProgress2, liveCommuteTotal2, liveCommuteError2,
}: Props) {
  const partnerHasValue = Boolean(workLocation2 || officePostcode2.trim() || liveCommuteTotal2 > 0);
  const [showPartnerWork, setShowPartnerWork] = useState(partnerHasValue);

  useEffect(() => {
    if (partnerHasValue) setShowPartnerWork(true);
  }, [partnerHasValue]);

  const primaryLiveStatus: LiveCommuteStatus = {
    loading: liveCommuteLoading,
    geocoding: liveCommuteGeocoding,
    progress: liveCommuteProgress,
    total: liveCommuteTotal,
    error: liveCommuteError,
    timesActive: !liveCommuteLoading && liveCommuteTotal > 0 && liveCommuteProgress === liveCommuteTotal,
    onFetch: onFetchLiveCommutes,
  };

  const partnerLiveStatus: LiveCommuteStatus = {
    loading: liveCommuteLoading2,
    geocoding: liveCommuteGeocoding2,
    progress: liveCommuteProgress2,
    total: liveCommuteTotal2,
    error: liveCommuteError2,
    timesActive: !liveCommuteLoading2 && liveCommuteTotal2 > 0 && liveCommuteProgress2 === liveCommuteTotal2,
    onFetch: onFetchLiveCommutes2,
  };

  const togglePartnerWork = () => {
    if (showPartnerWork) {
      setShowPartnerWork(false);
      setWorkLocation2('');
      setWorkMode2('preset');
      setOfficePostcode2('');
      setSelectedOfficeCoords2(null);
      return;
    }

    setShowPartnerWork(true);
  };

  const setupGridClass = 'grid grid-cols-1 items-start xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)] gap-4 mb-4 xl:mb-3';
  const { collapsed, toggle } = usePersistedCollapse('wtl-collapse-filters');

  // Compact chip recap of the current selections, shown while the section is collapsed.
  // Long addresses are clamped inside their own chip so they can't push the rest out of view.
  const workSummary = workMode === 'address'
    ? (officePostcode.trim() || 'not set')
    : (workLocation || 'not set');
  const partnerSummary = workMode2 === 'address' ? officePostcode2.trim() : workLocation2;
  const activePriorities = PRIORITY_SLIDERS.filter(({ key }) => priorities[key] > 0);
  const chipClass =
    'inline-flex max-w-full items-baseline gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  const chipLabelClass = 'shrink-0 text-gray-400 dark:text-gray-500';

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900 sm:p-4 ${className ?? 'mb-6'}`}>
      <div className={`flex items-center justify-between gap-3 ${collapsed ? '' : 'mb-4 xl:mb-3'}`}>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold flex items-center">
            <SlidersHorizontal className="h-5 w-5 mr-2 shrink-0 text-blue-600" />
            <span className="truncate">Your needs &amp; priorities</span>
          </h2>
          {collapsed && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-4">
              <span className={chipClass} title={workSummary}>
                <span className={chipLabelClass}>Work</span>
                <span className="max-w-[10rem] truncate font-medium">{workSummary}</span>
              </span>
              {partnerSummary && (
                <span className={chipClass} title={partnerSummary}>
                  <span className={chipLabelClass}>Partner</span>
                  <span className="max-w-[10rem] truncate font-medium">{partnerSummary}</span>
                </span>
              )}
              <span className={chipClass}>
                <span className="font-medium">{bedrooms} bed</span>
              </span>
              <span className={chipClass}>
                <span className="font-medium">{monthlyTrips} trips/mo</span>
              </span>
              {activePriorities.length > 0 ? (
                activePriorities.map(({ key, label }) => (
                  <span key={key} className={chipClass}>
                    <span className={chipLabelClass}>{label}</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">{priorities[key]}</span>
                  </span>
                ))
              ) : (
                <span className={chipClass}>
                  <span className={chipLabelClass}>Priorities off</span>
                </span>
              )}
              {budgetEnabled && (
                <span className={chipClass}>
                  <span className={chipLabelClass}>Budget</span>
                  <span className="font-medium">£{maxBudget.toLocaleString()}</span>
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </button>
      </div>

      {!collapsed && (
      <>
      <div className={setupGridClass}>
        <div className="flex flex-col gap-4">
        <WorkLocationInput
          label="Where do you work?"
          labelAction={(
            <button
              type="button"
              onClick={togglePartnerWork}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                showPartnerWork
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25'
                  : 'border-gray-300 bg-white text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:bg-blue-500/15 dark:hover:text-blue-200'
              }`}
              aria-pressed={showPartnerWork}
              aria-label={showPartnerWork ? "Hide partner's work location" : "Add partner's work location"}
              title={showPartnerWork ? "Hide partner's work location" : "Add partner's work location"}
            >
              {showPartnerWork ? <Users className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              <span>Partner</span>
            </button>
          )}
          mode={workMode}
          setMode={setWorkMode}
          presetValue={workLocation}
          setPresetValue={setWorkLocation}
          noneLabel="Select work location..."
          addressValue={officePostcode}
          setAddressValue={setOfficePostcode}
          setAddressCoords={setSelectedOfficeCoords}
          live={primaryLiveStatus}
        />

        {showPartnerWork && (
          <WorkLocationInput
            label="Partner's work location"
            icon={<Users className="h-4 w-4" />}
            optional
            liveAccent="indigo"
            mode={workMode2}
            setMode={setWorkMode2}
            presetValue={workLocation2}
            setPresetValue={setWorkLocation2}
            noneLabel="None"
            addressValue={officePostcode2}
            setAddressValue={setOfficePostcode2}
            setAddressCoords={setSelectedOfficeCoords2}
            live={partnerLiveStatus}
          />
        )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-rows-[2rem_auto]">
          <label className="flex min-h-8 items-center text-sm font-medium text-gray-700 dark:text-gray-300">Number of Bedrooms</label>
          <label className="flex min-h-8 items-center text-sm font-medium text-gray-700 dark:text-gray-300">Monthly trips</label>
          <select
            value={bedrooms}
            onChange={e => setBedrooms(parseInt(e.target.value) as BedroomCount)}
            className={SELECT_CLASS}
          >
            {([1, 2, 3, 4] as BedroomCount[]).map(n => (
              <option key={n} value={n}>{n} bed</option>
            ))}
          </select>
          <input
            type="number"
            value={monthlyTrips}
            onChange={e => setMonthlyTrips(Math.min(parseInt(e.target.value) || 0, MAX_MONTHLY_TRIPS))}
            className={SELECT_CLASS}
            min="0"
            max={MAX_MONTHLY_TRIPS}
          />
        </div>
      </div>

      {/* Priority sliders */}
      <div className="border-t dark:border-gray-700 pt-4 mt-2 xl:pt-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            <span>What matters most?</span>
            <span className="mt-1 block text-xs font-normal text-gray-400 sm:ml-2 sm:mt-0 sm:inline">
              Drag sliders to rank by a weighted score
            </span>
          </div>
          {anyPriority && (
            <button
              onClick={() => setPriorities(() => ({ commute: 0, cost: 0, safety: 0, schools: 0 }))}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
            >
              Reset
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {PRIORITY_SLIDERS.map(({ key, label, tip }) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300 font-medium" title={tip}>{label}</span>
                <span className={`font-bold ${priorities[key] > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                  {priorities[key] === 0 ? 'off' : priorities[key]}
                </span>
              </div>
              <input
                type="range" min="0" max={PRIORITY_MAX} step="1"
                value={priorities[key]}
                onChange={e => setPriorities(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                className="w-full accent-blue-600"
                title={tip}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Budget filter */}
      <div className="border-t dark:border-gray-700 pt-4 mt-4 xl:mt-3 xl:pt-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={budgetEnabled}
              onChange={e => setBudgetEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Max monthly budget</span>
          </label>
          {budgetEnabled && (
            <>
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400 w-16">£{maxBudget.toLocaleString()}</span>
              <input
                type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_STEP}
                value={maxBudget}
                onChange={e => setMaxBudget(parseInt(e.target.value))}
                className="flex-1 min-w-[160px] accent-blue-600"
              />
              <span className="text-xs text-gray-400">£{BUDGET_MIN.toLocaleString()} - £{BUDGET_MAX.toLocaleString()}</span>
            </>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
