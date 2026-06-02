import type { BoroughStats } from './types';
import boroughStatsJson from './data/borough-stats.json';

export const boroughStats = boroughStatsJson as unknown as Record<string, BoroughStats>;
