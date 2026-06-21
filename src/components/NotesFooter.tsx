import type { ReactNode } from 'react';
import { commuteTimesLastRun } from '../commute-times';
import { datasetGeography } from '../lib/dataset-geography';
import type { ScoredResult } from '../types';

interface Props {
  sortedResults: ScoredResult[];
}

interface SourceRow {
  label: string;
  source: ReactNode;
  availability: ReactNode;
  level: string;
}

export function NotesContent({ sortedResults }: Props) {
  const fares = sortedResults.map(r => r.farePerTrip);
  const minFare = fares.length ? Math.min(...fares) : null;
  const maxFare = fares.length ? Math.max(...fares) : null;
  const lastUpdated = commuteTimesLastRun
    ? new Date(commuteTimesLastRun).toLocaleString()
    : 'Unknown';
  const geographySummary = datasetGeography
    .map(item => `${item.label}: ${item.geography}`)
    .join('; ');
  const sourceRows: SourceRow[] = [
    {
      label: 'Rent',
      source: 'ONS Private Rental Market Statistics; Hutch / Joinhutch asking-rent data',
      availability: 'ONS January 2026 release; asking-rent snapshot in app data',
      level: 'Location-level market estimate',
    },
    {
      label: 'Commute',
      source: 'TfL Journey Planner',
      availability: <>Static matrix refreshed {lastUpdated}; live times calculated on demand</>,
      level: 'Station or exact-address journey',
    },
    {
      label: 'Transport',
      source: 'TfL fare-zone estimate',
      availability: 'Fare-zone assumptions held in app data',
      level: 'Fare zone',
    },
    {
      label: 'Council tax',
      source: 'Borough Band D council tax rates, including GLA precept',
      availability: '2025/26 tax year',
      level: 'Borough',
    },
    {
      label: 'Crime',
      source: 'Met Police borough crime totals per 1,000 residents',
      availability: '2024/25',
      level: 'Borough',
    },
    {
      label: 'Hongkongese & East Asian spots',
      source: 'Hand-curated by the author, initially seeded from OpenStreetMap',
      availability: 'Curated list held in app data',
      level: 'Within ~1.75km walk of each location anchor',
    },
    {
      label: 'Schools',
      source: 'Ofsted state-school inspection data',
      availability: 'Latest inspections as at 30 April 2026',
      level: '3km primary / 5km secondary radius around each location anchor',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-blue-200 bg-white/70 px-3 py-2 text-blue-900 dark:border-blue-400/20 dark:bg-white/5 dark:text-blue-100">
        No personal data or user input is collected by the author or stored on a server through this web app. Shared links can include selected filters in the URL, and live commute results may be cached temporarily in your browser session.
      </p>

      <div className="overflow-x-auto rounded-lg border border-blue-200 dark:border-blue-400/20">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-blue-100/70 text-blue-950 dark:bg-slate-900/70 dark:text-blue-100">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">Data set</th>
              <th className="min-w-44 px-3 py-2 font-semibold">Data source</th>
              <th className="min-w-44 px-3 py-2 font-semibold">Last refreshed / availability</th>
              <th className="min-w-40 px-3 py-2 font-semibold">Location level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100 dark:divide-blue-400/10">
            {sourceRows.map(row => (
              <tr key={row.label} className="bg-white/50 dark:bg-slate-950/20">
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-blue-950 dark:text-blue-100">{row.label}</td>
                <td className="px-3 py-2">{row.source}</td>
                <td className="px-3 py-2">{row.availability}</td>
                <td className="px-3 py-2">{row.level}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 text-xs leading-relaxed">
        <p><strong>Transport:</strong> {minFare !== null && maxFare !== null ? <>Costs range from &pound;{minFare.toFixed(2)} to &pound;{maxFare.toFixed(2)} per trip depending on zones.</> : 'Costs depend on selected areas and fare zones.'}</p>
        <p><strong>Crime bands:</strong> London average is 106/k; green &lt;= 90, yellow &lt;= 120, orange &lt;= 150, red &gt; 150.</p>
        <p><strong>Schools:</strong> Grammar/selective counts use Ofsted admissions policy = Selective. Girls-only/boys-only labels are shown when explicit in the school name. School colour bands use the nearby Outstanding share: green &gt;= 20%, yellow &gt;= 10%, red &lt; 10%.</p>
        <p><strong>Geography:</strong> Locations are station-centric anchors. {geographySummary}. Header badges show each metric's current source geography.</p>
        <p><strong>Live commute times:</strong> Address geocoding uses <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>.</p>
      </div>

      <div className="space-y-2 rounded-md border border-blue-200 bg-white/70 px-3 py-2 text-xs leading-relaxed text-blue-900 dark:border-blue-400/20 dark:bg-white/5 dark:text-blue-100">
        <p>Published on <a className="underline" href="https://leohk23.github.io/Where-to-live-in-London-v3/" target="_blank" rel="noopener noreferrer">GitHub Pages</a>.</p>
        <p><strong>Author:</strong> Leo L.</p>
        <p>
          <strong>Email:</strong>{' '}
          <a className="underline" href="mailto:leohk23@gmail.com">
            leohk23@gmail.com
          </a>
        </p>
      </div>
    </div>
  );
}

export default function NotesFooter({ sortedResults }: Props) {
  return (
    <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-gray-800 dark:text-blue-300">
      <NotesContent sortedResults={sortedResults} />
    </div>
  );
}
