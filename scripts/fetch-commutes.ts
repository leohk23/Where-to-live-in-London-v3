import { Client } from "@googlemaps/google-maps-services-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error("Error: Please set GOOGLE_MAPS_API_KEY in your environment or .env file.");
  process.exit(1);
}

const client = new Client({});

const homes = [
  "Brixton",
  "Fulham",
  "Tooting",
  "Sutton",
  "New Malden",
  "Wimbledon",
  "Richmond",
  "Ealing",
  "Hounslow",
  "Croydon",
  "Wimbledon Park",
  "High Barnet",
  "Sutton Cheam",
  "Acton Common",
  "South Ealing",
  "Southfields",
];

const works = [
  "City of London",
  "Canary Wharf",
  "King's Cross",
  "Shoreditch",
  "Westminster",
  "South Bank",
  "Paddington",
  "Victoria",
  "Liverpool Street",
  "Oxford Circus",
];

export type CommuteTimes = {
  [homeLocation: string]: {
    [workLocation: string]: number;
  };
};

async function fetchCommutes(): Promise<CommuteTimes> {
  const result: CommuteTimes = {};

  for (const home of homes) {
    result[home] = {};
    try {
      const response = await client.distancematrix({
        params: {
          key: API_KEY,
          origins: [home + ", London"],
          destinations: works.map(w => w + ", London"),
          mode: "transit",
          transit_mode: ["subway", "train"],
          departure_time: "now",
        },
      });

      const elements = response.data.rows[0].elements;
      for (let i = 0; i < works.length; i++) {
        const work = works[i];
        const element = elements[i];
        if (element.status === "OK" && element.duration) {
          result[home][work] = Math.round(element.duration.value / 60);
        } else {
          result[home][work] = 0;
        }
        console.log(`${home} → ${work}: ${result[home][work]} min`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch for ${home}:`, message);
      for (const work of works) {
        result[home][work] = 0;
      }
    }
  }

  return result;
}

async function main() {
  const times = await fetchCommutes();

  const outPath = path.resolve(__dirname, "../src/commute-times.ts");
  const fileContents = `/**\n * THIS FILE IS AUTO-GENERATED.\n * To regenerate, run: npm run fetch-commutes\n */\n\nexport interface CommuteTimes {\n  [homeLocation: string]: {\n    [workLocation: string]: number;\n  };\n}\n\nexport const commuteTimes: CommuteTimes = ${JSON.stringify(times, null, 2)};\n`;

  fs.writeFileSync(outPath, fileContents, { encoding: "utf-8" });
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
