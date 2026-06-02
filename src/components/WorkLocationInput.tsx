import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { workLocations, type WorkLocationKey } from '../work-locations';

const LONDON_BBOX = '-0.6,51.2,0.4,51.85';

const INPUT_CLASS =
  'w-full p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-sm';
const SELECT_CLASS =
  'w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm';
const SORTED_WORK_LOCATIONS = Object.entries(workLocations)
  .sort(([a], [b]) => a.localeCompare(b));
const LIVE_ACCENT_STYLES = {
  green: {
    border: 'border-green-400 dark:border-green-600',
    text: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500',
  },
  indigo: {
    border: 'border-indigo-400 dark:border-indigo-600',
    text: 'text-indigo-500 dark:text-indigo-400',
    dot: 'bg-indigo-500',
  },
} as const;

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    postcode?: string;
    type?: string;
  };
}

function formatSuggestion(f: PhotonFeature): string {
  const p = f.properties;
  const parts: string[] = [];
  if (p.name && p.name !== p.street) parts.push(p.name);
  if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`);
  else if (p.street) parts.push(p.street);
  if (p.city) parts.push(p.city);
  if (p.postcode) parts.push(p.postcode);
  return parts.length > 0 ? parts.join(', ') : (p.name ?? '');
}

export interface LiveCommuteStatus {
  loading: boolean;
  geocoding: boolean;
  progress: number;
  total: number;
  error: string | null;
  timesActive: boolean;
  onFetch: () => void;
}

interface Props {
  label: string;
  icon?: ReactNode;
  optional?: boolean;
  liveAccent?: keyof typeof LIVE_ACCENT_STYLES;
  mode: 'preset' | 'address';
  setMode: (m: 'preset' | 'address') => void;
  presetValue: WorkLocationKey | '';
  setPresetValue: (v: WorkLocationKey | '') => void;
  noneLabel: string;
  addressValue: string;
  setAddressValue: (v: string) => void;
  setAddressCoords: (c: { lat: string; lon: string } | null) => void;
  live: LiveCommuteStatus;
}

export default function WorkLocationInput({
  label, icon, optional,
  liveAccent = 'green',
  mode, setMode,
  presetValue, setPresetValue, noneLabel,
  addressValue, setAddressValue, setAddressCoords,
  live,
}: Props) {
  const [suggestions,        setSuggestions]        = useState<PhotonFeature[]>([]);
  const [showDropdown,       setShowDropdown]       = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [focusedIndex,       setFocusedIndex]       = useState(-1);

  useEffect(() => {
    if (mode !== 'address') { setSuggestions([]); setShowDropdown(false); return; }
    const q = addressValue.trim();
    if (q.length < 3) { setSuggestions([]); setShowDropdown(false); return; }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const qs = new URLSearchParams({ q, limit: '6', lang: 'en', bbox: LONDON_BBOX });
        const res = await fetch(`https://photon.komoot.io/api/?${qs}`);
        if (res.ok) {
          const data = await res.json() as { features: PhotonFeature[] };
          setSuggestions(data.features ?? []);
          setShowDropdown(true);
          setFocusedIndex(-1);
        }
      } catch { /* ignore */ }
      finally { setLoadingSuggestions(false); }
    }, 300);

    return () => clearTimeout(timer);
  }, [addressValue, mode]);

  const handleSelect = (feature: PhotonFeature) => {
    const [lon, lat] = feature.geometry.coordinates;
    setAddressValue(formatSuggestion(feature));
    setAddressCoords({ lat: String(lat), lon: String(lon) });
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setFocusedIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusedIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Escape')    { setShowDropdown(false); }
    else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && suggestions[focusedIndex]) handleSelect(suggestions[focusedIndex]);
      else { setShowDropdown(false); live.onFetch(); }
    }
  };

  const isBusy = live.loading || live.geocoding;
  const liveAccentStyles = LIVE_ACCENT_STYLES[liveAccent];

  return (
    <div>
      {/* Label row + mode toggle */}
      <div className="flex min-h-8 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
          {icon}{label}
          {optional && <span className="text-xs text-gray-400 font-normal ml-1">(optional)</span>}
        </label>
        <div className="flex w-fit rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-xs flex-shrink-0">
          <button
            type="button"
            onClick={() => setMode('preset')}
            className={`px-2.5 py-1 transition-colors ${
              mode === 'preset'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Quick pick
          </button>
          <button
            type="button"
            onClick={() => setMode('address')}
            className={`px-2.5 py-1 transition-colors border-l border-gray-300 dark:border-gray-600 ${
              mode === 'address'
                ? 'bg-blue-600 text-white border-l-blue-600'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Exact address
          </button>
        </div>
      </div>

      {mode === 'preset' ? (
        <select value={presetValue} onChange={e => setPresetValue(e.target.value as WorkLocationKey | '')} className={SELECT_CLASS}>
          <option value="">{noneLabel}</option>
          {SORTED_WORK_LOCATIONS.map(([loc, info]) => (
            <option key={loc} value={loc}>
              {loc} ({info.zone} - {info.station.replace(/ (Underground|Rail) Station$/, '')})
            </option>
          ))}
        </select>
      ) : (
        <div className="space-y-2">
          {/* Address input + fetch button */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="relative flex-1">
              <input
                type="text"
                value={addressValue}
                onChange={e => { setAddressValue(e.target.value); setAddressCoords(null); }}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                placeholder="e.g. EC2V 8RF or 1 Canada Square"
                autoComplete="off"
                className={`${INPUT_CLASS} ${
                  live.error
                    ? 'border-red-400 dark:border-red-600'
                    : live.timesActive
                      ? liveAccentStyles.border
                      : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {(showDropdown && suggestions.length > 0) || loadingSuggestions ? (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg overflow-hidden">
                  {loadingSuggestions && suggestions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Searching...</div>
                  ) : (
                    suggestions.map((feature, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); handleSelect(feature); }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                          i === focusedIndex
                            ? 'bg-blue-50 dark:bg-blue-900/40'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-800 dark:text-gray-200 leading-snug">
                          {formatSuggestion(feature)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <button
              onClick={live.onFetch}
              disabled={isBusy || !addressValue.trim()}
              className="w-full sm:w-auto px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {live.geocoding ? 'Locating...' : live.loading ? 'Calculating...' : 'Get times'}
            </button>
          </div>
          {/* Status */}
          {live.error && (
            <p className="text-xs text-red-500 dark:text-red-400">{live.error}</p>
          )}
          {(live.loading || live.timesActive) && (
            <div className="flex items-center gap-3">
              {live.loading && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {live.progress}/{live.total} routes
                </span>
              )}
              {live.timesActive && (
                <span className={`text-xs ${liveAccentStyles.text} flex items-center gap-1.5`}>
                  <span className={`w-2 h-2 rounded-full ${liveAccentStyles.dot} inline-block`} />
                  Live times active
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
