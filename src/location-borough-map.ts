import { locationData } from './location-data';

export const locationBoroughMap: Record<string, string> = Object.fromEntries(
  Object.entries(locationData).map(([location, info]) => [location, info.borough])
);
