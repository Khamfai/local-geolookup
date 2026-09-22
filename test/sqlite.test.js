import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openReadOnly, isBunRuntime } from '../dist/sqlite.js';

const DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../data/geonames.sqlite');

console.log('🧪 sqlite adapter tests');

console.log('Test 1: isBunRuntime matches the running engine');
assert.strictEqual(isBunRuntime(), typeof Bun !== 'undefined');
console.log('  ✅ Passed');

console.log('Test 2: openReadOnly returns rows for a prepared query');
const db = openReadOnly(DB_PATH);
const rows = db.prepare('SELECT name, country_code AS countryCode FROM cities WHERE geoname_id = ?').all(1609350);
assert.strictEqual(rows.length, 1);
assert.strictEqual(rows[0].name, 'Bangkok');
assert.strictEqual(rows[0].countryCode, 'TH');
db.close();
console.log('  ✅ Passed');

console.log('Test 3: missing database file throws the documented message');
assert.throws(
  () => openReadOnly('/definitely/missing/geonames.sqlite'),
  /GeoNames database not found at "\/definitely\/missing\/geonames\.sqlite"\. Please verify that geonames\.sqlite exists\./
);
console.log('  ✅ Passed');

console.log('Test 4: unreadable database file throws the open-failure message');
const notADb = resolve(dirname(fileURLToPath(import.meta.url)), 'sqlite.test.js');
assert.throws(() => openReadOnly(notADb), /Failed to open SQLite database at ".*sqlite\.test\.js": /);
console.log('  ✅ Passed');

console.log('\n🎉 sqlite adapter tests passed');
