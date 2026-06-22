import { useEffect, useRef, useState } from 'react';
import {
  Train,
  Moon,
  Sun,
  Check,
  Info,
  X,
  Share2,
  Copy,
  MessageCircle,
  Send,
  AtSign,
  Facebook,
  Twitter,
  Smartphone,
  ALargeSmall,
  Coffee,
} from 'lucide-react';
import { useCalculator } from './hooks/useCalculator';
import { useDarkMode } from './hooks/useDarkMode';
import FilterPanel from './components/FilterPanel';
import LocationMapPrototype from './components/LocationMapPrototype';
import ResultsTable from './components/ResultsTable';
import { NotesContent } from './components/NotesFooter';
import { workLocations, type WorkLocationKey } from './work-locations';

type PopoverName = 'share' | 'information';

function presetCoords(key: WorkLocationKey | '') {
  const coords = key ? workLocations[key]?.coords : null;
  return coords ? { lat: String(coords.lat), lon: String(coords.lon) } : null;
}

function LondonCostCalculator() {
  const { darkMode, setDarkMode } = useDarkMode();
  const calc = useCalculator();

  // On the very first visit, make sure every section opens expanded by clearing any
  // stale persisted collapse state before the sections mount and read it. Runs once,
  // synchronously, during this component's first render (ahead of its children).
  useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      if (!localStorage.getItem('wtl-visited')) {
        localStorage.removeItem('wtl-collapse-map');
        localStorage.removeItem('wtl-collapse-filters');
        localStorage.setItem('wtl-visited', '1');
      }
    } catch {
      // Storage unavailable (private mode etc.) — sections already default to expanded.
    }
    return null;
  });

  const [copied, setCopied] = useState<boolean>(false);
  const [activePopover, setActivePopover] = useState<PopoverName | null>(null);
  const [largeText, setLargeText] = useState<boolean>(false);
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const [pinnedLocation, setPinnedLocation] = useState<string | null>(null);
  // Set only by map clicks: asks the table to scroll to and expand this location.
  const [tableFocusRequest, setTableFocusRequest] = useState<{ location: string; requestId: number } | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const appCardRef = useRef<HTMLDivElement>(null);

  // Publish the sticky header's height as a CSS variable; the map, table title and
  // column headers all offset themselves from it so everything docks beneath the bar.
  useEffect(() => {
    const update = () => {
      const height = headerRef.current?.getBoundingClientRect().height ?? 0;
      appCardRef.current?.style.setProperty('--app-header-h', `${height}px`);
    };
    update();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (headerRef.current) resizeObserver?.observe(headerRef.current);
    window.addEventListener('resize', update);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareTitle = 'Where to live in London?';
  const shareText = 'Compare London areas by rent, commute, safety and schools.';
  const shareUrl = typeof window === 'undefined' ? '' : window.location.href;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const encodedShareLine = encodeURIComponent(`${shareText} ${shareUrl}`);
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleNativeShare = () => {
    if (!canNativeShare) return;
    void navigator.share({
      title: shareTitle,
      text: shareText,
      url: shareUrl,
    }).catch(() => undefined);
  };

  const shareLinks = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodedShareLine}`, icon: MessageCircle },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, icon: Send },
    { label: 'Threads', href: `https://www.threads.net/intent/post?text=${encodedShareLine}`, icon: AtSign },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: Facebook },
    { label: 'X', href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, icon: Twitter },
  ];

  const getPopoverTitle = () => {
    if (activePopover === 'share') return 'Share';
    return 'Information';
  };
  const popoverWidthClass = activePopover === 'information'
    ? 'w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-[42rem] md:w-[48rem] lg:w-[56rem] xl:w-[64rem]'
    : 'w-[calc(100vw-2rem)] max-w-[28rem]';
  const hasResults = calc.sortedResults.length > 0;
  const activeMapLocation = calc.sortedResults.some(result => result.location === hoveredLocation)
    ? hoveredLocation
    : calc.sortedResults.some(result => result.location === pinnedLocation)
      ? pinnedLocation
      : null;

  const renderFilterPanel = (className?: string) => (
    <FilterPanel
      className={className}
      workLocation={calc.workLocation}
      setWorkLocation={calc.setWorkLocation}
      workMode={calc.workMode}
      setWorkMode={calc.setWorkMode}
      commuteSource={calc.commuteSource}
      setCommuteSource={calc.setCommuteSource}
      commuteSource2={calc.commuteSource2}
      setCommuteSource2={calc.setCommuteSource2}
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
      onFetchLiveCommutes={() => { void calc.fetchLiveCommutes(true); }}
      liveCommuteLoading={calc.liveCommuteLoading}
      liveCommuteGeocoding={calc.liveCommuteGeocoding}
      liveCommuteProgress={calc.liveCommuteProgress}
      liveCommuteTotal={calc.liveCommuteTotal}
      liveCommuteError={calc.liveCommuteError}
      officePostcode2={calc.officePostcode2}
      setOfficePostcode2={calc.setOfficePostcode2}
      setSelectedOfficeCoords2={calc.setSelectedOfficeCoords2}
      onFetchLiveCommutes2={() => { void calc.fetchLiveCommutes2(true); }}
      liveCommuteLoading2={calc.liveCommuteLoading2}
      liveCommuteGeocoding2={calc.liveCommuteGeocoding2}
      liveCommuteProgress2={calc.liveCommuteProgress2}
      liveCommuteTotal2={calc.liveCommuteTotal2}
      liveCommuteError2={calc.liveCommuteError2}
    />
  );

  return (
    <div
      ref={appCardRef}
      className={`min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 dark:text-gray-100 ${largeText ? 'large-text-mode' : ''}`}
    >
      <header
        ref={headerRef}
        className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/90 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90"
      >
        <div className="mx-auto flex max-w-[110rem] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          {/* Mobile: English with the Chinese tucked beneath as a small second line; sm+: one truncated line. */}
          <h1 className="min-w-0 text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:truncate sm:text-lg lg:text-xl">
            <span className="block truncate sm:inline">Where to live in London?</span>
            {' '}
            <span className="block truncate text-xs font-semibold text-gray-500 dark:text-gray-400 sm:inline sm:[font-size:inherit]" lang="zh-Hant">倫敦住邊好？</span>
          </h1>
          <div className="relative flex shrink-0 items-center gap-1">
            <button
              onClick={() => setActivePopover(current => current === 'share' ? null : 'share')}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Share this view"
              aria-expanded={activePopover === 'share'}
              title="Share"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              onClick={() => setActivePopover(current => current === 'information' ? null : 'information')}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Show information"
              aria-expanded={activePopover === 'information'}
              title="Information"
            >
              <Info className="h-5 w-5" />
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setLargeText(current => !current)}
              className={`rounded-full p-2 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200 ${largeText ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}
              aria-label={largeText ? 'Return to normal text size' : 'Enlarge text size'}
              aria-pressed={largeText}
              title={largeText ? 'Normal text size' : 'Larger text'}
            >
              <ALargeSmall className="h-5 w-5" />
            </button>
            <a
              href="https://buymeacoffee.com/leohk23"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
              aria-label="Buy me a coffee"
              title="Buy me a coffee ☕"
            >
              <Coffee className="h-5 w-5" />
            </a>

            {activePopover && (
              <div className={`absolute right-0 top-11 z-50 rounded-md border border-gray-200 bg-white p-4 text-left text-sm text-gray-600 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 ${popoverWidthClass}`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                    {getPopoverTitle()}
                  </div>
                  <button
                    onClick={() => setActivePopover(null)}
                    className="-mr-1 -mt-1 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {activePopover === 'share' ? (
                  <div className="space-y-3">
                    <button
                      onClick={handleCopyLink}
                      className="flex w-full items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      <span className="inline-flex items-center gap-2">
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        <span>{copied ? 'Copied link' : 'Copy link'}</span>
                      </span>
                    </button>

                    {canNativeShare && (
                      <button
                        onClick={handleNativeShare}
                        className="flex w-full items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        <Smartphone className="h-4 w-4" />
                        <span>Share with phone apps</span>
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {shareLinks.map(({ label, href, icon: Icon }) => (
                        <a
                          key={label}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          <Icon className="h-4 w-4" />
                          <span>{label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                    <NotesContent sortedResults={calc.sortedResults} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[110rem] p-4 sm:p-6">
        {hasResults ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(22rem,0.45fr)_minmax(0,1.55fr)] xl:items-start xl:gap-y-3">
            <div className="order-2 min-w-0 xl:order-none xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:sticky xl:top-[calc(var(--app-header-h,3rem)+1rem)]">
              <LocationMapPrototype
                sortedResults={calc.sortedResults}
                selectedLocation={pinnedLocation}
                highlightedLocation={hoveredLocation}
                darkMode={darkMode}
                officeCoords={calc.workMode === 'address' ? calc.selectedOfficeCoords : presetCoords(calc.workLocation)}
                partnerCoords={calc.workMode2 === 'address' ? calc.selectedOfficeCoords2 : presetCoords(calc.workLocation2)}
                budgetEnabled={calc.budgetEnabled}
                maxBudget={calc.maxBudget}
                onLocationHover={setHoveredLocation}
                onLocationSelect={loc => {
                  const next = pinnedLocation === loc ? null : loc;
                  setPinnedLocation(next);
                  if (next) setTableFocusRequest({ location: loc, requestId: Date.now() });
                }}
                className="xl:h-[calc(100vh-var(--app-header-h,3rem)-2.5rem)]"
              />
            </div>
            <div className="order-1 min-w-0 xl:order-none xl:col-start-2 xl:row-start-1">
              {renderFilterPanel('')}
            </div>
            <div className="order-3 min-w-0 xl:order-none xl:col-start-2 xl:row-start-2">
              <ResultsTable
                sortedResults={calc.sortedResults}
                anyPriority={calc.anyPriority}
                workMode={calc.workMode}
                workLocation2={calc.workLocation2}
                workMode2={calc.workMode2}
                officePostcode2={calc.officePostcode2}
                monthlyTrips={calc.monthlyTrips}
                budgetEnabled={calc.budgetEnabled}
                maxBudget={calc.maxBudget}
                sortBy={calc.sortBy}
                sortDirection={calc.sortDirection}
                onSort={calc.handleSort}
                liveCommuteLoading={calc.liveCommuteLoading}
                liveCommuteLoading2={calc.liveCommuteLoading2}
                selectedLocation={activeMapLocation}
                onLocationHover={setHoveredLocation}
                onLocationSelect={loc => setPinnedLocation(cur => cur === loc ? null : loc)}
                focusRequest={tableFocusRequest}
              />
            </div>
          </div>
        ) : (
          <>
            {renderFilterPanel()}
            {calc.workLocation ? (
              <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-lg text-center">
                <Train className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-300">Adjust the selections above to see available areas.</p>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default LondonCostCalculator;
