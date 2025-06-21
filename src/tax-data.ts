import taxDataRaw from '../tax.json' assert { type: 'json' };
import type { BedroomCount } from './location-data';

// Council tax bands are keyed by borough name
export const councilTaxData = taxDataRaw as Record<string, Record<BedroomCount, number>>;
