import { trainInterval } from '../data/service-frequency';
import locationTransit from '../data/location-transit.json';

type Mode = 'tube' | 'overground' | 'elizabeth-line' | 'dlr' | 'tram' | 'national-rail';

// Typical PEAK minutes between trains by boarding mode. National Rail is the variable one and
// uses each location's curated figure when we have it (see service-frequency.ts); the value
// here is the fallback for stations not flagged as infrequent (typically frequent interchanges).
const MODE_PEAK_HEADWAY: Record<Mode, number> = {
  tube: 4,
  'elizabeth-line': 5,
  dlr: 5,
  overground: 8,
  tram: 8,
  'national-rail': 10,
};

const TUBE_LINES = new Set(['Bakerloo', 'Central', 'Circle', 'District', 'Hammersmith & City', 'Jubilee', 'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'Waterloo & City', 'Tube']);
const OVERGROUND_LINES = new Set(['Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush', 'Overground', 'London Overground']);

// Map a route line/operator name (as produced by summariseRoute) to its transport mode.
function lineToMode(line: string): Mode {
  if (TUBE_LINES.has(line)) return 'tube';
  if (OVERGROUND_LINES.has(line)) return 'overground';
  if (line === 'Elizabeth line') return 'elizabeth-line';
  if (line === 'DLR') return 'dlr';
  if (line === 'Tram' || line === 'London Trams') return 'tram';
  return 'national-rail'; // SWR, Southern, Southeastern, Thameslink, "National Rail", …
}

function headwayForMode(location: string, mode: Mode): number {
  const explicit = trainInterval[location]?.peak;
  if ((mode === 'national-rail' || mode === 'overground') && explicit != null) return explicit;
  if (mode === 'national-rail') return MODE_PEAK_HEADWAY['national-rail'];
  return MODE_PEAK_HEADWAY[mode];
}

// Headway from the location's most frequent mode, for when the route's first leg isn't known.
function primaryHeadway(location: string): number {
  const explicit = trainInterval[location]?.peak;
  if (explicit != null) return explicit;
  const primary = ((locationTransit as Record<string, string[]>)[location] ?? [])[0] as Mode | undefined;
  return primary ? headwayForMode(location, primary) : MODE_PEAK_HEADWAY['national-rail'];
}

// Expected platform wait (~half the gap between trains). When the journey's route is known it
// keys off the FIRST leg's mode, so a tube trip and a train trip from the same multi-modal
// station get different waits; otherwise it falls back to the location's most frequent mode.
export function expectedWaitMinutes(location: string, route?: string | null): number {
  const firstLeg = route ? route.split(' → ')[0] : null;
  const headway = firstLeg ? headwayForMode(location, lineToMode(firstLeg)) : primaryHeadway(location);
  return Math.round(headway / 2);
}

// Fixed minutes lost to a single change: walking between platforms, finding the next service,
// re-tapping. On top of the wait for the next train.
const INTERCHANGE_HASSLE_MIN = 4;

// Time cost of the CHANGES in a journey, so a direct 35-min trip beats a 35-min trip with two
// changes. Route legs (summariseRoute) are the non-walking boardings, so changes = legs - 1;
// each change after the first adds hassle plus the platform wait for that leg's mode.
// ponytail: interchange hubs are usually frequent, so this uses the mode's default headway
// (not the origin's curated figure) — refine per-interchange only if it proves too coarse.
export function interchangeWaitMinutes(route?: string | null): number {
  if (!route) return 0;
  const legs = route.split(' → ');
  let total = 0;
  for (let i = 1; i < legs.length; i += 1) {
    total += INTERCHANGE_HASSLE_MIN + Math.round(MODE_PEAK_HEADWAY[lineToMode(legs[i])] / 2);
  }
  return total;
}
