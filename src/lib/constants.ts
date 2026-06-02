export const FARE_BY_ZONE_DIFF: Record<number, number> = {
  0: 2.8,
  1: 3.5,
  2: 5.05,
};
export const FARE_FALLBACK = 6.0;

export const CRIME_THRESHOLDS = { low: 90, medium: 120, high: 150 } as const;
export const SCHOOL_THRESHOLDS = { high: 20, medium: 10 } as const;
export const SCORE_THRESHOLDS = { high: 70, medium: 45 } as const;

export const BUDGET_MIN = 1500;
export const BUDGET_MAX = 8000;
export const BUDGET_STEP = 50;
export const DEFAULT_MONTHLY_TRIPS = 22;
export const DEFAULT_BUDGET = 3500;
export const MAX_MONTHLY_TRIPS = 31;
export const NULL_COMMUTE_FALLBACK = 120;
export const NULL_CRIME_FALLBACK = 300;
