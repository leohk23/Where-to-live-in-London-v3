import { useState, useEffect, useCallback } from 'react';

import { commuteTimes } from "./commute-times";
import { locationData, type BedroomCount } from "./location-data";
import { councilTaxData } from "./tax-data";
import { Train, Building2, Home } from 'lucide-react';


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
      const councilTaxYearly = councilTaxData[location][bedrooms];
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

  const getSortHeaderClass = (
    value: 'total' | 'rent' | 'transport' | 'commute'
  ) => {
    return `cursor-pointer select-none ${
      sortBy === value
        ? 'text-blue-600 dark:text-blue-400 underline'
        : 'hover:underline'
    }`;
  };

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen dark:from-gray-900 dark:to-gray-800 dark:text-gray-100">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 sm:p-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 flex justify-center">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                倫敦住邊好？<br />Where to live in London?
              </h1>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="ml-4 px-3 py-1 rounded border text-sm dark:border-gray-600"
            >
              {darkMode ? 'Light' : 'Dark'} Mode
            </button>
          </div>
        </div>

        {/* Input Section */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 sm:p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-blue-600" />
            Work Location & Commute
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Where do you work?
              </label>
              <select
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Number of Bedrooms
              </label>
              <select
                value={bedrooms}
                onChange={(e) =>
                  setBedrooms(parseInt(e.target.value) as BedroomCount)
                }
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value={1}>1 Bedroom</option>
                <option value={2}>2 Bedrooms</option>
                <option value={3}>3 Bedrooms</option>
                <option value={4}>4 Bedrooms</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Monthly Round Trips
              </label>
              <input
                type="number"
                value={monthlyTrips}
                onChange={(e) => setMonthlyTrips(parseInt(e.target.value) || 0)}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                min="0"
                max="200"
              />
            </div>

          </div>
        </div>

        {/* Results Section */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center">
                <Home className="h-5 w-5 mr-2 text-green-600" />
                {bedrooms}-Bedroom Options for {workLocation}
              </h2>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Rank</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Location</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Borough</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Zone</th>
                      <th
                        onClick={() => sortResults('commute')}
                        className={`text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('commute')}`}
                      >
                        Commute
                      </th>
                      <th
                        onClick={() => sortResults('rent')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('rent')}`}
                      >
                        Rent
                      </th>
                      <th
                        onClick={() => sortResults('transport')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('transport')}`}
                      >
                        Transport
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Council Tax</th>
                      <th
                        onClick={() => sortResults('total')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-gray-700 ${getSortHeaderClass('total')}`}
                      >
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={result.location} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        index < 3 ? 'bg-gradient-to-r from-green-50/30 to-blue-50/30 dark:from-green-900/30 dark:to-blue-900/30' : ''
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
                              <span className="text-gray-500 dark:text-gray-400 text-sm">{index + 1}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{result.location}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-600 dark:text-gray-300">{result.borough}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block bg-gray-100 dark:bg-gray-700 dark:text-gray-100 px-2 py-1 rounded text-xs font-medium">
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
                        <td className="py-3 px-4 text-right font-bold text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-gray-800">
                          £{result.totalMonthly.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Note:</strong> Showing {bedrooms}-bedroom properties. Transport costs range from £{Math.min(...results.map(r => r.farePerTrip)).toFixed(2)} to £{Math.max(...results.map(r => r.farePerTrip)).toFixed(2)} per trip depending on zones.
                Council tax varies by property size and borough. Commute times are estimates and can be customised in <code>src/commute-times.ts</code>.
              </p>
            </div>
          </div>
        )}

        {results.length === 0 && workLocation && (
          <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-lg text-center">
            <Train className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">Adjust the selections above to see available areas for your commute to {workLocation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LondonCostCalculator;
