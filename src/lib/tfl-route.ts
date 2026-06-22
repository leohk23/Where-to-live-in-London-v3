// Shared by the live fetch (useCalculator) and the offline matrix generator
// (scripts/fetch-tfl-commutes.ts) so static and live routes are summarised identically.

export interface TflLeg {
  mode?: { id?: string; name?: string };
  routeOptions?: Array<{ name?: string }>;
}

export interface TflJourney {
  duration?: number;
  legs?: TflLeg[];
}

// Human-friendly fallback when a leg has no named line (DLR/rail return a mode, not a line).
const MODE_LABEL: Record<string, string> = {
  'national-rail': 'National Rail',
  'elizabeth-line': 'Elizabeth line',
  overground: 'Overground',
  dlr: 'DLR',
  tram: 'Tram',
  tube: 'Tube',
};

// "Victoria → Central" from a journey's non-walking legs, in order. null if nothing to show.
export function summariseRoute(journey?: TflJourney): string | null {
  const parts = (journey?.legs ?? [])
    .filter(leg => leg.mode?.id && leg.mode.id !== 'walking')
    .map(leg => leg.routeOptions?.find(o => o.name)?.name || MODE_LABEL[leg.mode?.id ?? ''] || leg.mode?.name || '')
    .filter(Boolean);
  return parts.length ? parts.join(' → ') : null;
}
