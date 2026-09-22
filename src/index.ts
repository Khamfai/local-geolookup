import { FastReverseGeocoder } from './geocoder.js';

export { FastReverseGeocoder } from './geocoder.js';
export type { PointInput, Coordinates, InitOptions, InitCallback } from './geocoder.js';
export { haversineDistance } from './haversine.js';
export type { GeoPoint, GeoResult, AdminCode, LookUpCallback, LookUpOneCallback } from './types.js';

const defaultInstance = new FastReverseGeocoder();
export default defaultInstance;
