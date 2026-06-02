import type { LocationInfo } from './types';
import locationsJson from './data/locations.json';

export type { BedroomCount } from './types';
export const locationData = locationsJson as unknown as Record<string, LocationInfo>;
