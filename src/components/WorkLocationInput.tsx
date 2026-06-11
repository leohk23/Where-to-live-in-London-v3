import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { workLocations, type WorkLocationKey } from '../work-locations';

const LONDON_BBOX = '-0.6,51.2,0.4,51.85';
const LONDON_VIEWBOX = '-0.6,51.85,0.4,51.2';

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

interface NominatimResult {
  display_name?: string;
  lat: string;
  lon: string;
  name?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    postcode?: string;
  };
}

interface AddressSuggestion {
  label: string;
  lat: string;
  lon: string;
}

function formatPhotonSuggestion(f: PhotonFeature): string {
  const p = f.properties;
  const parts: string[] = [];
  if (p.name && p.name !== p.street) parts.push(p.name);
  if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`);
  else if (p.street) parts.push(p.street);
  if (p.city) parts.push(p.city);
  if (p.postcode) parts.push(p.postcode);
  return parts.length > 0 ? parts.join(', ') : (p.name ?? '');
}

function formatNominatimSuggestion(result: NominatimResult): string {
  const address = result.address;
  const street = [address?.house_number, address?.road].filter(Boolean).join(' ');
  const locality = address?.suburb ?? address?.city ?? address?.town;
  const parts = [result.name, street, locality, address?.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : (result.display_name ?? '');
}

function uniqueSuggestions(suggestions: AddressSuggestion[]): AddressSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter(suggestion => {
    const key = suggestion.label.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAddressQueryVariants(query: string): string[] {
  const variants = [query.trim()];
  const addVariant = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !variants.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
      variants.push(trimmed);
    }
  };

  addVariant(query.replace(/\band\b/gi, '&'));
  addVariant(query.replace(/&/g, 'and'));

  for (const variant of [...variants]) {
    if (!/\blondon\b/i.test(variant)) addVariant(`${variant}, London`);
  }

  return variants;
}

async function fetchPhotonSuggestions(q: string): Promise<AddressSuggestion[]> {
  const qs = new URLSearchParams({ q, limit: '6', lang: 'en', bbox: LONDON_BBOX });
  const res = await fetch(`https://photon.komoot.io/api/?${qs}`);
  if (!res.ok) return [];
  const data = await res.json() as { features?: PhotonFeature[] };
  return (data.features ?? []).map(feature => {
    const [lon, lat] = feature.geometry.coordinates;
    return {
      label: formatPhotonSuggestion(feature),
      lat: String(lat),
      lon: String(lon),
    };
  });
}

async function fetchNominatimSuggestions(q: string): Promise<AddressSuggestion[]> {
  const qs = new URLSearchParams({
    q,
    countrycodes: 'gb',
    limit: '6',
    format: 'json',
    addressdetails: '1',
    viewbox: LONDON_VIEWBOX,
    bounded: '1',
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`);
  if (!res.ok) return [];
  const data = await res.json() as NominatimResult[];
  return data.map(result => ({
    label: formatNominatimSuggestion(result),
    lat: result.lat,
    lon: result.lon,
  }));
}

async function fetchAddressSuggestions(q: string): Promise<AddressSuggestion[]> {
  const variants = getAddressQueryVariants(q);

  for (const variant of variants) {
    try {
      const photonSuggestions = await fetchPhotonSuggestions(variant);
      if (photonSuggestions.length > 0) return uniqueSuggestions(photonSuggestions);
    } catch {
      // Browser/CORS failures should not make the dropdown unusable.
      break;
    }
  }

  for (const variant of variants) {
    try {
      const nominatimSuggestions = await fetchNominatimSuggestions(variant);
      if (nominatimSuggestions.length > 0) return uniqueSuggestions(nominatimSuggestions);
    } catch {
      return [];
    }
  }

  return [];
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
  labelAction?: ReactNode;
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
  label, icon, labelAction, optional,
  liveAccent = 'green',
  mode, setMode,
  presetValue, setPresetValue, noneLabel,
  addressValue, setAddressValue, setAddressCoords,
  live,
}: Props) {
  const [suggestions,        setSuggestions]        = useState<AddressSuggestion[]>([]);
  const [showDropdown,       setShowDropdown]       = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [hasSearched,        setHasSearched]        = useState(false);
  const [focusedIndex,       setFocusedIndex]       = useState(-1);
  const selectedSuggestionRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'address') {
      setSuggestions([]);
      setShowDropdown(false);
      setLoadingSuggestions(false);
      setHasSearched(false);
      return;
    }

    const q = addressValue.trim();
    if (q.length < 3 || q === selectedSuggestionRef.current) {
      setSuggestions([]);
      setShowDropdown(false);
      setLoadingSuggestions(false);
      setHasSearched(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      setHasSearched(false);
      try {
        const nextSuggestions = await fetchAddressSuggestions(q);
        if (cancelled) return;
        setSuggestions(nextSuggestions);
        setShowDropdown(true);
        setFocusedIndex(-1);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setShowDropdown(true);
        }
      }
      finally {
        if (!cancelled) {
          setLoadingSuggestions(false);
          setHasSearched(true);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addressValue, mode]);

  const handleSelect = (suggestion: AddressSuggestion) => {
    const formatted = suggestion.label;
    selectedSuggestionRef.current = formatted.trim();
    setAddressValue(formatted);
    setAddressCoords({ lat: suggestion.lat, lon: suggestion.lon });
    setShowDropdown(false);
    setSuggestions([]);
    setHasSearched(false);
  };

  const handleAddressChange = (value: string) => {
    selectedSuggestionRef.current = null;
    setAddressValue(value);
    setAddressCoords(null);
    setSuggestions([]);
    setHasSearched(false);
    setShowDropdown(value.trim().length >= 3);
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
    <div className="grid gap-y-2">
      {/* Label row + mode toggle */}
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            {icon}{label}
            {optional && <span className="text-xs text-gray-400 font-normal ml-1">(optional)</span>}
          </label>
          {labelAction}
        </div>
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
                onChange={e => handleAddressChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onFocus={() => {
                  if (addressValue.trim().length >= 3 && addressValue.trim() !== selectedSuggestionRef.current) {
                    setShowDropdown(true);
                  }
                }}
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
              {showDropdown && (loadingSuggestions || suggestions.length > 0 || hasSearched) ? (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg overflow-hidden">
                  {loadingSuggestions && suggestions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Searching...</div>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); handleSelect(suggestion); }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                          i === focusedIndex
                            ? 'bg-blue-50 dark:bg-blue-900/40'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-800 dark:text-gray-200 leading-snug">
                          {suggestion.label}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">No suggestions found</div>
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
