import { useState, useEffect, useCallback } from 'react';

import { commuteTimes } from "./commute-times";
import { Train, Building2, Home } from 'lucide-react';

type BedroomCount = 1 | 2 | 3 | 4;

interface LocationInfo {
  borough: string;
  rent: Record<BedroomCount, number>;
  transportFare: number;
  councilTaxYearly: Record<BedroomCount, number>;
  zone: string;
}

interface WorkLocation {
  zone: string;
  description: string;
}

interface Result {
  location: string;
  borough: string;
  zone: string;
  rent: number;
  transportCostMonthly: number;
  councilTaxMonthly: number;
  totalMonthly: number;
  farePerTrip: number;
  commuteTime: number;
  bedrooms: BedroomCount;
}

// Data extracted from your CSV with bedroom variations
const locationData: Record<string, LocationInfo> = {
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

// Common work locations in London
const workLocations: Record<string, WorkLocation> = {
  "City of London": { zone: "Zone 1", description: "Financial district" },
  "Canary Wharf": { zone: "Zone 2", description: "Business district" },
  "King's Cross": { zone: "Zone 1", description: "Tech hub" },
  "Shoreditch": { zone: "Zone 1", description: "Creative district" },
  "Westminster": { zone: "Zone 1", description: "Government area" },
  "South Bank": { zone: "Zone 1", description: "Cultural district" },
  "Paddington": { zone: "Zone 1", description: "Transport hub" },
  "Victoria": { zone: "Zone 1", description: "Business area" },
  "Liverpool Street": { zone: "Zone 1", description: "Financial area" },
  "Oxford Circus": { zone: "Zone 1", description: "Shopping & media" }
};

type WorkLocationKey = keyof typeof workLocations;

function LondonCostCalculator() {
  const [workLocation, setWorkLocation] = useState<WorkLocationKey | ''>('');
  const [monthlyTrips, setMonthlyTrips] = useState<number>(40);
  const [bedrooms, setBedrooms] = useState<BedroomCount>(2);
  const [results, setResults] = useState<Result[]>([]);
  const [sortBy, setSortBy] = useState<'total' | 'rent' | 'transport' | 'commute'>('total');

  const calculateCosts = useCallback(() => {
    if (!workLocation) return;

    const calculatedResults = Object.entries(locationData).map(([location, data]) => {
      const rent = data.rent[bedrooms];
      const councilTaxYearly = data.councilTaxYearly[bedrooms];
      const farePerTrip = getFarePerTrip(
        data.zone,
        workLocations[workLocation as WorkLocationKey].zone
      );
      const transportCostMonthly = farePerTrip * monthlyTrips;
      const councilTaxMonthly = councilTaxYearly / 12;
      const totalMonthly = rent + transportCostMonthly + councilTaxMonthly;
      
      return {
        location,
        borough: data.borough,
        zone: data.zone,
        rent: rent,
        transportCostMonthly: transportCostMonthly,
        councilTaxMonthly: councilTaxMonthly,
        totalMonthly: totalMonthly,
        farePerTrip: farePerTrip,
        commuteTime: getEstimatedCommuteTime(
          location,
          data.zone,
          workLocation,
          workLocations[workLocation as WorkLocationKey].zone
        ),
        bedrooms: bedrooms
      };
    });
    const sortedResults = [...calculatedResults].sort((a, b) => a.totalMonthly - b.totalMonthly);
    setSortBy('total');
    setResults(sortedResults);
  }, [workLocation, monthlyTrips, bedrooms]);

  const sortResults = (criteria: 'total' | 'rent' | 'transport' | 'commute') => {
    setSortBy(criteria);
    if (results.length === 0) return;
    
    const sorted = [...results].sort((a, b) => {
      switch(criteria) {
        case 'rent': return a.rent - b.rent;
        case 'transport': return a.transportCostMonthly - b.transportCostMonthly;
        case 'commute': return a.commuteTime - b.commuteTime;
        default: return a.totalMonthly - b.totalMonthly;
      }
    });
    
    setResults(sorted);
  };

  useEffect(() => {
    if (workLocation) {
      calculateCosts();
    }
  }, [calculateCosts, workLocation]);

  const getFarePerTrip = (homeZone: string, workZone: string) => {
    const homeZoneNum = parseInt(homeZone.replace('Zone ', ''));
    const workZoneNum = parseInt(workZone.replace('Zone ', ''));
    const zoneDiff = Math.abs(homeZoneNum - workZoneNum);

    if (zoneDiff === 0) return 2.8; // same zone travel
    if (zoneDiff === 1) return 3.5; // neighbouring zones
    if (zoneDiff === 2) return 5.05; // two zones apart
    return 6.0; // three or more zones apart
  };

  const getEstimatedCommuteTime = (
    homeLocation: string,
    homeZone: string,
    workLocationName: string,
    workZone: string,
  ) => {
    const specific = commuteTimes[homeLocation]?.[workLocationName];
    if (specific) return specific;

    const homeZoneNum = parseInt(homeZone.replace('Zone ', ''));
    const workZoneNum = parseInt(workZone.replace('Zone ', ''));
    const zoneDiff = Math.abs(homeZoneNum - workZoneNum);

    // Rough estimates based on zone differences
    if (zoneDiff === 0) return 25; // Same zone
    if (zoneDiff === 1) return 35; // Adjacent zones
    if (zoneDiff === 2) return 45; // 2 zones apart
    if (zoneDiff === 3) return 55; // 3 zones apart
    return 65; // 4+ zones apart
  };

  const getSortButtonClass = (value: 'total' | 'rent' | 'transport' | 'commute') => {
    return `px-3 py-1 rounded text-sm transition-colors ${
      sortBy === value 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      <div className="bg-white rounded-lg shadow-xl p-4 sm:p-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              倫敦住邊最平？<br />Where is the cheapest place to live in London?
            </h1>
          </div>
        </div>

        {/* Input Section */}
        <div className="bg-gray-50 p-4 sm:p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-blue-600" />
            Work Location & Commute
          </h2>
          
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Where do you work?
              </label>
              <select
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select work location...</option>
                {Object.entries(workLocations).map(([location, info]) => (
                  <option key={location} value={location}>
                    {location} ({info.zone}) - {info.description}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Bedrooms
              </label>
              <select
                value={bedrooms}
                onChange={(e) =>
                  setBedrooms(parseInt(e.target.value) as BedroomCount)
                }
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={1}>1 Bedroom</option>
                <option value={2}>2 Bedrooms</option>
                <option value={3}>3 Bedrooms</option>
                <option value={4}>4 Bedrooms</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Round Trips
              </label>
              <input
                type="number"
                value={monthlyTrips}
                onChange={(e) => setMonthlyTrips(parseInt(e.target.value) || 0)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min="0"
                max="200"
              />
            </div>

          </div>
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 space-y-4 sm:space-y-0">
              <h2 className="text-xl font-semibold flex items-center">
                <Home className="h-5 w-5 mr-2 text-green-600" />
                {bedrooms}-Bedroom Options for {workLocation}
              </h2>
              
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">Sort by:</span>
                <button onClick={() => sortResults('total')} className={getSortButtonClass('total')}>
                  Total Cost
                </button>
                <button onClick={() => sortResults('rent')} className={getSortButtonClass('rent')}>
                  Rent
                </button>
                <button onClick={() => sortResults('transport')} className={getSortButtonClass('transport')}>
                  Transport
                </button>
                <button onClick={() => sortResults('commute')} className={getSortButtonClass('commute')}>
                  Commute Time
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Location</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Borough</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Zone</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Commute</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Rent</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Transport</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">Council Tax</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 bg-blue-50">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={result.location} className={`border-b hover:bg-gray-50 transition-colors ${
                        index < 3 ? 'bg-gradient-to-r from-green-50/30 to-blue-50/30' : ''
                      }`}>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            {index < 3 ? (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                index === 0 ? 'bg-green-500 text-white' :
                                index === 1 ? 'bg-blue-500 text-white' :
                                'bg-purple-500 text-white'
                              }`}>
                                {index + 1}
                              </div>
                            ) : (
                              <span className="text-gray-500 text-sm">{index + 1}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900">{result.location}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-600">{result.borough}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block bg-gray-100 px-2 py-1 rounded text-xs font-medium">
                            {result.zone}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-sm text-blue-600">~{result.commuteTime}m</span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          £{result.rent.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          £{result.transportCostMonthly.toFixed(0)}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          £{result.councilTaxMonthly.toFixed(0)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-900 bg-blue-50">
                          £{result.totalMonthly.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Showing {bedrooms}-bedroom properties. Transport costs range from £{Math.min(...results.map(r => r.farePerTrip)).toFixed(2)} to £{Math.max(...results.map(r => r.farePerTrip)).toFixed(2)} per trip depending on zones.
                Council tax varies by property size and borough. Commute times are estimates and can be customised in <code>src/commute-times.ts</code>.
              </p>
            </div>
          </div>
        )}

        {results.length === 0 && workLocation && (
          <div className="bg-gray-50 p-8 rounded-lg text-center">
            <Train className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Adjust the selections above to see available areas for your commute to {workLocation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LondonCostCalculator;