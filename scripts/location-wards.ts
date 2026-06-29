// Which electoral wards make up each canonical location's map polygon.
//
// A location listed here has its named wards merged (unioned) into ONE polygon.
// A location NOT listed falls back to the single ward containing its anchor point
// (the original behaviour) — so you only need to add the ones you want to expand.
//
// Ward names must match the official names exactly (case-insensitive). Run
//   LIST_WARDS=1 npm run generate-ward-polygons
// to dump every ward name available in each location's borough into
// scripts/ward-catalogue.json, then copy the ones you want below.

export const LOCATION_WARDS: Record<string, string[]> = {
  "Brixton": ["Coldharbour", "Ferndale", "Brixton Hill"],
  "Fulham": ["Fulham Broadway", "Munster", "Parsons Green and Walham", "Sands End", "Town"],
  "Tooting": ["Graveney", "Tooting", "Furzedown"],
  "Sutton": ["Sutton West", "Sutton Central", "Sutton North", "Sutton South"],
  "New Malden": ["Beverley", "St James"],
  "Wimbledon": ["Hillside", "Dundonald", "Village", "Trinity"],
  "Richmond": ["South Richmond", "North Richmond"],
  "Ealing": ["Ealing Broadway", "Walpole", "Ealing Common", "Cleveland"],
  "Hounslow": ["Hounslow Central", "Hounslow South", "Hounslow West", "Hounslow Heath"],
  "Croydon": ["Fairfield", "Addiscombe", "Broad Green"],
  "High Barnet": ["High Barnet", "Underhill"],
  "Sutton Cheam": ["Cheam", "Nonsuch"],
  "Acton Common": ["South Acton", "Acton Central", "Southfield"],
  "South Ealing": ["Northfield", "Elthorne"],
  "Southfields": ["West Hill", "Southfields"],
  "Clapham": ["Clapham Town", "Clapham Common"],
  "Bethnal Green": ["Bethnal Green North", "Bethnal Green South"],
  "Stratford": ["Stratford and New Town", "West Ham"],
  "Walthamstow": ["Markhouse", "High Street", "Hoe Street", "William Morris"],
  "Peckham": ["The Lane", "Peckham", "Peckham Rye"],
  "Hackney": ["Hackney Central", "Hackney Downs", "Victoria"],
  "Putney": ["East Putney", "Thamesfield", "West Putney"],
  "Crystal Palace": ["Crystal Palace", "Penge and Cator"],
  "Bromley": ["Bromley Town", "Shortlands", "Plaistow and Sundridge"],
  "Orpington": ["Orpington", "Petts Wood and Knoll", "Farnborough and Crofton"],
  "Chiswick": ["Turnham Green", "Chiswick Homefields", "Chiswick Riverside"],
  "Hammersmith": ["Hammersmith Broadway", "Ravenscourt Park", "Avonmore and Brook Green"],
  "Islington": ["St Mary's", "St Peter's", "Canonbury", "Barnsbury"],
  "Finchley": ["West Finchley", "Finchley Church End", "Woodhouse"],
  "Greenwich": ["Greenwich West", "Peninsula"],
  "Lewisham": ["Lewisham Central", "Rushey Green", "Ladywell"],
  "Harringay Green Lanes": ["St Ann's", "Harringay"],
  "Manor House": ["New River", "Brownswood"],
  "Turnpike Lane": ["West Green", "Noel Park"],
  "Edmonton": ["Edmonton Green", "Lower Edmonton", "Upper Edmonton"],
  "Hendon": ["Hendon", "West Hendon"],
  "Colindale": ["Colindale", "Hale"],
  "Willesden Green": ["Willesden Green", "Mapesbury", "Dudden Hill"],
  "Cricklewood": ["Mapesbury", "Dollis Hill"],
  "Golders Green": ["Golders Green", "Childs Hill"],
  "North Finchley": ["Woodhouse", "West Finchley"],
  "Shepherd's Bush": ["Shepherd's Bush Green", "Askew", "Wormholt and White City"],
  "Worcester Park": ["Worcester Park", "Stonecot"],
  "Southwark": ["Cathedrals", "Chaucer", "Riverside"],
  "London Bridge": ["Grange", "Cathedrals", "Riverside"],
  "North Acton": ["East Acton", "Acton Central"],
  "Camden": ["Camden Town with Primrose Hill", "Cantelowes", "Kentish Town"],
  "Bloomsbury": ["Bloomsbury", "Holborn and Covent Garden", "King's Cross"],
  "Waddon": ["Waddon", "Broad Green"],
  "Wallington": ["Wallington North", "Wallington South"],
  "Balham": ["Balham", "Nightingale", "Bedford"],
  "South Wimbledon": ["Abbey", "Merton Park"],
  "Goldhawk Road": ["Hammersmith Broadway", "Askew"],
  "Stamford Brook": ["Ravenscourt Park", "Askew"],
  "Kingston": ["Grove", "Canbury", "Norbiton"],
  "Earlsfield": ["Earlsfield", "Wandsworth Common"],
  "Berrylands": ["Berrylands", "Alexandra"],
  "Twickenham": ["Twickenham Riverside", "South Twickenham"],
  "Teddington": ["Teddington", "Hampton Wick"],
  // Left as single-ward (anchor's own ward): Wimbledon Park, Childs Hill.
};
