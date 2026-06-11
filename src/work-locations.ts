export interface WorkLocation {
  zone: string;
  description: string;
  station: string;
  coords: { lat: number; lon: number };
}

export const workLocations: Record<string, WorkLocation> = {
  "City of London":  { zone: "Zone 1", description: "Financial district", station: "Bank Underground Station", coords: { lat: 51.5133, lon: -0.0886 } },
  "Canary Wharf":    { zone: "Zone 2", description: "Business district",  station: "Canary Wharf Underground Station", coords: { lat: 51.5051, lon: -0.0195 } },
  "King's Cross":    { zone: "Zone 1", description: "Tech hub",           station: "King's Cross St. Pancras Underground Station", coords: { lat: 51.5304, lon: -0.1238 } },
  "Shoreditch":      { zone: "Zone 1", description: "Creative district",  station: "Shoreditch High Street Rail Station", coords: { lat: 51.5232, lon: -0.0757 } },
  "Westminster":     { zone: "Zone 1", description: "Government area",    station: "Westminster Underground Station", coords: { lat: 51.5010, lon: -0.1254 } },
  "South Bank":      { zone: "Zone 1", description: "Cultural district",  station: "Waterloo Underground Station", coords: { lat: 51.5031, lon: -0.1132 } },
  "Paddington":      { zone: "Zone 1", description: "Transport hub",      station: "Paddington Underground Station", coords: { lat: 51.5154, lon: -0.1755 } },
  "Victoria":        { zone: "Zone 1", description: "Business area",      station: "Victoria Underground Station", coords: { lat: 51.4965, lon: -0.1447 } },
  "Liverpool Street":{ zone: "Zone 1", description: "Financial area",     station: "Liverpool Street Underground Station", coords: { lat: 51.5178, lon: -0.0823 } },
  "Oxford Circus":   { zone: "Zone 1", description: "Shopping & media",   station: "Oxford Circus Underground Station", coords: { lat: 51.5152, lon: -0.1418 } },
  "Green Park":      { zone: "Zone 1", description: "Royal park",         station: "Green Park Underground Station", coords: { lat: 51.5067, lon: -0.1428 } },
  "South Kensington":{ zone: "Zone 1", description: "Museums & Imperial", station: "South Kensington Underground Station", coords: { lat: 51.4941, lon: -0.1738 } },
  "Holborn":         { zone: "Zone 1", description: "Legal & media",      station: "Holborn Underground Station", coords: { lat: 51.5174, lon: -0.1200 } },
  "London Bridge":   { zone: "Zone 1", description: "Finance & Shard",    station: "London Bridge Underground Station", coords: { lat: 51.5049, lon: -0.0863 } },
  "Hammersmith":     { zone: "Zone 2", description: "BBC & Sky offices",   station: "Hammersmith Underground Station", coords: { lat: 51.4923, lon: -0.2240 } },
  "Stratford":       { zone: "Zone 2", description: "Olympic Park & east", station: "Stratford Underground Station", coords: { lat: 51.5416, lon: -0.0042 } },
  "Euston":          { zone: "Zone 1", description: "UCL & biomedical",   station: "Euston Underground Station", coords: { lat: 51.5282, lon: -0.1337 } },
};

export type WorkLocationKey = keyof typeof workLocations;
