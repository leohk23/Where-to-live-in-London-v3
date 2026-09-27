# Backlog

Parked ideas and known debt for **Where to Live in London**, captured 2026-07-09. Ordered
roughly by value/effort within each section. Nothing here is committed work — it's the "later"
pile so deferrals don't rot. Tick items off or delete them as they land.

## Scoring & data model

- [x] **Journey times for nearby stations *inside curated areas*** — done 2026-07-09. The 35
  not-yet-modelled stations sitting in curated wards are now fetched (name-keyed in the matrix, NR
  twins of already-curated stations skipped), feed the **ward-level** commute pool, and show real
  times in the Commute card's "Also nearby" list. Deliberately *not* promoted to any location's own
  `commuteStations`, so no area headline / schools / centroid moved (a few placeholders — e.g. King's
  Cross in a Bloomsbury ward — would have distorted the area otherwise).
  → `scripts/fetch-tfl-commutes.ts`, `ward-scores.ts`, `ResultsTable.tsx`.
- [ ] **Journey times for the *rest* of the Greater-London NR stations.** The ~225 NR stations that
  aren't inside a curated area still have no times (they're map-overlay only). Fetch on demand if any
  become relevant — e.g. when curating a new NR-anchored area. → `scripts/fetch-tfl-commutes.ts`.
- [ ] **Ward-commute in live / address mode.** The cross-area "nearest useful station" pool only
  opens for a **preset + static** work destination (it reads the static matrix). In live or custom-
  address mode it falls back to the location's own stations, so an edge ward can't reach a
  neighbour's station. Reconcile if live mode matters for the ward heatmap.
  → `src/features/map/ward-scores.ts` (`globalOptionsFor`), `src/london-cost-calculator.tsx`.
- [ ] **Within-area commute normalisation amplifies tiny gaps.** Commute (and crime) are min-max
  normalised *within* the selected area, so a ward only ~5 min slower can score far lower (e.g.
  Sutton South). Consider a gentler scale — soften the min-max, or anchor to an absolute band — so
  small real differences don't read as large. → `ward-scores.ts` (`normaliser`).
- [ ] **Ward-match palette contrast.** Composites cluster mid-range, so the heatmap reads mostly
  green→grey with little pure red. Options: normalise the *map fill* within-area for max contrast
  (at the cost of "green = objectively good"), or just deepen the ramp endpoints / raise fill alpha.
  → `ward-scores.ts` (`WARD_RAMP`).

## Map & UI

- [ ] **Per-ward door-to-work time in the Commute card.** Parked: showing a second set of commute
  times alongside the per-station rows read as confusing. The ward *tooltip* already shows walk-min
  + boarded line. Revisit only if a non-confusing presentation appears.
- [ ] **Strip the `bus` mode from station-overlay tooltips.** A few NR stations show
  "national-rail, bus" (a bus interchange tag from TfL). Harmless but slightly noisy — filter `bus`
  out of `lines` for the overlay if it bugs. → `scripts/generate-all-stations.ts` or the tooltip in
  `LocationMap.tsx`.
- [ ] **Remove the now-dead `tone` prop from `HeaderLevelBadge`.** After the header restyle every
  source-tag is one uniform style; `tone` is still in the type + passed at 8 call sites but no longer
  drives colour. Tidy-up only. → `src/features/results/ResultsTable.tsx`.
- [ ] **Ward hover-link caveat (low priority).** Map↔card ward highlighting only connects when the
  map is showing the same area as the expanded row — inherent to the hover-to-preview behaviour, not
  a bug. Note in case it ever confuses.

## Data pipeline & tech debt

- [ ] **Make `generate-ward-polygons` reproducible.** It re-fetches ONS boundaries every run, so
  regenerating churns the whole (huge) JSON on float precision / ordering. Snapshot the ONS responses
  under `scripts/data/` (like the crime/population snapshots) so reruns are deterministic and diffs
  stay small. → `scripts/generate-location-ward-polygons.ts`.
- [ ] **A few scoring self-checks.** No test framework by design, but the money paths (commute
  effective-time, ward nearest-station pick, schools score, walk model) have zero guards. A small
  `assert`-based node script over a couple of known cases would catch regressions cheaply.
- [ ] **Bundle size.** Main chunk is ~1.37 MB (Vite warns >500 kB) — maplibre + the generated JSON
  dominate. Code-split (dynamic import the map) or `manualChunks` if load time matters.
  → `vite.config.ts`.

## Curation (ongoing)

- [ ] **Continue the "recognizable area" merges.** The merge philosophy is now systematic. The
  Marginal-tier merges (e.g. Southwark + London Bridge) were flagged next; they inflate central
  school catchments most — safer now that the schools **Choice** score is capped (targets primary 4
  / secondary 15). The National Rail overlay helps spot NR merge candidates.
- [ ] **New NR-anchored curated areas.** Now that every Greater-London NR station is on the map,
  consider promoting well-known NR-only hubs into curated locations.

## Recently shipped (context)

Ward-level crime on 2022 wards · ward-level commute heatmap · cross-area nearest-useful-station ward
commute · every Greater-London NR station mapped + assigned to wards + card placeholders · "Chiswick"
→ "Chiswick Park" rename · transit-icon fix (Wimbledon National Rail) · tooltip portal + line-badge
ward tooltip · two-way map↔card ward hover · header source-tag restyle · schools **Choice** cap
(the previously-parked inflation fix — **done**).
