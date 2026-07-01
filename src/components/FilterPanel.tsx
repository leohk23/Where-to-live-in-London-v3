import { useEffect, useState } from 'react';
import { SlidersHorizontal, UserPlus, Users } from 'lucide-react';
import WorkLocationInput, { type LiveCommuteStatus } from './WorkLocationInput';
import { BUDGET_MIN, BUDGET_MAX, BUDGET_STEP, MAX_MONTHLY_TRIPS } from '../lib/constants';
import type { BedroomCount, Priorities } from '../types';
import type { WorkLocationKey } from '../work-locations';
import type { SchoolGender, SchoolFaith } from '../data';

type WorkMode = 'preset' | 'address';
type CommuteSource = 'static' | 'live';
const PRIORITY_MAX = 5;

const PRIORITY_SLIDERS: { key: keyof Priorities; label: string; tip: string }[] = [
  { key: 'commute',  label: 'Commute', tip: 'Shorter commute = higher score' },
  { key: 'cost',     label: 'Cost',    tip: 'Lower total monthly cost = higher score' },
  { key: 'safety',   label: 'Safety',  tip: 'Lower crime rate = higher score' },
  { key: 'schools',  label: 'Schools', tip: 'Nearby school quality (Outstanding + Good) and choice, primary & secondary, plus grammar access = higher score' },
];

const SELECT_CLASS =
  'w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white';

interface Props {
  className?: string;
  workLocation: WorkLocationKey | '';
  setWorkLocation: (v: WorkLocationKey | '') => void;
  workMode: WorkMode;
  setWorkMode: (v: WorkMode) => void;
  commuteSource: CommuteSource;
  setCommuteSource: (v: CommuteSource) => void;
  commuteSource2: CommuteSource;
  setCommuteSource2: (v: CommuteSource) => void;
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
  childGender: SchoolGender;
  setChildGender: (g: SchoolGender) => void;
  schoolFaith: SchoolFaith;
  setSchoolFaith: (f: SchoolFaith) => void;
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
  commuteSource, setCommuteSource,
  commuteSource2, setCommuteSource2,
  workLocation2, setWorkLocation2,
  workMode2, setWorkMode2,
  bedrooms, setBedrooms,
  monthlyTrips, setMonthlyTrips,
  priorities, setPriorities,
  childGender, setChildGender,
  schoolFaith, setSchoolFaith,
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

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900 sm:p-4 ${className ?? 'mb-6'}`}>
      <div className="mb-4 flex items-center gap-3 xl:mb-3">
        <h2 className="min-w-0 flex-1 text-lg font-semibold flex items-center">
          <SlidersHorizontal className="h-5 w-5 mr-2 shrink-0 text-blue-600" />
          <span className="truncate">Your needs &amp; priorities</span>
        </h2>
      </div>

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
          source={commuteSource}
          setSource={setCommuteSource}
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
            source={commuteSource2}
            setSource={setCommuteSource2}
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
            title="Number of commute trips to your workplace each month — used to estimate transport cost."
          />
          <p className="col-start-2 -mt-1 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
            Commutes to your workplace per month (≈22 for a 5-day week).
          </p>
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

        {/* Child gender — only single-sex schools that match are counted in the Schools score. */}
        {priorities.schools > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Schools for a</span>
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
              {([['any', 'Any child'], ['boy', 'Son'], ['girl', 'Daughter']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setChildGender(val)}
                  aria-pressed={childGender === val}
                  className={`rounded px-2.5 py-1 font-semibold leading-none transition ${
                    childGender === val
                      ? 'bg-white text-blue-700 shadow-sm dark:bg-gray-900 dark:text-blue-300'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {childGender !== 'any' && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {childGender === 'boy' ? 'girls-only schools excluded' : 'boys-only schools excluded'}
              </span>
            )}
          </div>
        )}

        {/* Faith schools admit partly on religion, so they aren't realistically open to all — let
            families who can't access them drop faith schools from the Schools score. */}
        {priorities.schools > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Faith schools</span>
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
              {([['any', 'Include'], ['secular', 'Exclude']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSchoolFaith(val)}
                  aria-pressed={schoolFaith === val}
                  className={`rounded px-2.5 py-1 font-semibold leading-none transition ${
                    schoolFaith === val
                      ? 'bg-white text-blue-700 shadow-sm dark:bg-gray-900 dark:text-blue-300'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {schoolFaith === 'secular' && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">faith schools excluded</span>
            )}
          </div>
        )}
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
    </div>
  );
}
