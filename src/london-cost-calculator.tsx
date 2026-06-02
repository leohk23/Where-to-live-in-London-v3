import { useState } from 'react';
import { Train, Moon, Sun, Link, Check, Info, UserCircle, X } from 'lucide-react';
import { useCalculator } from './hooks/useCalculator';
import { useDarkMode } from './hooks/useDarkMode';
import FilterPanel from './components/FilterPanel';
import ResultsTable from './components/ResultsTable';
import { NotesContent } from './components/NotesFooter';

function LondonCostCalculator() {
  const { darkMode, setDarkMode } = useDarkMode();
  const calc = useCalculator();

  const [copied, setCopied] = useState<boolean>(false);
  const [activePopover, setActivePopover] = useState<'notes' | 'about' | null>(null);

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 p-4 sm:p-6">
      <div className="max-w-[110rem] mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-xl p-4 sm:p-8">

        <header className="flex items-start justify-between mb-8">
          <div className="flex-1" />
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              倫敦住邊好？
            </h1>
            <p className="text-xl font-semibold text-gray-500 dark:text-gray-400 mt-1">
              Where to live in London?
            </p>
          </div>
          <div className="relative flex-1 flex justify-end items-center gap-1 pt-1">
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Copy link to this view"
              title="Copy link"
            >
              {copied ? <Check className="h-5 w-5 text-green-500" /> : <Link className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setActivePopover(current => current === 'notes' ? null : 'notes')}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Show methodology notes"
              aria-expanded={activePopover === 'notes'}
              title="Notes"
            >
              <Info className="h-5 w-5" />
            </button>
            <button
              onClick={() => setActivePopover(current => current === 'about' ? null : 'about')}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Show about"
              aria-expanded={activePopover === 'about'}
              title="About"
            >
              <UserCircle className="h-5 w-5" />
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {activePopover && (
              <div className="absolute right-0 top-11 z-40 w-[calc(100vw-2rem)] max-w-[28rem] rounded-md border border-gray-200 bg-white p-4 text-left text-sm text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                    {activePopover === 'notes' ? 'Notes' : 'About'}
                  </div>
                  <button
                    onClick={() => setActivePopover(null)}
                    className="-mr-1 -mt-1 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {activePopover === 'notes' ? (
                  <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                    <NotesContent sortedResults={calc.sortedResults} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p>A personal London area comparison tool for balancing rent, commute, safety and schools.</p>
                    <p>Data is indicative and intended to help shortlist areas for further research.</p>
                    <p><strong>Author:</strong> Leo L.</p>
                    <p>
                      <strong>Email:</strong>{' '}
                      <a className="text-blue-600 underline dark:text-blue-300" href="mailto:leohk23@gmail.com">
                        leohk23@gmail.com
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <FilterPanel
          workLocation={calc.workLocation}
          setWorkLocation={calc.setWorkLocation}
          workMode={calc.workMode}
          setWorkMode={calc.setWorkMode}
          workLocation2={calc.workLocation2}
          setWorkLocation2={calc.setWorkLocation2}
          workMode2={calc.workMode2}
          setWorkMode2={calc.setWorkMode2}
          bedrooms={calc.bedrooms}
          setBedrooms={calc.setBedrooms}
          monthlyTrips={calc.monthlyTrips}
          setMonthlyTrips={calc.setMonthlyTrips}
          priorities={calc.priorities}
          setPriorities={calc.setPriorities}
          budgetEnabled={calc.budgetEnabled}
          setBudgetEnabled={calc.setBudgetEnabled}
          maxBudget={calc.maxBudget}
          setMaxBudget={calc.setMaxBudget}
          anyPriority={calc.anyPriority}
          officePostcode={calc.officePostcode}
          setOfficePostcode={calc.setOfficePostcode}
          setSelectedOfficeCoords={calc.setSelectedOfficeCoords}
          onFetchLiveCommutes={() => { void calc.fetchLiveCommutes(); }}
          liveCommuteLoading={calc.liveCommuteLoading}
          liveCommuteGeocoding={calc.liveCommuteGeocoding}
          liveCommuteProgress={calc.liveCommuteProgress}
          liveCommuteTotal={calc.liveCommuteTotal}
          liveCommuteError={calc.liveCommuteError}
          officePostcode2={calc.officePostcode2}
          setOfficePostcode2={calc.setOfficePostcode2}
          setSelectedOfficeCoords2={calc.setSelectedOfficeCoords2}
          onFetchLiveCommutes2={() => { void calc.fetchLiveCommutes2(); }}
          liveCommuteLoading2={calc.liveCommuteLoading2}
          liveCommuteGeocoding2={calc.liveCommuteGeocoding2}
          liveCommuteProgress2={calc.liveCommuteProgress2}
          liveCommuteTotal2={calc.liveCommuteTotal2}
          liveCommuteError2={calc.liveCommuteError2}
        />

        {calc.sortedResults.length > 0 ? (
          <>
            <ResultsTable
              sortedResults={calc.sortedResults}
              anyPriority={calc.anyPriority}
              workLocation={calc.workLocation}
              workMode={calc.workMode}
              officePostcode={calc.officePostcode}
              workLocation2={calc.workLocation2}
              workMode2={calc.workMode2}
              officePostcode2={calc.officePostcode2}
              bedrooms={calc.bedrooms}
              budgetEnabled={calc.budgetEnabled}
              maxBudget={calc.maxBudget}
              sortBy={calc.sortBy}
              sortDirection={calc.sortDirection}
              onSort={calc.handleSort}
              liveCommuteLoading={calc.liveCommuteLoading}
              liveCommuteLoading2={calc.liveCommuteLoading2}
            />
          </>
        ) : calc.workLocation ? (
          <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-lg text-center">
            <Train className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">Adjust the selections above to see available areas.</p>
          </div>
        ) : null}

      </div>
    </div>
  );
}

export default LondonCostCalculator;
