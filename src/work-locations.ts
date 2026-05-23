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
};

export type WorkLocationKey = keyof typeof workLocations;
