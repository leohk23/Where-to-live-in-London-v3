// Official TfL line colours, keyed by the line names summariseRoute() produces.
const LINE_COLORS: Record<string, string> = {
  Bakerloo: '#B36305',
  Central: '#E32017',
  Circle: '#FFD300',
  District: '#00782A',
  'Hammersmith & City': '#F3A9BB',
  Jubilee: '#A0A5A9',
  Metropolitan: '#9B0056',
  Northern: '#000000',
  Piccadilly: '#003688',
  Victoria: '#0098D4',
  'Waterloo & City': '#95CDBA',
  'Elizabeth line': '#6950A1',
  DLR: '#00A4A7',
  Tram: '#84B817',
  // Overground — the six named lines (Nov 2024) plus the legacy single brand.
  Liberty: '#5D6061',
  Lioness: '#FAA61A',
  Mildmay: '#0077AD',
  Suffragette: '#18A95D',
  Weaver: '#823A62',
  Windrush: '#ED1B00',
  Overground: '#EE7C0E',
  'London Overground': '#EE7C0E',
  'National Rail': '#6F777D',
};

const FALLBACK = '#6F777D';

// Pick black or white text for legibility on the given background.
function readableText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

export function lineColor(name: string): { bg: string; fg: string } {
  const bg = LINE_COLORS[name] ?? FALLBACK;
  return { bg, fg: readableText(bg) };
}
