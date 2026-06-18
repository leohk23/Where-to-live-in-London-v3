import type { LocationInfo, LocationSchoolStats, BoroughStats, BedroomCount } from './types';
import locationsJson from './data/locations.json';
import locationSchoolsJson from './data/location-schools.json';
import boroughStatsJson from './data/borough-stats.json';
import taxDataRaw from '../counciltax.json';

export const locationData = locationsJson as unknown as Record<string, LocationInfo>;
export const locationSchoolStats = locationSchoolsJson as unknown as Record<string, LocationSchoolStats>;
export const boroughStats = boroughStatsJson as unknown as Record<string, BoroughStats>;
export const councilTaxData = taxDataRaw as Record<string, Record<BedroomCount, number>>;
