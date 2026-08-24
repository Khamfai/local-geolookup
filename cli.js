#!/usr/bin/env node
'use strict';

const geocoder = require('./fast-geocoder');

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('📌 Usage: node cli.js <latitude> <longitude> [maxResults]');
  console.log('   Example: node cli.js 13.7563 100.5018 1');
  console.log('   Example: node cli.js 18.7883 98.9853');
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
const results = geocoder.lookUp({ latitude: lat, longitude: lon }, maxResults);
const duration = (performance.now() - start).toFixed(2);

console.log(`\n🔍 Reverse Geocoding Results for (${lat}, ${lon}) [${duration} ms]:\n`);
console.log(JSON.stringify(results[0], null, 2));
