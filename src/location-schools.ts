import type { LocationSchoolStats } from './types';
import locationSchoolsJson from './data/location-schools.json';

export const locationSchoolStats = locationSchoolsJson as unknown as Record<string, LocationSchoolStats>;
