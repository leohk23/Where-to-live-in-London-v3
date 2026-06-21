# Where to live in London?

A personal London area comparison app for balancing rent, commute, safety, schools, transport cost and council tax around the places that matter.

Live site: https://leohk23.github.io/Where-to-live-in-London-v3/

This project is published on GitHub Pages only. It is no longer published to Vercel.

## What It Does

The app helps shortlist London areas by comparing:

- monthly rent estimates
- TfL commute times, including optional live exact-address commute checks
- transport costs by fare zone
- borough council tax
- borough-level crime rates
- nearby primary and secondary school data around each location anchor

## Data And Privacy

The app uses public or app-maintained datasets, including ONS Private Rental Market Statistics plus Hutch / Joinhutch asking-rent data (manually maintained estimate), TfL Journey Planner, Ofsted school inspection data, Met Police crime data and council tax figures.

No personal data or user input is collected by the author or stored on a server through this web app. Shared links can include selected filters in the URL, and live commute results may be cached temporarily in your browser session.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Deployment is handled through GitHub Pages:

```bash
npm run deploy
```

The `homepage` value in `package.json` points to the GitHub Pages URL.

## Customising Commute Times

The app estimates commute durations using a prepopulated table of sample times for each home/work pair in `src/commute-times.ts`. Regenerate or adjust those values if the commute matrix needs refreshing.
