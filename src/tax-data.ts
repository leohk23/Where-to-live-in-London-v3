import taxDataRaw from '../tax.json' assert { type: 'json' };
import type { BedroomCount } from './location-data';

export const councilTaxData = taxDataRaw as Record<string, Record<BedroomCount, number>>;
