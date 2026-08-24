'use strict';
const geocoder = require('./fast-geocoder');

const pt = { latitude: 13.7563, longitude: 100.5018 };
const result = geocoder.lookUp(pt, 1);
console.log('Result for single point:', JSON.stringify(result, null, 2));

const batch = [
  { latitude: 13.7563, longitude: 100.5018 },
  { latitude: 35.6762, longitude: 139.6503 }
];
const batchResult = geocoder.lookUp(batch, 1);
console.log('Result for batch:', JSON.stringify(batchResult, null, 2));
