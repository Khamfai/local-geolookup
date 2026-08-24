#!/usr/bin/env node
import geocoder from './fast-geocoder.js';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('📌 Usage: local-geolookup <latitude> <longitude> [maxResults]');
  console.log('   Example (Single): local-geolookup 13.7563 100.5018');
  console.log('   Example (Multi) : local-geolookup 13.7563 100.5018 3');
  process.exit(1);
}

const lat = parseFloat(args[0]);
const lon = parseFloat(args[1]);
const maxResults = args[2] ? parseInt(args[2], 10) : 1;

if (isNaN(lat) || isNaN(lon)) {
  console.error('❌ Error: Latitude and Longitude must be valid numbers.');
  process.exit(1);
}

const start = performance.now();

if (maxResults === 1) {
  const result = geocoder.lookUpOne(lat, lon);
  const duration = (performance.now() - start).toFixed(2);
  console.log(`\n🔍 Single Reverse Geocode (${lat}, ${lon}) [${duration} ms]:\n`);
  console.log(JSON.stringify(result, null, 2));
} else {
  const results = geocoder.lookUp({ latitude: lat, longitude: lon }, maxResults);
  const duration = (performance.now() - start).toFixed(2);
  console.log(`\n🔍 Multi Reverse Geocode (${lat}, ${lon}, maxResults=${maxResults}) [${duration} ms]:\n`);
  console.log(JSON.stringify(results[0], null, 2));
}
