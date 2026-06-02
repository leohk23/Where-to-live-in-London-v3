/**
 * Fires N Journey Planner requests at a given interval and reports
 * any non-200 responses so we can confirm TfL's actual rate limit.
 *
 * Usage: tsx scripts/test-tfl-rate.ts [pauseMs] [count]
 * e.g.:  tsx scripts/test-tfl-rate.ts 150 30
 */
import { locationData } from "../src/location-data";
import { workLocations } from "../src/work-locations";

const APP_KEY = process.env.TFL_APP_KEY || "";
const BASE    = "https://api.tfl.gov.uk";

const pauseMs = parseInt(process.argv[2] ?? "150");
const count   = parseInt(process.argv[3] ?? "30");

// Fixed pair: Brixton → City of London (both overridden, always 1 API call)
const FROM = "940GZZLUBXN"; // Brixton
const TO   = "940GZZLUBNK"; // Bank

// Pick a variety of home→work pairs to stress different station combos
const pairs: [string, string][] = [];
const homes = Object.keys(locationData);
const works = Object.keys(workLocations);
for (let i = 0; i < count; i++) {
  // cycle through different pairs so we're not hitting cache
  pairs.push([homes[i % homes.length], works[i % works.length]]);
}

const OVERRIDES: Record<string, string> = {
  "Brixton Underground Station":                  "940GZZLUBXN",
  "Bank Underground Station":                     "940GZZLUBNK",
  "King's Cross St. Pancras Underground Station": "940GZZLUKSX",
  "Oxford Circus Underground Station":            "940GZZLUOXC",
  "Victoria Underground Station":                 "940GZZLUVIC",
  "Waterloo Underground Station":                 "940GZZLUWLO",
  "Green Park Underground Station":               "940GZZLUGPK",
  "Westminster Underground Station":              "940GZZLUWSM",
  "Liverpool Street Underground Station":         "940GZZLULVT",
  "Paddington Underground Station":               "940GZZLUPAC",
  "South Kensington Underground Station":         "940GZZLUSKS",
  "Holborn Underground Station":                  "940GZZLUHBN",
  "London Bridge Underground Station":            "940GZZLULNB",
  "Hammersmith Underground Station":              "940GZZLUHSD",
  "Stratford Underground Station":                "940GZZLUSTD",
  "Euston Underground Station":                   "940GZZLUEAC",
  "Fulham Broadway Underground Station":          "940GZZLUFBY",
  "Tooting Broadway Underground Station":         "940GZZLUTBY",
  "Wimbledon Underground Station":                "940GZZLUWIM",
  "Ealing Broadway Underground Station":          "940GZZLUEBY",
  "Hounslow Central Underground Station":         "940GZZLUHWC",
  "High Barnet Underground Station":              "940GZZLUHBT",
  "Acton Town Underground Station":               "940GZZLUACT",
  "Southfields Underground Station":              "940GZZLUSFS",
  "Clapham Common Underground Station":           "940GZZLUCPC",
  "Bethnal Green Underground Station":            "940GZZLUBLG",
  "Walthamstow Central Underground Station":      "940GZZLUWWL",
  "East Putney Underground Station":              "940GZZLUEPY",
  "Chiswick Park Underground Station":            "940GZZLUCWP",
  "Highbury and Islington Underground Station":   "940GZZLUHAI",
  "Finchley Central Underground Station":         "940GZZLUFYC",
  "Wimbledon Park Underground Station":           "940GZZLUWIP",
  "Sutton (London) Rail Station":                 "910GSUTTON",
  "New Malden Rail Station":                      "910GNEWMLDN",
  "Richmond (London) Rail Station":               "910GRICHMND",
  "Cheam Rail Station":                           "910GCHEAM",
  "Peckham Rye Rail Station":                     "910GPCKHMRY",
  "Hackney Central Rail Station":                 "910GHACKNYC",
  "Crystal Palace Rail Station":                  "910GCRYSTLP",
  "Lewisham Rail Station":                        "910GLEWISHM",
  "Greenwich DLR Station":                        "940GZZDLGRE",
};

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const modes = ["tube","overground","elizabeth-line","dlr","tram","national-rail"];

async function journeyCall(fromId: string, toId: string): Promise<{ status: number; duration: number }> {
  const t0 = Date.now();
  const url = `${BASE}/Journey/JourneyResults/${encodeURIComponent(fromId)}/to/${encodeURIComponent(toId)}?` +
    new URLSearchParams({
      app_key: APP_KEY, mode: modes.join(","),
      timeIs: "Departing", date: "20260602", time: "0900",
    });
  const res = await fetch(url);
  return { status: res.status, duration: Date.now() - t0 };
}

async function main() {
  console.log(`Testing ${count} requests at ${pauseMs}ms interval (${Math.round(60000 / pauseMs)} req/min)\n`);

  let ok = 0, errors: string[] = [];
  const t0 = Date.now();

  for (let i = 0; i < pairs.length; i++) {
    const [home, work] = pairs[i];
    const fromId = OVERRIDES[locationData[home].station] ?? "";
    const toId   = OVERRIDES[workLocations[work].station] ?? "";
    if (!fromId || !toId) { console.warn(`No override for ${home}→${work}`); continue; }

    const { status, duration } = await journeyCall(fromId, toId);
    const label = `[${String(i+1).padStart(3)}] ${home.padEnd(18)} → ${work.padEnd(18)} HTTP ${status} (${duration}ms)`;

    if (status === 200 || status === 300) {
      ok++;
      console.log(`✓ ${label}`);
    } else {
      errors.push(label);
      console.error(`✗ ${label}`);
    }

    if (i < pairs.length - 1) await pause(pauseMs);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n--- ${count} requests in ${elapsed}s ---`);
  console.log(`OK: ${ok}  Errors: ${errors.length}`);
  if (errors.length) { console.log("Failed:"); errors.forEach(e => console.log(" ", e)); }
}

main().catch(e => { console.error(e); process.exit(1); });
