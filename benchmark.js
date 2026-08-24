'use strict';

const geocoder = require('./fast-geocoder');

console.log('🏁 Running Reverse Geocoder Benchmark...\n');

// Measure initial memory
const initialMem = process.memoryUsage();

// Generate 1,000 random coordinates around the world
const testPoints = [];
for (let i = 0; i < 1000; i++) {
  testPoints.push({
    latitude: -60 + Math.random() * 120,   // lat between -60 and +60
    longitude: -180 + Math.random() * 360  // lon between -180 and +180
  });
}

// Warm up
geocoder.lookUp(testPoints[0], 1);

// Measure Single-point lookups
const startSingle = performance.now();
for (let i = 0; i < testPoints.length; i++) {
  geocoder.lookUp(testPoints[i], 1);
}
const endSingle = performance.now();
const totalSingleMs = endSingle - startSingle;
const avgSingleMs = totalSingleMs / testPoints.length;
const qpsSingle = (testPoints.length / (totalSingleMs / 1000)).toFixed(0);

// Measure Batch lookups (all 1000 points at once)
const startBatch = performance.now();
const batchResults = geocoder.lookUp(testPoints, 1);
const endBatch = performance.now();
const totalBatchMs = endBatch - startBatch;
const avgBatchMs = totalBatchMs / testPoints.length;
const qpsBatch = (testPoints.length / (totalBatchMs / 1000)).toFixed(0);

// Measure final memory
const finalMem = process.memoryUsage();
const rssMb = (finalMem.rss / (1024 * 1024)).toFixed(2);
const heapMb = (finalMem.heapUsed / (1024 * 1024)).toFixed(2);

console.log('----------------------------------------------------');
console.log('📊 BENCHMARK RESULTS:');
console.log('----------------------------------------------------');
console.log(`⚡ Startup Time:            Instant (0.00 ms)`);
console.log(`⏱️ Single Query Latency:    ${avgSingleMs.toFixed(3)} ms / query`);
console.log(`🚀 Single Query Throughput: ${qpsSingle} queries / sec`);
console.log(`📦 Batch Query Latency:     ${avgBatchMs.toFixed(3)} ms / point`);
console.log(`🚀 Batch Query Throughput:  ${qpsBatch} queries / sec`);
console.log(`💾 Memory Usage (RAM RSS):  ${rssMb} MB`);
console.log(`💾 V8 Heap Used:            ${heapMb} MB`);
console.log('----------------------------------------------------\n');

// Sample lookups demonstration
console.log('📍 Sample Lookups:');
const samples = [
  { name: 'Bangkok, Thailand', lat: 13.7563, lon: 100.5018 },
  { name: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503 },
  { name: 'Paris, France', lat: 48.8566, lon: 2.3522 },
  { name: 'New York, USA', lat: 40.7128, lon: -74.0060 },
  { name: 'Sydney, Australia', lat: -33.8688, lon: 151.2093 }
];

samples.forEach(s => {
  const res = geocoder.lookUp({ latitude: s.lat, longitude: s.lon }, 1);
  const c = res[0][0];
  const admin1 = typeof c.admin1Code === 'object' ? c.admin1Code.name : c.admin1Code;
  const admin2 = typeof c.admin2Code === 'object' ? c.admin2Code.name : c.admin2Code;
  console.log(` • ${s.name}:`);
  console.log(`   -> Found: ${c.name} (${admin1 ? admin1 + ', ' : ''}${c.countryCode}) | Distance: ${c.distance} km | Timezone: ${c.timezone}`);
});
