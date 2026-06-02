import { commuteTimesLastRun } from '../commute-times';
import { datasetGeography } from '../lib/dataset-geography';
import type { ScoredResult } from '../types';

interface Props {
  sortedResults: ScoredResult[];
}

export default function NotesFooter({ sortedResults }: Props) {
  const minFare = Math.min(...sortedResults.map(r => r.farePerTrip));
  const maxFare = Math.max(...sortedResults.map(r => r.farePerTrip));
  const lastUpdated = commuteTimesLastRun
    ? new Date(commuteTimesLastRun).toLocaleString()
    : 'unknown';
  const geographySummary = datasetGeography
    .map(item => `${item.label}: ${item.geography}`)
    .join('; ');

  return (
    <div className="mt-6 p-4 bg-blue-50 dark:bg-gray-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 space-y-1">
      <p><strong>Transport:</strong> Costs range from &pound;{minFare.toFixed(2)} to &pound;{maxFare.toFixed(2)} per trip depending on zones.</p>
      <p><strong>Council tax:</strong> Rates are based on 2025/26 Band D figures (including GLA precept), scaled by bedroom count.</p>
      <p><strong>Rent:</strong> Sourced from ONS Private Rental Market Statistics (January 2026 release) and Hutch/Joinhutch asking-rent data.</p>
      <p><strong>Crime:</strong> Borough-level crimes per 1,000 residents, 2024/25 (Met Police). London average is 106/k; green &lt;= 90, yellow &lt;= 120, orange &lt;= 150, red &gt; 150.</p>
      <p><strong>Schools:</strong> Outstanding state schools from Ofsted (April 2026): primary schools are counted within 3km of each location anchor; secondary and grammar/selective schools are counted within 5km. Grammar/selective counts use Ofsted admissions policy = Selective. Girls-only/boys-only labels are shown when explicit in the school name. Displayed as count and % of nearby primary/secondary schools; green &gt;= 20%, yellow &gt;= 10%, red &lt; 10%.</p>
      <p><strong>Commute times:</strong> From TfL Journey Planner (09:00 Mon), home station to work station. Last updated {lastUpdated}.</p>
      <p><strong>Geography:</strong> Locations are station-centric anchors. {geographySummary}. Header badges show each metric's current source geography.</p>
      <p><strong>Score:</strong> Weighted composite 0-100 based on your priority sliders. All dimensions normalised relative to the current result set.</p>
      <p><strong>Live commute times:</strong> Calculated on demand via TfL Journey Planner. Address geocoding uses <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap contributors</a>.</p>
    </div>
  );
}
