import taxDataRaw from '../counciltax.json' assert { type: 'json' };
import type { BedroomCount } from './types';

export const councilTaxData = taxDataRaw as Record<string, Record<BedroomCount, number>>;
