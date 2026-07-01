// Per-school grammar/selective catchment radius (km, straight line from the school). Used so a
// location only counts a grammar it could realistically get into, instead of one blanket radius.
//
// Three kinds of school (see the trailing note on each line):
//   radius — the school publishes a hard catchment radius; a place is only offered inside it.
//   area   — admits by a designated postcode/ward area (not a circle); approximated by a radius
//            that roughly covers that area.
//   rank   — super-selective: admits by exam rank from anywhere, no true catchment. Distance is
//            only a tiebreak, so we use a documented wide "realistic reach" (RANK_ONLY_KM).
//
// Figures are approximate and change year to year — edit here to refine. Sourced Jul 2026.
export const RANK_ONLY_KM = 12;

export const grammarCatchmentKm: Record<string, number> = {
  'Nonsuch High School for Girls': 5.25,               // radius — published (Sutton)
  'Wallington County Grammar School': 6.7,             // radius — published
  'Wallington High School for Girls': 6.7,             // radius — published
  'Tiffin School': 10,                                 // radius — 10km priority area (Kingston)
  'Newstead Wood School': 14.5,                        // radius — 9 miles (Bromley/Orpington)
  'The Tiffin Girls\' School': 10,                     // area — designated postcodes; estimate
  'The Latymer School': 9,                             // area — designated N/EN/E postcodes; estimate
  'The Henrietta Barnett School': RANK_ONLY_KM,        // rank — 3mi priority but admits beyond
  "Queen Elizabeth's School, Barnet": RANK_ONLY_KM,    // rank
  'Woodford County High School': RANK_ONLY_KM,         // rank (Redbridge)
  'St Michael\'s Catholic Grammar School': RANK_ONLY_KM, // rank (faith + selective, Finchley)
  'Sutton Grammar School': RANK_ONLY_KM,               // rank (postcode priority, no radius)
  'Wilson\'s School': RANK_ONLY_KM,                    // rank
  'St Olave\'s and St Saviour\'s Grammar School': RANK_ONLY_KM, // rank (Bromley)
};
