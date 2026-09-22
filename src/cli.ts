#!/usr/bin/env node
import geocoder from './index.js';

const USAGE = [
  '📌 Usage: local-geolookup <latitude> <longitude> [maxResults]',
  '   Example (Single): local-geolookup 13.7563 100.5018',
  '   Example (Multi) : local-geolookup 13.7563 100.5018 3',
].join('\n');

function main(argv: string[]): number {
  if (argv.length < 2) {
    console.log(USAGE);
    return 1;
  }

  const lat = parseFloat(argv[0]);
  const lon = parseFloat(argv[1]);
  const maxResults = argv[2] ? parseInt(argv[2], 10) : 1;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    console.error('❌ Error: Latitude and Longitude must be valid numbers.');
    return 1;
  }
  if (Number.isNaN(maxResults) || maxResults < 1) {
    console.error('❌ Error: maxResults must be a positive integer.');
    return 1;
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
  return 0;
}

process.exitCode = main(process.argv.slice(2));
