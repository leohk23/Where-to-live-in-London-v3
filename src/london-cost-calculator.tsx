import { useState, useEffect, useCallback, useMemo } from 'react';

import { commuteTimes } from "./commute-times";
import { locationData, type BedroomCount } from "./location-data";
import { councilTaxData } from "./tax-data";
import { Train, Building2, Home, ArrowUp, ArrowDown } from 'lucide-react';
import { commuteTimesLastRun } from "./commute-times-last-run";
import { workLocations, type WorkLocationKey } from "./work-locations";


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


// Lookup table for zone-based fare calculations
const fareByZoneDifference: Record<number, number> = {
  0: 2.8,
  1: 3.5,
  2: 5.05,
};

function LondonCostCalculator() {
  const [workLocation, setWorkLocation] = useState<WorkLocationKey | ''>('');
  const [monthlyTrips, setMonthlyTrips] = useState<number>(40);
  const [bedrooms, setBedrooms] = useState<BedroomCount>(2);
  const [results, setResults] = useState<Result[]>([]);
  const [sortBy, setSortBy] = useState<
    | 'total'
    | 'rent'
    | 'transport'
    | 'commute'
    | 'location'
    | 'borough'
    | 'councilTax'
  >('total');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDirection('asc');
    }
  };

  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return null;
    return sortDirection === 'asc'
      ? <ArrowUp className="inline h-3 w-3 ml-1" />
      : <ArrowDown className="inline h-3 w-3 ml-1" />;
  };

  const calculateCosts = useCallback(() => {
    if (!workLocation) return;

    const calculatedResults = Object.entries(locationData).map(([location, data]) => {
      const rent = data.rent[bedrooms];
      const councilTaxYearly = councilTaxData[data.borough][bedrooms];
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
        commuteTime: getCommuteTime(
          location,
          workLocation
        ),
        bedrooms: bedrooms
      };
    });
    setSortBy('total');
    setSortDirection('asc');
    setResults(calculatedResults);
  }, [workLocation, monthlyTrips, bedrooms]);

  const sortedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      switch (sortBy) {
        case 'rent':          return a.rent - b.rent;
        case 'transport':     return a.transportCostMonthly - b.transportCostMonthly;
        case 'commute':       return a.commuteTime - b.commuteTime;
        case 'location':      return a.location.localeCompare(b.location);
        case 'borough':       return a.borough.localeCompare(b.borough);
        case 'councilTax':    return a.councilTaxMonthly - b.councilTaxMonthly;
        default:              return a.totalMonthly - b.totalMonthly;
      }
    });
    return sortDirection === 'desc' ? sorted.reverse() : sorted;
  }, [results, sortBy, sortDirection]);

  useEffect(() => {
    if (workLocation) {
      calculateCosts();
    }
  }, [calculateCosts, workLocation]);

  const getFarePerTrip = (homeZone: string, workZone: string) => {
    const homeZoneNum = parseInt(homeZone.replace('Zone ', ''));
    const workZoneNum = parseInt(workZone.replace('Zone ', ''));
    const zoneDiff = Math.abs(homeZoneNum - workZoneNum);
    return fareByZoneDifference[zoneDiff] ?? 6.0;
  };

  const getCommuteTime = (
    homeLocation: string,
    workLocationName: string,
  ) => {
    return commuteTimes[homeLocation]?.[workLocationName] ?? 60;
  };

  const getSortHeaderClass = (
    value:
      | 'total'
      | 'rent'
      | 'transport'
      | 'commute'
      | 'location'
      | 'borough'
      | 'councilTax',
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 sm:p-8">
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
                    {location} ({info.zone} · {info.station.replace(/ (Underground|Rail) Station$/, '')})
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
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Rank</th>
                      <th
                        onClick={() => handleSort('location')}
                        className={`text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('location')}`}
                      >
                        Location{sortIcon('location')}
                      </th>
                      <th
                        onClick={() => handleSort('borough')}
                        className={`text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('borough')}`}
                      >
                        Borough{sortIcon('borough')}
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Zone</th>
                      <th
                        onClick={() => handleSort('commute')}
                        className={`text-center py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('commute')}`}
                      >
                        Commute{sortIcon('commute')}
                      </th>
                      <th
                        onClick={() => handleSort('rent')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('rent')}`}
                      >
                        Rent{sortIcon('rent')}
                      </th>
                      <th
                        onClick={() => handleSort('transport')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('transport')}`}
                      >
                        Transport{sortIcon('transport')}
                      </th>
                      <th
                        onClick={() => handleSort('councilTax')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 ${getSortHeaderClass('councilTax')}`}
                      >
                        Council Tax{sortIcon('councilTax')}
                      </th>
                      <th
                        onClick={() => handleSort('total')}
                        className={`text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-gray-700 ${getSortHeaderClass('total')}`}
                      >
                        Total{sortIcon('total')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((result, index) => (
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
                <strong>Note:</strong> Showing {bedrooms}-bedroom properties. Transport costs range from £{Math.min(...sortedResults.map(r => r.farePerTrip)).toFixed(2)} to £{Math.max(...sortedResults.map(r => r.farePerTrip)).toFixed(2)} per trip depending on zones.
                Council tax varies by property size and borough.
                <br />
                <span>
                  <strong>Commute times last updated:</strong>{" "}
                  {commuteTimesLastRun ? new Date(commuteTimesLastRun).toLocaleString() : "Unknown"}
                </span>
                <br />
                <span>
                  Commute times are taken from TfL Journey Planner, assuming travel from the home tube station to the work tube station.
                </span>
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
