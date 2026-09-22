import assert from 'node:assert/strict';
import { parsePoint } from '../dist/geocoder.js';

console.log('🧪 parsePoint tests');

console.log('Test 1: { latitude, longitude } numbers');
assert.deepStrictEqual(parsePoint({ latitude: 13.7563, longitude: 100.5018 }), { lat: 13.7563, lon: 100.5018 });
console.log('  ✅ Passed');

console.log('Test 2: { lat, lon } and { lat, lng }');
assert.deepStrictEqual(parsePoint({ lat: 1, lon: 2 }), { lat: 1, lon: 2 });
assert.deepStrictEqual(parsePoint({ lat: 1, lng: 2 }), { lat: 1, lon: 2 });
assert.deepStrictEqual(parsePoint({ latitude: 1, lat: 2, longitude: 3, lon: 4 }), { lat: 1, lon: 3 });
assert.deepStrictEqual(parsePoint({ lat: 1, lon: 2, lng: 9 }), { lat: 1, lon: 2 });
console.log('  ✅ Passed');

console.log('Test 3: string values are coerced');
assert.deepStrictEqual(parsePoint({ latitude: '13.5', longitude: '100.25' }), { lat: 13.5, lon: 100.25 });
assert.deepStrictEqual(parsePoint(['-33.8688', '151.2093']), { lat: -33.8688, lon: 151.2093 });
console.log('  ✅ Passed');

console.log('Test 4: tuple and positional numbers');
assert.deepStrictEqual(parsePoint([35.6762, 139.6503]), { lat: 35.6762, lon: 139.6503 });
assert.deepStrictEqual(parsePoint(35.6762, 139.6503), { lat: 35.6762, lon: 139.6503 });
console.log('  ✅ Passed');

console.log('Test 5: invalid input returns null');
assert.strictEqual(parsePoint({ latitude: 'nope', longitude: 100 }), null);
assert.strictEqual(parsePoint({}), null);
assert.strictEqual(parsePoint([]), null);
assert.strictEqual(parsePoint(13.7563), null);
assert.strictEqual(parsePoint(null), null);
console.log('  ✅ Passed');

console.log('\n🎉 parsePoint tests passed');
