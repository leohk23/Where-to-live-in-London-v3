import { useEffect, useRef } from 'react';

const itemClass = 'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[15px]';
const iconClass = 'inline-grid h-6 w-6 shrink-0 place-items-center rounded-md';

// The logo (the 💂 favicon) opens a small menu for switching to the owner's other apps —
// mirrors the "P" menu in Where to park in London?, which links back here.
export default function AppSwitcher() {
  const ref = useRef<HTMLDetailsElement>(null);

  // Closes when you tap anywhere else or press Escape.
  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        close();
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details ref={ref} className="relative shrink-0">
      <summary
        className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg bg-blue-100 text-lg leading-none sm:h-8 sm:w-8 sm:text-xl transition-colors hover:bg-blue-200 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 [&::-webkit-details-marker]:hidden"
        title="Switch app"
        aria-label="Switch app"
      >
        <span aria-hidden="true">💂</span>
      </summary>
      <div
        className="absolute left-0 top-[calc(100%+0.5rem)] z-[60] grid w-max gap-0.5 rounded-xl border border-gray-200 bg-white p-1.5 font-normal shadow-xl dark:border-gray-700 dark:bg-gray-900"
        role="menu"
      >
        <span className={`${itemClass} text-gray-500 dark:text-gray-400`} role="menuitem" aria-current="page">
          <span className={`${iconClass} bg-blue-100 text-base dark:bg-blue-500/20`} aria-hidden="true">💂</span>
          Where to live in London?
        </span>
        <a
          href="https://leohk23.github.io/parking-in-london/"
          className={`${itemClass} text-gray-900 hover:bg-blue-50 focus-visible:bg-blue-50 dark:text-gray-100 dark:hover:bg-blue-500/15 dark:focus-visible:bg-blue-500/15`}
          role="menuitem"
        >
          <span className={`${iconClass} bg-blue-700 text-sm font-extrabold text-white`} aria-hidden="true">P</span>
          Where to park in London?
        </a>
      </div>
    </details>
  );
}
