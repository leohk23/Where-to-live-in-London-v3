import type { DatasetGeography } from '../types';

export const datasetGeography: DatasetGeography[] = [
  {
    key: 'commute',
    label: 'Commute',
    geography: 'home station to selected work station or address',
    joinKey: 'location.naptan',
    caveat: 'Best interpreted as a station-access proxy for each area.',
  },
  {
    key: 'rent',
    label: 'Rent',
    geography: 'location-level market estimate',
    joinKey: 'location.id',
    caveat: 'Area boundaries come from the source data and are not always identical to the display label.',
  },
  {
    key: 'councilTax',
    label: 'Council tax',
    geography: 'borough',
    joinKey: 'location.borough',
    caveat: 'Uses borough-level Band D rates scaled by bedroom count.',
  },
  {
    key: 'crime',
    label: 'Crime',
    geography: 'ward-weighted within each location polygon; borough fallback',
    joinKey: 'ward code via generated location ward polygons',
    caveat: 'Ward counts are more local than borough averages but still use approximate Police API street locations.',
  },
  {
    key: 'schools',
    label: 'Schools',
    geography: '3km primary / 5km secondary radius around location anchor',
    joinKey: 'location.naptan',
    caveat: 'Counts nearby state primary and secondary schools using the current station or location anchor.',
  },
];
