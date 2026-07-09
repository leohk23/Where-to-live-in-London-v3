// Which electoral wards make up each canonical location's map polygon.
//
// A location listed here has its named wards merged (unioned) into ONE polygon.
// A location NOT listed falls back to the single ward containing its anchor point
// (the original behaviour) — so you only need to add the ones you want to expand.
//
// Ward names are 2022 wards (WD22CD), matching 2021-census population + MPS ward-level
// crime. Names must match the official ONS names exactly (case-insensitive). Run
//   LIST_WARDS=1 npm run generate-ward-polygons
// to dump every ward name available in each location's borough into
// scripts/data/ward-catalogue.json, then copy the ones you want below.

export const LOCATION_WARDS: Record<string, string[]> = {
  "Brixton": ["Brixton Acre Lane", "Brixton North", "Brixton Windrush"],
  "Fulham": ["Fulham Town", "Lillie", "Munster", "Parsons Green & Sandford", "Sands End", "Walham Green"],
  "Tooting": ["Furzedown", "Tooting Bec", "Tooting Broadway"],
  "Sutton": ["Sutton Central", "Sutton North", "Sutton South", "Sutton West & East Cheam"],
  "New Malden": ["Green Lane & St James", "Motspur Park & Old Malden East", "New Malden Village"],
  "Wimbledon": ["Abbey", "Hillside", "Merton Park", "Village", "Wandle", "Wimbledon Park", "Wimbledon Town & Dundonald"],
  "Richmond": ["North Richmond", "South Richmond"],
  "Ealing": ["Ealing Broadway", "Ealing Common", "Hanwell Broadway", "Northfield", "Pitshanger", "Walpole"],
  "Hounslow": ["Hounslow Central", "Hounslow East", "Hounslow Heath", "Hounslow South", "Hounslow West"],
  "Croydon": ["Addiscombe West", "Broad Green", "Fairfield", "Park Hill & Whitgift", "Waddon"],
  "High Barnet": ["Barnet Vale", "High Barnet", "Underhill"],
  "Sutton Cheam": ["Cheam", "Worcester Park South"],
  "Acton Common": ["East Acton", "North Acton", "South Acton", "Southfield"],
  "Southfields": ["Southfields", "West Hill"],
  "Clapham": ["Clapham Common & Abbeville", "Clapham East", "Clapham Town"],
  "Bethnal Green": ["St Peter's", "Bethnal Green"],
  "Stratford": ["Maryland", "Stratford", "Stratford Olympic Park", "West Ham"],
  "Walthamstow": ["High Street", "Hoe Street", "Markhouse", "St James", "William Morris"],
  "Peckham": ["Peckham", "Peckham Rye", "Rye Lane"],
  "Hackney": ["Hackney Central", "Hackney Downs", "Victoria"],
  "Putney": ["East Putney", "Thamesfield", "West Putney"],
  "Crystal Palace": ["Crystal Palace & Anerley", "Penge & Cator"],
  "Bromley": ["Bromley Town", "Plaistow", "Shortlands & Park Langley"],
  "Orpington": ["Farnborough & Crofton", "Orpington", "Petts Wood & Knoll"],
  "Chiswick": ["Chiswick Gunnersbury", "Chiswick Homefields", "Chiswick Riverside"],
  "Hammersmith": ["Avonmore", "Brook Green", "Coningham", "Grove", "Hammersmith Broadway", "Ravenscourt", "Wendell Park"],
  "Islington": ["Barnsbury", "Canonbury", "Laycock", "St Mary's & St James'", "St Peter's & Canalside"],
  "Finchley": ["Finchley Church End", "West Finchley", "Woodhouse"],
  "Greenwich": ["East Greenwich", "Greenwich Creekside", "Greenwich Park", "Greenwich Peninsula"],
  "Lewisham": ["Ladywell", "Lewisham Central", "Rushey Green"],
  "Harringay Green Lanes": ["Harringay", "Hermitage & Gardens", "Noel Park", "St Ann's", "West Green"],
  "Manor House": ["Brownswood", "Woodberry Down"],
  "Edmonton": ["Edmonton Green", "Lower Edmonton", "Upper Edmonton"],
  "Hendon": ["Hendon", "West Hendon"],
  "Colindale": ["Colindale North", "Colindale South"],
  "Willesden Green": ["Cricklewood & Mapesbury", "Roundwood", "Willesden Green"],
  "Cricklewood": ["Dollis Hill"],
  "Golders Green": ["Childs Hill", "Cricklewood", "Golders Green"],
  "Shepherd's Bush": ["Shepherd's Bush Green", "White City", "Wormholt"],
  "Worcester Park": ["North Cheam", "Stonecot", "Worcester Park North"],
  "Southwark": ["Borough & Bankside", "Chaucer", "St George's"],
  "London Bridge": ["London Bridge & West Bermondsey", "North Bermondsey"],
  "Camden": ["Camden Square", "Camden Town", "Kentish Town North", "Kentish Town South"],
  "Bloomsbury": ["Bloomsbury", "Holborn & Covent Garden", "King's Cross"],
  "Wallington": ["Wallington North", "Wallington South"],
  "Balham": ["Balham", "South Balham", "Trinity"],
  "Kingston": ["Canbury Gardens", "Kingston Gate", "Kingston Town", "Norbiton"],
  "Earlsfield": ["Wandle", "Wandsworth Common"],
  "Berrylands": ["Alexandra", "Berrylands"],
  "Twickenham": ["South Twickenham", "Twickenham Riverside"],
  "Teddington": ["Hampton Wick & South Teddington", "Teddington"],
  "Canning Town": ["Canning Town North", "Canning Town South", "Custom House", "Plaistow West & Canning Town East", "Royal Victoria"],
  "Norbury": ["Bensham Manor", "Norbury & Pollards Hill", "Norbury Park", "Thornton Heath"],
  "Ruislip": ["Ruislip", "Ruislip Manor", "South Ruislip"],
  "Mill Hill": ["Edgwarebury", "Mill Hill"],
};
