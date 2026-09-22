import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import geocoder, { FastReverseGeocoder, haversineDistance } from '../dist/index.js';

console.log('🧪 Running Reverse Geocoder Test Suite...\n');

// Test 1: Single point lookup using lookUpOne with full object
console.log('Test 1: lookUpOne with { latitude, longitude }');
const bkk = geocoder.lookUpOne({ latitude: 13.7563, longitude: 100.5018 });
assert.ok(bkk, 'Should return a result for Bangkok');
assert.strictEqual(bkk.name, 'Bangkok', 'Name should be Bangkok');
assert.strictEqual(bkk.countryCode, 'TH', 'Country should be TH');
assert.ok(bkk.distance < 1.0, 'Distance should be under 1 km');
console.log('  ✅ Passed (Found: ' + bkk.name + ', ' + bkk.countryCode + ', ' + bkk.distance + ' km)');

// Test 2: lookUpOne with short object { lat, lon }
console.log('Test 2: lookUpOne with { lat, lon }');
const cm = geocoder.lookUpOne({ lat: 18.7883, lon: 98.9853 });
assert.ok(cm, 'Should return a result for Chiang Mai');
assert.strictEqual(cm.name, 'Chiang Mai');
assert.strictEqual(cm.countryCode, 'TH');
console.log('  ✅ Passed (Found: ' + cm.name + ', ' + cm.countryCode + ')');

// Test 3: lookUpOne with direct coordinates (lat, lon)
console.log('Test 3: lookUpOne with numbers (35.6762, 139.6503)');
const tokyo = geocoder.lookUpOne(35.6762, 139.6503);
assert.ok(tokyo, 'Should return a result in Tokyo');
assert.strictEqual(tokyo.countryCode, 'JP');
console.log('  ✅ Passed (Found: ' + tokyo.name + ', ' + tokyo.countryCode + ')');

// Test 4: Batch lookup with lookUp (2D Array)
console.log('Test 4: Batch lookUp returning 2D array');
const batch = [
  { latitude: 13.7563, longitude: 100.5018 },
  { latitude: 48.8566, longitude: 2.3522 }
];
const results = geocoder.lookUp(batch, 2);
assert.strictEqual(results.length, 2, 'Should return 2 result arrays');
assert.strictEqual(results[0].length, 2, 'Each should have 2 nearest cities');
assert.strictEqual(results[0][0].name, 'Bangkok');
assert.strictEqual(results[1][0].countryCode, 'FR');
console.log('  ✅ Passed (Batch 2D array verified)');

// Test 5: Async lookUpOneAsync
console.log('Test 5: lookUpOneAsync Promise');
const asyncRes = await geocoder.lookUpOneAsync(13.7563, 100.5018);
assert.ok(asyncRes);
assert.strictEqual(asyncRes.name, 'Bangkok');
console.log('  ✅ Passed (Async lookup verified)');

// Test 6: Haversine distance utility
console.log('Test 6: haversineDistance calculation');
const d = haversineDistance(13.7563, 100.5018, 13.75398, 100.50144);
assert.ok(d > 0.2 && d < 0.3, 'Distance should be approx 0.26 km');
console.log('  ✅ Passed (Distance: ' + d.toFixed(3) + ' km)');

// Test 7: invalid point in a batch yields an empty inner array
console.log('Test 7: lookUp with an invalid point returns []');
const invalid = geocoder.lookUp([{ latitude: 'nope', longitude: 100 }, { latitude: 13.7563, longitude: 100.5018 }], 1);
assert.deepStrictEqual(invalid[0], []);
assert.strictEqual(invalid[1][0].name, 'Bangkok');
console.log('  ✅ Passed (Invalid point skipped)');

// Test 8: explicit dbPath and close()
console.log('Test 8: FastReverseGeocoder with explicit dbPath');
const custom = new FastReverseGeocoder(fileURLToPath(new URL('../data/geonames.sqlite', import.meta.url)));
assert.strictEqual(custom.lookUpOne(48.8566, 2.3522)?.countryCode, 'FR');
custom.close();
assert.throws(() => custom.lookUpOne(48.8566, 2.3522), /Database statement not initialized/);
console.log('  ✅ Passed (custom instance + close)');

// Test 9: a failed init() preserves the existing working connection and dbPath
console.log('Test 9: failed init() preserves prior state');
const previousDbPath = geocoder.dbPath;
geocoder.init({ dbPath: '/nope/missing.sqlite' }, (err) => {
  assert.ok(err instanceof Error, 'callback should receive an Error');
  assert.ok(
    err.message.startsWith('GeoNames database not found'),
    'error message should start with "GeoNames database not found"'
  );
});
assert.strictEqual(geocoder.dbPath, previousDbPath, 'dbPath should be unchanged after a failed init');
assert.strictEqual(
  geocoder.lookUpOne(13.7563, 100.5018)?.name,
  'Bangkok',
  'existing connection should still work after a failed init'
);
console.log('  ✅ Passed (state preserved after failed init)');

// Test 10: init() callback arity — success calls back with (null, this)
console.log('Test 10: init() callback receives (null, instance) on success');
geocoder.init((err, inst) => {
  assert.strictEqual(err, null);
  assert.strictEqual(inst, geocoder);
});
console.log('  ✅ Passed (init callback arity restored)');

// Test 11: lookUp accepts tuple points, matching parsePoint's accepted input forms
console.log('Test 11: lookUp accepts tuple points');
assert.strictEqual(geocoder.lookUp([[13.7563, 100.5018]], 1)[0][0].name, 'Bangkok');
console.log('  ✅ Passed (lookUp accepts tuples)');

console.log('\n🎉 All tests passed successfully!');
