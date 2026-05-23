export type BedroomCount = 1 | 2 | 3 | 4;

export interface LocationInfo {
  borough: string;
  rent: Record<BedroomCount, number>;
  transportFare: number;
  zone: string;
  station: string;
}

export const locationData: Record<string, LocationInfo> = {
  "Brixton": {
    borough: "Lambeth",
    zone: "Zone 2",
    station: "Brixton Underground Station",
    rent: { 1: 2000, 2: 2572, 3: 3200, 4: 4000 },
    transportFare: 3.50,
  },
  "Fulham": {
    borough: "Hammersmith and Fulham",
    zone: "Zone 2",
    station: "Fulham Broadway Underground Station",
    rent: { 1: 1500, 2: 1922, 3: 2400, 4: 3000 },
    transportFare: 3.50,
  },
  "Tooting": {
    borough: "Wandsworth",
    zone: "Zone 3",
    station: "Tooting Broadway Underground Station",
    rent: { 1: 1300, 2: 1650, 3: 2100, 4: 2600 },
    transportFare: 5.05,
  },
  "Sutton": {
    borough: "Sutton",
    zone: "Zone 5",
    station: "Sutton (London) Rail Station",
    rent: { 1: 1500, 2: 1909, 3: 2400, 4: 3000 },
    transportFare: 5.05,
  },
  "New Malden": {
    borough: "Kingston upon Thames",
    zone: "Zone 4",
    station: "New Malden Rail Station",
    rent: { 1: 1900, 2: 2409, 3: 3000, 4: 3750 },
    transportFare: 5.05,
  },
  "Wimbledon": {
    borough: "Merton",
    zone: "Zone 3",
    station: "Wimbledon Underground Station",
    rent: { 1: 1550, 2: 1979, 3: 2500, 4: 3100 },
    transportFare: 3.50,
  },
  "Richmond": {
    borough: "Richmond upon Thames",
    zone: "Zone 4",
    station: "Richmond (London) Rail Station",
    rent: { 1: 1650, 2: 2098, 3: 2650, 4: 3300 },
    transportFare: 5.05,
  },
  "Ealing": {
    borough: "Ealing",
    zone: "Zone 3",
    station: "Ealing Broadway Underground Station",
    rent: { 1: 1550, 2: 1957, 3: 2450, 4: 3050 },
    transportFare: 3.50,
  },
  "Hounslow": {
    borough: "Hounslow",
    zone: "Zone 4",
    station: "Hounslow Central Underground Station",
    rent: { 1: 1450, 2: 1845, 3: 2300, 4: 2900 },
    transportFare: 6.00,
  },
  "Croydon": {
    borough: "Croydon",
    zone: "Zone 5",
    station: "East Croydon Rail Station",
    rent: { 1: 1200, 2: 1541, 3: 1950, 4: 2450 },
    transportFare: 5.05,
  },
  "Wimbledon Park": {
    borough: "Merton",
    zone: "Zone 3",
    station: "Wimbledon Park Underground Station",
    rent: { 1: 1600, 2: 2025, 3: 2550, 4: 3200 },
    transportFare: 3.50,
  },
  "High Barnet": {
    borough: "Barnet",
    zone: "Zone 5",
    station: "High Barnet Underground Station",
    rent: { 1: 1450, 2: 1850, 3: 2350, 4: 2950 },
    transportFare: 6.00,
  },
  "Sutton Cheam": {
    borough: "Sutton",
    zone: "Zone 5",
    station: "Cheam Rail Station",
    rent: { 1: 1300, 2: 1650, 3: 2100, 4: 2600 },
    transportFare: 5.05,
  },
  "Acton Common": {
    borough: "Ealing",
    zone: "Zone 2",
    station: "Acton Town Underground Station",
    rent: { 1: 1450, 2: 1850, 3: 2350, 4: 2950 },
    transportFare: 3.50,
  },
  "South Ealing": {
    borough: "Ealing",
    zone: "Zone 3",
    station: "South Ealing Underground Station",
    rent: { 1: 1450, 2: 1850, 3: 2350, 4: 2950 },
    transportFare: 3.50,
  },
  "Southfields": {
    borough: "Wandsworth",
    zone: "Zone 3",
    station: "Southfields Underground Station",
    rent: { 1: 1700, 2: 2150, 3: 2700, 4: 3400 },
    transportFare: 3.50,
  }
};
