import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { ScoredResult } from '../types';

interface Props {
  sortedResults: ScoredResult[];
  anyPriority: boolean;
}

interface Coordinate {
  lat: number;
  lon: number;
}

const MAP_WIDTH = 620;
const MAP_HEIGHT = 360;
const MAP_BOUNDS = {
  minLat: 51.315,
  maxLat: 51.405,
  minLon: -0.255,
  maxLon: -0.115,
};

const SAMPLE_POLYGON = {
  location: 'Sutton',
  label: 'Sutton',
  note: 'Prototype polygon',
  anchor: { lat: 51.3594, lon: -0.1919 },
  polygon: [
    { lat: 51.379, lon: -0.222 },
    { lat: 51.388, lon: -0.197 },
    { lat: 51.381, lon: -0.163 },
    { lat: 51.362, lon: -0.139 },
    { lat: 51.341, lon: -0.151 },
    { lat: 51.328, lon: -0.183 },
    { lat: 51.338, lon: -0.220 },
    { lat: 51.356, lon: -0.238 },
  ],
};

const CONTEXT_POINTS = [
  { label: 'Cheam', lat: 51.355, lon: -0.216 },
  { label: 'Wimbledon', lat: 51.421, lon: -0.206 },
  { label: 'Croydon', lat: 51.376, lon: -0.098 },
  { label: 'Morden', lat: 51.402, lon: -0.194 },
];

function project(point: Coordinate) {
  const x = ((point.lon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) * MAP_WIDTH;
  const y = ((MAP_BOUNDS.maxLat - point.lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * MAP_HEIGHT;
  return { x, y };
}

function polygonPoints(points: Coordinate[]) {
  return points.map(point => {
    const projected = project(point);
    return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
  }).join(' ');
}

function money(value: number) {
  return `£${Math.round(value).toLocaleString()}`;
}

function formatCommute(value: number | null) {
  return value === null ? '?' : `${value} min`;
}

export default function LocationMapPrototype({ sortedResults, anyPriority }: Props) {
  const [activeLocation, setActiveLocation] = useState<string | null>(null);
  const result = sortedResults.find(item => item.location === SAMPLE_POLYGON.location);
  if (!result) return null;

  const isActive = activeLocation === SAMPLE_POLYGON.location;
  const anchor = project(SAMPLE_POLYGON.anchor);
  const polygon = polygonPoints(SAMPLE_POLYGON.polygon);

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Location explorer</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">One sample polygon using the current calculator result.</p>
        </div>
        <span className="rounded bg-teal-100 px-2 py-1 text-xs font-medium text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">
          Polygon prototype
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          <button
            type="button"
            onMouseEnter={() => setActiveLocation(SAMPLE_POLYGON.location)}
            onMouseLeave={() => setActiveLocation(null)}
            onFocus={() => setActiveLocation(SAMPLE_POLYGON.location)}
            onBlur={() => setActiveLocation(null)}
            className={`w-full rounded-md border p-3 text-left transition-colors ${
              isActive
                ? 'border-teal-400 bg-teal-50 shadow-sm dark:border-teal-500/60 dark:bg-teal-500/10'
                : 'border-gray-200 bg-gray-50 hover:border-teal-300 hover:bg-teal-50/60 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-teal-500/50 dark:hover:bg-teal-500/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                  <MapPin className="h-4 w-4 text-teal-600 dark:text-teal-300" />
                  {result.displayName}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{result.borough} · {result.zone}</div>
              </div>
              {anyPriority ? (
                <span className="rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                  {result.compositeScore}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="font-medium text-gray-400 dark:text-gray-500">Total</div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">{money(result.totalMonthly)}</div>
              </div>
              <div>
                <div className="font-medium text-gray-400 dark:text-gray-500">Commute</div>
                <div>{formatCommute(result.commuteTime)}</div>
              </div>
              <div>
                <div className="font-medium text-gray-400 dark:text-gray-500">Schools</div>
                <div>{result.outstandingSchoolsPct === null ? '?' : `${result.outstandingSchoolsPct}%`}</div>
              </div>
              <div>
                <div className="font-medium text-gray-400 dark:text-gray-500">Crime</div>
                <div>{result.crimeRate === null ? '?' : `${result.crimeRate}/k`}</div>
              </div>
            </div>
          </button>
        </div>

        <div
          className="overflow-hidden rounded-md border border-gray-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-950"
          onMouseEnter={() => setActiveLocation(SAMPLE_POLYGON.location)}
          onMouseLeave={() => setActiveLocation(null)}
        >
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="img" aria-label="Prototype map with Sutton polygon" className="block h-72 w-full sm:h-80">
            <defs>
              <pattern id="prototype-grid" width="46" height="46" patternUnits="userSpaceOnUse">
                <path d="M 46 0 L 0 0 0 46" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-slate-800" />
              </pattern>
              <filter id="polygon-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity="0.18" />
              </filter>
            </defs>
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="currentColor" className="text-slate-50 dark:text-gray-950" />
            <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#prototype-grid)" opacity="0.65" />
            <path
              d="M 0 238 C 95 214 164 225 236 201 S 374 153 456 168 548 205 620 180"
              fill="none"
              stroke="currentColor"
              strokeWidth="16"
              strokeLinecap="round"
              className="text-sky-100 dark:text-sky-950"
            />
            <path
              d="M 32 296 C 111 252 190 268 269 224 S 413 181 496 216"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="9 9"
              className="text-slate-300 dark:text-slate-700"
            />
            <polygon
              points={polygon}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={isActive ? 5 : 3}
              className={isActive ? 'text-teal-400/70 stroke-teal-700 dark:text-teal-400/50 dark:stroke-teal-200' : 'text-teal-300/35 stroke-teal-600 dark:text-teal-500/20 dark:stroke-teal-300'}
              filter={isActive ? 'url(#polygon-shadow)' : undefined}
            />
            <circle cx={anchor.x} cy={anchor.y} r={isActive ? 8 : 6} fill="currentColor" className="text-white dark:text-gray-950" />
            <circle cx={anchor.x} cy={anchor.y} r={isActive ? 5 : 4} fill="currentColor" className="text-teal-700 dark:text-teal-200" />
            <text x={anchor.x + 10} y={anchor.y - 8} className="fill-slate-900 text-[13px] font-semibold dark:fill-slate-100">
              {SAMPLE_POLYGON.label}
            </text>
            <text x={anchor.x + 10} y={anchor.y + 9} className="fill-slate-500 text-[10px] dark:fill-slate-400">
              {SAMPLE_POLYGON.note}
            </text>
            {CONTEXT_POINTS.map(point => {
              const projected = project(point);
              return (
                <g key={point.label} opacity={point.label === 'Croydon' ? 0.55 : 0.7}>
                  <circle cx={projected.x} cy={projected.y} r="3" fill="currentColor" className="text-slate-400 dark:text-slate-600" />
                  <text x={projected.x + 6} y={projected.y + 4} className="fill-slate-500 text-[10px] dark:fill-slate-500">
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
