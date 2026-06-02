export interface WorkLocation {
  zone: string;
  description: string;
  station: string;
}

export const workLocations: Record<string, WorkLocation> = {
  "City of London":  { zone: "Zone 1", description: "Financial district", station: "Bank Underground Station" },
  "Canary Wharf":    { zone: "Zone 2", description: "Business district",  station: "Canary Wharf Underground Station" },
  "King's Cross":    { zone: "Zone 1", description: "Tech hub",           station: "King's Cross St. Pancras Underground Station" },
  "Shoreditch":      { zone: "Zone 1", description: "Creative district",  station: "Shoreditch High Street Rail Station" },
  "Westminster":     { zone: "Zone 1", description: "Government area",    station: "Westminster Underground Station" },
  "South Bank":      { zone: "Zone 1", description: "Cultural district",  station: "Waterloo Underground Station" },
  "Paddington":      { zone: "Zone 1", description: "Transport hub",      station: "Paddington Underground Station" },
  "Victoria":        { zone: "Zone 1", description: "Business area",      station: "Victoria Underground Station" },
  "Liverpool Street":{ zone: "Zone 1", description: "Financial area",     station: "Liverpool Street Underground Station" },
  "Oxford Circus":   { zone: "Zone 1", description: "Shopping & media",   station: "Oxford Circus Underground Station" },
  "Green Park":      { zone: "Zone 1", description: "Royal park",         station: "Green Park Underground Station" },
  "South Kensington":{ zone: "Zone 1", description: "Museums & Imperial", station: "South Kensington Underground Station" },
  "Holborn":         { zone: "Zone 1", description: "Legal & media",      station: "Holborn Underground Station" },
  "London Bridge":   { zone: "Zone 1", description: "Finance & Shard",    station: "London Bridge Underground Station" },
  "Hammersmith":     { zone: "Zone 2", description: "BBC & Sky offices",   station: "Hammersmith Underground Station" },
  "Stratford":       { zone: "Zone 2", description: "Olympic Park & east", station: "Stratford Underground Station" },
  "Euston":          { zone: "Zone 1", description: "UCL & biomedical",   station: "Euston Underground Station" },
};

export type WorkLocationKey = keyof typeof workLocations;
