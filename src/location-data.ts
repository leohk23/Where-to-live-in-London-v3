export type BedroomCount = 1 | 2 | 3 | 4;

export interface LocationInfo {
  borough: string;
  rent: Record<BedroomCount, number>;
  transportFare: number;
  zone: string;
}

export const locationData: Record<string, LocationInfo> = {
  "Brixton": {
    borough: "Lambeth",
    rent: {
      1: 2000,
      2: 2572,
      3: 3200,
      4: 4000
    },
    transportFare: 3.50,
    zone: "Zone 2"
  },
  "Fulham": {
    borough: "Hammersmith and Fulham",
    rent: {
      1: 1500,
      2: 1922,
      3: 2400,
      4: 3000
    },
    transportFare: 3.50,
    zone: "Zone 2"
  },
  "Tooting": {
    borough: "Wandsworth",
    rent: {
      1: 1300,
      2: 1650,
      3: 2100,
      4: 2600
    },
    transportFare: 5.05,
    zone: "Zone 3"
  },
  "Sutton": {
    borough: "Sutton",
    rent: {
      1: 1500,
      2: 1909,
      3: 2400,
      4: 3000
    },
    transportFare: 5.05,
    zone: "Zone 5"
  },
  "New Malden": {
    borough: "Kingston upon Thames",
    rent: {
      1: 1900,
      2: 2409,
      3: 3000,
      4: 3750
    },
    transportFare: 5.05,
    zone: "Zone 4"
  },
  "Wimbledon": {
    borough: "Merton",
    rent: {
      1: 1550,
      2: 1979,
      3: 2500,
      4: 3100
    },
    transportFare: 3.50,
    zone: "Zone 3"
  },
  "Richmond": {
    borough: "Richmond upon Thames",
    rent: {
      1: 1650,
      2: 2098,
      3: 2650,
      4: 3300
    },
    transportFare: 5.05,
    zone: "Zone 4"
  },
  "Ealing": {
    borough: "Ealing",
    rent: {
      1: 1550,
      2: 1957,
      3: 2450,
      4: 3050
    },
    transportFare: 3.50,
    zone: "Zone 3"
  },
  "Hounslow": {
    borough: "Hounslow",
    rent: {
      1: 1450,
      2: 1845,
      3: 2300,
      4: 2900
    },
    transportFare: 6.00,
    zone: "Zone 4"
  },
  "Croydon": {
    borough: "Croydon",
    rent: {
      1: 1200,
      2: 1541,
      3: 1950,
      4: 2450
    },
    transportFare: 5.05,
    zone: "Zone 5"
  },
  "Wimbledon Park": {
    borough: "Merton",
    rent: {
      1: 1600,
      2: 2025,
      3: 2550,
      4: 3200
    },
    transportFare: 3.50,
    zone: "Zone 3"
  },
  "High Barnet": {
    borough: "Barnet",
    rent: {
      1: 1450,
      2: 1850,
      3: 2350,
      4: 2950
    },
    transportFare: 6.00,
    zone: "Zone 5"
  },
  "Sutton Cheam": {
    borough: "Sutton",
    rent: {
      1: 1300,
      2: 1650,
      3: 2100,
      4: 2600
    },
    transportFare: 5.05,
    zone: "Zone 5"
  },
  "Acton Common": {
    borough: "Ealing",
    rent: {
      1: 1450,
      2: 1850,
      3: 2350,
      4: 2950
    },
    transportFare: 3.50,
    zone: "Zone 2"
  },
  "South Ealing": {
    borough: "Ealing",
    rent: {
      1: 1450,
      2: 1850,
      3: 2350,
      4: 2950
    },
    transportFare: 3.50,
    zone: "Zone 3"
  },
  "Southfields": {
    borough: "Wandsworth",
    rent: {
      1: 1700,
      2: 2150,
      3: 2700,
      4: 3400
    },
    transportFare: 3.50,
    zone: "Zone 3"
  }
};
