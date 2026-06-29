// Typical minutes BETWEEN trains toward central London, for non-tube (National Rail /
// Overground) locations — shown in the commute section. Tube / DLR / Elizabeth-line
// locations are turn-up-and-go and omitted (left blank).
//
//   peak    = weekday rush hours (~07:00–09:30 & 16:00–19:00)
//   offPeak = weekday daytime / evenings (and roughly weekends)
//
// Off-peak is the differentiating one: most places are ~10–15 min at peak, but off-peak
// is where a location either holds frequency or drops to every 30. These are typical
// estimates — edit freely as you verify against the timetable.
export const trainInterval: Record<string, { peak: number; offPeak: number }> = {
  "Sutton": { peak: 6, offPeak: 10 },
  "New Malden": { peak: 10, offPeak: 15 },
  "Croydon": { peak: 3, offPeak: 5 },
  "Sutton Cheam": { peak: 15, offPeak: 30 },
  "Peckham": { peak: 5, offPeak: 10 },
  "Hackney": { peak: 8, offPeak: 12 },
  "Crystal Palace": { peak: 8, offPeak: 15 },
  "Bromley": { peak: 5, offPeak: 10 },
  "Orpington": { peak: 8, offPeak: 15 },
  "Edmonton": { peak: 15, offPeak: 15 },
  "Harringay Green Lanes": { peak: 15, offPeak: 20 },
  "Worcester Park": { peak: 10, offPeak: 20 },
  "Waddon": { peak: 15, offPeak: 30 },
  "Wallington": { peak: 15, offPeak: 30 },
  "Kingston": { peak: 10, offPeak: 15 },
  "Earlsfield": { peak: 8, offPeak: 15 },
  "Berrylands": { peak: 30, offPeak: 30 },
  "Twickenham": { peak: 8, offPeak: 12 },
  "Teddington": { peak: 12, offPeak: 20 },
};
