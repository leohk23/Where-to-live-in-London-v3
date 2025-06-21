import { locationData } from './src/location-data.ts';
const list = Object.entries(locationData).flatMap(([location, info]) =>
  Object.entries(info.councilTaxYearly).map(([bedroom, tax]) => ({
    location,
    bedroom: Number(bedroom),
    councilTaxYearly: tax
  }))
);
console.log(JSON.stringify(list, null, 2));
