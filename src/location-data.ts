export type BedroomCount = 1 | 2 | 3 | 4;

export interface LocationInfo {
  borough: string;
  rent: Record<BedroomCount, number>;
  transportFare: number;
  councilTaxYearly: Record<BedroomCount, number>;
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
    councilTaxYearly: {
      1: 1563, // Band D reduced for smaller properties
      2: 1953.95, // Band D
      3: 2344, // Band E
      4: 2734 // Band F
    },
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
    councilTaxYearly: {
      1: 1161,
      2: 1451.42,
      3: 1741,
      4: 2032
    },
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
    councilTaxYearly: {
      1: 792,
      2: 990,
      3: 1188,
      4: 1386
    },
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
    councilTaxYearly: {
      1: 1815,
      2: 2269,
      3: 2723,
      4: 3177
    },
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
    councilTaxYearly: {
      1: 1990,
      2: 2488,
      3: 2986,
      4: 3484
    },
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
    councilTaxYearly: {
      1: 1671,
      2: 2088.43,
      3: 2506,
      4: 2923
    },
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
    councilTaxYearly: {
      1: 1898,
      2: 2372.07,
      3: 2846,
      4: 3320
    },
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
    councilTaxYearly: {
      1: 1633,
      2: 2041,
      3: 2449,
      4: 2857
    },
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
    councilTaxYearly: {
      1: 1668,
      2: 2085,
      3: 2502,
      4: 2919
    },
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
    councilTaxYearly: {
      1: 1984,
      2: 2480,
      3: 2976,
      4: 3472
    },
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
    councilTaxYearly: {
      1: 1671,
      2: 2088.43,
      3: 2506,
      4: 2923
    },
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
    councilTaxYearly: {
      1: 1469,
      2: 1836,
      3: 2203,
      4: 2570
    },
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
    councilTaxYearly: {
      1: 1817,
      2: 2270.72,
      3: 2725,
      4: 3179
    },
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
    councilTaxYearly: {
      1: 1668,
      2: 2085.30,
      3: 2502,
      4: 2919
    },
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
    councilTaxYearly: {
      1: 1668,
      2: 2085.30,
      3: 2502,
      4: 2919
    },
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
    councilTaxYearly: {
      1: 792,
      2: 990,
      3: 1188,
      4: 1386
    },
    zone: "Zone 3"
  }
};
